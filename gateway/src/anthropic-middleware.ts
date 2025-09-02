import { Request, Response, NextFunction } from 'express';
import { AnthropicMessagesRequest, ChatMessage } from '../../shared/types/index.js';
import { validateAnthropicRequest } from './utils/validation.js';
import { handleError, APIError } from './utils/error-handler.js';
import { anthropicResponseTransformer } from './utils/response-transformer.js';

export function anthropicToOpenAIMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const anthropicRequest = req.body as AnthropicMessagesRequest;

    const validationError = validateAnthropicRequest(anthropicRequest);
    if (validationError) {
      throw new APIError(400, validationError);
    }

    const messages: ChatMessage[] = [...anthropicRequest.messages];
    
    if (anthropicRequest.system) {
      messages.unshift({
        role: 'system',
        content: anthropicRequest.system
      });
    }

    req.body = {
      model: anthropicRequest.model,
      messages,
      max_tokens: anthropicRequest.max_tokens,
      stream: anthropicRequest.stream || false,
      temperature: anthropicRequest.temperature,
      ...Object.fromEntries(
        Object.entries(anthropicRequest).filter(([key]) => 
          !['model', 'messages', 'max_tokens', 'system', 'stream', 'temperature'].includes(key)
        )
      )
    };

    anthropicResponseTransformer(req, res, next);
  } catch (error) {
    handleError(error, res, true);
  }
}