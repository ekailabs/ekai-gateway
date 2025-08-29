import { Request, Response } from 'express';
import { usageTracker } from './utils/usage-tracker.js';

export function getUsage(req: Request, res: Response) {
  try {
    const usage = usageTracker.getUsage();
    res.json(usage);
  } catch (error) {
    console.error('Usage endpoint error:', error);
    res.status(500).json({ 
      error: 'Failed to get usage data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}