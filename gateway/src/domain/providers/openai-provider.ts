import { BaseProvider } from './base-provider.js';
import { Request as CanonicalRequest, Response as CanonicalResponse } from '../../canonical/types/index.js';
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
    const anyReq = request as any;
    return Boolean(anyReq?.provider_params?.openai?.use_responses_api || anyReq?.metadata?.useResponsesAPI);
  }

  // Build the request body that would be sent to OpenAI Responses API (for diagnostics/tests)
  static buildRequestBodyForResponses(request: CanonicalRequest): any {
    // Reconstruct OpenAI Responses input array from canonical messages
    const anyReq = request as any;
    const input: any[] = [];
    
    for (const msg of anyReq.messages || []) {
      if (Array.isArray(msg.content)) {
        // Check if this is a reasoning message (system role with reasoning content)
        const reasoningContent = msg.content.find((c: any) => c.type === 'reasoning');
        if (reasoningContent && msg.role === 'system') {
          input.push({
            type: 'reasoning',
            summary: reasoningContent.summary,
            content: reasoningContent.content,
            encrypted_content: reasoningContent.encrypted_content
          });
        } else {
          // Regular message
          input.push({
            type: 'message',
            role: msg.role,
            content: msg.content.map((c: any) => ({
              type: c.type === 'text' ? 'input_text' : c.type, // Convert back to input_text
              text: c.text || ''
            }))
          });
        }
      } else {
        // Simple string content
        input.push({
          type: 'message',
          role: msg.role,
          content: [{ type: 'input_text', text: String(msg.content ?? '') }]
        });
      }
    }

    const gen = anyReq.generation || {};
    const body: any = {
      model: anyReq.model,
      input,
      temperature: gen.temperature,
      stream: Boolean(anyReq.stream),
    };
    if (gen.max_tokens != null) body.max_output_tokens = gen.max_tokens;
    if (anyReq.system) body.instructions = anyReq.system;
    if (anyReq.store !== undefined) body.store = anyReq.store;
    if (anyReq.parallel_tool_calls !== undefined) body.parallel_tool_calls = anyReq.parallel_tool_calls;
    if (anyReq.thinking) {
      // Only pass the fields that OpenAI Responses API accepts
      const thinking = anyReq.thinking;
      body.reasoning = {
        budget: thinking.budget,
        summary: thinking.summary,
        content: thinking.content,
        encrypted_content: thinking.encrypted_content,
        effort: anyReq.reasoning_effort  // Map reasoning_effort to reasoning.effort
      };
    }
    if (anyReq.tools) body.tools = anyReq.tools;
    if (anyReq.tool_choice) body.tool_choice = anyReq.tool_choice;
    if (anyReq.response_format) body.response_format = anyReq.response_format;
    if (anyReq.modalities) body.modalities = anyReq.modalities;
    if (anyReq.audio) body.audio = anyReq.audio;
    if (gen.seed !== undefined) body.seed = gen.seed;
    if (anyReq.provider_params?.openai?.prompt_cache_key) body.prompt_cache_key = anyReq.provider_params.openai.prompt_cache_key;
    if (anyReq.include) body.include = anyReq.include;
    return body;
  }

  private transformRequestForResponses(request: CanonicalRequest): any {
    return OpenAIProvider.buildRequestBodyForResponses(request);
  }

  protected transformRequest(request: CanonicalRequest): OpenAIRequest {
    const anyReq = request as any;
    const messages = (anyReq.messages || []).map((msg: any) => ({
      role: msg.role,
      content: Array.isArray(msg.content)
        ? (msg.content as any[]).filter(p => p?.type === 'text').map(p => p.text || '').join('')
        : String(msg.content ?? '')
    }));

    const gen = anyReq.generation || {};
    const requestData: OpenAIRequest = {
      model: anyReq.model,
      messages,
      temperature: gen.temperature,
      stream: Boolean(anyReq.stream),
      stop: gen.stop ?? gen.stop_sequences
    } as any;

    if (gen.max_tokens) {
      if (ModelUtils.requiresMaxCompletionTokens(anyReq.model)) {
        requestData.max_completion_tokens = gen.max_tokens;
      } else {
        requestData.max_tokens = gen.max_tokens;
      }
    }

    return requestData;
  }

  private transformResponsesToCanonical(response: any): CanonicalResponse {
    const text = response.output_text
      || (Array.isArray(response.output)
          ? response.output.flatMap((o: any) => (o.content || [])).filter((c: any) => c.type?.includes('text')).map((c: any) => c.text || '').join('')
          : '');
    const input_tokens = response.usage?.input_tokens ?? response.usage?.prompt_tokens ?? 0;
    const output_tokens = response.usage?.output_tokens ?? response.usage?.completion_tokens ?? 0;
    const created = response.created ?? Math.floor(Date.now() / 1000);
    const canonical: any = {
      schema_version: '1.0.1',
      id: response.id,
      model: response.model,
      created,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: [{ type: 'text', text }] },
        finish_reason: 'stop'
      }],
      usage: {
        input_tokens,
        output_tokens,
        total_tokens: input_tokens + output_tokens
      }
    };
    return canonical as CanonicalResponse;
  }

  // Add streaming support - always return raw provider response
  async getStreamingResponse(request: CanonicalRequest): Promise<Response> {
    let endpoint: string;
    let payload: any;

    if (this.isResponsesAPI(request)) {
      payload = this.transformRequestForResponses(request);
      endpoint = '/responses';
    } else {
      payload = this.transformRequest(request);
      payload.stream = true;
      endpoint = this.getChatCompletionEndpoint();
    }

    return this.fetchStreaming(endpoint, payload);
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
    const canonical: any = {
      schema_version: '1.0.1',
      id: response.id,
      model: response.model,
      created: response.created,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: [{ type: 'text', text: choice.message.content }] },
        finish_reason: choice.finish_reason
      }],
      usage: {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens
      }
    };
    return canonical as CanonicalResponse;
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
