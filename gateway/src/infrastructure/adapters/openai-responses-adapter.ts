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

export class OpenAIResponsesAdapter implements FormatAdapter<OpenAIResponsesRequest, OpenAIResponsesResponse> {
  toCanonical(input: OpenAIResponsesRequest): CanonicalRequest {
    const instructions = (input as any).instructions;
    const systemPrompt = instructions ? (typeof instructions === 'string' ? instructions : String(instructions)) : undefined;

    // Map OpenAI Responses input to canonical messages
    const messages: any[] = [];
    const inputData = (input as any).input;
    
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
      model: (input as any).model,
      messages: (messages.length ? messages : [{ role: 'user', content: '' }]),
      system: systemPrompt,
      stream: Boolean((input as any).stream),
      tools: (input as any).tools,
      tool_choice: (input as any).tool_choice,
      parallel_tool_calls: (input as any).parallel_tool_calls,
      response_format: (input as any).response_format,
      include: (input as any).include,
      store: (input as any).store,
      reasoning_effort: (input as any).reasoning_effort ?? (input as any).reasoning?.effort,
      modalities: (input as any).modalities,
      audio: (input as any).audio,
      thinking: (input as any).reasoning ? {
        budget: (input as any).reasoning.budget,
        summary: (input as any).reasoning.summary,
        content: (input as any).reasoning.content,
        encrypted_content: (input as any).reasoning.encrypted_content
      } : undefined,
      generation: {
        max_tokens: (input as any).max_output_tokens ?? (input as any).max_tokens,
        temperature: (input as any).temperature,
        top_p: (input as any).top_p,
        stop: (input as any).stop,
        stop_sequences: (input as any).stop_sequences,
        seed: (input as any).seed
      },
      provider_params: { openai: { use_responses_api: true, prompt_cache_key: (input as any).prompt_cache_key } }
    };

    return canonical as CanonicalRequest;
  }

  fromCanonical(response: CanonicalResponse): OpenAIResponsesResponse {
    const firstChoice: any = (response as any).choices?.[0] || {};
    const parts: any[] = firstChoice?.message?.content || [];
    const text = parts
      .filter(p => p?.type === 'text')
      .map(p => p.text || '')
      .join('');
    return {
      id: (response as any).id,
      object: 'response',
      created: (response as any).created,
      model: (response as any).model,
      output_text: text,
      output: [{ content: parts.map(p => p?.type === 'text' ? { type: 'text', text: p.text || '' } : { type: 'text', text: '' }) }],
      usage: {
        input_tokens: (response as any).usage?.input_tokens ?? (response as any).usage?.prompt_tokens,
        output_tokens: (response as any).usage?.output_tokens ?? (response as any).usage?.completion_tokens,
        total_tokens: (response as any).usage?.total_tokens
      }
    } as OpenAIResponsesResponse;
  }

  fromCanonicalStream?(chunk: any): string {
    // Convert canonical streaming chunk to OpenAI Responses SSE format
    const lines: string[] = [];
    
    // Handle different streaming event types from canonical chunk
    if (chunk.event) {
      const eventType = chunk.event.type;
      
      switch (eventType) {
        case 'message_start':
          lines.push('event: response.created');
          lines.push(`data: ${JSON.stringify({
            type: 'response.created',
            response: {
              id: chunk.event.id || chunk.id,
              object: 'response',
              created: chunk.event.created || Math.floor(Date.now() / 1000),
              status: 'in_progress'
            }
          })}`);
          break;

        case 'content_delta':
          if (chunk.event.part === 'text') {
            lines.push('event: response.output_text.delta');
            lines.push(`data: ${JSON.stringify({
              type: 'response.output_text.delta',
              delta: chunk.event.value
            })}`);
          }
          break;

        case 'tool_call':
          lines.push('event: response.function_call');
          lines.push(`data: ${JSON.stringify({
            type: 'response.function_call',
            name: chunk.event.name,
            arguments_json: chunk.event.arguments_json,
            call_id: chunk.event.id
          })}`);
          break;

        case 'usage':
          lines.push('event: response.usage');
          lines.push(`data: ${JSON.stringify({
            type: 'response.usage',
            usage: {
              input_tokens: chunk.event.input_tokens,
              output_tokens: chunk.event.output_tokens,
              total_tokens: (chunk.event.input_tokens || 0) + (chunk.event.output_tokens || 0)
            }
          })}`);
          break;

        case 'complete':
          lines.push('event: response.completed');
          lines.push(`data: ${JSON.stringify({
            type: 'response.completed',
            response: {
              status: 'completed',
              finish_reason: chunk.event.finish_reason
            }
          })}`);
          break;

        case 'error':
          lines.push('event: error');
          lines.push(`data: ${JSON.stringify({
            type: 'error',
            error: {
              code: chunk.event.code,
              message: chunk.event.message
            }
          })}`);
          break;
      }
    }

    // Legacy support: Handle old-style canonical chunks
    if (chunk.delta?.content) {
      const textDelta = chunk.delta.content
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

    // Handle function calls in delta
    if (chunk.delta?.tool_calls) {
      for (const call of chunk.delta.tool_calls) {
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

    // Handle function call outputs
    if (chunk.delta?.function_call_output) {
      lines.push('event: response.function_call_output');
      lines.push(`data: ${JSON.stringify({
        type: 'response.function_call_output',
        call_id: chunk.delta.function_call_output.call_id,
        output: chunk.delta.function_call_output.output
      })}`);
    }

    // Handle completion
    if (chunk.finishReason) {
      if (chunk.usage) {
        lines.push('event: response.usage');
        lines.push(`data: ${JSON.stringify({
          type: 'response.usage',
          usage: {
            input_tokens: chunk.usage.input_tokens || chunk.usage.inputTokens || 0,
            output_tokens: chunk.usage.output_tokens || chunk.usage.outputTokens || 0,
            total_tokens: chunk.usage.total_tokens || chunk.usage.totalTokens || 0
          }
        })}`);
      }
      
      lines.push('event: response.completed');
      lines.push(`data: ${JSON.stringify({
        type: 'response.completed',
        response: {
          status: 'completed',
          finish_reason: chunk.finishReason
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
