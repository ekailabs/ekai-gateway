import { BaseProvider } from './base-provider.js';
import { ChatCompletionRequest, ChatCompletionResponse } from '../types.js';
import { APIError } from '../utils/error-handler.js';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string;
  temperature?: number;
  stream?: boolean;
}

interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class AnthropicProvider extends BaseProvider {
  readonly name = 'anthropic';
  protected readonly baseUrl = 'https://api.anthropic.com/v1';
  protected readonly apiKey = process.env.ANTHROPIC_API_KEY;

  protected getHeaders(): Record<string, string> {
    if (!this.apiKey) {
      throw new APIError(401, `${this.name} API key not configured`);
    }
    return {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    };
  }

  protected getChatCompletionEndpoint(): string {
    return '/messages';
  }

  protected transformRequest(request: ChatCompletionRequest): AnthropicRequest {
    // Extract system message if present
    let systemPrompt: string | undefined;
    const messages: AnthropicMessage[] = [];

    for (const message of request.messages) {
      if (message.role === 'system') {
        systemPrompt = message.content;
      } else if (message.role === 'user' || message.role === 'assistant') {
        messages.push({
          role: message.role,
          content: message.content
        });
      }
    }

    const anthropicRequest: AnthropicRequest = {
      model: request.model,
      max_tokens: request.max_tokens || 1000, // Anthropic requires max_tokens
      messages,
      temperature: request.temperature,
      stream: request.stream || false
    };

    if (systemPrompt) {
      anthropicRequest.system = systemPrompt;
    }

    return anthropicRequest;
  }

  protected transformResponse(response: AnthropicResponse): ChatCompletionResponse {
    const content = response.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('');

    return {
      id: response.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: response.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: content
        },
        finish_reason: this.mapFinishReason(response.stop_reason)
      }],
      usage: {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens
      }
    };
  }

  private mapFinishReason(stopReason: string): string {
    switch (stopReason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'stop_sequence':
        return 'stop';
      case 'tool_use':
        return 'tool_calls';
      default:
        return 'stop';
    }
  }
}