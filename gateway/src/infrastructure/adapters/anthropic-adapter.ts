import { FormatAdapter } from '../../canonical/format-adapter.js';
import { Request as CanonicalRequest, Response as CanonicalResponse } from '../../canonical/types/index.js';
import { AnthropicMessagesRequest, AnthropicMessagesResponse } from 'shared/types/types.js';

export class AnthropicAdapter implements FormatAdapter<AnthropicMessagesRequest, AnthropicMessagesResponse> {
  
  toCanonical(input: AnthropicMessagesRequest): CanonicalRequest {
    const messages: any[] = [];

    // Handle system message
    if (input.system) {
      const systemText = this.normalizeText(input.system as any);
      messages.push({ role: 'system', content: systemText });
    }

    // Handle regular messages
    input.messages.forEach(msg => {
      messages.push({ role: msg.role as any, content: this.normalizeText(msg.content as any) });
    });

    return {
      schema_version: '1.0.1',
      model: input.model,
      messages: messages as any,
      stream: input.stream || false,
      system: undefined,
      generation: { max_tokens: input.max_tokens, temperature: input.temperature },
      provider_params: { anthropic: { ...(input as any) } }
    } as any as CanonicalRequest;
  }

  fromCanonical(response: CanonicalResponse): AnthropicMessagesResponse | string {
    const resp: any = response as any;
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