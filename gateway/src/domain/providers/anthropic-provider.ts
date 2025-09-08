import { BaseProvider } from './base-provider.js';
import { CanonicalRequest, CanonicalResponse } from 'shared/types/index.js';
import { APIError } from '../../infrastructure/utils/error-handler.js';
import fetch, { Response } from 'node-fetch';

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: Array<{ role: 'user' | 'assistant'; content: string; }>;
  system?: string;
  temperature?: number;
  stream?: boolean;
}

interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{ type: 'text'; text: string; }>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence';
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// Constants
const DEFAULT_MAX_TOKENS = 1000;
const ANTHROPIC_VERSION = '2023-06-01';
const REQUEST_TIMEOUT = 30000;

export class AnthropicProvider extends BaseProvider {
  readonly name = 'anthropic';
  protected readonly baseUrl = 'https://api.anthropic.com/v1';
  protected readonly apiKey = process.env.ANTHROPIC_API_KEY;

  private validateApiKey(): void {
    if (!this.apiKey) {
      throw new APIError(401, `${this.name} API key not configured`);
    }
  }

  private async makeRequest(url: string, body: any, stream: boolean = false): Promise<Response> {
    this.validateApiKey();
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ ...body, stream }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new APIError(response.status, `${this.name} API error: ${response.status} - ${errorText}`);
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async chatCompletion(request: CanonicalRequest): Promise<CanonicalResponse> {
    // For non-streaming, collect the stream and parse it
    const streamResponse = await this.getStreamingResponse(request);
    const text = await streamResponse.text();
    return this.parseStreamToCanonical(text, request);
  }

  // Get raw streaming response  
  async getStreamingResponse(request: CanonicalRequest): Promise<Response> {
    const transformedRequest = this.transformRequest(request);
    const url = `${this.baseUrl}${this.getChatCompletionEndpoint()}`;
    
    return await this.makeRequest(url, transformedRequest, true);
  }

  private parseStreamToCanonical(streamText: string, originalRequest: CanonicalRequest): CanonicalResponse {
    let finalMessage = '';
    let usage = { input_tokens: 0, output_tokens: 0 };

    // Parse Server-Sent Events format
    const lines = streamText.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const dataStr = line.slice(6);
        if (dataStr === '[DONE]') break;
        
        try {
          const data = JSON.parse(dataStr);
          if (data.type === 'content_block_delta' && data.delta?.text) {
            finalMessage += data.delta.text;
          } else if (data.type === 'message_delta' && data.usage) {
            usage = { ...usage, ...data.usage };
          } else if (data.type === 'message_start' && data.message?.usage) {
            usage = { ...usage, ...data.message.usage };
          }
        } catch (e) {
          // Skip malformed JSON lines
        }
      }
    }

    // Track usage
    if (usage.input_tokens || usage.output_tokens) {
      import('../../infrastructure/utils/usage-tracker.js').then(({ usageTracker }) => {
        usageTracker.trackUsage(originalRequest.model, this.name, usage.input_tokens, usage.output_tokens);
      });
    }

    // Return canonical response
    return {
      id: `msg-${Date.now()}`,
      model: originalRequest.model,
      created: Math.floor(Date.now() / 1000),
      message: {
        role: 'assistant',
        content: [{
          type: 'text',
          text: finalMessage
        }]
      },
      finishReason: 'stop',
      usage: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        totalTokens: usage.input_tokens + usage.output_tokens
      }
    };
  }

  protected getHeaders(): Record<string, string> {
    this.validateApiKey();
    return {
      'x-api-key': this.apiKey!,
      'Content-Type': 'application/json',
      'anthropic-version': ANTHROPIC_VERSION
    };
  }

  protected getChatCompletionEndpoint(): string {
    return '/messages';
  }

  protected transformRequest(request: CanonicalRequest): AnthropicRequest {
    // Extract system message and regular messages
    let systemPrompt: string | undefined;
    const messages: Array<{ role: 'user' | 'assistant'; content: string; }> = [];

    for (const message of request.messages) {
      if (message.role === 'system') {
        // Combine all text content for system message
        systemPrompt = message.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('');
      } else if (message.role === 'user' || message.role === 'assistant') {
        // Combine all text content for regular messages
        const content = message.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('');
        
        messages.push({
          role: message.role,
          content
        });
      }
    }

    const anthropicRequest: AnthropicRequest = {
      model: request.model,
      max_tokens: request.maxTokens || DEFAULT_MAX_TOKENS,
      messages,
      temperature: request.temperature,
      stream: request.stream || false
    };

    if (systemPrompt) {
      anthropicRequest.system = systemPrompt;
    }

    return anthropicRequest;
  }

  protected transformResponse(response: AnthropicResponse): CanonicalResponse {
    const content = response.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('');

    return {
      id: response.id,
      model: response.model,
      created: Math.floor(Date.now() / 1000),
      message: {
        role: 'assistant',
        content: [{
          type: 'text',
          text: content
        }]
      },
      finishReason: this.mapFinishReason(response.stop_reason),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens
      }
    };
  }

  private mapFinishReason(stopReason: string): 'stop' | 'length' | 'tool_calls' | 'error' {
    switch (stopReason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'stop_sequence':
        return 'stop';
      default:
        return 'stop';
    }
  }


}