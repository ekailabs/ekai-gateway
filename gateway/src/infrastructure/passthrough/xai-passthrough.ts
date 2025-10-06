import { Response as ExpressResponse } from 'express';
import { logger } from '../utils/logger.js';
import { APIError } from '../utils/error-handler.js';
import { CONTENT_TYPES } from '../../domain/types/provider.js';

export class XAIPassthrough {
  private readonly baseUrl = 'https://api.x.ai/v1/messages';

  private get apiKey(): string {
    const key = process.env.XAI_API_KEY;
    if (!key) throw new APIError(401, 'xAI API key not configured');
    return key;
  }

  // Store initial usage data from message_start
  private initialUsage: {
    inputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
  } | null = null;

  private async makeRequest(body: any, stream: boolean): Promise<globalThis.Response> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, `xAI API error: ${response.status} - ${errorText}`);
    }

    return response;
  }

  private trackUsage(text: string, model: string, clientIp?: string): void {
    try {
      // Handle message_start event (initial usage data)
      if (text.includes('message_start')) {
        const match = text.match(/data: ({.*"type":"message_start".*})/);
        if (match) {
          const data = JSON.parse(match[1]);
          if (data.message?.usage) {
            this.initialUsage = {
              inputTokens: data.message.usage.input_tokens || 0,
              cacheCreationTokens: data.message.usage.cache_creation_input_tokens || 0,
              cacheReadTokens: data.message.usage.cache_read_input_tokens || 0
            };

            // Initial usage captured successfully
          }
        }
        return;
      }

      // Handle final usage event (message_delta or message_stop with complete output_tokens)
      if (text.includes('message_delta') || text.includes('message_stop')) {
        const match = text.match(/data: ({.*"type":"(?:message_delta|message_stop)".*})/);
        if (match) {
          const data = JSON.parse(match[1]);
          if (data.usage && this.initialUsage) {
            const outputTokens = data.usage.output_tokens || 0;

            // Track usage for this request

            import('../utils/usage-tracker.js').then(({ usageTracker }) => {
              // Use initial usage if available, otherwise use fallback values
              const inputTokens = this.initialUsage?.inputTokens || 0;
              const cacheCreationTokens = this.initialUsage?.cacheCreationTokens || 0;
              const cacheReadTokens = this.initialUsage?.cacheReadTokens || 0;

              usageTracker.trackUsage(
                model,
                'xAI',
                inputTokens,
                outputTokens,
                cacheCreationTokens,
                cacheReadTokens,
                clientIp
              );
            }).catch((error) => {
              logger.error('Usage tracking failed', error, { provider: 'xai', operation: 'passthrough', module: 'xai-passthrough' });
            });

            // Reset for next request
            this.initialUsage = null;
          } else if (data.usage && !this.initialUsage) {
            // Fallback: if we missed message_start, use whatever we have
            const inputTokens = data.usage.input_tokens || 0;
            const cacheCreationTokens = data.usage.cache_creation_input_tokens || 0;
            const cacheReadTokens = data.usage.cache_read_input_tokens || 0;
            const outputTokens = data.usage.output_tokens || 0;

            // Using fallback usage tracking (message_start missed)

            import('../utils/usage-tracker.js').then(({ usageTracker }) => {
              usageTracker.trackUsage(model, 'xAI', inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, clientIp);
            }).catch(() => {});
          }
        }
      }
    } catch (error) {
      logger.error('Usage tracking failed', error, { provider: 'xai', operation: 'passthrough', module: 'xai-passthrough' });
    }
  }

  async handleDirectRequest(request: any, res: ExpressResponse, clientIp?: string): Promise<void> {
    // Reset usage tracking for new request
    this.initialUsage = null;

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

        const text = new TextDecoder().decode(value);
        setImmediate(() => this.trackUsageSSE(text, request.model, clientIp));

        res.write(value);
      }
      res.end();
    } else {
      const response = await this.makeRequest(request, false);
      const json = await response.json();

      // Track usage for non-streaming requests
      if (json.usage) {
        const inputTokens = json.usage.input_tokens || 0;
        const cacheCreationTokens = json.usage.cache_creation_input_tokens || 0;
        const cacheReadTokens = json.usage.cache_read_input_tokens || 0;
        const outputTokens = json.usage.output_tokens || 0;

        // Track non-streaming usage

        import('../utils/usage-tracker.js').then(({ usageTracker }) => {
          usageTracker.trackUsage(request.model, 'xAI', inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, clientIp);
        }).catch(() => {});
      }

      res.json(json);
    }
  }
}

// Singleton instance
export const xaiPassthrough = new XAIPassthrough();

// xAI Responses API passthrough (OpenAI Responses-compatible)
export class XAIResponsesPassthrough {
  private readonly baseUrl = 'https://api.x.ai/v1/responses';

  private get apiKey(): string {
    const key = process.env.XAI_API_KEY;
    if (!key) throw new APIError(401, 'xAI API key not configured');
    return key;
  }

  // Store usage data for tracking (kept for parity; usage is read per-event)
  private eventBuffer: string = '';

  private async makeRequest(body: any, stream: boolean): Promise<globalThis.Response> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ...body, stream, store: true })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, `xAI Responses API error: ${response.status} - ${errorText}`);
    }

    return response;
  }

  private trackUsage(text: string, model: string, clientIp?: string): void {
    try {
      // Buffer stream to handle multi-chunk JSON events
      this.eventBuffer += text;

      // Look for the completed marker anywhere in the object (xAI may not put type first)
      const typePos = this.eventBuffer.indexOf('"type":"response.completed"');
      if (typePos !== -1) {
        // Find the opening brace of the JSON object that contains the type field
        let startIndex = -1;
        for (let i = typePos; i >= 0; i--) {
          if (this.eventBuffer[i] === '{') { startIndex = i; break; }
        }
        if (startIndex === -1) return; // No opening brace yet

        // Find the matching closing brace using brace counting
        let braceCount = 0;
        let endIndex = -1;
        for (let i = startIndex; i < this.eventBuffer.length; i++) {
          const ch = this.eventBuffer[i];
          if (ch === '{') braceCount++;
          if (ch === '}') braceCount--;
          if (braceCount === 0) { endIndex = i; break; }
        }
        if (endIndex === -1) return; // Incomplete object; wait for more data

        const jsonString = this.eventBuffer.substring(startIndex, endIndex + 1);

        logger.debug('JSON response found', { provider: 'xai', operation: 'response_parsing', module: 'xai-responses-passthrough' });
        try {
          const data = JSON.parse(jsonString);
          logger.debug('Response parsed successfully', { provider: 'xai', operation: 'usage_extraction', module: 'xai-responses-passthrough' });
          const usage = data?.response?.usage;
          if (usage) {
            const totalInputTokens = usage.input_tokens || 0;
            const cachedTokens = usage.input_tokens_details?.cached_tokens || 0;
            const nonCachedInputTokens = totalInputTokens - cachedTokens;
            const outputTokens = usage.output_tokens || 0;

            logger.debug('Usage tracking from response', {
              provider: 'xai',
              model,
              totalInputTokens,
              nonCachedInputTokens,
              cachedTokens,
              outputTokens,
              module: 'xai-responses-passthrough'
            });

            import('../utils/usage-tracker.js').then(({ usageTracker }) => {
              usageTracker.trackUsage(
                model,
                'xAI',
                nonCachedInputTokens,
                outputTokens,
                cachedTokens,
                0,
                clientIp
              );
            }).catch((error) => {
              logger.error('Usage tracking failed', error, { provider: 'xai', operation: 'passthrough', module: 'xai-responses-passthrough' });
            });
          } else {
            logger.warn('No usage data in response', { provider: 'xai', operation: 'passthrough', module: 'xai-responses-passthrough' });
          }
        } catch (parseError) {
          logger.error('JSON parse error', parseError, { provider: 'xai', operation: 'response_parsing', module: 'xai-responses-passthrough' });
        }

        // Clear buffer after processing
        this.eventBuffer = '';
      }
    } catch (error) {
      logger.error('Usage tracking failed', error, { provider: 'xai', operation: 'passthrough', module: 'xai-responses-passthrough' });
    }
  }


  async handleDirectRequest(request: any, res: ExpressResponse, clientIp?: string): Promise<void> {
    // Reset state for new request
    this.eventBuffer = '';

    if (request.stream) {
      const response = await this.makeRequest(request, true);

      res.writeHead(200, {
        'Content-Type': CONTENT_TYPES.EVENT_STREAM,
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      const reader = response.body!.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = new TextDecoder().decode(value);
        setImmediate(() => this.trackUsage(text, request.model, clientIp));

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
          provider: 'xai',
          model: request.model,
          totalInputTokens,
          nonCachedInputTokens,
          cachedTokens,
          outputTokens,
          totalTokens,
          reasoningTokens,
          module: 'xai-responses-passthrough'
        });

        import('../utils/usage-tracker.js').then(({ usageTracker }) => {
          usageTracker.trackUsage(request.model, 'xAI', nonCachedInputTokens, outputTokens, cachedTokens, 0, clientIp);
        }).catch(() => {});
      }

      res.json(json);
    }
  }
}

// Singleton instance for Responses passthrough
export const xaiResponsesPassthrough = new XAIResponsesPassthrough();
