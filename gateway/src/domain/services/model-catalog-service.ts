import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pricingLoader, ModelPricing } from '../../infrastructure/utils/pricing-loader.js';
import { ModelUtils } from '../../infrastructure/utils/model-utils.js';
import { logger } from '../../infrastructure/utils/logger.js';

type EndpointType = 'chat_completions' | 'messages' | 'responses';

export interface ModelCatalogEntry {
  id: string;
  provider: string;
  endpoint: EndpointType;
  pricing: (ModelPricing & { currency: string; unit: string }) | null;
  source: string;
}

interface ProviderModels {
  provider: string;
  models: string[];
}

interface CatalogFile {
  filename: string;
  endpoint: EndpointType;
}

const CATALOG_FILES: CatalogFile[] = [
  { filename: 'chat_completions_providers_v1.json', endpoint: 'chat_completions' },
  { filename: 'messages_providers_v1.json', endpoint: 'messages' },
  { filename: 'responses_providers_v1.json', endpoint: 'responses' }
];

export interface ModelCatalogFilter {
  provider?: string;
  endpoint?: EndpointType;
  search?: string;
  limit?: number;
  offset?: number;
}

export class ModelCatalogService {
  private cache: ModelCatalogEntry[] | null = null;
  private readonly cacheTtlMs = 5 * 60 * 1000;
  private lastLoad = 0;

  getModels(filter: ModelCatalogFilter = {}): { total: number; items: ModelCatalogEntry[] } {
    const catalog = this.ensureLoaded();

    let items = catalog;

    if (filter.provider) {
      const provider = filter.provider.toLowerCase();
      items = items.filter(m => m.provider === provider);
    }

    if (filter.endpoint) {
      items = items.filter(m => m.endpoint === filter.endpoint);
    }

    if (filter.search) {
      const term = filter.search.toLowerCase();
      items = items.filter(m => m.id.toLowerCase().includes(term));
    }

    const total = items.length;

    const limit = Math.min(Math.max(filter.limit ?? 200, 1), 500);
    const offset = Math.max(filter.offset ?? 0, 0);

    const paged = items.slice(offset, offset + limit);

    return { total, items: paged };
  }

  private ensureLoaded(): ModelCatalogEntry[] {
    const now = Date.now();
    if (this.cache && now - this.lastLoad < this.cacheTtlMs) {
      return this.cache;
    }

    try {
      const entries: ModelCatalogEntry[] = [];
      const pricingMap = pricingLoader.loadAllPricing();

      for (const catalogFile of CATALOG_FILES) {
        const providers = this.readCatalogFile(catalogFile.filename);
        providers.forEach(providerEntry => {
          const provider = providerEntry.provider.toLowerCase();
          const openRouterModels = provider === 'openrouter' ? this.getOpenRouterModels(pricingMap) : null;
          const models = openRouterModels ?? providerEntry.models;

          models.forEach(modelId => {
            const normalizedModel = ModelUtils.normalizeModelName(modelId);
            const pricingConfig = pricingMap.get(provider);
            const modelPricing = pricingConfig?.models[normalizedModel] || pricingConfig?.models[modelId] || null;

            const pricing = modelPricing
              ? {
                  ...modelPricing,
                  currency: pricingConfig?.currency || 'USD',
                  unit: pricingConfig?.unit || '1K tokens'
                }
              : null;

            entries.push({
              id: modelId,
              provider,
              endpoint: catalogFile.endpoint,
              pricing,
              source: catalogFile.filename
            });
          });
        });
      }

      this.cache = entries;
      this.lastLoad = now;

      logger.info('Model catalog loaded', {
        entryCount: entries.length,
        operation: 'model_catalog_load',
        module: 'model-catalog-service'
      });

      return entries;
    } catch (error) {
      logger.error('Failed to load model catalog', error, { module: 'model-catalog-service' });
      this.cache = [];
      this.lastLoad = now;
      return this.cache;
    }
  }

  private getOpenRouterModels(pricingMap: Map<string, any>): string[] | null {
    const pricing = pricingMap.get('openrouter');
    if (!pricing || !pricing.models) return null;
    const ids = Object.keys(pricing.models);
    return ids.length ? ids : null;
  }

  private readCatalogFile(filename: string): ProviderModels[] {
    const filePath = this.resolveCatalogPath(filename);

    if (!filePath) {
      logger.warn('Catalog file not found', { filename, module: 'model-catalog-service' });
      return [];
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as { providers?: ProviderModels[] };
      return parsed.providers || [];
    } catch (error) {
      logger.error('Failed to parse catalog file', error, { filename, module: 'model-catalog-service' });
      return [];
    }
  }

  private resolveCatalogPath(filename: string): string | null {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const candidates = [
      path.resolve(process.cwd(), 'model_catalog', filename),
      path.resolve(__dirname, '../../../model_catalog', filename),
      path.resolve(__dirname, '../../../../model_catalog', filename)
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }
}

export const modelCatalogService = new ModelCatalogService();
