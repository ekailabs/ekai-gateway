import { FormatAdapter } from '../../canonical/format-adapter.js';
import { Request as CanonicalRequest, Response as CanonicalResponse } from '../../canonical/types/index.js';
import { AnthropicMessagesRequest, AnthropicMessagesResponse } from 'shared/types/types.js';

export class AnthropicAdapter implements FormatAdapter<AnthropicMessagesRequest, AnthropicMessagesResponse, any, any> {
  
  // Request path: Client → Canonical → Provider
  encodeRequestToCanonical(clientRequest: AnthropicMessagesRequest): CanonicalRequest {
    const messages: any[] = [];

    // Handle system message
    if (clientRequest.system) {
      const systemText = this.normalizeText(clientRequest.system as any);
      messages.push({ role: 'system', content: systemText });
    }

    // Handle regular messages
    clientRequest.messages.forEach(msg => {
      messages.push({ role: msg.role as any, content: this.normalizeText(msg.content as any) });
    });

    return {
      schema_version: '1.0.1',
      model: clientRequest.model,
      messages: messages as any,
      stream: clientRequest.stream || false,
      system: undefined,
      generation: { max_tokens: clientRequest.max_tokens, temperature: clientRequest.temperature },
      provider_params: { anthropic: { ...(clientRequest as any) } }
    } as any as CanonicalRequest;
  }

  decodeCanonicalRequest(canonicalRequest: CanonicalRequest): any {
    // Convert canonical request to Anthropic Messages API format
    const messages: any[] = [];
    let system: string | undefined;

    for (const message of canonicalRequest.messages || []) {
      if ((message as any).role === 'system') {
        system = this.normalizeText((message as any).content);
      } else {
        messages.push({
          role: message.role,
          content: this.normalizeText((message as any).content)
        });
      }
    }

    return {
      model: canonicalRequest.model,
      messages,
      system,
      stream: canonicalRequest.stream,
      max_tokens: canonicalRequest.generation?.max_tokens,
      temperature: canonicalRequest.generation?.temperature,
      ...canonicalRequest.provider_params?.anthropic
    };
  }

  // Response path: Provider → Canonical → Client
  encodeResponseToCanonical(providerResponse: any): CanonicalResponse {
    // This method will be implemented when we move provider logic here
    // For now, return the provider response as-is
    return providerResponse as CanonicalResponse;
  }

  decodeResponseToClient(canonicalResponse: CanonicalResponse): AnthropicMessagesResponse | string {
    const resp: any = canonicalResponse as any;
    const choice = resp.choices?.[0];
    const text = choice?.message?.content?.map?.((p: any) => p?.type === 'text' ? (p.text || '') : '').join('') || '';
    return {
      id: resp.id,
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text }],
      model: resp.model,
      stop_reason: (resp.stop_reason as any) || 'end_turn',
      usage: {
        input_tokens: resp.usage?.input_tokens ?? resp.usage?.prompt_tokens,
        output_tokens: resp.usage?.output_tokens ?? resp.usage?.completion_tokens
      }
    } as AnthropicMessagesResponse;
  }

  private normalizeText(content: string | Array<{ type: string; text: string }>): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.filter(i => i?.type === 'text').map(i => i.text).join('');
    return String(content ?? '');
  }

  private mapFinishReason(reason: string): 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' {
    switch (reason) {
      case 'stop': return 'end_turn';
      case 'length': return 'max_tokens';
      case 'tool_calls': return 'tool_use';
      default: return 'end_turn';
    }
  }
}