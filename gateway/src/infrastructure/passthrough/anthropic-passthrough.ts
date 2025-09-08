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
    if (!text.includes('message_delta')) return;
    
    try {
      const match = text.match(/data: ({.*"type":"message_delta".*})/);
      if (match) {
        const data = JSON.parse(match[1]);
        if (data.usage) {
          logger.info('ANTHROPIC_PASSTHROUGH: Tracking usage', {
            model,
            inputTokens: data.usage.input_tokens,
            outputTokens: data.usage.output_tokens
          });
          
          import('../utils/usage-tracker.js').then(({ usageTracker }) => {
            usageTracker.trackUsage(model, 'anthropic', data.usage.input_tokens || 0, data.usage.output_tokens || 0);
          }).catch(() => {});
        }
      }
    } catch {}
  }

  async handleDirectRequest(request: any, res: ExpressResponse): Promise<void> {
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
      
      // Track usage
      if (json.usage) {
        this.trackUsage(`data: {"type":"message_delta","usage":${JSON.stringify(json.usage)}}`, request.model);
      }
      
      res.json(json);
    }
  }
}

// Singleton instance
export const anthropicPassthrough = new AnthropicPassthrough();