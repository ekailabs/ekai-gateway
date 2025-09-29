import { FormatAdapter } from '../../canonical/format-adapter.js';
import { Request as CanonicalRequest, Response as CanonicalResponse } from '../../canonical/types/index.js';
import { ChatCompletionRequest, ChatCompletionResponse } from 'shared/types/types.js';

export class OpenAIAdapter implements FormatAdapter<ChatCompletionRequest, ChatCompletionResponse, any, any> {
  
  // Request path: Client → Canonical → Provider
  encodeRequestToCanonical(clientRequest: ChatCompletionRequest): CanonicalRequest {
    const messages = clientRequest.messages.map(msg => ({ role: msg.role as any, content: msg.content }));
    return {
      schema_version: '1.0.1',
      model: clientRequest.model,
      messages: messages as any,
      stream: clientRequest.stream || false,
      generation: {
        max_tokens: clientRequest.max_tokens,
        temperature: clientRequest.temperature,
        top_p: (clientRequest as any).top_p,
        stop: (clientRequest as any).stop
      },
      provider_params: {
        openai: {
          presence_penalty: (clientRequest as any).presence_penalty,
          frequency_penalty: (clientRequest as any).frequency_penalty,
          logit_bias: (clientRequest as any).logit_bias,
          user: (clientRequest as any).user
        }
      }
    } as any as CanonicalRequest;
  }

  decodeCanonicalRequest(canonicalRequest: CanonicalRequest): any {
    // Convert canonical request to OpenAI Chat Completions API format
    return {
      model: canonicalRequest.model,
      messages: canonicalRequest.messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content
      })),
      stream: canonicalRequest.stream,
      max_tokens: canonicalRequest.generation?.max_tokens,
      temperature: canonicalRequest.generation?.temperature,
      top_p: canonicalRequest.generation?.top_p,
      stop: canonicalRequest.generation?.stop,
      presence_penalty: canonicalRequest.provider_params?.openai?.presence_penalty,
      frequency_penalty: canonicalRequest.provider_params?.openai?.frequency_penalty,
      logit_bias: canonicalRequest.provider_params?.openai?.logit_bias,
      user: canonicalRequest.provider_params?.openai?.user
    };
  }

  // Response path: Provider → Canonical → Client
  encodeResponseToCanonical(providerResponse: any): CanonicalResponse {
    // This method will be implemented when we move provider logic here
    // For now, return the provider response as-is
    return providerResponse as CanonicalResponse;
  }

  decodeResponseToClient(canonicalResponse: CanonicalResponse): ChatCompletionResponse {
    const resp: any = canonicalResponse as any;
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