import { modelCatalogService } from './model-catalog-service.js';
import { ProviderService } from './provider-service.js';
import { logger } from '../../infrastructure/utils/logger.js';

const providerService = new ProviderService();

/**
 * Check if a model exists in the catalog
 */
export function isValidModel(modelId: string): boolean {
  const { items } = modelCatalogService.getModels({ search: modelId, limit: 1 });
  return items.some(m => m.id === modelId);
}

/**
 * Get all valid models from a list, filtering out invalid ones
 */
export function filterValidModels(modelIds: string[]): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const modelId of modelIds) {
    if (isValidModel(modelId)) {
      valid.push(modelId);
    } else {
      invalid.push(modelId);
    }
  }

  return { valid, invalid };
}

/**
 * Check if a user has access to a specific model.
 *
 * For now, this checks if the provider for the model has an API key configured.
 * In the future, this could check smart contract approvals, delegations, etc.
 *
 * @param userAddress - The user's wallet address
 * @param apiOwnerAddress - The address whose API keys are being used
 * @param modelId - The model to check access for
 * @returns true if access is allowed, false otherwise
 */
export function hasModelAccess(userAddress: string, apiOwnerAddress: string, modelId: string): boolean {
  // Get the model's provider
  const { items } = modelCatalogService.getModels({ search: modelId, limit: 10 });
  const model = items.find(m => m.id === modelId);

  if (!model) {
    logger.debug('Model not found in catalog', { modelId, userAddress, module: 'access-service' });
    return false;
  }

  // Check if the provider has an API key configured
  const availableProviders = providerService.getAvailableProviders();
  const providerAvailable = availableProviders.some(p => p.toLowerCase() === model.provider.toLowerCase());

  if (!providerAvailable) {
    logger.debug('Provider not configured for model', {
      modelId,
      provider: model.provider,
      availableProviders,
      userAddress,
      module: 'access-service'
    });
    return false;
  }

  // For now, if provider is available, user has access
  // Future: check smart contract approval for delegation
  logger.debug('Model access granted', {
    modelId,
    provider: model.provider,
    userAddress,
    apiOwnerAddress,
    module: 'access-service'
  });

  return true;
}

/**
 * Filter models by access - returns only models the user has access to
 */
export function filterAccessibleModels(userAddress: string, apiOwnerAddress: string, modelIds: string[]): string[] {
  return modelIds.filter(modelId => hasModelAccess(userAddress, apiOwnerAddress, modelId));
}
