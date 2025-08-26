import { Request, Response } from 'express';
import fetch from 'node-fetch';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

export async function getModels(req: Request, res: Response) {
  try {
    console.log('📋 Fetching models from OpenRouter');
    
    const response = await fetch(OPENROUTER_MODELS_URL, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
      }
    });

    if (!response.ok) {
      throw new Error(`OpenRouter models API error: ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('❌ Error fetching models:', error);
    res.status(500).json({ 
      error: 'Failed to fetch models',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}