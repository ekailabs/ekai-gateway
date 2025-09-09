import { Response as ExpressResponse } from 'express';
import { logger } from '../utils/logger.js';
import { APIError } from '../utils/error-handler.js';
import { CONTENT_TYPES } from '../../domain/types/provider.js';
import { ModelUtils } from '../utils/model-utils.js';

export class AnthropicPassthrough {
  private readonly baseUrl = 'https://api.anthropic.com/v1/messages';

  private get apiKey(): string {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new APIError(401, 'Anthropic API key not configured');
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
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ ...body, stream })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, `Anthropic API error: ${response.status} - ${errorText}`);
    }

    return response;
  }

  private trackUsage(text: string, model: string): void {
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

            logger.info('ANTHROPIC_PASSTHROUGH: Captured initial usage', {
              model,
              ...this.initialUsage
            });
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

            logger.info('ANTHROPIC_PASSTHROUGH: Tracking final usage', {
              model,
              ...this.initialUsage,
              outputTokens
            });

            import('../utils/usage-tracker.js').then(({ usageTracker }) => {
              usageTracker.trackUsage(
                model,
                'anthropic',
                this.initialUsage!.inputTokens,
                outputTokens,
                this.initialUsage!.cacheCreationTokens,
                this.initialUsage!.cacheReadTokens
              );
            }).catch(() => {});

            // Reset for next request
            this.initialUsage = null;
          } else if (data.usage && !this.initialUsage) {
            // Fallback: if we missed message_start, use whatever we have
            const inputTokens = data.usage.input_tokens || 0;
            const cacheCreationTokens = data.usage.cache_creation_input_tokens || 0;
            const cacheReadTokens = data.usage.cache_read_input_tokens || 0;
            const outputTokens = data.usage.output_tokens || 0;

            logger.warn('ANTHROPIC_PASSTHROUGH: Missed message_start, using fallback usage tracking', {
              model,
              inputTokens,
              cacheCreationTokens,
              cacheReadTokens,
              outputTokens
            });

            import('../utils/usage-tracker.js').then(({ usageTracker }) => {
              usageTracker.trackUsage(model, 'anthropic', inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens);
            }).catch(() => {});
          }
        }
      }
    } catch (error) {
      logger.error('ANTHROPIC_PASSTHROUGH: Error tracking usage', error);
    }
  }

  async handleDirectRequest(request: any, res: ExpressResponse): Promise<void> {
    // Reset usage tracking for new request
    this.initialUsage = null;

    // Ensure Anthropic models have required suffixes for pricing lookup
    request.model = ModelUtils.ensureAnthropicSuffix(request.model);
    
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
        setImmediate(() => this.trackUsage(text, request.model));
        
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

        logger.info('ANTHROPIC_PASSTHROUGH: Tracking non-streaming usage', {
          model: request.model,
          inputTokens,
          cacheCreationTokens,
          cacheReadTokens,
          outputTokens
        });

        import('../utils/usage-tracker.js').then(({ usageTracker }) => {
          usageTracker.trackUsage(request.model, 'anthropic', inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens);
        }).catch(() => {});
      }

      res.json(json);
    }
  }
}

// Singleton instance
export const anthropicPassthrough = new AnthropicPassthrough();