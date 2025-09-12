import { Request, Response } from 'express';
import { usageTracker } from '../../infrastructure/utils/usage-tracker.js';
import { handleError } from '../../infrastructure/utils/error-handler.js';
import { logger } from '../../infrastructure/utils/logger.js';

export class UsageHandler {
  async getUsage(req: Request, res: Response): Promise<void> {
    try {
      // Parse and validate query parameters
      const { startTime, endTime, timezone } = req.query;
      
      
      // Default to last 7 days if no startTime provided
      const defaultStartTime = new Date();
      defaultStartTime.setDate(defaultStartTime.getDate() - 7);
      
      const start = startTime ? new Date(String(startTime)) : defaultStartTime;
      const end = endTime ? new Date(String(endTime)) : new Date();
      const tz = String(timezone || 'UTC');
      
      // Validate dates
      if (isNaN(start.getTime())) {
        res.status(400).json({ error: 'Invalid startTime format. Use RFC3339 (e.g., 2024-01-01T00:00:00Z)' });
        return;
      }
      if (isNaN(end.getTime())) {
        res.status(400).json({ error: 'Invalid endTime format. Use RFC3339 (e.g., 2024-01-01T23:59:59Z)' });
        return;
      }
      if (start >= end) {
        res.status(400).json({ error: 'startTime must be before endTime' });
        return;
      }
      
      // Validate timezone (IANA format)
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
      } catch {
        res.status(400).json({ error: 'Invalid timezone. Use IANA format (e.g., America/New_York, UTC)' });
        return;
      }
     
      logger.info('USAGE_TRACKER: Fetching usage data', {
        start,
        end,
        tz
      });
      
      // Get usage data with date range filtering
      const usage = usageTracker.getUsageFromDatabase(start.toISOString(), end.toISOString());
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