import { 
  CanonicalRequest, 
  CanonicalResponse, 
  CanonicalStreamChunk,
  CanonicalContent,
  CanonicalMessage,
  FormatAdapter
} from 'shared/types/canonical.js';
import { ChatCompletionRequest, ChatCompletionResponse } from 'shared/types/types.js';

export class OpenAIAdapter implements FormatAdapter<ChatCompletionRequest, ChatCompletionResponse> {
  
  toCanonical(input: ChatCompletionRequest): CanonicalRequest {
    const messages: CanonicalMessage[] = input.messages.map(msg => ({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: [{
        type: 'text',
        text: msg.content
      }] as CanonicalContent[]
    }));

    return {
      model: input.model,
      messages,
      maxTokens: input.max_tokens,
      temperature: input.temperature,
      topP: input.top_p,
      stopSequences: Array.isArray(input.stop) ? input.stop : input.stop ? [input.stop] : undefined,
      stream: input.stream || false,
      
      // OpenAI-specific features in metadata
      metadata: {
        presencePenalty: input.presence_penalty,
        frequencyPenalty: input.frequency_penalty,
        logitBias: input.logit_bias,
        userId: input.user,
        // Preserve any other fields
        ...Object.fromEntries(
          Object.entries(input).filter(([key]) => 
            !['model', 'messages', 'max_tokens', 'temperature', 'top_p', 'stop', 'stream',
              'presence_penalty', 'frequency_penalty', 'logit_bias', 'user'].includes(key)
          )
        )
      }
    };
  }

  fromCanonical(response: CanonicalResponse): ChatCompletionResponse {
    // Extract text content from canonical content array
    const textContent = response.message.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');

    return {
      id: response.id,
      object: 'chat.completion',
      created: response.created,
      model: response.model,
      choices: [{
        index: 0,
        message: {
          role: response.message.role,
          content: textContent
        },
        finish_reason: this.mapFinishReason(response.finishReason)
      }],
      usage: {
        prompt_tokens: response.usage.inputTokens,
        completion_tokens: response.usage.outputTokens,
        total_tokens: response.usage.totalTokens
      }
    };
  }

  fromCanonicalStream(chunk: CanonicalStreamChunk): string {
    const textDelta = chunk.delta.content
      ?.filter(c => c.type === 'text')
      ?.map(c => c.text)
      ?.join('') || '';

    const openaiChunk = {
      id: chunk.id,
      object: 'chat.completion.chunk',
      created: chunk.created,
      model: chunk.model,
      choices: [{
        index: 0,
        delta: {
          role: chunk.delta.role,
          content: textDelta || undefined
        },
        finish_reason: chunk.finishReason ? this.mapFinishReason(chunk.finishReason) : null
      }]
    };

    // Add usage in final chunk
    if (chunk.usage && chunk.finishReason) {
      (openaiChunk as any).usage = {
        prompt_tokens: chunk.usage.inputTokens || 0,
        completion_tokens: chunk.usage.outputTokens || 0,
        total_tokens: (chunk.usage.inputTokens || 0) + (chunk.usage.outputTokens || 0)
      };
    }

    return `data: ${JSON.stringify(openaiChunk)}\n\n`;
  }

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