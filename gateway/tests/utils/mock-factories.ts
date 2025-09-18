// vi is available globally due to vitest config globals: true
import fs from 'fs';
import path from 'path';
import type { CostCalculation, PricingConfig, ModelPricing } from '../../src/infrastructure/utils/pricing-loader.js';

/**
 * Mock factories for creating test data
 */

export class MockFactories {
  
  static createCostCalculation(overrides: Partial<CostCalculation> = {}): CostCalculation {
    return {
      inputCost: 0.001,
      cacheWriteCost: 0.0005,
      cacheReadCost: 0.0001,
      outputCost: 0.002,
      totalCost: 0.0036,
      currency: 'USD',
      unit: 'MTok',
      ...overrides
    };
  }

  static createModelPricing(overrides: Partial<ModelPricing> = {}): ModelPricing {
    return {
      input: 30.0,
      output: 60.0,
      cache_write: 3.75,
      cache_read: 0.3,
      ...overrides
    };
  }

  /**
   * Load real pricing config from actual src/costs files
   */
  static loadRealPricingConfig(provider: string): PricingConfig | null {
    const realPricingDir = path.join(__dirname, '../../src/costs');
    const filePath = path.join(realPricingDir, `${provider}.yaml`);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const yaml = require('js-yaml');
      return yaml.load(content) as PricingConfig;
    } catch {
      return null;
    }
  }

  /**
   * Create a minimal test pricing config for controlled unit tests
   */
  static createMinimalPricingConfig(provider: string = 'test-provider', overrides: Partial<PricingConfig> = {}): PricingConfig {
    return {
      provider,
      currency: 'USD',
      unit: 'MTok',
      models: {
        // OpenAI pattern: cached_input
        'test-openai-model': {
          input: 2.50,
          output: 10.0,
          cache_write: 1.25  // Will be mapped to cached_input for OpenAI
        },
        // Anthropic pattern: 5m_cache_write, 1h_cache_write, cache_read
        'test-anthropic-model': {
          input: 3.0,
          output: 15.0,
          cache_write: 3.75,  // Will be mapped to 5m_cache_write
          cache_read: 0.3
        },
        // Simple model without cache
        'test-simple-model': {
          input: 1.0,
          output: 2.0
        }
      },
      metadata: {
        last_updated: '2024-01-01',
        source: 'test',
        notes: 'Minimal test pricing configuration',
        version: '1.0.0'
      },
      ...overrides
    };
  }

  static createYamlContent(config: PricingConfig): string {
    return `
provider: "${config.provider}"
currency: "${config.currency}"
unit: "${config.unit}"

models:
${Object.entries(config.models).map(([model, pricing]) => `
  ${model}:
    input: ${pricing.input}
    output: ${pricing.output}
    ${pricing.cache_write ? `cache_write: ${pricing.cache_write}` : ''}
    ${pricing.cache_read ? `cache_read: ${pricing.cache_read}` : ''}
`).join('')}

metadata:
  last_updated: "${config.metadata.last_updated}"
  source: "${config.metadata.source}"
  notes: "${config.metadata.notes}"
  version: "${config.metadata.version}"
    `.trim();
  }

  static createMockFileSystem(files: Record<string, string>) {
    const mockFs = {
      existsSync: vi.fn((path: string) => path in files),
      readFileSync: vi.fn((path: string, encoding?: string) => {
        if (path in files) {
          return files[path];
        }
        throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      }),
      readdirSync: vi.fn((path: string) => {
        // Return filenames that start with the directory path
        return Object.keys(files)
          .filter(file => file.startsWith(path))
          .map(file => file.replace(path + '/', ''))
          .filter(file => !file.includes('/'));
      })
    };

    return mockFs;
  }

  static createMockLogger() {
    return {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    };
  }

  static createDateSequence(startDate: Date, count: number, intervalHours: number = 1): Date[] {
    const dates = [];
    for (let i = 0; i < count; i++) {
      const date = new Date(startDate);
      date.setHours(date.getHours() + (i * intervalHours));
      dates.push(date);
    }
    return dates;
  }

  static createProviderModelCombinations(): Array<{ provider: string; model: string }> {
    return [
      { provider: 'openai', model: 'gpt-4' },
      { provider: 'openai', model: 'gpt-3.5-turbo' },
      { provider: 'anthropic', model: 'claude-3-sonnet-20240229' },
      { provider: 'anthropic', model: 'claude-3-haiku-20240307' },
      { provider: 'xai', model: 'grok-beta' },
      { provider: 'openrouter', model: 'meta-llama/llama-2-70b-chat' }
    ];
  }

  static createErrorScenarios() {
    return {
      databaseError: new Error('Database connection failed'),
      fileNotFound: new Error('ENOENT: no such file or directory'),
      invalidYaml: new Error('YAMLException: bad indentation'),
      networkError: new Error('ECONNREFUSED'),
      validationError: new Error('Invalid input parameters')
    };
  }

  /**
   * Create mock file system that points to real pricing files
   */
  static createRealPricingMockFs() {
    const realPricingDir = path.join(__dirname, '../../src/costs');
    const files: Record<string, string> = {};
    
    // Load actual pricing files
    if (fs.existsSync(realPricingDir)) {
      const pricingFiles = fs.readdirSync(realPricingDir)
        .filter(file => file.endsWith('.yaml') || file.endsWith('.yml'));
      
      pricingFiles.forEach(file => {
        const filePath = path.join(realPricingDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        files[filePath] = content;
      });
    }

    return MockFactories.createMockFileSystem(files);
  }

  /**
   * Get real provider/model combinations for testing
   */
  static getRealProviderModelCombinations(): Array<{ provider: string; model: string; hasCache: boolean }> {
    const combinations: Array<{ provider: string; model: string; hasCache: boolean }> = [];
    const providers = ['openai', 'anthropic', 'xAI', 'openrouter'];
    
    providers.forEach(provider => {
      const config = MockFactories.loadRealPricingConfig(provider);
      if (config?.models) {
        Object.entries(config.models).forEach(([model, pricing]) => {
          const hasCache = !!(pricing.cache_write || pricing.cache_read || 
                            (pricing as any).cached_input || 
                            (pricing as any)['5m_cache_write'] ||
                            (pricing as any)['1h_cache_write']);
          
          combinations.push({ provider, model, hasCache });
        });
      }
    });
    
    return combinations;
  }

  /**
   * Get real model names from actual pricing files for testing
   */
  static getRealModelNames(provider: string): string[] {
    const realPricingDir = path.join(__dirname, '../../src/costs');
    const filePath = path.join(realPricingDir, `${provider}.yaml`);
    
    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const yaml = require('js-yaml');
      const config = yaml.load(content) as PricingConfig;
      return Object.keys(config.models || {});
    } catch {
      return [];
    }
  }
}
