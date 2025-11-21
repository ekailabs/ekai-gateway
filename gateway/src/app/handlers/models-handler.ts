import { Request, Response } from 'express';
import { modelCatalogService } from '../../domain/services/model-catalog-service.js';
import { logger } from '../../infrastructure/utils/logger.js';

const MAX_LIMIT = 500;

export const handleModelsRequest = (req: Request, res: Response): void => {
  try {
    const { provider, endpoint, search } = req.query;
    const limit = Math.min(parseInt(String(req.query.limit || '200'), 10) || 200, MAX_LIMIT);
    const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);

    const { total, items } = modelCatalogService.getModels({
      provider: provider ? String(provider) : undefined,
      endpoint: endpoint === 'messages' ? 'messages' : endpoint === 'chat_completions' ? 'chat_completions' : endpoint === 'responses' ? 'responses' : undefined,
      search: search ? String(search) : undefined,
      limit,
      offset
    });

    res.json({
      total,
      limit,
      offset,
      items
    });
  } catch (error) {
    logger.error('Failed to fetch models', error, { module: 'models-handler' });
    res.status(500).json({ error: 'Failed to fetch models' });
  }
};
