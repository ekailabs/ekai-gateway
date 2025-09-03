import { Request, Response } from 'express';
import { usageTracker } from '../../infrastructure/utils/usage-tracker.js';
import { handleError } from '../../infrastructure/utils/error-handler.js';
import { logger } from '../../infrastructure/utils/logger.js';

export class UsageHandler {
  async getUsage(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Fetching usage data');
      const usage = usageTracker.getUsageFromDatabase();
      res.json(usage);
    } catch (error) {
      logger.error('Failed to fetch usage data', error instanceof Error ? error : new Error(String(error)));
      handleError(error, res);
    }
  }
}

// Singleton instance
const usageHandler = new UsageHandler();

// Endpoint function
export const handleUsageRequest = async (req: Request, res: Response): Promise<void> => {
  await usageHandler.getUsage(req, res);
};