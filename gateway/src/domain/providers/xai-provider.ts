import { BaseProvider } from './base-provider.js';
import { Request as CanonicalRequest, Response as CanonicalResponse } from '../../canonical/types/index.js';

interface GrokRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string; }>;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  stop?: string | string[];
}

interface GrokResponse {
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

export class XAIProvider extends BaseProvider {
  readonly name = 'xAI';
  protected readonly baseUrl = 'https://api.x.ai/v1';
  protected readonly apiKey = process.env.XAI_API_KEY;

  protected transformRequest(request: CanonicalRequest): GrokRequest {
    const anyReq = request as any;
    const messages = (anyReq.messages || []).map((msg: any) => ({
      role: msg.role,
      content: Array.isArray(msg.content)
        ? (msg.content as any[]).filter(p => p?.type === 'text').map(p => p.text || '').join('')
        : String(msg.content ?? '')
    }));

    const gen = anyReq.generation || {};
    return {
      model: anyReq.model,
      messages,
      max_tokens: gen.max_tokens,
      temperature: gen.temperature,
      stream: Boolean(anyReq.stream),
      stop: gen.stop ?? gen.stop_sequences
    } as GrokRequest;
  }

  protected transformResponse(response: GrokResponse): CanonicalResponse {
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

  private mapFinishReason(reason: string): 'stop' | 'length' | 'tool_calls' | 'error' {
    switch (reason) {
      case 'stop': return 'stop';
      case 'length': return 'length';
      default: return 'stop';
    }
  }
}
