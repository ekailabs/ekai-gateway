import { BaseProvider } from './base-provider.js';
import { CanonicalRequest, CanonicalResponse } from 'shared/types/index.js';
import { getConfig } from '../../infrastructure/config/app-config.js';

interface EigenAIRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string; }>;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  stop?: string | string[];
  seed?: number;
}

interface EigenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string; };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class EigenAIProvider extends BaseProvider {
  readonly name = 'eigenai';
  protected readonly baseUrl = 'https://eigenai-sepolia.eigencloud.xyz/v1';
  protected get apiKey(): string | undefined {
    return getConfig().providers.eigenai.apiKey;
  }

  protected getHeaders(): Record<string, string> {
    return {
      'X-API-Key': this.apiKey || '',
      'Content-Type': 'application/json'
    };
  }

  protected transformRequest(request: CanonicalRequest): EigenAIRequest {
    const messages = request.messages.map(msg => ({
      role: msg.role,
      content: msg.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('')
    }));

    const requestData: EigenAIRequest = {
      model: request.model,
      messages,
      temperature: request.temperature,
      stream: request.stream || false,
      stop: request.stopSequences
    };

    if (request.maxTokens) {
      requestData.max_tokens = request.maxTokens;
    }

    if (typeof request.metadata?.seed === 'number') {
      requestData.seed = request.metadata.seed;
    }

    return requestData;
  }

  protected transformResponse(response: EigenAIResponse): CanonicalResponse {
    const choice = response.choices[0];

    return {
      id: response.id,
      model: response.model,
      created: response.created,
      message: {
        role: 'assistant',
        content: [{
          type: 'text',
          text: choice.message.content
        }]
      },
      finishReason: this.mapFinishReason(choice.finish_reason),
      usage: {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens
      }
    };
  }

  private mapFinishReason(reason: string): 'stop' | 'length' | 'tool_calls' | 'error' {
    switch (reason) {
      case 'stop': return 'stop';
      case 'length': return 'length';
      default: return 'stop';
    }
  }
}
