import { FormatAdapter } from '../../canonical/format-adapter.js';
import { Request as CanonicalRequest, Response as CanonicalResponse } from '../../canonical/types/index.js';
import { ChatCompletionRequest, ChatCompletionResponse } from 'shared/types/types.js';

export class OpenAIAdapter implements FormatAdapter<ChatCompletionRequest, ChatCompletionResponse> {
  
  toCanonical(input: ChatCompletionRequest): CanonicalRequest {
    const messages = input.messages.map(msg => ({ role: msg.role as any, content: msg.content }));
    return {
      schema_version: '1.0.1',
      model: input.model,
      messages: messages as any,
      stream: input.stream || false,
      generation: {
        max_tokens: input.max_tokens,
        temperature: input.temperature,
        top_p: (input as any).top_p,
        stop: (input as any).stop
      },
      provider_params: {
        openai: {
          presence_penalty: (input as any).presence_penalty,
          frequency_penalty: (input as any).frequency_penalty,
          logit_bias: (input as any).logit_bias,
          user: (input as any).user
        }
      }
    } as any as CanonicalRequest;
  }

  fromCanonical(response: CanonicalResponse): ChatCompletionResponse {
    const resp: any = response as any;
    const choice = resp.choices?.[0];
    const text = choice?.message?.content?.map?.((p: any) => p?.type === 'text' ? (p.text || '') : '').join('') || '';
    return {
      id: resp.id,
      object: 'chat.completion',
      created: resp.created,
      model: resp.model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: (choice?.finish_reason as any) || 'stop'
      }],
      usage: {
        prompt_tokens: resp.usage?.prompt_tokens ?? resp.usage?.input_tokens,
        completion_tokens: resp.usage?.completion_tokens ?? resp.usage?.output_tokens,
        total_tokens: resp.usage?.total_tokens
      }
    } as ChatCompletionResponse;
  }

  // Streaming handled upstream via provider or passthrough

  private mapFinishReason(reason: string): string {
    switch (reason) {
      case 'stop': return 'stop';
      case 'length': return 'length';
      case 'tool_calls': return 'tool_calls';
      case 'error': return 'stop';
      default: return 'stop';
    }
  }
}