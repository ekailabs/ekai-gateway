import { BaseProvider } from './base-provider.js';
import { CanonicalRequest, CanonicalResponse } from 'shared/types/index.js';
import fetch, { Response } from 'node-fetch';
import { APIError } from '../../infrastructure/utils/error-handler.js';
import { ModelUtils } from '../../infrastructure/utils/model-utils.js';
import { getConfig } from '../../infrastructure/config/app-config.js';

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
  protected get apiKey(): string | undefined {
    return getConfig().providers.openai.apiKey;
  }

  private isResponsesAPI(request: CanonicalRequest): boolean {
    return Boolean((request as any).metadata?.useResponsesAPI);
  }

  private transformRequestForResponses(request: CanonicalRequest): any {
    // Flatten canonical messages to a simple string input when possible
    const lastUser = [...request.messages].reverse().find(m => m.role === 'user');
    const text = lastUser
      ? lastUser.content.filter(c => c.type === 'text').map(c => c.text).join('')
      : request.messages.map(m => m.content.filter(c => c.type === 'text').map(c => c.text).join('')).join('\n');
    const body: any = {
      model: request.model,
      input: text,
      temperature: request.temperature,
    };
    if (request.maxTokens) body.max_output_tokens = request.maxTokens;
    if (request.stream) body.stream = true;
    return body;
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

  private transformResponsesToCanonical(response: any): CanonicalResponse {
    const text = response.output_text
      || (Array.isArray(response.output)
          ? response.output.flatMap((o: any) => (o.content || [])).filter((c: any) => c.type?.includes('text')).map((c: any) => c.text || '').join('')
          : '');

    const inputTokens = response.usage?.input_tokens ?? response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? response.usage?.completion_tokens ?? 0;
    const created = response.created ?? Math.floor(Date.now() / 1000);

    return {
      id: response.id,
      model: response.model,
      created,
      message: {
        role: 'assistant',
        content: [{ type: 'text', text }]
      },
      finishReason: 'stop',
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens
      }
    };
  }

  // Add streaming support
  async getStreamingResponse(request: CanonicalRequest): Promise<Response> {
    if (this.isResponsesAPI(request)) {
      const transformed = this.transformRequestForResponses(request);
      return this.fetchStreaming('/responses', transformed);
    }

    const transformedRequest = this.transformRequest(request);
    transformedRequest.stream = true;

    if (!this.apiKey) {
      throw new APIError(401, `${this.name} API key not configured`);
    }

    return this.fetchStreaming(this.getChatCompletionEndpoint(), transformedRequest);
  }

  private async fetchStreaming(endpoint: string, body: any): Promise<Response> {
    if (!this.apiKey) {
      throw new APIError(401, `${this.name} API key not configured`);
    }
    const url = `${this.baseUrl}${endpoint}`;
    const headers = this.getHeaders();
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, `${this.name} API error: ${response.status} - ${errorText}`);
    }
    return response;
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

  async chatCompletion(request: CanonicalRequest): Promise<CanonicalResponse> {
    if (this.isResponsesAPI(request)) {
      const body = this.transformRequestForResponses(request);
      const resp = await this.makeAPIRequest<any>('/responses', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      return this.transformResponsesToCanonical(resp);
    }
    return super.chatCompletion(request);
  }
}
