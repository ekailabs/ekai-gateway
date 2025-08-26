import { Request, Response } from 'express';
import fetch from 'node-fetch';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function openRouterProxy(req: Request, res: Response) {
  try {
    const { messages, model, stream = false, ...otherParams } = req.body;

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    
    if (!OPENROUTER_API_KEY) {
      console.error('OPENROUTER_API_KEY environment variable is required');
      return res.status(500).json({ error: 'OpenRouter API key not configured' });
    }

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    if (!model) {
      return res.status(400).json({ error: 'Model is required' });
    }

    const openRouterRequest = {
      model,
      messages,
      stream,
      ...otherParams
    };

    console.log(`🤖 Proxying request to OpenRouter for model: ${model}`);

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Title': 'OpenRouter Proxy Backend'
      },
      body: JSON.stringify(openRouterRequest)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: 'OpenRouter API error',
        details: errorText
      });
    }

    if (stream && response.body) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      response.body.pipe(res);
    } else {
      const data = await response.json();
      res.json(data);
    }
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}