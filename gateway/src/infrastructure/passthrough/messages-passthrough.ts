import { Response as ExpressResponse } from 'express';
import { logger } from '../utils/logger.js';
import { AuthenticationError, PaymentError, ProviderError } from '../../shared/errors/index.js';
import { CONTENT_TYPES } from '../../domain/types/provider.js';
import { ModelUtils } from '../utils/model-utils.js';

type UsageFormat = 'anthropic_messages';

export interface MessagesAuthConfig {
  envVar: string;
  header: string;
  scheme?: string;
  template?: string;
}

export interface MessagesUsageConfig {
  format: UsageFormat;
}

export interface MessagesModelOptions {
  ensureAnthropicSuffix?: boolean;
}

export interface MessagesPassthroughConfig {
  provider: string;
  baseUrl: string;
  auth?: MessagesAuthConfig;
  staticHeaders?: Record<string, string>;
  supportedClientFormats: string[];
  modelOptions?: MessagesModelOptions;
  usage?: MessagesUsageConfig;
  forceStreamOption?: boolean;
  x402Enabled?: boolean;
}

interface StreamUsageSnapshot {
  inputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export class MessagesPassthrough {
  private initialUsage: StreamUsageSnapshot | null = null;
  private streamBuffer = '';
  private x402FetchFunction: typeof fetch | null = null;
  private x402Initialized = false;
  private lastX402PaymentAmount: string | undefined = undefined;
  private assistantResponseBuffer = '';

  constructor(private readonly config: MessagesPassthroughConfig) {
    // Initialize x402 payment wrapper once if needed
    this.initializeX402Support();
  }

  private async initializeX402Support(): Promise<void> {
    // Check if x402 is enabled for this provider (set by config loader)
    const { getConfig } = await import('../config/app-config.js');
    const config = getConfig();
    const shouldUseX402 = this.config.x402Enabled && config.x402.enabled;

    if (!shouldUseX402) {
      this.x402Initialized = true;
      return;
    }

    try {
      const { getX402Account, createX402Fetch, logPaymentReady } = await import('../payments/x402/index.js');
      const account = getX402Account();
      
      if (account) {
        this.x402FetchFunction = createX402Fetch(account);
        logPaymentReady(account, {
          provider: this.config.provider,
          baseUrl: this.config.baseUrl,
        });
        logger.info('x402 payment support initialized', {
          provider: this.config.provider,
          walletAddress: account.address,
          module: 'messages-passthrough',
        });
      } else {
        logger.error('x402 wallet initialization failed - getX402Account returned null', {
          provider: this.config.provider,
          module: 'messages-passthrough',
        });
      }
    } catch (error) {
      logger.error('Failed to initialize x402 payments', error, {
        provider: this.config.provider,
        errorMessage: error instanceof Error ? error.message : String(error),
        module: 'messages-passthrough',
      });
    } finally {
      this.x402Initialized = true;
    }
  }

  private resolveBaseUrl(): string {
    return this.config.baseUrl;
  }

  private get apiKey(): string | undefined {
    if (!this.config.auth) return undefined;
    const envVar = this.config.auth.envVar;
    const token = process.env[envVar];
    if (!token) {
      throw new AuthenticationError(`${this.config.provider} API key not configured`, { provider: this.config.provider });
    }
    return token;
  }

  private buildAuthHeader(): string | undefined {
    if (!this.config.auth) return undefined;
    const { scheme, template } = this.config.auth;
    const token = this.apiKey;
    
    if (!token) return undefined;

    if (template) {
      return template.replace('{{token}}', token);
    }

    if (scheme) {
      return `${scheme} ${token}`.trim();
    }

    return token;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.staticHeaders,
    };

    // Only add auth header if auth is configured (not x402 mode)
    if (this.config.auth) {
      const authHeader = this.buildAuthHeader();
      if (authHeader) {
        headers[this.config.auth.header] = authHeader;
      }
    }

    return headers;
  }

  private applyModelOptions(request: any): void {
    const modelOptions = this.config.modelOptions;
    if (!modelOptions) return;

    if (modelOptions.ensureAnthropicSuffix && typeof request.model === 'string') {
      request.model = ModelUtils.ensureAnthropicSuffix(request.model);
    }
  }

  private ensurePayloadBody(body: any, stream: boolean): any {
    if (this.config.forceStreamOption === false) {
      return { ...body };
    }
    return { ...body, stream };
  }

  private async makeRequest(body: any, stream: boolean): Promise<globalThis.Response> {
    // Wait for x402 initialization to complete
    while (!this.x402Initialized) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Use x402 fetch if available, otherwise standard fetch
    const fetchFunction = this.x402FetchFunction || fetch;
    const isX402Enabled = this.x402FetchFunction !== null;

    // Log which authentication method is being used for this request
    if (isX402Enabled) {
      logger.info('Making request with x402 payment (PRIVATE_KEY)', {
        provider: this.config.provider,
        model: body?.model,
        baseUrl: this.config.baseUrl,
        stream,
        module: 'messages-passthrough',
      });
    } else {
      logger.info('Making request with API key authentication', {
        provider: this.config.provider,
        model: body?.model,
        baseUrl: this.config.baseUrl,
        apiKeyEnvVar: this.config.auth?.envVar,
        stream,
        module: 'messages-passthrough',
      });
    }

    let response: globalThis.Response;
    
    try {
      response = await fetchFunction(this.resolveBaseUrl(), {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(this.ensurePayloadBody(body, stream)),
      });
    } catch (error) {
      // Catch x402 payment errors (insufficient balance, payment failures, etc.)
      if (isX402Enabled) {
        logger.error('x402 payment request failed', error, {
          provider: this.config.provider,
          baseUrl: this.config.baseUrl,
          errorMessage: error instanceof Error ? error.message : String(error),
          module: 'messages-passthrough',
        });
      }
      throw error;
    }

    // Store fixed x402 cost for messages ($0.01 per request)
    // TODO: Replace with dynamically calculated amounts from x402 payment response
    if (isX402Enabled) {
      this.lastX402PaymentAmount = '0.01';
      
      const { logPaymentInfo, extractPaymentInfo } = await import('../payments/x402/index.js');
      const paymentInfo = extractPaymentInfo(response);
      if (paymentInfo) {
        logPaymentInfo(paymentInfo, {
          provider: this.config.provider,
          model: body?.model,
        });
      }
    }

    // Handle failed responses
    if (!response.ok) {
      const errorText = await response.text();
      
      // Special handling for 402 with x402 enabled - payment failed
      if (response.status === 402 && isX402Enabled) {
        logger.error('x402 payment failed', {
          provider: this.config.provider,
          error: errorText,
          module: 'messages-passthrough',
        });
        throw new PaymentError(
          errorText || 'Insufficient balance or payment error',
          { provider: this.config.provider, statusCode: response.status }
        );
      }
      
      // Standard error handling
      throw new ProviderError(
        this.config.provider,
        errorText || `HTTP ${response.status}`,
        response.status,
        { endpoint: this.resolveBaseUrl() }
      );
    }

    return response;
  }


  private trackUsage(payloadChunk: string, model: string, clientIp?: string): void {
    if (this.config.usage?.format !== 'anthropic_messages') {
      return;
    }

    try {
      this.streamBuffer += payloadChunk;
      const events = this.streamBuffer.split(/\n\n/);
      this.streamBuffer = events.pop() ?? '';

      for (const rawEvent of events) {
        const dataLines = rawEvent
          .split('\n')
          .filter(line => line.startsWith('data:'))
          .map(line => line.replace(/^data:\s?/, '').trim())
          .filter(Boolean);

        if (!dataLines.length) continue;

        const payload = dataLines.join('');
        if (!payload.startsWith('{')) continue;

        const data = JSON.parse(payload);
        
        // Don't accumulate from content_block_delta - we'll get the final response from message_delta/message_stop

        if (data.type === 'message_start' && data.message?.usage) {
          this.initialUsage = {
            inputTokens: data.message.usage.input_tokens || 0,
            cacheCreationTokens: data.message.usage.cache_creation_input_tokens || 0,
            cacheReadTokens: data.message.usage.cache_read_input_tokens || 0,
          };

          logger.debug('Usage tracking started', {
            provider: this.config.provider,
            model,
            ...this.initialUsage,
            module: 'messages-passthrough',
          });
          continue;
        }

        if (data.type === 'message_delta' || data.type === 'message_stop') {
          const usageData = data.usage;
          
          // Extract final response text from message_delta/message_stop event
          // Check if there's a message field with content
          if (data.message?.content && Array.isArray(data.message.content)) {
            const textContent = data.message.content
              .filter((c: any) => c.type === 'text')
              .map((c: any) => c.text || '')
              .join('');
            if (textContent) {
              this.assistantResponseBuffer = textContent;
            }
          }

          if (usageData) {
            const inputTokens = usageData.input_tokens ?? this.initialUsage?.inputTokens ?? 0;
            const cacheCreationTokens = usageData.cache_creation_input_tokens ?? this.initialUsage?.cacheCreationTokens ?? 0;
            const cacheReadTokens = usageData.cache_read_input_tokens ?? this.initialUsage?.cacheReadTokens ?? 0;
            const outputTokens = usageData.output_tokens ?? 0;

            const usingFallback = !this.initialUsage;

            if (usingFallback) {
              logger.warn('Using fallback usage tracking', {
                provider: this.config.provider,
                reason: 'missed_message_start',
                model,
                inputTokens,
                cacheCreationTokens,
                cacheReadTokens,
                outputTokens,
                module: 'messages-passthrough',
              });
            }

            const usageSnapshot = {
              inputTokens,
              cacheCreationTokens,
              cacheReadTokens,
              outputTokens,
            };

            logger.debug('Usage tracking completed', {
              provider: this.config.provider,
              model,
              ...usageSnapshot,
              x402PaymentAmount: this.lastX402PaymentAmount,
              willUseX402Pricing: !!this.lastX402PaymentAmount,
              module: 'messages-passthrough',
            });

            import('../utils/usage-tracker.js')
              .then(({ usageTracker }) => {
                usageTracker.trackUsage(
                  model,
                  this.config.provider,
                  inputTokens,
                  outputTokens,
                  cacheCreationTokens,
                  cacheReadTokens,
                  clientIp,
                  this.lastX402PaymentAmount, // Pass x402 payment amount if available
                );
                // Clear payment amount after tracking
                this.lastX402PaymentAmount = undefined;
              })
              .catch(error => {
                logger.error('Usage tracking failed', error, {
                  provider: this.config.provider,
                  operation: 'passthrough',
                  module: 'messages-passthrough',
                });
              });

            this.initialUsage = null;
            continue;
          }

          if (!this.initialUsage) {
            continue;
          }
        }
      }
    } catch (error) {
      logger.error('Usage tracking failed', error, {
        provider: this.config.provider,
        operation: 'passthrough',
        module: 'messages-passthrough',
      });
    }
  }

  async handleDirectRequest(request: any, res: ExpressResponse, clientIp?: string): Promise<void> {
    this.initialUsage = null;
    this.streamBuffer = '';
    this.assistantResponseBuffer = '';
    this.lastX402PaymentAmount = undefined; // Reset payment amount for new request

    // Retrieve and inject memory context
    this.injectMemoryContext(request);

    this.applyModelOptions(request);

    if (request.stream) {
      const response = await this.makeRequest(request, true);

      res.writeHead(200, {
        'Content-Type': CONTENT_TYPES.TEXT_PLAIN,
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      const reader = response.body!.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunkText = new TextDecoder().decode(value);
        setImmediate(() => this.trackUsage(chunkText, request.model, clientIp));

        res.write(value);
      }
      res.end();
      
      // Persist memory after streaming completes
      this.persistMemory(request, this.assistantResponseBuffer);
      return;
    }

    const response = await this.makeRequest(request, false);
    const json = await response.json();

    if (json.usage && this.config.usage?.format === 'anthropic_messages') {
      const inputTokens = json.usage.input_tokens || 0;
      const cacheCreationTokens = json.usage.cache_creation_input_tokens || 0;
      const cacheReadTokens = json.usage.cache_read_input_tokens || 0;
      const outputTokens = json.usage.output_tokens || 0;

      logger.debug('Tracking non-streaming usage', {
        provider: this.config.provider,
        model: request.model,
        inputTokens,
        cacheCreationTokens,
        cacheReadTokens,
        outputTokens,
        x402PaymentAmount: this.lastX402PaymentAmount,
        willUseX402Pricing: !!this.lastX402PaymentAmount,
        module: 'messages-passthrough',
      });

      import('../utils/usage-tracker.js')
        .then(({ usageTracker }) => {
          usageTracker.trackUsage(
            request.model,
            this.config.provider,
            inputTokens,
            outputTokens,
            cacheCreationTokens,
            cacheReadTokens,
            clientIp,
            this.lastX402PaymentAmount, // Pass x402 payment amount if available
          );
          // Clear payment amount after tracking
          this.lastX402PaymentAmount = undefined;
        })
        .catch(error => {
          logger.error('Usage tracking failed', error, {
            provider: this.config.provider,
            operation: 'passthrough',
            module: 'messages-passthrough',
          });
        });
    }

    // Extract assistant response from non-streaming response
    const assistantResponse = json?.content?.[0]?.text || '';
    this.persistMemory(request, assistantResponse);

    res.json(json);
  }
  
  private injectMemoryContext(request: any): void {
    try {
      const { memoryService } = require('../memory/memory-service.js');
      
      // Retrieve memories for the user (uses default limit from memory backend)
      const memories = memoryService.retrieve({
        userId: 'default',
      });
      
      logger.info('Memory retrieval result', {
        totalMemories: memories.length,
        provider: this.config.provider,
        module: 'messages-passthrough',
      });
      
      if (memories.length === 0) {
        logger.info('No memories found to inject', { 
          provider: this.config.provider,
          module: 'messages-passthrough' 
        });
        return;
      }
      
      // Extract user content from current messages for deduplication
      const currentMessages = request.messages || [];
      const currentUserContents = currentMessages
        .filter((msg: any) => msg.role === 'user')
        .map((msg: any) => {
          let content: string;
          if (typeof msg.content === 'string') {
            content = msg.content;
          } else if (Array.isArray(msg.content)) {
            content = msg.content
              .map((c: any) => c.type === 'text' ? c.text : `[${c.type}]`)
              .join(' ');
          } else {
            content = JSON.stringify(msg.content);
          }
          return content.trim();
        });
      
      // Filter out memories that are already in the current conversation
      const relevantMemories = memories.filter((memory) => {
        // Extract user content from memory (format: "User: <content>\n\nAssistant: <response>")
        const userMatch = memory.content.match(/^User: ([\s\S]*?)\n\nAssistant:/);
        if (!userMatch) return false;
        
        const memoryUserContent = userMatch[1].trim();
        return !currentUserContents.includes(memoryUserContent);
      });
      
      if (relevantMemories.length === 0) {
        logger.info('No new memories to inject after deduplication', { 
          totalMemories: memories.length,
          currentUserMessages: currentUserContents.length,
          provider: this.config.provider,
          module: 'messages-passthrough' 
        });
        return;
      }
      
      // Format memories for system parameter
      const formattedMemories = relevantMemories
        .reverse() // Oldest first
        .map((m) => m.content)
        .join('\n\n---\n\n');
      
      const memoryContext = `Previous conversation context:\n\n${formattedMemories}`;
      
      // Anthropic Messages API uses top-level 'system' parameter, not a system role in messages
      if (request.system) {
        // Prepend memory context to existing system prompt
        request.system = `${memoryContext}\n\n---\n\n${request.system}`;
      } else {
        // Set as new system parameter
        request.system = memoryContext;
      }
    } catch (error) {
      logger.warn('Failed to inject memory context', { 
        error, 
        provider: this.config.provider,
        module: 'messages-passthrough' 
      });
    }
  }

  private persistMemory(request: any, assistantResponse: string): void {
    try {
      const { memoryService } = require('../memory/memory-service.js');
      
      // Extract only the LAST user message (current turn)
      const messages = request.messages || [];
      const userMessages = messages.filter((msg: any) => msg.role === 'user');
      
      if (userMessages.length === 0) {
        logger.debug('No user message found to persist', { module: 'messages-passthrough' });
        return;
      }
      
      const lastUserMessage = userMessages[userMessages.length - 1];
      let userContent: string;
      
      if (typeof lastUserMessage.content === 'string') {
        userContent = lastUserMessage.content;
      } else if (Array.isArray(lastUserMessage.content)) {
        userContent = lastUserMessage.content
          .map((c: any) => c.type === 'text' ? c.text : `[${c.type}]`)
          .join(' ');
      } else {
        userContent = JSON.stringify(lastUserMessage.content);
      }
      
      // Skip persisting if user content is empty
      if (!userContent || !userContent.trim()) {
        logger.debug('Skipping memory persistence - user content empty', { 
          module: 'messages-passthrough' 
        });
        return;
      }
      
      // Skip if assistant response is too short or empty (not useful)
      const trimmedResponse = assistantResponse.trim();
      if (!trimmedResponse || trimmedResponse.length < 3) {
        return;
      }
      
      const content = `User: ${userContent}\n\nAssistant: ${assistantResponse}`;
      
      // Filter out specific test patterns
      const filteredPatterns = [
        'User: test\n\nAssistant: Hello',
      ];
      if (filteredPatterns.includes(content)) {
        return;
      }
      
      memoryService.add({
        userId: 'default',
        agentId: this.config.provider,
        content,
        metadata: {
          model: request.model,
          provider: this.config.provider,
        },
      });
      
      logger.debug('Memory persisted in passthrough', {
        provider: this.config.provider,
        model: request.model,
        hasAssistantResponse: assistantResponse.length > 0,
        module: 'messages-passthrough',
      });
    } catch (error) {
      logger.warn('Failed to persist memory in passthrough', { 
        error, 
        provider: this.config.provider,
        module: 'messages-passthrough' 
      });
    }
  }
}
