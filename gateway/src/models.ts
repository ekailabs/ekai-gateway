import { Request, Response } from 'express';
import { ProviderManager } from './provider-manager.js';

const providerManager = new ProviderManager();

export async function getModels(req: Request, res: Response) {
  try {
    console.log('📋 Fetching models from all available providers');
    
    const allModels = await providerManager.getAllModels();
    res.json(allModels);
  } catch (error) {
    console.error('❌ Error fetching models:', error);
    res.status(500).json({ 
      error: 'Failed to fetch models',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}