// Minimal adapter for OpenAI Responses API request/response shapes
// Converts between Responses API and canonical schema format used internally.
import { FormatAdapter } from '../../canonical/format-adapter.js';
import { Request as CanonicalRequest, Response as CanonicalResponse } from '../../canonical/types/index.js';

type ResponsesInput =
  | string
  | Array<{ role?: 'system' | 'user' | 'assistant'; content: Array<{ type: string; text?: string }> }>;

interface OpenAIResponsesRequest {
  model: string;
  input: ResponsesInput;
  stream?: boolean;
  temperature?: number;
  max_output_tokens?: number;
  [key: string]: any;
}

interface OpenAIResponsesResponse {
  id: string;
  object: 'response';
  created: number;
  model: string;
  output_text?: string;
  // Fallback structures (not exhaustively typed)
  output?: Array<{ content: Array<{ type: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
}

export class OpenAIResponsesAdapter implements FormatAdapter<OpenAIResponsesRequest, OpenAIResponsesResponse, any, any> {
  // Request path: Client → Canonical → Provider
  encodeRequestToCanonical(clientRequest: OpenAIResponsesRequest): CanonicalRequest {
    const instructions = (clientRequest as any).instructions;
    const systemPrompt = instructions ? (typeof instructions === 'string' ? instructions : String(instructions)) : undefined;

    // Map OpenAI Responses input to canonical messages
    const messages: any[] = [];
    const inputData = (clientRequest as any).input;
    
    if (typeof inputData === 'string') {
      messages.push({ role: 'user', content: inputData });
    } else if (Array.isArray(inputData)) {
      for (const item of inputData) {
        if (item?.type === 'message') {
          const role = item.role || 'user';
          // Map content array preserving all types (input_text, output_text, etc.)
          const content = Array.isArray(item.content) 
            ? item.content.map((c: any) => ({
                type: c.type === 'input_text' ? 'text' : c.type, // Normalize input_text to text
                text: c.text || ''
              }))
            : [{ type: 'text', text: '' }];
          messages.push({ role, content });
        } else if (item?.type === 'reasoning') {
          // Map reasoning to a special message type that can be reconstructed
      messages.push({
            role: 'system', // Use system role to distinguish reasoning
            content: [{
              type: 'reasoning',
              summary: item.summary,
              content: item.content,
              encrypted_content: item.encrypted_content
            }]
          });
        }
      }
    }

    const canonical: any = {
      schema_version: '1.0.1',
      model: (clientRequest as any).model,
      messages: (messages.length ? messages : [{ role: 'user', content: '' }]),
      system: systemPrompt,
      stream: Boolean((clientRequest as any).stream),
      tools: (clientRequest as any).tools,
      tool_choice: (clientRequest as any).tool_choice,
      parallel_tool_calls: (clientRequest as any).parallel_tool_calls,
      response_format: (clientRequest as any).response_format,
      include: (clientRequest as any).include,
      store: (clientRequest as any).store,
      reasoning_effort: (clientRequest as any).reasoning_effort ?? (clientRequest as any).reasoning?.effort,
      modalities: (clientRequest as any).modalities,
      audio: (clientRequest as any).audio,
      thinking: (clientRequest as any).reasoning ? {
        budget: (clientRequest as any).reasoning.budget,
        summary: (clientRequest as any).reasoning.summary,
        content: (clientRequest as any).reasoning.content,
        encrypted_content: (clientRequest as any).reasoning.encrypted_content
      } : undefined,
      generation: {
        max_tokens: (clientRequest as any).max_output_tokens ?? (clientRequest as any).max_tokens,
        temperature: (clientRequest as any).temperature,
        top_p: (clientRequest as any).top_p,
        stop: (clientRequest as any).stop,
        stop_sequences: (clientRequest as any).stop_sequences,
        seed: (clientRequest as any).seed
      },
      provider_params: { openai: { use_responses_api: true, prompt_cache_key: (clientRequest as any).prompt_cache_key } }
    };

    return canonical as CanonicalRequest;
  }

  decodeCanonicalRequest(canonicalRequest: CanonicalRequest): any {
    // Convert canonical request to OpenAI Responses API format
    const messages = canonicalRequest.messages || [];
    const input: any[] = [];
    
    for (const message of messages) {
      if ((message as any).role === 'system') {
        // Handle reasoning/system messages
        const content = Array.isArray(message.content) ? message.content[0] : message.content;
        if ((content as any)?.type === 'reasoning') {
          input.push({
            type: 'reasoning',
            summary: (content as any).summary,
            content: (content as any).content,
            encrypted_content: (content as any).encrypted_content
          });
        }
      } else {
        // Handle regular messages
        input.push({
          type: 'message',
          role: message.role,
          content: Array.isArray(message.content) 
            ? message.content.map((c: any) => ({
                type: c.type === 'text' ? 'input_text' : c.type,
                text: c.text || ''
              }))
            : [{ type: 'input_text', text: String(message.content || '') }]
        });
      }
    }

    return {
      model: canonicalRequest.model,
      input: input.length > 0 ? input : [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: '' }] }],
      stream: canonicalRequest.stream,
      temperature: canonicalRequest.generation?.temperature,
      max_output_tokens: canonicalRequest.generation?.max_tokens,
      top_p: canonicalRequest.generation?.top_p,
      stop: canonicalRequest.generation?.stop,
      stop_sequences: canonicalRequest.generation?.stop_sequences,
      seed: canonicalRequest.generation?.seed,
      tools: canonicalRequest.tools,
      tool_choice: canonicalRequest.tool_choice,
      parallel_tool_calls: canonicalRequest.parallel_tool_calls,
      response_format: canonicalRequest.response_format,
      include: canonicalRequest.include,
      store: canonicalRequest.store,
      reasoning: canonicalRequest.thinking ? {
        budget: canonicalRequest.thinking.budget,
        summary: canonicalRequest.thinking.summary,
        content: canonicalRequest.thinking.content,
        encrypted_content: canonicalRequest.thinking.encrypted_content,
        effort: canonicalRequest.reasoning_effort
      } : undefined,
      modalities: canonicalRequest.modalities,
      audio: canonicalRequest.audio,
      prompt_cache_key: canonicalRequest.provider_params?.openai?.prompt_cache_key
    };
  }

  // Response path: Provider → Canonical → Client
  encodeResponseToCanonical(providerResponse: any): CanonicalResponse {
    // This method will be implemented when we move provider logic here
    // For now, return the provider response as-is
    return providerResponse as CanonicalResponse;
  }

  decodeResponseToClient(canonicalResponse: CanonicalResponse): OpenAIResponsesResponse {
    const firstChoice: any = (canonicalResponse as any).choices?.[0] || {};
    const parts: any[] = firstChoice?.message?.content || [];
    const text = parts
      .filter(p => p?.type === 'text')
      .map(p => p.text || '')
      .join('');
    return {
      id: (canonicalResponse as any).id,
      object: 'response',
      created: (canonicalResponse as any).created,
      model: (canonicalResponse as any).model,
      output_text: text,
      output: [{ content: parts.map(p => p?.type === 'text' ? { type: 'text', text: p.text || '' } : { type: 'text', text: '' }) }],
      usage: {
        input_tokens: (canonicalResponse as any).usage?.input_tokens ?? (canonicalResponse as any).usage?.prompt_tokens,
        output_tokens: (canonicalResponse as any).usage?.output_tokens ?? (canonicalResponse as any).usage?.completion_tokens,
        total_tokens: (canonicalResponse as any).usage?.total_tokens
      }
    } as OpenAIResponsesResponse;
  }

  // Streaming response path: Provider → Canonical → Client
  encodeStreamToCanonical?(providerChunk: any): any {
    // This method will be implemented when we move provider logic here
    // For now, return the provider chunk as-is
    return providerChunk;
  }

  decodeStreamToClient?(canonicalChunk: any): string {
    // Convert streaming chunk to OpenAI Responses SSE format
    const lines: string[] = [];
    
    // Handle canonical streaming schema (stream_type: 'canonical')
    if (canonicalChunk.stream_type === 'canonical' && canonicalChunk.event) {
      const eventType = canonicalChunk.event.type;
      
      switch (eventType) {
        case 'response_created':
          lines.push('event: response.created');
          lines.push(`data: ${JSON.stringify({
            type: 'response.created',
            response: canonicalChunk.event.response || {
              id: canonicalChunk.event.id || `resp_${Date.now()}`,
              object: 'response',
              created_at: canonicalChunk.event.created || Math.floor(Date.now() / 1000),
              status: 'in_progress'
            }
          })}`);
          break;

        case 'content_delta':
          if (canonicalChunk.event.part === 'text') {
            lines.push('event: response.output_text.delta');
            lines.push(`data: ${JSON.stringify({
              type: 'response.output_text.delta',
              delta: canonicalChunk.event.value || canonicalChunk.event.delta
            })}`);
          }
          break;

        case 'output_text_done':
          lines.push('event: response.output_text.done');
          lines.push(`data: ${JSON.stringify({
            type: 'response.output_text.done',
            text: canonicalChunk.event.text,
            annotations: canonicalChunk.event.annotations,
            logprobs: canonicalChunk.event.logprobs
          })}`);
          break;

        case 'refusal_delta':
          lines.push('event: response.refusal.delta');
          lines.push(`data: ${JSON.stringify({
            type: 'response.refusal.delta',
            delta: canonicalChunk.event.delta,
            refusal: canonicalChunk.event.refusal
          })}`);
          break;

        case 'refusal_done':
          lines.push('event: response.refusal.done');
          lines.push(`data: ${JSON.stringify({
            type: 'response.refusal.done',
            refusal: canonicalChunk.event.refusal
          })}`);
          break;

        case 'function_call_arguments_delta':
          lines.push('event: response.function_call.arguments.delta');
          lines.push(`data: ${JSON.stringify({
            type: 'response.function_call.arguments.delta',
            call_id: canonicalChunk.event.call_id,
            delta: canonicalChunk.event.delta,
            arguments: canonicalChunk.event.arguments
          })}`);
          break;

        case 'function_call_arguments_done':
          lines.push('event: response.function_call.arguments.done');
          lines.push(`data: ${JSON.stringify({
            type: 'response.function_call.arguments.done',
            call_id: canonicalChunk.event.call_id,
            arguments: canonicalChunk.event.arguments
          })}`);
          break;

        case 'function_call_output':
          lines.push('event: response.function_call_output');
          lines.push(`data: ${JSON.stringify({
            type: 'response.function_call_output',
            call_id: canonicalChunk.event.call_id,
            output: canonicalChunk.event.output
          })}`);
          break;

        case 'reasoning_summary_text_delta':
          lines.push('event: response.reasoning_summary_text.delta');
          lines.push(`data: ${JSON.stringify({
            type: 'response.reasoning_summary_text.delta',
            delta: canonicalChunk.event.delta,
            summary: canonicalChunk.event.summary
          })}`);
          break;

        case 'reasoning_summary_text_done':
          lines.push('event: response.reasoning_summary_text.done');
          lines.push(`data: ${JSON.stringify({
            type: 'response.reasoning_summary_text.done',
            summary: canonicalChunk.event.summary
          })}`);
          break;

        case 'content_part_start':
          lines.push('event: response.content_part.added');
          lines.push(`data: ${JSON.stringify({
            type: 'response.content_part.added',
            index: canonicalChunk.event.index,
            content_block: canonicalChunk.event.content_block
          })}`);
          break;

        case 'content_part_done':
          lines.push('event: response.content_part.done');
          lines.push(`data: ${JSON.stringify({
            type: 'response.content_part.done',
            index: canonicalChunk.event.index
          })}`);
          break;

        case 'output_item_added':
          lines.push('event: response.output_item.added');
          lines.push(`data: ${JSON.stringify({
            type: 'response.output_item.added',
            output_index: canonicalChunk.event.output_index || 0,
            item: canonicalChunk.event.item,
            sequence_number: canonicalChunk.event.sequence_number
          })}`);
          break;

        case 'output_item_done':
          lines.push('event: response.output_item.done');
          lines.push(`data: ${JSON.stringify({
            type: 'response.output_item.done',
            output_index: canonicalChunk.event.output_index || 0,
            item: canonicalChunk.event.item
          })}`);
          break;

        case 'function_call_start':
          lines.push('event: response.function_call');
          lines.push(`data: ${JSON.stringify({
            type: 'response.function_call',
            name: canonicalChunk.event.name,
            arguments_json: canonicalChunk.event.arguments_json,
            call_id: canonicalChunk.event.id || canonicalChunk.event.call_id
          })}`);
          break;

        case 'tool_call_start':
          lines.push('event: response.tool_call');
          lines.push(`data: ${JSON.stringify({
            type: 'response.tool_call',
            name: canonicalChunk.event.name,
            arguments_json: canonicalChunk.event.arguments_json,
            call_id: canonicalChunk.event.id || canonicalChunk.event.call_id
          })}`);
          break;

        case 'usage':
          lines.push('event: response.usage');
          lines.push(`data: ${JSON.stringify({
            type: 'response.usage',
            usage: canonicalChunk.event.usage || {
              input_tokens: canonicalChunk.event.input_tokens,
              output_tokens: canonicalChunk.event.output_tokens,
              reasoning_tokens: canonicalChunk.event.reasoning_tokens,
              total_tokens: (canonicalChunk.event.input_tokens || 0) + (canonicalChunk.event.output_tokens || 0)
            }
          })}`);
          break;

        case 'message_delta':
          lines.push('event: message.delta');
          lines.push(`data: ${JSON.stringify({
            type: 'message.delta',
            delta: canonicalChunk.event.delta
          })}`);
          break;

        case 'message_done':
          lines.push('event: message.done');
          lines.push(`data: ${JSON.stringify({
            type: 'message.done'
          })}`);
          break;

        case 'response_completed':
          lines.push('event: response.completed');
          lines.push(`data: ${JSON.stringify({
            type: 'response.completed',
            response: canonicalChunk.event.response || {
              status: 'completed',
              finish_reason: canonicalChunk.event.finish_reason
            }
          })}`);
          break;

        case 'file_search_start':
          lines.push('event: response.file_search_call.in_progress');
          lines.push(`data: ${JSON.stringify({
            type: 'response.file_search_call.in_progress',
            call_id: canonicalChunk.event.call_id,
            tool_call_id: canonicalChunk.event.tool_call_id,
            file_search: canonicalChunk.event.file_search
          })}`);
          break;

        case 'file_search_progress':
          lines.push('event: response.file_search_call.searching');
          lines.push(`data: ${JSON.stringify({
            type: 'response.file_search_call.searching',
            call_id: canonicalChunk.event.call_id,
            tool_call_id: canonicalChunk.event.tool_call_id,
            file_search: canonicalChunk.event.file_search
          })}`);
          break;

        case 'file_search_done':
          lines.push('event: response.file_search_call.completed');
          lines.push(`data: ${JSON.stringify({
            type: 'response.file_search_call.completed',
            call_id: canonicalChunk.event.call_id,
            tool_call_id: canonicalChunk.event.tool_call_id,
            file_search: canonicalChunk.event.file_search
          })}`);
          break;

        case 'error':
          lines.push('event: error');
          lines.push(`data: ${JSON.stringify({
            type: 'error',
            error: {
              code: canonicalChunk.event.code,
              message: canonicalChunk.event.message
            }
          })}`);
          break;
      }
    }

    // Handle OpenAI streaming format (stream_type: 'openai')
    if (canonicalChunk.stream_type === 'openai' && canonicalChunk.choices) {
      for (const choice of canonicalChunk.choices) {
        if (choice.delta?.function_call) {
          const funcCall = choice.delta.function_call;
          if (funcCall.name) {
            lines.push('event: response.function_call');
            lines.push(`data: ${JSON.stringify({
              type: 'response.function_call',
              name: funcCall.name,
              call_id: choice.delta.tool_calls?.[0]?.id || `call_${Date.now()}`
            })}`);
          }
          if (funcCall.arguments) {
            lines.push('event: response.function_call.arguments.delta');
            lines.push(`data: ${JSON.stringify({
              type: 'response.function_call.arguments.delta',
              call_id: choice.delta.tool_calls?.[0]?.id || `call_${Date.now()}`,
              delta: funcCall.arguments
            })}`);
          }
        }
        if (choice.delta?.tool_calls) {
          for (const call of choice.delta.tool_calls) {
            if (call.function?.name) {
              lines.push('event: response.function_call');
              lines.push(`data: ${JSON.stringify({
                type: 'response.function_call',
                name: call.function.name,
                call_id: call.id
              })}`);
            }
            if (call.function?.arguments) {
              lines.push('event: response.function_call.arguments.delta');
              lines.push(`data: ${JSON.stringify({
                type: 'response.function_call.arguments.delta',
                call_id: call.id,
                delta: call.function.arguments
              })}`);
            }
          }
        }
        if (choice.delta?.content) {
          lines.push('event: response.output_text.delta');
          lines.push(`data: ${JSON.stringify({
            type: 'response.output_text.delta',
            delta: choice.delta.content
          })}`);
        }
        if (choice.finish_reason) {
          lines.push('event: response.completed');
          lines.push(`data: ${JSON.stringify({
            type: 'response.completed',
            response: {
              status: 'completed',
              finish_reason: choice.finish_reason
            }
          })}`);
        }
      }
    }

    // Legacy support: Handle old-style canonical chunks
    if (canonicalChunk.delta?.content) {
    const textDelta = canonicalChunk.delta.content
        .filter((c: any) => c.type === 'text' || c.type === 'output_text')
        .map((c: any) => c.text)
        .join('');

    if (textDelta) {
        lines.push('event: response.output_text.delta');
        lines.push(`data: ${JSON.stringify({
          type: 'response.output_text.delta',
          delta: textDelta
        })}`);
      }
    }

    // Handle function calls in delta (both tool_calls and function_call formats)
    if (canonicalChunk.delta?.tool_calls) {
      for (const call of canonicalChunk.delta.tool_calls) {
        if (call.created) {
          lines.push('event: response.function_call');
          lines.push(`data: ${JSON.stringify({
            type: 'response.function_call',
            name: call.name,
            call_id: call.id
          })}`);
        }
        if (call.arguments_delta) {
          lines.push('event: response.function_call.arguments.delta');
          lines.push(`data: ${JSON.stringify({
            type: 'response.function_call.arguments.delta',
            call_id: call.id,
            delta: call.arguments_delta
          })}`);
        }
        if (call.done) {
          lines.push('event: response.function_call.done');
          lines.push(`data: ${JSON.stringify({
            type: 'response.function_call.done',
            call_id: call.id
          })}`);
        }
      }
    }

    // Handle legacy function_call format from streaming schema
    if (canonicalChunk.delta?.function_call) {
      const funcCall = canonicalChunk.delta.function_call;
      if (funcCall.name) {
        lines.push('event: response.function_call');
        lines.push(`data: ${JSON.stringify({
          type: 'response.function_call',
          name: funcCall.name
        })}`);
      }
      if (funcCall.arguments) {
        lines.push('event: response.function_call.arguments.delta');
        lines.push(`data: ${JSON.stringify({
          type: 'response.function_call.arguments.delta',
          delta: funcCall.arguments
        })}`);
      }
    }

    // Handle function call outputs
    if (canonicalChunk.delta?.function_call_output) {
      lines.push('event: response.function_call_output');
      lines.push(`data: ${JSON.stringify({
        type: 'response.function_call_output',
        call_id: canonicalChunk.delta.function_call_output.call_id,
        output: canonicalChunk.delta.function_call_output.output
      })}`);
    }

    // Handle completion
    if (canonicalChunk.finishReason) {
      if (canonicalChunk.usage) {
        lines.push('event: response.usage');
        lines.push(`data: ${JSON.stringify({
          type: 'response.usage',
          usage: {
            input_tokens: canonicalChunk.usage.input_tokens || canonicalChunk.usage.inputTokens || 0,
            output_tokens: canonicalChunk.usage.output_tokens || canonicalChunk.usage.outputTokens || 0,
            total_tokens: canonicalChunk.usage.total_tokens || canonicalChunk.usage.totalTokens || 0
          }
        })}`);
      }
      
      lines.push('event: response.completed');
      lines.push(`data: ${JSON.stringify({
        type: 'response.completed',
        response: {
          status: 'completed',
          finish_reason: canonicalChunk.finishReason
        }
      })}`);
    }

    return lines.map(line => line + '\n').join('') + '\n';
  }

  private normalizeContent(content: unknown): Array<{ type: 'text' | 'output_text'; text: string }> {
    // Accept string or array of blocks with { type, text? }
    if (typeof content === 'string') {
      return [{ type: 'text', text: content }];
    }
    if (Array.isArray(content)) {
      return (content as Array<{ type: string; text?: string }>).flatMap(part => {
        if (part?.type === 'input_text' || part?.type === 'text' || part?.type === 'output_text') {
          return [{ type: part.type === 'output_text' ? 'output_text' : 'text', text: part.text || '' }];
        }
        return [];
      });
    }
    return [];
  }
}
