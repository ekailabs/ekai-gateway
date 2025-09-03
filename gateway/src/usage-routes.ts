import { Request, Response } from 'express';
import { usageTracker } from './utils/usage-tracker.js';

export function getUsage(req: Request, res: Response) {
  try {
    // Get usage data from database (more accurate and persistent)
    const usage = usageTracker.getUsageFromDatabase();
    res.json(usage);
  } catch (error) {
    console.error('Usage endpoint error:', error);
    res.status(500).json({ 
      error: 'Failed to get usage data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}