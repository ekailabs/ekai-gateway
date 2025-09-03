import { Request, Response } from 'express';
import { ProviderService } from '../../domain/services/provider-service.js';
import { handleError } from '../../infrastructure/utils/error-handler.js';
import { logger } from '../../infrastructure/utils/logger.js';

export class ModelsHandler {
  constructor(private readonly providerService: ProviderService) {}

  async getModels(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Fetching available models');
      const models = await this.providerService.getAllModels();
      res.json(models);
    } catch (error) {
      logger.error('Failed to fetch models', error instanceof Error ? error : new Error(String(error)));
      handleError(error, res);
    }
  }
}

// Factory function
export function createModelsHandler(): ModelsHandler {
  const providerService = new ProviderService();
  return new ModelsHandler(providerService);
}

// Singleton instance
const modelsHandler = createModelsHandler();

// Endpoint function
export const handleModelsRequest = async (req: Request, res: Response): Promise<void> => {
  await modelsHandler.getModels(req, res);
};