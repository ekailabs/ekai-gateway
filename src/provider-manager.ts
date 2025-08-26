import { AIProvider, ProviderName, ChatCompletionRequest, ChatCompletionResponse, ModelsResponse, Model } from './types.js';
import { OpenAIProvider } from './providers/openai-provider.js';
import { OpenRouterProvider } from './providers/openrouter-provider.js';

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
      }
    }
    return this.providers.get(name)!;
  }

  getAvailableProviders(): ProviderName[] {
    const availableProviders: ProviderName[] = [];
    
    // Check each provider by creating them on-demand
    const providerNames: ProviderName[] = ['openai', 'openrouter'];
    for (const name of providerNames) {
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
    // ideal: we go through list of models, compare prices or privacy/compliance and then pick ones
    const availableProviders = this.getAvailableProviders();
    console.log('Available Providers:', availableProviders);
    
    if (availableProviders.length === 0) {
      return null;
    }

    // TODO: check if model is OpenAI model v1/models/ then do it. 
    if (!modelName.includes('/') && availableProviders.includes('openai')) {
      return 'openai';
    } else {
      return 'openrouter';
    }
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