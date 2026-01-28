import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fetch, { Response } from 'node-fetch';
import { ModelUtils } from './model-utils.js';
import { logger } from './logger.js';
import { getConfig } from '../config/app-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Type definitions for pricing configuration
export interface PricingConfig {
  provider: string;
  currency: string;
  unit: string;
  models: Record<string, ModelPricing>;
  metadata: PricingMetadata;
}

export interface ModelPricing {
  input: number;
  output: number;
  cache_write?: number; // Cost for writing to cache
  cache_read?: number;  // Cost for reading from cache
  id?: string;
  original_provider?: string;
  region?: string;
  tier?: string;
}

export interface PricingMetadata {
  last_updated: string;
  source: string;
  notes: string;
  version: string;
  contributor?: string;
}

export interface CostCalculation {
  inputCost: number;
  cacheWriteCost: number;
  cacheReadCost: number;
  outputCost: number;
  totalCost: number;
  currency: string;
  unit: string;
}

export class PricingLoader {
  private costsDir = path.join(__dirname, '../../costs');
  private generatedCostsDir = path.join(__dirname, '../../../costs/generated');
  private pricingCache = new Map<string, PricingConfig>();
  private lastLoadTime = 0;
  private cacheExpiryMs = 5 * 60 * 1000; // 5 minutes
  private openRouterRefreshPromise: Promise<void> | null = null;
  private static readonly OPENROUTER_PRICING_URL = 'https://openrouter.ai/api/v1/models';
  private static readonly OPENROUTER_COST_FILE = 'openrouter.yaml';

  /**
   * Load all pricing configurations from YAML files
   * Includes caching for performance
   */
  loadAllPricing(): Map<string, PricingConfig> {
    const now = Date.now();

    // Return cached data if still valid
    if (this.pricingCache.size > 0 && (now - this.lastLoadTime) < this.cacheExpiryMs) {
      return this.pricingCache;
    }

    // Clear cache and reload
    this.pricingCache.clear();
    
    try {
      // Attempt to refresh OpenRouter pricing before loading files.
      // Fire-and-forget; failures fall back to existing YAML snapshot.
      void this.refreshOpenRouterPricing().catch(() => undefined);

      const files = fs.readdirSync(this.costsDir);
      
      files.forEach(file => {
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          const providerFromFile = path.basename(file, path.extname(file));
          
          // Skip template files
          if (providerFromFile === 'templates') return;
          
          // Normalize provider name to lowercase for consistent lookups
          const provider = providerFromFile.toLowerCase();
          
          try {
            const pricing = this.loadProviderPricing(providerFromFile);
            this.pricingCache.set(provider, pricing);
            logger.debug('Pricing loaded', { provider, modelCount: Object.keys(pricing.models).length, operation: 'pricing_load', module: 'pricing-loader' });
          } catch (error) {
            logger.error('Failed to load pricing', error, { provider, operation: 'pricing_load', module: 'pricing-loader' });
          }
        }
      });

      this.lastLoadTime = now;
      logger.info('Pricing cache loaded', { providerCount: this.pricingCache.size, operation: 'pricing_load', module: 'pricing-loader' });
      
    } catch (error) {
      logger.error('Failed to load pricing directory', error, { operation: 'pricing_load', module: 'pricing-loader' });
    }

    return this.pricingCache;
  }

  /**
   * Load pricing for a specific provider
   */
  loadProviderPricing(provider: string): PricingConfig {
    const filePath = this.getCostFilePath(provider);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Pricing file not found for provider: ${provider}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const config = yaml.load(content) as PricingConfig;

    // Validate required fields
    if (!config.provider || !config.models || !config.currency) {
      throw new Error(`Invalid pricing configuration for provider: ${provider}`);
    }

    // Provider-specific normalizations
    const normalizer = this.modelNormalizers.get(provider.toLowerCase());
    if (normalizer) {
      config.models = normalizer(config.models);
    }

    return config;
  }
  private getCostFilePath(provider: string): string {
    if (provider === 'openrouter') {
      const generatedCandidates = [
        path.join(this.generatedCostsDir, `${provider}.yaml`),
        path.join(this.costsDir, 'generated', `${provider}.yaml`)
      ];

      for (const candidate of generatedCandidates) {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }

    return path.join(this.costsDir, `${provider}.yaml`);
  }

  // Provider-specific pricing normalizers
  private modelNormalizers: Map<string, (models: Record<string, any>) => Record<string, ModelPricing>> = new Map([
    ['anthropic', (models) => {
      const normalizedModels: Record<string, ModelPricing> = {};
      Object.entries(models).forEach(([modelName, modelPricing]: [string, any]) => {
        const normalizedPricing: ModelPricing = { ...modelPricing };

        if (modelPricing['5m_cache_write'] !== undefined) {
          normalizedPricing.cache_write = modelPricing['5m_cache_write'];
        }
        if (modelPricing['1h_cache_write'] !== undefined) {
          normalizedPricing.cache_write = normalizedPricing.cache_write || modelPricing['1h_cache_write'];
        }
        if (modelPricing['cache_read'] !== undefined) {
          normalizedPricing.cache_read = modelPricing['cache_read'];
        }

        normalizedModels[modelName] = normalizedPricing;
      });
      return normalizedModels;
    }],
    ['xai', (models) => {
      const normalizedModels: Record<string, ModelPricing> = {};
      Object.entries(models).forEach(([modelName, modelPricing]: [string, any]) => {
        const normalizedPricing: ModelPricing = { ...modelPricing };
        if (modelPricing['cached_input'] !== undefined) {
          normalizedPricing.cache_write = modelPricing['cached_input'];
          normalizedPricing.cache_read = modelPricing['cached_input'];
        }
        normalizedModels[modelName] = normalizedPricing;
      });
      return normalizedModels;
    }]
  ]);

  /**
   * Get pricing for a specific model (with automatic model name normalization)
   */
  getModelPricing(provider: string, model: string): ModelPricing | null {
    // Normalize provider name to lowercase for consistent cache lookups
    const normalizedProvider = provider.toLowerCase();
    let config = this.pricingCache.get(normalizedProvider);
    if (!config) {
      this.loadAllPricing();
      config = this.pricingCache.get(normalizedProvider);
      if (!config) return null;
    }
    
    // Try normalized model name first, then original model name as fallback
    const normalizedModel = ModelUtils.normalizeModelName(model);
    const modelWithoutPrefix = ModelUtils.removeProviderPrefix(model);
    
    return config.models[normalizedModel] 
      || config.models[modelWithoutPrefix] 
      || config.models[model] 
      || null;
  }

  /**
   * Get all available models for a provider
   */
  getProviderModels(provider: string): string[] {
    // Normalize provider name to lowercase for consistent cache lookups
    const normalizedProvider = provider.toLowerCase();
    const config = this.pricingCache.get(normalizedProvider);
    if (!config) return [];
    
    return Object.keys(config.models);
  }

  /**
   * Get all available providers
   */
  getAvailableProviders(): string[] {
    return Array.from(this.pricingCache.keys());
  }

  /**
   * Search for models across all providers
   */
  searchModels(query: string): Array<{provider: string, model: string, pricing: ModelPricing}> {
    const results: Array<{provider: string, model: string, pricing: ModelPricing}> = [];
    
    this.pricingCache.forEach((config, provider) => {
      Object.entries(config.models).forEach(([model, pricing]) => {
        if (model.toLowerCase().includes(query.toLowerCase())) {
          results.push({ provider, model, pricing });
        }
      });
    });

    return results;
  }

  /**
   * Calculate cost for a specific model usage
   */
  calculateCost(provider: string, model: string, inputTokens: number, outputTokens: number, cacheWriteTokens: number = 0, cacheReadTokens: number = 0): CostCalculation | null {
    const pricing = this.getModelPricing(provider, model);
    if (!pricing) return null;

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const cacheWriteCost = pricing.cache_write ? (cacheWriteTokens / 1_000_000) * pricing.cache_write : 0;
    const cacheReadCost = pricing.cache_read ? (cacheReadTokens / 1_000_000) * pricing.cache_read : 0;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    const totalCost = inputCost + cacheWriteCost + cacheReadCost + outputCost;

    // Normalize provider name to lowercase for consistent cache lookups
    const normalizedProvider = provider.toLowerCase();
    const config = this.pricingCache.get(normalizedProvider);

    return {
      inputCost: Math.round(inputCost * 1000000) / 1000000, // Round to 6 decimal places
      cacheWriteCost: Math.round(cacheWriteCost * 1000000) / 1000000,
      cacheReadCost: Math.round(cacheReadCost * 1000000) / 1000000,
      outputCost: Math.round(outputCost * 1000000) / 1000000,
      totalCost: Math.round(totalCost * 1000000) / 1000000,
      currency: config?.currency || 'USD',
      unit: config?.unit || 'per_1m_tokens'
    };
  }

  /**
   * Get pricing summary for all providers
   */
  getPricingSummary(): Array<{provider: string, modelCount: number, lastUpdated: string}> {
    return Array.from(this.pricingCache.entries()).map(([provider, config]) => ({
      provider,
      modelCount: Object.keys(config.models).length,
      lastUpdated: config.metadata.last_updated
    }));
  }

  /**
   * Force reload pricing (useful for testing or when files change)
   */
  reloadPricing(): void {
    this.pricingCache.clear();
    this.lastLoadTime = 0;
    this.loadAllPricing();
  }

  async refreshOpenRouterPricing(): Promise<void> {
    const config = getConfig();
    if (config.openrouter.skipPricingRefresh) {
      return;
    }

    if (this.openRouterRefreshPromise) {
      return this.openRouterRefreshPromise;
    }

    const costsPath = path.join(this.costsDir, PricingLoader.OPENROUTER_COST_FILE);

    const execute = async (): Promise<void> => {
      try {
        const payload = await this.fetchOpenRouterModels();
        const models = this.transformOpenRouterModels(payload);

        if (!models || Object.keys(models).length === 0) {
          logger.warn('OpenRouter pricing refresh returned no supported models', {
            operation: 'pricing_refresh',
            provider: 'openrouter',
            module: 'pricing-loader'
          });
          return;
        }

        const currency = payload?.meta?.currency?.toUpperCase?.() ?? 'USD';

        const doc: PricingConfig = {
          provider: 'openrouter',
          currency,
          unit: 'MTok',
          models,
          metadata: {
            last_updated: new Date().toISOString().slice(0, 10),
            source: PricingLoader.OPENROUTER_PRICING_URL,
            notes: 'Auto-refreshed from OpenRouter models API',
            version: 'auto'
          }
        };

        const serialized = yaml.dump(doc, { lineWidth: 120, noRefs: true });
        await fs.promises.writeFile(costsPath, serialized, 'utf8');

        // Refresh in-memory cache immediately to avoid transient misses.
        const refreshedConfig = this.loadProviderPricing('openrouter');
        this.pricingCache.set('openrouter', refreshedConfig);
        this.lastLoadTime = Date.now();

        logger.info('OpenRouter pricing refreshed', {
          operation: 'pricing_refresh',
          provider: 'openrouter',
          modelCount: Object.keys(models).length,
          module: 'pricing-loader'
        });
      } catch (error) {
        logger.error('Failed to refresh OpenRouter pricing, using cached YAML', error, {
          operation: 'pricing_refresh',
          provider: 'openrouter',
          module: 'pricing-loader'
        });
      }
    };

    this.openRouterRefreshPromise = execute().finally(() => {
      this.openRouterRefreshPromise = null;
    });

    return this.openRouterRefreshPromise;
  }

  private async fetchOpenRouterModels(): Promise<any> {
    const config = getConfig();
    const timeoutMs = config.openrouter.pricingTimeoutMs;
    const retries = config.openrouter.pricingRetries;

    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response: Response = await fetch(PricingLoader.OPENROUTER_PRICING_URL, {
          method: 'GET',
          headers: this.buildOpenRouterPricingHeaders(),
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`OpenRouter models API responded with ${response.status}`);
        }

        return await response.json();
      } catch (error) {
        lastError = error;
        logger.warn('OpenRouter pricing fetch attempt failed', {
          attempt: attempt + 1,
          retries: retries + 1,
          provider: 'openrouter',
          error: error instanceof Error ? error.message : String(error),
          module: 'pricing-loader'
        });
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private buildOpenRouterPricingHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'Ekai-Gateway-Pricing-Refresh/1.0'
    };

    const config = getConfig();
    const apiKey = config.providers.openrouter.apiKey;
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    return headers;
  }

  private transformOpenRouterModels(payload: any): Record<string, ModelPricing> {
    if (!payload || !Array.isArray(payload.data)) {
      return {};
    }

    const models: Record<string, ModelPricing> = {};

    payload.data.forEach((model: any) => {
      if (!model || typeof model.id !== 'string') return;

      const [provider] = model.id.split('/');

      const pricing = model.pricing || {};
      const multiplier = this.resolvePricingUnitMultiplier(pricing.unit);

      const input = this.toMTok(pricing.prompt, multiplier);
      const output = this.toMTok(pricing.completion, multiplier);
      const cacheWrite = this.toMTok(pricing.cache_write ?? pricing.cached, multiplier);
      const cacheRead = this.toMTok(pricing.cache_read ?? pricing.cached, multiplier);

      if (input === undefined || output === undefined) {
        return;
      }

      const normalizedKey = ModelUtils.removeProviderPrefix(model.id);
      const entry: ModelPricing = {
        id: model.id,
        input,
        output,
        original_provider: provider
      };

      if (cacheWrite !== undefined) {
        entry.cache_write = cacheWrite;
      }

      if (cacheRead !== undefined) {
        entry.cache_read = cacheRead;
      }

      // Store both provider-qualified and normalized keys to support lookups
      models[model.id] = entry;
      if (!models[normalizedKey]) {
        models[normalizedKey] = entry;
      }
    });

    return models;
  }

  private resolvePricingUnitMultiplier(unit?: string): number {
    if (!unit) {
      return 1_000_000;
    }

    const normalized = unit.toLowerCase();
    if (normalized.includes('mtok') || normalized.includes('million')) {
      return 1;
    }
    if (normalized.includes('ktok') || normalized.includes('thousand')) {
      return 1_000;
    }
    if (normalized.includes('token')) {
      return 1_000_000;
    }

    return 1_000_000;
  }

  private toMTok(value: unknown, multiplier: number): number | undefined {
    let numericValue: number;

    if (typeof value === 'number') {
      numericValue = value;
    } else if (typeof value === 'string') {
      numericValue = Number(value);
    } else {
      return undefined;
    }

    if (!Number.isFinite(numericValue)) {
      return undefined;
    }

    const scaled = numericValue * multiplier;
    return Math.round(scaled * 1_000_000) / 1_000_000;
  }
}

// Export singleton instance
export const pricingLoader = new PricingLoader();
