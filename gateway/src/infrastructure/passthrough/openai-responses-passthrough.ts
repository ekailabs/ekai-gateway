import { Response as ExpressResponse } from 'express';
import { logger } from '../utils/logger.js';
import { AuthenticationError, ProviderError } from '../../shared/errors/index.js';
import { CONTENT_TYPES } from '../../domain/types/provider.js';
import { getConfig } from '../config/app-config.js';

export class OpenAIResponsesPassthrough {
  private readonly baseUrl = 'https://api.openai.com/v1/responses';

  private get apiKey(): string {
    const key = getConfig().providers.openai.apiKey;
    if (!key) throw new AuthenticationError('OpenAI API key not configured', { provider: 'openai' });
    return key;
  }

  // Store usage data for tracking
  private usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  } | null = null;

  // Buffer to handle multi-chunk SSE events
  private eventBuffer: string = '';
  
  // Buffer to accumulate assistant response
  private assistantResponseBuffer: string = '';

  private async makeRequest(body: any, stream: boolean): Promise<globalThis.Response> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ...body, stream, store: false }) // Not storing responses
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ProviderError('openai', errorText || `HTTP ${response.status}`, response.status, { endpoint: this.baseUrl });
    }

    return response;
  }

  private trackUsage(text: string, model: string, clientIp?: string): void {
    try {
      // Add to buffer to handle multi-chunk events
      this.eventBuffer += text;
      
      // Extract assistant response content from text.delta events
      const textDeltaMatch = /"type":"response\.text\.delta"[^}]*"text":"([^"]+)"/g;
      let match;
      while ((match = textDeltaMatch.exec(text)) !== null) {
        this.assistantResponseBuffer += match[1];
      }
      
      // Look for the exact response.completed event
      if (this.eventBuffer.includes('"type":"response.completed"')) {
        
        // Find the start of the JSON object
        const startIndex = this.eventBuffer.indexOf('{"type":"response.completed"');
        if (startIndex === -1) return;
        
        // Find the end by counting braces
        let braceCount = 0;
        let endIndex = -1;
        
        for (let i = startIndex; i < this.eventBuffer.length; i++) {
          if (this.eventBuffer[i] === '{') braceCount++;
          if (this.eventBuffer[i] === '}') braceCount--;
          
          if (braceCount === 0) {
            endIndex = i;
            break;
          }
        }
        
        if (endIndex === -1) return; // Incomplete JSON, wait for more chunks
        
        // Extract the complete JSON
        const jsonString = this.eventBuffer.substring(startIndex, endIndex + 1);
        
        logger.debug('JSON response found', { provider: 'openai', operation: 'response_parsing', module: 'openai-responses-passthrough' });
        
        try {
          const data = JSON.parse(jsonString);
          logger.debug('Response parsed successfully', { provider: 'openai', operation: 'usage_extraction', module: 'openai-responses-passthrough' });
          
          // Extract usage data from response.usage
          if (data.response?.usage) {
            const usage = data.response.usage;
            const totalInputTokens = usage.input_tokens || 0;
            const cachedTokens = usage.input_tokens_details?.cached_tokens || 0;
            const nonCachedInputTokens = totalInputTokens - cachedTokens; // Split for pricing
            const outputTokens = usage.output_tokens || 0;
            const totalTokens = usage.total_tokens || (totalInputTokens + outputTokens);
            const reasoningTokens = usage.output_tokens_details?.reasoning_tokens || 0;

            logger.debug('Usage tracking from response', {
              provider: 'openai',
              model,
              totalInputTokens,
              nonCachedInputTokens,
              cachedTokens,
              outputTokens,
              totalTokens,
              reasoningTokens,
              module: 'openai-responses-passthrough'
            });

            import('../utils/usage-tracker.js').then(({ usageTracker }) => {
              usageTracker.trackUsage(
                model,
                'openai',
                nonCachedInputTokens, // Send non-cached input tokens for correct pricing
                outputTokens,
                cachedTokens,         // Send cached tokens separately for correct pricing
                0, // cache read tokens
                clientIp
              );
            }).catch((error) => {
              logger.error('Usage tracking failed', error, { provider: 'openai', operation: 'passthrough', module: 'openai-responses-passthrough' });
            });
          } else {
            logger.warn('No usage data in response', { provider: 'openai', operation: 'passthrough', module: 'openai-responses-passthrough' });
          }
        } catch (parseError) {
          logger.error('JSON parse error', parseError, { provider: 'openai', operation: 'response_parsing', module: 'openai-responses-passthrough' });
          logger.debug('Raw JSON data', { provider: 'openai', operation: 'response_parsing', module: 'openai-responses-passthrough' });
        }
        
        // Clear buffer after processing
        this.eventBuffer = '';
      }
    } catch (error) {
      logger.error('Usage tracking failed', error, { provider: 'openai', operation: 'passthrough', module: 'openai-responses-passthrough' });
    }
  }

  async handleDirectRequest(request: any, res: ExpressResponse, clientIp?: string): Promise<void> {
    // Reset usage tracking for new request
    this.usage = null;
    this.eventBuffer = '';
    this.assistantResponseBuffer = '';

    // Retrieve and inject memory context
    this.injectMemoryContext(request);

    if (request.stream) {
      const response = await this.makeRequest(request, true);

      res.writeHead(200, {
        'Content-Type': CONTENT_TYPES.EVENT_STREAM,
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // Manual stream processing like Anthropic for usage tracking
      const reader = response.body!.getReader();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const text = new TextDecoder().decode(value);
        setImmediate(() => this.trackUsage(text, request.model, clientIp));
        
        res.write(value);
      }
      res.end();
      
      // Persist memory after streaming completes
      this.persistMemory(request, this.assistantResponseBuffer);
    } else {
      const response = await this.makeRequest(request, false);
      const json = await response.json();

      // Track usage for non-streaming requests
      if (json.usage) {
        const totalInputTokens = json.usage.input_tokens || 0;
        const cachedTokens = json.usage.input_tokens_details?.cached_tokens || 0;
        const nonCachedInputTokens = totalInputTokens - cachedTokens; // Split for pricing
        const outputTokens = json.usage.output_tokens || 0;
        const totalTokens = json.usage.total_tokens || (totalInputTokens + outputTokens);
        const reasoningTokens = json.usage.output_tokens_details?.reasoning_tokens || 0;

        logger.debug('Tracking non-streaming usage', {
          provider: 'openai',
          model: request.model,
          totalInputTokens,
          nonCachedInputTokens,
          cachedTokens,
          outputTokens,
          totalTokens,
          reasoningTokens,
          module: 'openai-responses-passthrough'
        });

        import('../utils/usage-tracker.js').then(({ usageTracker }) => {
          usageTracker.trackUsage(request.model, 'openai', nonCachedInputTokens, outputTokens, cachedTokens, 0, clientIp);
        }).catch(() => {});
      }

      // Extract assistant response from non-streaming response
      const assistantResponse = json?.output?.[0]?.content?.[0]?.text || '';
      this.persistMemory(request, assistantResponse);

      res.json(json);
    }
  }
  
  private injectMemoryContext(request: any): void {
    try {
      const { memoryService } = require('../memory/memory-service.js');
      
      // Retrieve memories for the user (uses default limit from memory backend)
      const memories = memoryService.retrieve({
        userId: 'test',
      });
      
      logger.info('Memory retrieval result', {
        totalMemories: memories.length,
        provider: 'openai',
        module: 'openai-responses-passthrough',
      });
      
      if (memories.length === 0) {
        logger.info('No memories found to inject', { 
          provider: 'openai',
          module: 'openai-responses-passthrough' 
        });
        return;
      }
      
      // Extract current user input for deduplication
      const currentUserContent = (request.input || '').trim();
      
      // Filter out memories that contain the current user input
      const relevantMemories = memories.filter((memory) => {
        // Extract user content from memory (format: "User: <content>\n\nAssistant: <response>")
        const userMatch = memory.content.match(/^User: ([\s\S]*?)\n\nAssistant:/);
        if (!userMatch) return false;
        
        const memoryUserContent = userMatch[1].trim();
        return memoryUserContent !== currentUserContent;
      });
      
      if (relevantMemories.length === 0) {
        logger.info('No new memories to inject after deduplication', { 
          totalMemories: memories.length,
          currentUserInput: currentUserContent,
          provider: 'openai',
          module: 'openai-responses-passthrough' 
        });
        return;
      }
      
      // Format memories for instructions field
      const formattedMemories = relevantMemories
        .reverse() // Oldest first
        .map((m) => m.content)
        .join('\n\n---\n\n');
      
      const memoryContext = `Previous conversation context:\n\n${formattedMemories}`;
      
      // Inject into instructions field (prepend to existing instructions if any)
      if (request.instructions) {
        request.instructions = `${memoryContext}\n\n---\n\n${request.instructions}`;
      } else {
        request.instructions = memoryContext;
      }
      
      logger.info('Memory context injected', {
        totalMemories: memories.length,
        injectedCount: relevantMemories.length,
        provider: 'openai',
        injectedContent: formattedMemories.substring(0, 500) + (formattedMemories.length > 500 ? '...' : ''),
        module: 'openai-responses-passthrough',
      });
    } catch (error) {
      logger.warn('Failed to inject memory context', { 
        error, 
        provider: 'openai',
        module: 'openai-responses-passthrough' 
      });
    }
  }
  
  private persistMemory(request: any, assistantResponse: string): void {
    try {
      const { memoryService } = require('../memory/memory-service.js');
      
      // Extract user input (OpenAI Responses API has different structure)
      // The 'input' field contains the current user message
      const userContent = request.input || '';
      
      if (!userContent) {
        logger.debug('No user input found to persist', { module: 'openai-responses-passthrough' });
        return;
      }
      
      const content = `User: ${userContent}\n\nAssistant: ${assistantResponse}`;
      
      memoryService.add({
        userId: 'test',
        agentId: 'openai',
        content,
        metadata: {
          model: request.model,
          provider: 'openai',
        },
      });
      
      logger.debug('Memory persisted in passthrough', {
        provider: 'openai',
        model: request.model,
        hasAssistantResponse: assistantResponse.length > 0,
        module: 'openai-responses-passthrough',
      });
    } catch (error) {
      logger.warn('Failed to persist memory in passthrough', { 
        error, 
        provider: 'openai',
        module: 'openai-responses-passthrough' 
      });
    }
  }
}

// Singleton instance
export const openaiResponsesPassthrough = new OpenAIResponsesPassthrough();
