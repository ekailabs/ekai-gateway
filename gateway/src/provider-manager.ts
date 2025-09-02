import { AIProvider, ProviderName, ChatCompletionRequest, ChatCompletionResponse, ModelsResponse, Model } from '../../shared/types/index.js';
import { OpenAIProvider } from './providers/openai-provider.js';
import { OpenRouterProvider } from './providers/openrouter-provider.js';
import { AnthropicProvider } from './providers/anthropic-provider.js';

export class ProviderManager {
  private providers: Map<ProviderName, AIProvider> = new Map();

  private getOrCreateProvider(name: ProviderName): AIProvider {
    if (!this.providers.has(name)) {
      switch (name) {
        case 'openai':
          this.providers.set('openai', new OpenAIProvider());
          break;
        case 'openrouter':
          this.providers.set('openrouter', new OpenRouterProvider());
          break;
        case 'anthropic':
          this.providers.set('anthropic', new AnthropicProvider());
          break;
        default:
          throw new Error(`Unknown provider: ${name}`);
      }
    }
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Failed to create provider: ${name}`);
    }
    return provider;
  }

  private static readonly PROVIDER_NAMES: ProviderName[] = ['openai', 'openrouter', 'anthropic'];

  getAvailableProviders(): ProviderName[] {
    const availableProviders: ProviderName[] = [];
    
    // Check each provider by creating them on-demand
    for (const name of ProviderManager.PROVIDER_NAMES) {
      const provider = this.getOrCreateProvider(name);
      if (provider.isConfigured()) {
        availableProviders.push(name);
      }
    }
    
    return availableProviders;
  }

  getProvider(name: ProviderName): AIProvider | undefined {
    return this.getOrCreateProvider(name);
  }

  pickOptimal(modelName: string): ProviderName | null {
    const availableProviders = this.getAvailableProviders();
    console.log('Available Providers:', availableProviders);
    
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

    // Fallback to any available provider
    return availableProviders[0];
  }

  async handleChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const selectedProvider = this.pickOptimal(request.model);

    if (!selectedProvider) {
      throw new Error('No configured AI providers available');
    }

    const provider = this.getProvider(selectedProvider);
    if (!provider) {
      throw new Error(`Provider ${selectedProvider} not found`);
    }

    console.log(`🤖 Using ${selectedProvider} for model: ${request.model}`);
    
    return provider.chatCompletion(request);
  }

  async getAllModels(): Promise<ModelsResponse> {
    const availableProviders = this.getAvailableProviders();
    const allModels: Model[] = [];

    for (const providerName of availableProviders) {
      const provider = this.getProvider(providerName);
      if (provider) {
        try {
          const modelsResponse = await provider.getModels();
          const modelsWithProvider = modelsResponse.data.map(model => ({
            ...model,
            provider: providerName
          }));
          allModels.push(...modelsWithProvider);
        } catch (error) {
          console.error(`Error fetching models from ${providerName}:`, error);
        }
      }
    }

    return {
      object: 'list',
      data: allModels
    };
  }
}