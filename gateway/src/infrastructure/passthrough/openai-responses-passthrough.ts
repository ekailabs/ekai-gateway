import { Response as ExpressResponse } from 'express';
import { logger } from '../utils/logger.js';
import { APIError } from '../utils/error-handler.js';
import { CONTENT_TYPES } from '../../domain/types/provider.js';

export class OpenAIResponsesPassthrough {
  private readonly baseUrl = 'https://api.openai.com/v1/responses';

  private get apiKey(): string {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new APIError(401, 'OpenAI API key not configured');
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
      throw new APIError(response.status, `OpenAI API error: ${response.status} - ${errorText}`);
    }

    return response;
  }

  private trackUsage(text: string, model: string): void {
    try {
      // Add to buffer to handle multi-chunk events
      this.eventBuffer += text;
      
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
                0 // cache read tokens
              );
            }).catch((error) => {
              logger.error('Usage tracking failed', error instanceof Error ? error : new Error(String(error)), { provider: 'openai', operation: 'passthrough', module: 'openai-responses-passthrough' });
            });
          } else {
            logger.warn('No usage data in response', { provider: 'openai', operation: 'passthrough', module: 'openai-responses-passthrough' });
          }
        } catch (parseError) {
          logger.error('JSON parse error', parseError instanceof Error ? parseError : new Error(String(parseError)), { provider: 'openai', operation: 'response_parsing', module: 'openai-responses-passthrough' });
          logger.debug('Raw JSON data', { provider: 'openai', operation: 'response_parsing', module: 'openai-responses-passthrough' });
        }
        
        // Clear buffer after processing
        this.eventBuffer = '';
      }
    } catch (error) {
      logger.error('Usage tracking failed', error instanceof Error ? error : new Error(String(error)), { provider: 'openai', operation: 'passthrough', module: 'openai-responses-passthrough' });
    }
  }

  async handleDirectRequest(request: any, res: ExpressResponse): Promise<void> {
    // Reset usage tracking for new request
    this.usage = null;
    this.eventBuffer = '';

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
        setImmediate(() => this.trackUsage(text, request.model));
        
        res.write(value);
      }
      res.end();
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
          usageTracker.trackUsage(request.model, 'openai', nonCachedInputTokens, outputTokens, cachedTokens, 0);
        }).catch(() => {});
      }

      res.json(json);
    }
  }
}

// Singleton instance
export const openaiResponsesPassthrough = new OpenAIResponsesPassthrough();
