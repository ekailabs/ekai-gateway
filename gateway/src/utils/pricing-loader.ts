import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

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
  outputCost: number;
  totalCost: number;
  currency: string;
  unit: string;
}

export class PricingLoader {
  private costsDir = path.join(__dirname, '../costs');
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

    return config;
  }

  /**
   * Get pricing for a specific model
   */
  getModelPricing(provider: string, model: string): ModelPricing | null {
    const config = this.pricingCache.get(provider);
    if (!config) return null;
    
    return config.models[model] || null;
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
  calculateCost(provider: string, model: string, inputTokens: number, outputTokens: number): CostCalculation | null {
    const pricing = this.getModelPricing(provider, model);
    if (!pricing) return null;

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    const totalCost = inputCost + outputCost;

    const config = this.pricingCache.get(provider);
    
    return {
      inputCost: Math.round(inputCost * 1000000) / 1000000, // Round to 6 decimal places
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
