import { CanonicalRequest, CanonicalResponse } from 'shared/types/index.js';
import { AIProvider } from '../types/provider.js';
import { AnthropicProvider } from '../providers/anthropic-provider.js';
import { OpenAIProvider } from '../providers/openai-provider.js';
import { OpenRouterProvider } from '../providers/openrouter-provider.js';
import { XAIProvider } from '../providers/xai-provider.js';
import { logger } from '../../infrastructure/utils/logger.js';
import { pricingLoader, ModelPricing } from '../../infrastructure/utils/pricing-loader.js';
import { ModelUtils } from '../../infrastructure/utils/model-utils.js';

enum Provider {
  ANTHROPIC = 'anthropic',
  OPENAI = 'openai',
  OPENROUTER = 'openrouter',
  XAI = 'xAI'
}

export class ProviderService {
  private providers = new Map<Provider, AIProvider>();

  private createAdapter(name: Provider): AIProvider {
    const adapterMap = {
      [Provider.ANTHROPIC]: () => new AnthropicProvider(),
      [Provider.OPENAI]: () => new OpenAIProvider(),
      [Provider.OPENROUTER]: () => new OpenRouterProvider(),
      [Provider.XAI]: () => new XAIProvider()
    };

    const factory = adapterMap[name];
    if (!factory) {
      throw new Error(`Unknown provider: ${name}`);
    }

    return factory();
  }

  private getOrCreateProvider(name: Provider): AIProvider {
    if (!this.providers.has(name)) {
      this.providers.set(name, this.createAdapter(name));
    }

    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Failed to create provider: ${name}`);
    }

    return provider;
  }

  getAvailableProviders(): Provider[] {
    return Object.values(Provider).filter(name => {
      const provider = this.getOrCreateProvider(name);
      return provider.isConfigured();
    });
  }

  getMostOptimalProvider(modelName: string): { provider: Provider; error?: never } | { provider?: never; error: { code: string; message: string } } {
    const normalizedModel = ModelUtils.normalizeModelName(modelName);
    const availableProviders = this.getAvailableProviders();

    if (availableProviders.length === 0) {
      logger.error(`PROVIDER_SERVICE: No providers configured, please check your .env file`);
      return {
        error: {
          code: 'NO_PROVIDERS_CONFIGURED',
          message: 'No inference providers are configured. Please add your API keys to the .env file.'
        }
      };
    }

    // Check for explicit provider matches first
    if (modelName.includes('grok-') || modelName.includes('grok_beta')) {
      if (availableProviders.includes(Provider.XAI)) {
        return { provider: Provider.XAI };
      }
    }

    // Find cheapest available provider that supports this model
    let cheapestProvider: Provider | null = null;
    let lowestCost = Infinity;

    const allPricing = pricingLoader.loadAllPricing();

    for (const providerName of availableProviders) {
      const pricingConfig = allPricing.get(providerName);
      const modelPricing = pricingConfig?.models[normalizedModel];

      if (modelPricing) {
        const totalCost = modelPricing.input + modelPricing.output;
        if (totalCost < lowestCost) {
          lowestCost = totalCost;
          cheapestProvider = providerName;
        }
      }
    }

    if (!cheapestProvider) {
      logger.error(`PROVIDER_SERVICE: No providers found for model ${normalizedModel} among available providers ${availableProviders.join(', ')}`);
      return {
        error: {
          code: 'MODEL_NOT_SUPPORTED',
          message: `Model '${modelName}' is not supported by any available providers. Either try a different model or add more providers to your .env file.`
        }
      };
    }

    return { provider: cheapestProvider };
  }


  async processChatCompletion(
    request: CanonicalRequest,
    providerName: Provider,
    clientType?: 'openai' | 'anthropic',
    originalRequest?: unknown
  ): Promise<CanonicalResponse> {
    const provider = this.providers.get(providerName)!;

    // Ensure Anthropic models have required suffixes
    if (providerName === Provider.ANTHROPIC) {
      request.model = ModelUtils.ensureAnthropicSuffix(request.model);
    }

    logger.info(`Processing chat completion`, {
      provider: providerName,
      model: request.model,
      streaming: request.stream
    });

    return await provider.chatCompletion(request);
  }

  async processStreamingRequest(
    request: CanonicalRequest,
    providerName: Provider,
    clientType?: 'openai' | 'anthropic',
    originalRequest?: unknown
  ): Promise<any> {
    const provider = this.providers.get(providerName)!;

    // Ensure Anthropic models have required suffixes
    if (providerName === Provider.ANTHROPIC) {
      request.model = ModelUtils.ensureAnthropicSuffix(request.model);
    }

    logger.info(`Processing streaming request`, {
      provider: providerName,
      model: request.model
    });

    return provider.getStreamingResponse(request);
  }
}
