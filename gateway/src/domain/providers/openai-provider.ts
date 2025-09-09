import { BaseProvider } from './base-provider.js';
import { CanonicalRequest, CanonicalResponse } from 'shared/types/index.js';
import fetch, { Response } from 'node-fetch';
import { APIError } from '../../infrastructure/utils/error-handler.js';
import { ModelUtils } from '../../infrastructure/utils/model-utils.js';

interface OpenAIRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string; }>;
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  stream?: boolean;
  stop?: string | string[];
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string; };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenAIProvider extends BaseProvider {
  readonly name = 'openai';
  protected readonly baseUrl = 'https://api.openai.com/v1';
  protected readonly apiKey = process.env.OPENAI_API_KEY;

  // Add streaming support
  async getStreamingResponse(request: CanonicalRequest): Promise<Response> {
    const transformedRequest = this.transformRequest(request);
    transformedRequest.stream = true;

    if (!this.apiKey) {
      throw new APIError(401, `${this.name} API key not configured`);
    }

    const url = `${this.baseUrl}${this.getChatCompletionEndpoint()}`;
    const headers = this.getHeaders();
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(transformedRequest)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, `${this.name} API error: ${response.status} - ${errorText}`);
    }

    return response;
  }

  protected transformRequest(request: CanonicalRequest): OpenAIRequest {
    const messages = request.messages.map(msg => ({
      role: msg.role,
      content: msg.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('')
    }));

    const requestData: OpenAIRequest = {
      model: request.model,
      messages,
      temperature: request.temperature,
      stream: request.stream || false,
      stop: request.stopSequences
    };

    // Use max_completion_tokens for o1/o3/o4 series models, max_tokens for others
    if (request.maxTokens) {
      if (ModelUtils.requiresMaxCompletionTokens(request.model)) {
        requestData.max_completion_tokens = request.maxTokens;
      } else {
        requestData.max_tokens = request.maxTokens;
      }
    }

    return requestData;
  }

  protected transformResponse(response: OpenAIResponse): CanonicalResponse {
    const choice = response.choices[0];
    
    return {
      id: response.id,
      model: response.model,
      created: response.created,
      message: {
        role: 'assistant',
        content: [{
          type: 'text',
          text: choice.message.content
        }]
      },
      finishReason: this.mapFinishReason(choice.finish_reason),
      usage: {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens
      }
    };
  }

  private mapFinishReason(reason: string): 'stop' | 'length' | 'tool_calls' | 'error' {
    switch (reason) {
      case 'stop': return 'stop';
      case 'length': return 'length'; 
      case 'function_call': return 'tool_calls';
      case 'tool_calls': return 'tool_calls';
      default: return 'stop';
    }
  }
}