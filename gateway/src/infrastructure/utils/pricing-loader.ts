import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { ModelUtils } from './model-utils.js';

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
  private pricingCache = new Map<string, PricingConfig>();
  private lastLoadTime = 0;
  private cacheExpiryMs = 5 * 60 * 1000; // 5 minutes

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
      const files = fs.readdirSync(this.costsDir);
      
      files.forEach(file => {
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          const provider = path.basename(file, path.extname(file));
          
          // Skip template files
          if (provider === 'templates') return;
          
          try {
            const pricing = this.loadProviderPricing(provider);
            this.pricingCache.set(provider, pricing);
            console.log(`✅ Loaded pricing for ${provider}: ${Object.keys(pricing.models).length} models`);
          } catch (error) {
            console.error(`❌ Failed to load pricing for ${provider}:`, error);
          }
        }
      });

      this.lastLoadTime = now;
      console.log(`📊 Loaded pricing for ${this.pricingCache.size} providers`);
      
    } catch (error) {
      console.error('❌ Failed to load pricing directory:', error);
    }

    return this.pricingCache;
  }

  /**
   * Load pricing for a specific provider
   */
  loadProviderPricing(provider: string): PricingConfig {
    const filePath = path.join(this.costsDir, `${provider}.yaml`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Pricing file not found for provider: ${provider}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const config = yaml.load(content) as PricingConfig;

    // Validate required fields
    if (!config.provider || !config.models || !config.currency) {
      throw new Error(`Invalid pricing configuration for provider: ${provider}`);
    }

    // Normalize cache field names for Anthropic
    if (provider === 'anthropic') {
      config.models = this.normalizeAnthropicCacheFields(config.models);
    }

    return config;
  }

  /**
   * Normalize Anthropic cache field names to generic format
   */
  private normalizeAnthropicCacheFields(models: Record<string, any>): Record<string, ModelPricing> {
    const normalizedModels: Record<string, ModelPricing> = {};

    Object.entries(models).forEach(([modelName, modelPricing]: [string, any]) => {
      const normalizedPricing: ModelPricing = { ...modelPricing };

      // Map Anthropic-specific cache field names to generic ones
      if (modelPricing['5m_cache_write'] !== undefined) {
        normalizedPricing.cache_write = modelPricing['5m_cache_write'];
      }
      if (modelPricing['1h_cache_write'] !== undefined) {
        // Use 5min cache write as default, 1h as fallback
        normalizedPricing.cache_write = normalizedPricing.cache_write || modelPricing['1h_cache_write'];
      }
      if (modelPricing['cache_read'] !== undefined) {
        normalizedPricing.cache_read = modelPricing['cache_read'];
      }

      normalizedModels[modelName] = normalizedPricing;
    });

    return normalizedModels;
  }

  /**
   * Get pricing for a specific model (with automatic model name normalization)
   */
  getModelPricing(provider: string, model: string): ModelPricing | null {
    const config = this.pricingCache.get(provider);
    if (!config) return null;
    
    const normalizedModel = ModelUtils.normalizeModelName(model);
    return config.models[normalizedModel] || null;
  }

  /**
   * Get all available models for a provider
   */
  getProviderModels(provider: string): string[] {
    const config = this.pricingCache.get(provider);
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

    const config = this.pricingCache.get(provider);

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
}

// Export singleton instance
export const pricingLoader = new PricingLoader();
