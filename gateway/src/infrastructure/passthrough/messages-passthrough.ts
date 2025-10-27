import { Response as ExpressResponse } from 'express';
import { logger } from '../utils/logger.js';
import { APIError } from '../utils/error-handler.js';
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
      throw new APIError(401, `${this.config.provider} API key not configured`);
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

    // Log payment information if present
    if (isX402Enabled && response.headers.has('x-payment-response')) {
      await this.handleX402PaymentResponse(response, body?.model);
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
        throw new APIError(
          response.status,
          `x402 payment failed: ${errorText || 'Insufficient balance or payment error'}`
        );
      }
      
      // Standard error handling
      throw new APIError(response.status, `${this.config.provider} API error: ${response.status} - ${errorText}`);
    }

    return response;
  }

  private async handleX402PaymentResponse(response: Response, model?: string): Promise<void> {
    try {
      const { extractPaymentInfo, logPaymentInfo } = await import('../payments/x402/index.js');
      const paymentInfo = extractPaymentInfo(response);
      
      if (paymentInfo) {
        logPaymentInfo(paymentInfo, {
          provider: this.config.provider,
          model,
        });
      }
    } catch (error) {
      logger.debug('Could not process x402 payment response', {
        error: error instanceof Error ? error.message : String(error),
        module: 'messages-passthrough',
      });
    }
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
                );
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
          );
        })
        .catch(error => {
          logger.error('Usage tracking failed', error, {
            provider: this.config.provider,
            operation: 'passthrough',
            module: 'messages-passthrough',
          });
        });
    }

    res.json(json);
  }
}
