import { BaseProvider, ApiKeyContext } from './base-provider.js';
import { CanonicalRequest, CanonicalResponse } from 'shared/types/index.js';
import { getConfig } from '../../infrastructure/config/app-config.js';
import { getKeyManager } from '../../infrastructure/crypto/key-manager.js';

interface GrokRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string; }>;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  stop?: string | string[];
}

interface GrokResponse {
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

export class XAIProvider extends BaseProvider {
  readonly name = 'xAI';
  protected readonly baseUrl = 'https://api.x.ai/v1';

  /**
   * Get API key via ROFL authorization workflow
   */
  protected async getApiKey(context?: ApiKeyContext): Promise<string | undefined> {
    if (!context?.sapphireContext) {
      throw new Error('Sapphire context required for API key retrieval');
    }
    const keyManager = getKeyManager();
    return keyManager.getKey(context.sapphireContext);
  }

  isConfigured(): boolean {
    // Always configured - key retrieval happens via Sapphire
    return true;
  }

  protected transformRequest(request: CanonicalRequest): GrokRequest {
    const messages = request.messages.map(msg => ({
      role: msg.role,
      content: msg.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('')
    }));

    return {
      model: request.model,
      messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stream: request.stream || false,
      stop: request.stopSequences
    };
  }

  protected transformResponse(response: GrokResponse): CanonicalResponse {
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
