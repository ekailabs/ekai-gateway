import { CanonicalStreamEvent } from '../registry.js';

/**
 * OpenAI streaming chunk interface
 */
export interface OpenAIStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  system_fingerprint?: string;
  choices: OpenAIStreamChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface OpenAIStreamChoice {
  index: number;
  delta: {
    role?: string;
    content?: string;
    tool_calls?: OpenAIStreamToolCall[];
    function_call?: {
      name?: string;
      arguments?: string;
    };
  };
  logprobs?: any;
  finish_reason?: string | null;
}

export interface OpenAIStreamToolCall {
  index: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}

/**
 * State tracker for assembling tool calls from streaming chunks
 */
class ToolCallAssembler {
  private toolCalls = new Map<number, {
    id: string;
    name: string;
    arguments: string;
    complete: boolean;
  }>();

  addChunk(toolCall: OpenAIStreamToolCall): void {
    const existing = this.toolCalls.get(toolCall.index);
    
    if (!existing) {
      // New tool call
      this.toolCalls.set(toolCall.index, {
        id: toolCall.id || '',
        name: toolCall.function?.name || '',
        arguments: toolCall.function?.arguments || '',
        complete: false
      });
    } else {
      // Update existing tool call
      if (toolCall.id) existing.id = toolCall.id;
      if (toolCall.function?.name) existing.name = toolCall.function.name;
      if (toolCall.function?.arguments) existing.arguments += toolCall.function.arguments;
    }
  }

  markComplete(index: number): void {
    const toolCall = this.toolCalls.get(index);
    if (toolCall) {
      toolCall.complete = true;
    }
  }

  getCompletedToolCalls(): Array<{ id: string; name: string; arguments: string }> {
    return Array.from(this.toolCalls.values())
      .filter(tc => tc.complete && tc.name && tc.id)
      .map(tc => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments
      }));
  }

  reset(): void {
    this.toolCalls.clear();
  }
}

/**
 * Convert OpenAI streaming chunks to canonical events
 * @param chunk - OpenAI stream chunk
 * @param assembler - Tool call assembler (maintains state across chunks)
 */
export function openaiChunkToCanonical(
  chunk: OpenAIStreamChunk,
  assembler: ToolCallAssembler = new ToolCallAssembler()
): CanonicalStreamEvent[] {
  const events: CanonicalStreamEvent[] = [];

  // Handle first chunk (message_start)
  if (chunk.choices?.[0]?.delta?.role) {
    events.push({
      type: 'message_start',
      data: {
        id: chunk.id,
        model: chunk.model,
        created: chunk.created
      },
      provider_raw: chunk
    });
  }

  for (const choice of chunk.choices || []) {
    const { delta, finish_reason } = choice;

    // Text content delta
    if (delta.content) {
      events.push({
        type: 'content_delta',
        data: {
          part: 'text',
          value: delta.content
        },
        provider_raw: chunk
      });
    }

    // Tool calls delta
    if (delta.tool_calls) {
      for (const toolCall of delta.tool_calls) {
        assembler.addChunk(toolCall);

        // Emit incremental tool call data
        if (toolCall.function?.arguments) {
          events.push({
            type: 'content_delta',
            data: {
              part: 'tool_call',
              value: toolCall.function.arguments,
              tool_index: toolCall.index
            },
            provider_raw: chunk
          });
        }
      }
    }

    // Function call delta (legacy)
    if (delta.function_call) {
      if (delta.function_call.arguments) {
        events.push({
          type: 'content_delta',
          data: {
            part: 'tool_call',
            value: delta.function_call.arguments,
            function_name: delta.function_call.name
          },
          provider_raw: chunk
        });
      }
    }

    // Handle finish_reason (completion)
    if (finish_reason) {
      // Mark any in-progress tool calls as complete
      if (delta.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          assembler.markComplete(toolCall.index);
        }
      }

      // Emit completed tool calls
      const completedCalls = assembler.getCompletedToolCalls();
      for (const call of completedCalls) {
        events.push({
          type: 'tool_call',
          data: {
            id: call.id,
            name: call.name,
            arguments_json: call.arguments
          },
          provider_raw: chunk
        });
      }

      // Map OpenAI finish reasons to canonical
      const canonicalReason = mapFinishReason(finish_reason);
      events.push({
        type: 'complete',
        data: {
          finish_reason: canonicalReason
        },
        provider_raw: chunk
      });
    }
  }

  // Usage information (usually in final chunk)
  if (chunk.usage) {
    events.push({
      type: 'usage',
      data: {
        prompt_tokens: chunk.usage.prompt_tokens,
        completion_tokens: chunk.usage.completion_tokens,
        input_tokens: chunk.usage.prompt_tokens,
        output_tokens: chunk.usage.completion_tokens
      },
      provider_raw: chunk
    });
  }

  return events;
}

/**
 * Map OpenAI finish reasons to canonical finish reasons
 */
function mapFinishReason(openaiReason: string): string {
  const mapping: Record<string, string> = {
    'stop': 'stop',
    'length': 'max_tokens',
    'tool_calls': 'tool_call',
    'content_filter': 'content_filter',
    'function_call': 'tool_call'
  };
  
  return mapping[openaiReason] || openaiReason;
}

/**
 * Factory for creating a stateful chunk processor
 * @returns Function that processes chunks and maintains state
 */
export function createOpenAIStreamProcessor(): (chunk: OpenAIStreamChunk) => CanonicalStreamEvent[] {
  const assembler = new ToolCallAssembler();
  
  return (chunk: OpenAIStreamChunk) => {
    return openaiChunkToCanonical(chunk, assembler);
  };
}

/**
 * Parse SSE data from OpenAI stream
 * @param sseData - Raw SSE data string
 */
export function parseOpenAISSE(sseData: string): OpenAIStreamChunk | null {
  // Handle different SSE formats
  if (sseData.startsWith('data: ')) {
    const jsonData = sseData.slice(6).trim();
    
    // Handle termination signal
    if (jsonData === '[DONE]') {
      return null;
    }
    
    try {
      return JSON.parse(jsonData) as OpenAIStreamChunk;
    } catch (error) {
      console.error('Failed to parse OpenAI SSE chunk:', error);
      return null;
    }
  }
  
  return null;
}

/**
 * Usage examples:
 * 
 * // Process single chunk
 * const events = openaiChunkToCanonical(chunk);
 * 
 * // Process stream with state management
 * const processor = createOpenAIStreamProcessor();
 * stream.on('data', (chunk) => {
 *   const events = processor(chunk);
 *   events.forEach(handleCanonicalEvent);
 * });
 * 
 * // Parse SSE format
 * const chunk = parseOpenAISSE('data: {"id":"chatcmpl-123",...}');
 * if (chunk) {
 *   const events = openaiChunkToCanonical(chunk);
 * }
 */