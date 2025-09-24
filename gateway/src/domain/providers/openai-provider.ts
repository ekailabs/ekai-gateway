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

  private isResponsesAPI(request: CanonicalRequest): boolean {
    return Boolean((request as any).metadata?.useResponsesAPI);
  }

  // Build the request body that would be sent to OpenAI Responses API (for diagnostics/tests)
  static buildRequestBodyForResponses(request: CanonicalRequest): any {
    // Use canonical input if available, otherwise reconstruct from messages
    let input: any;
    
    if (request.input !== undefined) {
      // Use the canonical input structure
      if (typeof request.input === 'string') {
        input = request.input;
      } else {
        // Convert canonical input items back to OpenAI Responses format
        input = request.input.map(item => {
          if (item.type === 'message') {
            return {
              type: 'message',
              role: item.role,
              content: item.content.map(c => ({ 
                type: c.type === 'text' ? 'input_text' : c.type, 
                text: c.text 
              }))
            };
          } else if (item.type === 'reasoning') {
            return {
              type: 'reasoning',
              summary: item.summary,
              content: item.content,
              encrypted_content: item.encrypted_content
            };
          }
          return item;
        });
      }
    } else {
      // Fallback: reconstruct from messages
      input = request.messages.map(m => ({
        type: 'message',
        role: m.role,
        content: m.content.map(c => ({ type: 'input_text', text: c.type === 'text' ? c.text : '' }))
      }));
    }

    const body: any = {
      model: request.model,
      input,
      temperature: request.temperature,
    };
    if (request.maxTokens) body.max_output_tokens = request.maxTokens;
    if (request.stream) body.stream = true;
    if (request.system) body.instructions = request.system;
    if (request.store !== undefined) body.store = request.store;
    if (request.parallelToolCalls !== undefined) body.parallel_tool_calls = request.parallelToolCalls;
    if (request.reasoning) body.reasoning = request.reasoning;
    if (request.reasoningEffort) body.reasoning_effort = request.reasoningEffort;
    if (request.tools) body.tools = request.tools;
    if (request.toolChoice) body.tool_choice = request.toolChoice;
    if (request.responseFormat) body.response_format = request.responseFormat;
    if (request.modalities) body.modalities = request.modalities;
    if (request.audio) body.audio = request.audio;
    if (request.seed !== undefined) body.seed = request.seed;
    if (request.promptCacheKey) body.prompt_cache_key = request.promptCacheKey;
    if (request.include) body.include = request.include;

    return body;
  }

  private transformRequestForResponses(request: CanonicalRequest): any {
    // Use the same input reconstruction logic as buildRequestBodyForResponses
    let input: any;
    
    if (request.input !== undefined) {
      // Use the canonical input structure
      if (typeof request.input === 'string') {
        input = request.input;
      } else {
        // Convert canonical input items back to OpenAI Responses format
        input = request.input.map(item => {
          if (item.type === 'message') {
            return {
              type: 'message',
              role: item.role,
              content: item.content.map(c => ({ 
                type: c.type === 'text' ? 'input_text' : c.type, 
                text: c.text 
              }))
            };
          } else if (item.type === 'reasoning') {
            return {
              type: 'reasoning',
              summary: item.summary,
              content: item.content,
              encrypted_content: item.encrypted_content
            };
          }
          return item;
        });
      }
    } else {
      // Fallback: reconstruct from messages
      input = request.messages.map(m => ({
        type: 'message',
        role: m.role,
        content: m.content.map(c => ({ type: 'input_text', text: c.type === 'text' ? c.text : '' }))
      }));
    }

    const body: any = {
      model: request.model,
      input,
      temperature: request.temperature,
    };
    if (request.maxTokens) body.max_output_tokens = request.maxTokens;
    if (request.stream) body.stream = true;
    if (request.system) body.instructions = request.system;
    if (request.store !== undefined) body.store = request.store;
    if (request.parallelToolCalls !== undefined) body.parallel_tool_calls = request.parallelToolCalls;
    if (request.reasoning) body.reasoning = request.reasoning;
    if (request.reasoningEffort) body.reasoning_effort = request.reasoningEffort;
    if (request.promptCacheKey) body.prompt_cache_key = request.promptCacheKey;
    if (request.include) body.include = request.include;
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
