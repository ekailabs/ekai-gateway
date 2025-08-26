import { Request, Response } from 'express';
import { ProviderManager } from './provider-manager.js';
import { ChatCompletionRequest } from './types.js';

const providerManager = new ProviderManager();

export async function chatCompletionProxy(req: Request, res: Response) {
  try {
    const { messages, model, stream = false, ...otherParams } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    if (!model) {
      return res.status(400).json({ error: 'Model is required' });
    }

    console.log(`🚀 The model is here ${model}`);

    const request: ChatCompletionRequest = {
      model,
      messages,
      stream,
      ...otherParams
    };
    
    const response = await providerManager.handleChatCompletion(request);

    // Response is already JSON parsed from the provider
    res.json(response);
  } catch (error) {
    console.error('Chat completion proxy error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}