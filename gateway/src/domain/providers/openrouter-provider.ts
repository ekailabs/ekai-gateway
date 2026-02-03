import { BaseProvider, ApiKeyContext } from './base-provider.js';
import { CanonicalRequest, CanonicalResponse } from 'shared/types/index.js';
import { pricingLoader } from '../../infrastructure/utils/pricing-loader.js';
import { ModelUtils } from '../../infrastructure/utils/model-utils.js';
import { getKeyManager } from '../../infrastructure/crypto/key-manager.js';

interface OpenRouterRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string; }>;
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  stream?: boolean;
  stop?: string | string[];
}

interface OpenRouterResponse {
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

export class OpenRouterProvider extends BaseProvider {
  readonly name = 'openrouter';
  protected readonly baseUrl = 'https://openrouter.ai/api/v1';

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

  protected getHeaders(apiKey: string): Record<string, string> {
    return {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ekai-proxy',
      'X-Title': 'EKAI Proxy'
    };
  }

  protected transformRequest(request: CanonicalRequest): OpenRouterRequest {
    const messages = request.messages.map(msg => ({
      role: msg.role,
      content: msg.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('')
    }));

    // Get the actual OpenRouter model ID from pricing data
    const openRouterModel = this.getOpenRouterModelId(request.model);

    const requestData: OpenRouterRequest = {
      model: openRouterModel,
      messages,
      temperature: request.temperature,
      stream: request.stream || false,
      stop: request.stopSequences
    };

    // Use max_completion_tokens for o1/o3/o4 series models, max_tokens for others
    if (request.maxTokens) {
      if (ModelUtils.requiresMaxCompletionTokens(openRouterModel)) {
        requestData.max_completion_tokens = request.maxTokens;
      } else {
        requestData.max_tokens = request.maxTokens;
      }
    }

    return requestData;
  }

  private getOpenRouterModelId(modelName: string): string {
    // If model already has provider prefix, use as-is
    if (modelName.includes('/')) {
      return modelName;
    }

    // Look up the model in OpenRouter pricing to get the actual ID
    const openRouterPricing = pricingLoader.getModelPricing('openrouter', modelName);

    if (openRouterPricing?.id) {
      return openRouterPricing.id;
    }

    // Fallback to original model name if no ID found
    return modelName;
  }

  protected transformResponse(response: OpenRouterResponse): CanonicalResponse {
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
      case 'function_call': return 'tool_calls';
      case 'tool_calls': return 'tool_calls';
      default: return 'stop';
    }
  }
}
