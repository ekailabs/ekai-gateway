import { Request } from 'express';
import { CanonicalRequest, CanonicalResponse } from 'shared/types/index.js';
import { logger } from '../../infrastructure/utils/logger.js';
import { pricingLoader } from '../../infrastructure/utils/pricing-loader.js';
import { ModelUtils } from '../../infrastructure/utils/model-utils.js';
import {
  Provider,
  ProviderRegistry,
  createDefaultProviderRegistry
} from './provider-registry.js';
import { createSapphireContext } from '../../infrastructure/middleware/sapphire-context.js';
import { getUsageLogger } from '../../infrastructure/logging/usage-logger.js';
import type { ApiKeyContext } from '../providers/base-provider.js';

export class ProviderService {
  constructor(private readonly registry: ProviderRegistry = createDefaultProviderRegistry()) {}

  getAvailableProviders(): Provider[] {
    return this.registry.getAvailableProviders();
  }

  getMostOptimalProvider(modelName: string, requestId?: string): { provider: Provider; error?: never } | { provider?: never; error: { code: string; message: string } } {
    const normalizedModel = ModelUtils.normalizeModelName(modelName);
    const availableProviders = this.getAvailableProviders();

    if (availableProviders.length === 0) {
      logger.warn('No providers configured', { operation: 'provider_selection', requestId, module: 'provider-service' });
      return {
        error: {
          code: 'NO_PROVIDERS_CONFIGURED',
          message: 'No inference providers are configured. Please add your API keys to the .env file.'
        }
      };
    }

    // Check for explicit provider matches first via registry rules
    const preferred = this.registry.findPreferredProvider(modelName, availableProviders);
    if (preferred) {
      return { provider: preferred };
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
      logger.warn('No providers found for model', {
        operation: 'provider_selection',
        module: 'provider-service',
        model: normalizedModel,
        availableProviders,
        requestId
      });
      return {
        error: {
          code: 'MODEL_NOT_SUPPORTED',
          message: `Model '${modelName}' is not supported by any available providers. Either try a different model or add more providers to your .env file.`
        }
      };
    }

    return { provider: cheapestProvider };
  }

  /**
   * Build API key context from Express request
   * Uses user preferences for owner/delegate addresses
   */
  private buildApiKeyContext(req: Request | undefined, providerName: string, modelName: string): ApiKeyContext | undefined {
    if (!req?.user) {
      return undefined;
    }

    // Create or get Sapphire context from user preferences
    const sapphireContext = req.sapphireContext || createSapphireContext(req, providerName, modelName);

    if (!sapphireContext) {
      return undefined;
    }

    return { sapphireContext };
  }

  async processChatCompletion(
    request: CanonicalRequest,
    providerName: Provider,
    clientType?: 'openai' | 'anthropic',
    originalRequest?: unknown,
    requestId?: string,
    clientIp?: string,
    expressReq?: Request
  ): Promise<CanonicalResponse> {
    const provider = this.registry.getOrCreateProvider(providerName);

    // Ensure Anthropic models have required suffixes
    if (providerName === Provider.ANTHROPIC) {
      request.model = ModelUtils.ensureAnthropicSuffix(request.model);
    }

    // Build API key context from user preferences
    const context = this.buildApiKeyContext(expressReq, providerName, request.model);

    logger.info(`Processing chat completion`, {
      provider: providerName,
      model: request.model,
      streaming: request.stream,
      hasSapphireContext: !!context?.sapphireContext,
      requestId,
      module: 'provider-service'
    });

    const resp = await provider.chatCompletion(request, context);

    // Log usage on-chain (async, non-blocking)
    if (context?.sapphireContext && resp.usage) {
      const usageLogger = getUsageLogger();
      usageLogger.logReceipt(context.sapphireContext, {
        promptTokens: resp.usage.inputTokens || 0,
        completionTokens: resp.usage.outputTokens || 0,
      }).catch(err => {
        logger.warn('Failed to log usage receipt on-chain', { error: err, requestId });
      });
    }

    // attach IP on response object for downstream (optional)
    (resp as any)._clientIp = clientIp;
    return resp;
  }

  async processStreamingRequest(
    request: CanonicalRequest,
    providerName: Provider,
    clientType?: 'openai' | 'anthropic',
    originalRequest?: unknown,
    requestId?: string,
    clientIp?: string,
    expressReq?: Request
  ): Promise<any> {
    const provider = this.registry.getOrCreateProvider(providerName);

    // Ensure Anthropic models have required suffixes
    if (providerName === Provider.ANTHROPIC) {
      request.model = ModelUtils.ensureAnthropicSuffix(request.model);
    }

    // Build API key context from user preferences
    const context = this.buildApiKeyContext(expressReq, providerName, request.model);

    logger.info(`Processing streaming request`, {
      provider: providerName,
      model: request.model,
      hasSapphireContext: !!context?.sapphireContext,
      requestId,
      module: 'provider-service'
    });

    const stream = await provider.getStreamingResponse(request, context);
    (stream as any)._clientIp = clientIp;
    return stream;
  }
}
