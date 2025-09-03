import { Request, Response, NextFunction } from 'express';
import { AnthropicMessagesResponse } from 'shared/types/index.js';

export function createResponseTransformer<TInput, TOutput>(
  transformer: (input: TInput) => TOutput
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = function(data: TInput) {
      const transformedData = transformer(data);
      return originalJson(transformedData);
    };
    next();
  };
}

export function convertOpenAIToAnthropic(openaiResponse: any): AnthropicMessagesResponse {
  const choice = openaiResponse.choices?.[0];
  if (!choice) {
    throw new Error('No choices in OpenAI response');
  }

  return {
    id: openaiResponse.id,
    type: 'message',
    role: 'assistant',
    content: [{
      type: 'text',
      text: choice.message.content
    }],
    model: openaiResponse.model,
    stop_reason: choice.finish_reason === 'stop' ? 'end_turn' : 
                 choice.finish_reason === 'length' ? 'max_tokens' : 
                 'end_turn',
    usage: {
      input_tokens: openaiResponse.usage?.prompt_tokens || 0,
      output_tokens: openaiResponse.usage?.completion_tokens || 0
    }
  };
}

export const anthropicResponseTransformer = createResponseTransformer(convertOpenAIToAnthropic);