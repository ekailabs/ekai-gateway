import { CanonicalStreamEvent } from '../registry.js';

/**
 * Anthropic streaming event interfaces
 */
export type AnthropicStreamEvent = 
  | MessageStartEvent
  | ContentBlockStartEvent  
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageDeltaEvent
  | MessageStopEvent
  | PingEvent;

export interface MessageStartEvent {
  type: 'message_start';
  message: {
    id: string;
    type: 'message';
    role: 'assistant';
    content: any[];
    model: string;
    stop_reason: null;
    stop_sequence: null;
    usage: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}

export interface ContentBlockStartEvent {
  type: 'content_block_start';
  index: number;
  content_block: {
    type: 'text' | 'tool_use';
    text?: string;
    id?: string;
    name?: string;
    input?: any;
  };
}

export interface ContentBlockDeltaEvent {
  type: 'content_block_delta';
  index: number;
  delta: {
    type: 'text_delta' | 'input_json_delta' | 'citations_delta';
    text?: string;
    partial_json?: string;
    citations?: any[];
  };
}

export interface ContentBlockStopEvent {
  type: 'content_block_stop';
  index: number;
}

export interface MessageDeltaEvent {
  type: 'message_delta';
  delta: {
    stop_reason?: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
    stop_sequence?: string;
  };
  usage: {
    output_tokens: number;
  };
}

export interface MessageStopEvent {
  type: 'message_stop';
}

export interface PingEvent {
  type: 'ping';
}

/**
 * State tracker for assembling tool calls from streaming events
 */
class AnthropicToolAssembler {
  private toolCalls = new Map<number, {
    id: string;
    name: string;
    input: string;
    complete: boolean;
  }>();

  startToolCall(index: number, id: string, name: string): void {
    this.toolCalls.set(index, {
      id,
      name,
      input: '',
      complete: false
    });
  }

  addToolInput(index: number, partialJson: string): void {
    const toolCall = this.toolCalls.get(index);
    if (toolCall) {
      toolCall.input += partialJson;
    }
  }

  completeToolCall(index: number): void {
    const toolCall = this.toolCalls.get(index);
    if (toolCall) {
      toolCall.complete = true;
    }
  }

  getCompletedToolCalls(): Array<{ id: string; name: string; input: string }> {
    return Array.from(this.toolCalls.values())
      .filter(tc => tc.complete)
      .map(tc => ({
        id: tc.id,
        name: tc.name,
        input: tc.input
      }));
  }

  reset(): void {
    this.toolCalls.clear();
  }
}

/**
 * Convert Anthropic streaming events to canonical events
 * @param event - Anthropic stream event
 * @param assembler - Tool call assembler (maintains state across events)
 */
export function anthropicEventToCanonical(
  event: AnthropicStreamEvent,
  assembler: AnthropicToolAssembler = new AnthropicToolAssembler()
): CanonicalStreamEvent[] {
  const events: CanonicalStreamEvent[] = [];

  switch (event.type) {
    case 'message_start':
      events.push({
        type: 'message_start',
        data: {
          id: event.message.id,
          model: event.message.model,
          input_tokens: event.message.usage.input_tokens
        },
        provider_raw: event
      });
      break;

    case 'content_block_start':
      if (event.content_block.type === 'text') {
        // Text content starting - no specific event needed
      } else if (event.content_block.type === 'tool_use') {
        // Tool call starting
        assembler.startToolCall(
          event.index,
          event.content_block.id || '',
          event.content_block.name || ''
        );
      }
      break;

    case 'content_block_delta':
      if (event.delta.type === 'text_delta' && event.delta.text) {
        events.push({
          type: 'content_delta',
          data: {
            part: 'text',
            value: event.delta.text
          },
          provider_raw: event
        });
      } else if (event.delta.type === 'input_json_delta' && event.delta.partial_json) {
        // Tool call arguments delta
        assembler.addToolInput(event.index, event.delta.partial_json);
        events.push({
          type: 'content_delta',
          data: {
            part: 'tool_call',
            value: event.delta.partial_json,
            tool_index: event.index
          },
          provider_raw: event
        });
      } else if (event.delta.type === 'citations_delta' && event.delta.citations) {
        events.push({
          type: 'content_delta',
          data: {
            part: 'citations',
            value: JSON.stringify(event.delta.citations)
          },
          provider_raw: event
        });
      }
      break;

    case 'content_block_stop':
      // Mark tool call as complete if it was a tool_use block
      assembler.completeToolCall(event.index);
      break;

    case 'message_delta':
      if (event.delta.stop_reason) {
        // Emit any completed tool calls
        const completedCalls = assembler.getCompletedToolCalls();
        for (const call of completedCalls) {
          events.push({
            type: 'tool_call',
            data: {
              id: call.id,
              name: call.name,
              arguments_json: call.input
            },
            provider_raw: event
          });
        }

        // Map Anthropic finish reasons to canonical
        const canonicalReason = mapFinishReason(event.delta.stop_reason);
        events.push({
          type: 'complete',
          data: {
            finish_reason: canonicalReason
          },
          provider_raw: event
        });
      }

      // Usage information
      if (event.usage?.output_tokens) {
        events.push({
          type: 'usage',
          data: {
            output_tokens: event.usage.output_tokens,
            completion_tokens: event.usage.output_tokens // For OpenAI compatibility
          },
          provider_raw: event
        });
      }
      break;

    case 'message_stop':
      // Final event - stream complete
      break;

    case 'ping':
      // Keep-alive event - no action needed
      break;
  }

  return events;
}

/**
 * Map Anthropic finish reasons to canonical finish reasons
 */
function mapFinishReason(anthropicReason: string): string {
  const mapping: Record<string, string> = {
    'end_turn': 'stop',
    'max_tokens': 'max_tokens',
    'stop_sequence': 'stop_sequence',
    'tool_use': 'tool_call'
  };
  
  return mapping[anthropicReason] || anthropicReason;
}

/**
 * Factory for creating a stateful event processor
 * @returns Function that processes events and maintains state
 */
export function createAnthropicStreamProcessor(): (event: AnthropicStreamEvent) => CanonicalStreamEvent[] {
  const assembler = new AnthropicToolAssembler();
  
  return (event: AnthropicStreamEvent) => {
    return anthropicEventToCanonical(event, assembler);
  };
}

/**
 * Parse SSE data from Anthropic stream
 * @param sseData - Raw SSE data string
 */
export function parseAnthropicSSE(sseData: string): AnthropicStreamEvent | null {
  // Handle different SSE formats
  if (sseData.startsWith('data: ')) {
    const jsonData = sseData.slice(6).trim();
    
    // Handle termination signal
    if (jsonData === '[DONE]' || jsonData === '') {
      return null;
    }
    
    try {
      return JSON.parse(jsonData) as AnthropicStreamEvent;
    } catch (error) {
      console.error('Failed to parse Anthropic SSE event:', error);
      return null;
    }
  }
  
  // Handle event-type lines
  if (sseData.startsWith('event: ')) {
    // Some events might not have data - return ping
    return { type: 'ping' };
  }
  
  return null;
}

/**
 * Usage examples:
 * 
 * // Process single event
 * const events = anthropicEventToCanonical(anthropicEvent);
 * 
 * // Process stream with state management
 * const processor = createAnthropicStreamProcessor();
 * stream.on('data', (event) => {
 *   const events = processor(event);
 *   events.forEach(handleCanonicalEvent);
 * });
 * 
 * // Parse SSE format
 * const event = parseAnthropicSSE('data: {"type":"content_block_delta",...}');
 * if (event) {
 *   const events = anthropicEventToCanonical(event);
 * }
 */