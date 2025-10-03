// Minimal adapter for OpenAI Responses API request/response shapes
// Converts between Responses API and canonical schema format used internally.
import { FormatAdapter } from '../../canonical/format-adapter.js';
import { Request as CanonicalRequest, Response as CanonicalResponse, StreamingResponse as CanonicalStreamingResponse } from '../../canonical/types/index.js';

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
  private readonly providerEventHandlers: Record<string, (data: any) => CanonicalStreamingResponse | CanonicalStreamingResponse[] | null> = {
    'response.created': (data: any) => this.buildCanonicalChunk({
      type: 'response_created',
      id: data.response?.id,
      model: data.response?.model,
      created: data.response?.created_at,
      sequence_number: data.sequence_number,
      response: data.response
    }),
    'response.in_progress': (data: any) => this.buildCanonicalChunk({
      type: 'response_in_progress',
      sequence_number: data.sequence_number,
      response: data.response
    }),
    'response.output_text.delta': (data: any) => this.buildCanonicalChunk({
      type: 'content_delta',
      part: 'text',
      value: data.delta,
      delta: data.delta,
      index: data.content_index,
      sequence_number: data.sequence_number,
      item_id: data.item_id,
      output_index: data.output_index,
      content_index: data.content_index,
      annotations: data.annotations,
      logprobs: data.logprobs,
      obfuscation: data.obfuscation
    }),
    'response.output_item.added': (data: any) => this.handleOutputItemAdded(data),
    'response.content_part.added': (data: any) => this.handleContentPartAdded(data),
    'response.output_item.done': (data: any) => this.buildCanonicalChunk({
      type: 'output_item_done',
      output_index: data.output_index,
      item: data.item,
      sequence_number: data.sequence_number,
      item_id: data.item?.id ?? data.item_id
    }),
    'response.function_call': (data: any) => this.buildCanonicalChunk({
      type: 'function_call',
      name: data.name,
      arguments_json: data.arguments_json || '',
      id: data.call_id,
      call_id: data.call_id
    }),
    'response.tool_call': (data: any) => this.buildCanonicalChunk({
      type: 'tool_call',
      name: data.name,
      arguments_json: data.arguments_json || '',
      id: data.call_id,
      call_id: data.call_id
    }),
    'response.usage': (data: any) => this.buildCanonicalChunk({
      type: 'usage',
      input_tokens: data.usage?.input_tokens,
      output_tokens: data.usage?.output_tokens,
      reasoning_tokens: data.usage?.reasoning_tokens,
      usage: data.usage
    }),
    'response.file_search_call.in_progress': (data: any) => this.buildCanonicalChunk({
      type: 'file_search_call_in_progress',
      call_id: data.call_id,
      tool_call_id: data.tool_call_id,
      file_search: data.file_search
    }),
    'response.file_search_call.searching': (data: any) => this.buildCanonicalChunk({
      type: 'file_search_call_searching',
      call_id: data.call_id,
      tool_call_id: data.tool_call_id,
      file_search: data.file_search
    }),
    'response.completed': (data: any) => this.buildCanonicalChunk({
      type: 'response_completed',
      finish_reason: data.response?.status || 'completed',
      response: data.response
    }),
    'response.error': (data: any) => this.buildCanonicalChunk({
      type: 'error',
      error: data.error || data
    }),
    error: (data: any) => this.buildCanonicalChunk({
      type: 'error',
      error: data.error || data
    })
  };

  private readonly canonicalEventHandlers: Record<string, (event: Record<string, any>) => { event: string; data: Record<string, any> } | null> = {
    response_created: (event: Record<string, any>) => ({
      event: 'response.created',
      data: {
        type: 'response.created',
        sequence_number: event.sequence_number,
        response: event.response || {
          id: event.id,
          model: event.model,
          created_at: event.created,
          status: 'in_progress'
        }
      }
    }),
    response_in_progress: (event: Record<string, any>) => ({
      event: 'response.in_progress',
      data: {
        type: 'response.in_progress',
        sequence_number: event.sequence_number,
        response: event.response
      }
    }),
    content_delta: (event: Record<string, any>) => {
      if (event.part !== 'text') {
        return null;
      }
      return {
        event: 'response.output_text.delta',
        data: {
          type: 'response.output_text.delta',
          delta: event.value ?? event.delta ?? '',
          sequence_number: event.sequence_number,
          item_id: event.item_id,
          content_index: event.content_index ?? event.index,
          output_index: event.output_index,
          logprobs: event.logprobs,
          annotations: event.annotations,
          obfuscation: event.obfuscation
        }
      };
    },
    content_part_start: (event: Record<string, any>) => ({
      event: 'response.content_part.added',
      data: {
        type: 'response.content_part.added',
        sequence_number: event.sequence_number,
        output_index: event.output_index,
        content_index: event.index,
        item_id: event.item_id,
        part: event.content_block
      }
    }),
    output_item_added: (event: Record<string, any>) => ({
      event: 'response.output_item.added',
      data: {
        type: 'response.output_item.added',
        sequence_number: event.sequence_number,
        output_index: event.output_index,
        item: event.item,
        item_id: event.item_id
      }
    }),
    output_item_done: (event: Record<string, any>) => ({
      event: 'response.output_item.done',
      data: {
        type: 'response.output_item.done',
        sequence_number: event.sequence_number,
        output_index: event.output_index,
        item: event.item,
        item_id: event.item_id
      }
    }),
    function_call: (event: Record<string, any>) => ({
      event: 'response.function_call',
      data: {
        type: 'response.function_call',
        name: event.name,
        arguments_json: event.arguments_json,
        call_id: event.call_id || event.id
      }
    }),
    tool_call: (event: Record<string, any>) => ({
      event: 'response.tool_call',
      data: {
        type: 'response.tool_call',
        name: event.name,
        arguments_json: event.arguments_json,
        call_id: event.call_id || event.id
      }
    }),
    usage: (event: Record<string, any>) => ({
      event: 'response.usage',
      data: {
        type: 'response.usage',
        usage: event.usage || {
          input_tokens: event.input_tokens,
          output_tokens: event.output_tokens,
          reasoning_tokens: event.reasoning_tokens
        }
      }
    }),
    response_completed: (event: Record<string, any>) => ({
      event: 'response.completed',
      data: {
        type: 'response.completed',
        response: event.response || {
          status: event.finish_reason || 'completed'
        }
      }
    }),
    error: (event: Record<string, any>) => ({
      event: 'error',
      data: {
        type: 'error',
        error: event.error || {
          code: event.code,
          message: event.message
        }
      }
    }),
    file_search_call_in_progress: (event: Record<string, any>) => ({
      event: 'response.file_search_call.in_progress',
      data: {
        type: 'response.file_search_call.in_progress',
        call_id: event.call_id,
        tool_call_id: event.tool_call_id,
        file_search: event.file_search
      }
    }),
    file_search_call_searching: (event: Record<string, any>) => ({
      event: 'response.file_search_call.searching',
      data: {
        type: 'response.file_search_call.searching',
        call_id: event.call_id,
        tool_call_id: event.tool_call_id,
        file_search: event.file_search
      }
    })
  };
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
  encodeStreamToCanonical?(providerStream: any): CanonicalStreamingResponse[] {
    const text = this.normalizeProviderStream(providerStream);
    if (!text) {
      return [];
    }

    const chunks: CanonicalStreamingResponse[] = [];
    const lines = text.split(/\r?\n/);
    let currentEvent = '';

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();

      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
        continue;
      }

      if (!line.startsWith('data: ')) {
        continue;
      }

      const dataStr = line.slice(6);
      if (dataStr === '[DONE]') {
        chunks.push(this.buildCanonicalChunk({
          type: 'response_completed',
          finish_reason: 'stop'
        }));
        break;
      }

      try {
        const data = JSON.parse(dataStr);
        const eventType = data?.type || currentEvent;
        if (!eventType) {
          continue;
        }

        const handler = this.providerEventHandlers[eventType];
        if (!handler) {
          continue;
        }

        const result = handler(data);
        const canonicalChunks = Array.isArray(result)
          ? result.filter(Boolean) as CanonicalStreamingResponse[]
          : result
            ? [result as CanonicalStreamingResponse]
            : [];

        for (const chunk of canonicalChunks) {
          if (!chunk) continue;
          (chunk as any).provider_raw = {
            event: eventType,
            data,
            raw_event: currentEvent ? `event: ${currentEvent}` : undefined,
            raw_data: `data: ${dataStr}`
          };
          chunks.push(chunk);
        }
      } catch (_error) {
        // ignore malformed JSON lines
      }
    }

    return chunks;
  }

  decodeStreamToClient?(canonicalChunk: CanonicalStreamingResponse): string {
    if (!canonicalChunk || (canonicalChunk as any).stream_type !== 'canonical') {
      return '';
    }

    const providerRaw = (canonicalChunk as any).provider_raw;
    if (providerRaw?.raw_data || providerRaw?.raw_event) {
      const eventLine = providerRaw.raw_event
        ?? (providerRaw.event ? `event: ${providerRaw.event}` : undefined);
      const dataLine = providerRaw.raw_data
        ?? (providerRaw.data ? `data: ${JSON.stringify(providerRaw.data)}` : undefined);

      const pieces = [] as string[];
      if (eventLine) pieces.push(eventLine);
      if (dataLine) pieces.push(dataLine);
      return pieces.join('\n') + '\n\n';
    }

    if (providerRaw?.event && providerRaw?.data) {
      return `event: ${providerRaw.event}\ndata: ${JSON.stringify(providerRaw.data)}\n\n`;
    }

    const event = (canonicalChunk as any).event;
    if (!event?.type) {
      return '';
    }

    const handler = this.canonicalEventHandlers[event.type];
    const payload = handler ? handler(event) : null;
    if (!payload) {
      return '';
    }

    return `event: ${payload.event}\ndata: ${JSON.stringify(payload.data)}\n\n`;
  }

  private normalizeProviderStream(stream: any): string {
    if (typeof stream === 'string') {
      return stream;
    }
    if (stream instanceof Uint8Array) {
      return new TextDecoder('utf-8').decode(stream);
    }
    if (Array.isArray(stream)) {
      return new TextDecoder('utf-8').decode(new Uint8Array(stream));
    }
    return stream && typeof stream === 'object' && 'toString' in stream ? String(stream) : '';
  }

  private buildCanonicalChunk(event: Record<string, any>): CanonicalStreamingResponse {
    return {
      schema_version: '1.0.1',
      stream_type: 'canonical',
      event
    } as CanonicalStreamingResponse;
  }

  private handleOutputItemAdded(data: any): CanonicalStreamingResponse {
    const item = data.item;
    const functionCall = this.extractFunctionOrToolUse(item?.content);
    if (functionCall) {
      return this.buildCanonicalChunk({
        type: 'function_call',
        name: functionCall.name || functionCall.function?.name,
        arguments_json: functionCall.arguments_json || functionCall.arguments || functionCall.function?.arguments || '',
        id: functionCall.id,
        call_id: functionCall.id
      }, 'response.output_item.added', data);
    }

    const canonicalItem = {
      id: item?.id ?? data.item_id ?? '',
      status: item?.status ?? 'in_progress',
      type: item?.type ?? 'message',
      role: item?.role,
      content: Array.isArray(item?.content) ? item.content : [],
      encrypted_content: item?.encrypted_content
    } as any;

    return this.buildCanonicalChunk({
      type: 'output_item_added',
      output_index: data.output_index ?? 0,
      item: canonicalItem,
      sequence_number: data.sequence_number,
      item_id: data.item_id ?? canonicalItem.id
    }, 'response.output_item.added', data);
  }

  private handleContentPartAdded(data: any): CanonicalStreamingResponse {
    const part = data.part;
    if (part?.type === 'function_call' || part?.type === 'tool_use') {
      return this.buildCanonicalChunk({
        type: 'function_call',
        name: part.name || part.function?.name,
        arguments_json: part.arguments_json || part.arguments || part.function?.arguments || '',
        id: part.id,
        call_id: part.id
      }, 'response.content_part.added', data);
    }

    return this.buildCanonicalChunk({
      type: 'content_part_start',
      index: data.content_index ?? 0,
      sequence_number: data.sequence_number,
      item_id: data.item_id,
      output_index: data.output_index,
      content_block: part
    }, 'response.content_part.added', data);
  }

  private extractFunctionOrToolUse(content: any): any | null {
    if (!Array.isArray(content)) {
      return null;
    }
    return content.find((segment: any) => segment?.type === 'function_call' || segment?.type === 'tool_use') || null;
  }
}
