import { Request, Response } from 'express';
import { ProviderManager } from './provider-manager.js';
import { ChatCompletionRequest, ChatMessage } from './types.js';
import { validateChatCompletionRequest } from './utils/validation.js';
import { handleError, APIError } from './utils/error-handler.js';

const providerManager = new ProviderManager();

// Removed conversation context management - no conversation storage

export async function chatCompletionProxy(req: Request, res: Response) {
  try {
    const { messages, model, stream = false, ...otherParams } = req.body;

    const validationError = validateChatCompletionRequest(req.body);
    if (validationError) {
      throw new APIError(400, validationError);
    }

    console.log(`🚀 Processing request for model: ${model}`);

    const request: ChatCompletionRequest = {
      model,
      messages,
      stream,
      ...otherParams
    };
    
    const response = await providerManager.handleChatCompletion(request);

    res.json(response);
  } catch (error) {
    handleError(error, res, false);
  }
}