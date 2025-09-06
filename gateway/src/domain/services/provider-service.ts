import { CanonicalRequest, CanonicalResponse } from 'shared/types/index.js';
import { AIProvider } from '../types/provider.js';
import { AnthropicProvider } from '../providers/anthropic-provider.js';
import { OpenAIProvider } from '../providers/openai-provider.js';
import { OpenRouterProvider } from '../providers/openrouter-provider.js';
import { logger } from '../../infrastructure/utils/logger.js';

type ProviderName = 'anthropic' | 'openai' | 'openrouter';

export class ProviderService {
  private providers = new Map<ProviderName, AIProvider>();
  private readonly PROVIDER_NAMES: ProviderName[] = ['anthropic', 'openai', 'openrouter'];

  private createProvider(name: ProviderName): AIProvider {
    const providerMap = {
      anthropic: () => new AnthropicProvider(),
      openai: () => new OpenAIProvider(),
      openrouter: () => new OpenRouterProvider()
    };

    const factory = providerMap[name];
    if (!factory) {
      throw new Error(`Unknown provider: ${name}`);
    }

    return factory();
  }

  private getOrCreateProvider(name: ProviderName): AIProvider {
    if (!this.providers.has(name)) {
      this.providers.set(name, this.createProvider(name));
    }
    
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Failed to create provider: ${name}`);
    }
    
    return provider;
  }

  getAvailableProviders(): ProviderName[] {
    return this.PROVIDER_NAMES.filter(name => {
      const provider = this.getOrCreateProvider(name);
      return provider.isConfigured();
    });
  }

  private getConfiguredProvider(request: CanonicalRequest): AIProvider {
    const selectedProvider = this.selectOptimalProvider(request.model);
    
    if (!selectedProvider) {
      throw new Error('No configured AI providers available');
    }

    const provider = this.getOrCreateProvider(selectedProvider);
    
    if (!provider.isConfigured()) {
      throw new Error(`Provider ${selectedProvider} is not configured`);
    }

    return provider;
  }

  private selectOptimalProvider(modelName: string): ProviderName | null {
    const availableProviders = this.getAvailableProviders();
    
    if (availableProviders.length === 0) {
      return null;
    }

    // Route Claude models to Anthropic
    if (modelName.startsWith('claude-') && availableProviders.includes('anthropic')) {
      return 'anthropic';
    }
    
    // Route OpenAI models (no slash) to OpenAI
    if (!modelName.includes('/') && availableProviders.includes('openai')) {
      return 'openai';
    }
    
    // Route everything else to OpenRouter
    if (availableProviders.includes('openrouter')) {
      return 'openrouter';
    }

    return availableProviders[0];
  }

  async processChatCompletion(
    request: CanonicalRequest, 
    originalRequest?: unknown, 
    clientType?: 'openai' | 'anthropic'
  ): Promise<CanonicalResponse> {
    const provider = this.getConfiguredProvider(request);
    
    logger.info(`Processing chat completion`, {
      provider: provider.name,
      model: request.model,
      streaming: request.stream
    });
    
    const canonicalResponse = await provider.chatCompletion(request);
    
    return canonicalResponse;
  }

  async processStreamingRequest(
    request: CanonicalRequest,
    originalRequest?: unknown,
    clientType?: 'openai' | 'anthropic'
  ): Promise<any> {
    const provider = this.getConfiguredProvider(request);
    
    logger.info(`Processing streaming request`, {
      provider: provider.name,
      model: request.model
    });
    
    return provider.getStreamingResponse(request);
  }

}