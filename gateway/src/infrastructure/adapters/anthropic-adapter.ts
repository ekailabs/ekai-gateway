import { 
  CanonicalRequest, 
  CanonicalResponse, 
  CanonicalStreamChunk,
  CanonicalContent,
  CanonicalMessage,
  FormatAdapter
} from 'shared/types/canonical.js';
import { AnthropicMessagesRequest, AnthropicMessagesResponse } from 'shared/types/types.js';

export class AnthropicAdapter implements FormatAdapter<AnthropicMessagesRequest, AnthropicMessagesResponse> {
  
  toCanonical(input: AnthropicMessagesRequest): CanonicalRequest {
    const messages: CanonicalMessage[] = [];

    // Handle system message
    if (input.system) {
      const systemContent = this.normalizeContent(input.system);
      messages.push({
        role: 'system',
        content: systemContent
      });
    }

    // Handle regular messages
    input.messages.forEach(msg => {
      messages.push({
        role: msg.role,
        content: this.normalizeContent(msg.content)
      });
    });

    return {
      model: input.model,
      messages,
      maxTokens: input.max_tokens,
      temperature: input.temperature,
      stream: input.stream || false,
      
      // Anthropic-specific features in metadata
      metadata: {
        promptCaching: input.metadata?.promptCaching,
        // Preserve any other fields
        ...Object.fromEntries(
          Object.entries(input).filter(([key]) => 
            !['model', 'messages', 'max_tokens', 'system', 'temperature', 'stream'].includes(key)
          )
        )
      }
    };
  }

  fromCanonical(response: CanonicalResponse): AnthropicMessagesResponse {
    // Convert canonical content back to Anthropic format
    const content = response.message.content.map(c => {
      if (c.type === 'text') {
        return { type: 'text', text: c.text || '' };
      }
      // Handle other content types as needed
      return { type: 'text', text: '' };
    });

    return {
      id: response.id,
      type: 'message',
      role: 'assistant',
      content: content as Array<{ type: "text"; text: string; }>,
      model: response.model,
      stop_reason: this.mapFinishReason(response.finishReason),
      usage: {
        input_tokens: response.usage.inputTokens,
        output_tokens: response.usage.outputTokens
      }
    };
  }

  fromCanonicalStream(chunk: CanonicalStreamChunk): string {
    // Convert to Anthropic streaming format
    if (chunk.delta.content && chunk.delta.content.length > 0) {
      const textContent = chunk.delta.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('');

      if (textContent) {
        const anthropicChunk = {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'text_delta',
            text: textContent
          }
        };
        return `data: ${JSON.stringify(anthropicChunk)}\n\n`;
      }
    }

    // Handle final chunk with usage
    if (chunk.finishReason && chunk.usage) {
      const finalChunk = {
        type: 'message_delta',
        delta: {},
        usage: {
          output_tokens: chunk.usage.outputTokens || 0
        }
      };
      return `data: ${JSON.stringify(finalChunk)}\n\n`;
    }

    return '';
  }

  private normalizeContent(content: string | Array<{ type: string; text: string }>): CanonicalContent[] {
    if (typeof content === 'string') {
      return [{
        type: 'text',
        text: content
      }];
    }
    
    if (Array.isArray(content)) {
      return content.map(item => ({
        type: 'text',
        text: item.text
      }));
    }
    
    return [{ type: 'text', text: String(content) }];
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