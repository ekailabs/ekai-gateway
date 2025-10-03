import { StreamingResponse as CanonicalStreamingResponse } from '../../../canonical/types/index.js';
import { buildCanonicalChunk, mapFinishReasonFromResponsesStatus } from './stream.helpers.js';

// Helper functions local to this map
function handleOutputItemAdded(data: any): CanonicalStreamingResponse {
  const item = data.item;
  const functionCall = Array.isArray(item?.content)
    ? item.content.find((seg: any) => seg?.type === 'function_call' || seg?.type === 'tool_use')
    : null;

  if (functionCall) {
    return buildCanonicalChunk({
      type: 'function_call',
      name: functionCall.name || functionCall.function?.name,
      arguments_json:
        functionCall.arguments_json || functionCall.arguments || functionCall.function?.arguments || '',
      id: functionCall.id,
      call_id: functionCall.id
    });
  }

  const canonicalItem = {
    id: item?.id ?? data.item_id ?? '',
    status: item?.status ?? 'in_progress',
    type: item?.type ?? 'message',
    role: item?.role,
    content: Array.isArray(item?.content) ? item.content : [],
    encrypted_content: item?.encrypted_content
  } as any;

  return buildCanonicalChunk({
    type: 'output_item_added',
    output_index: data.output_index ?? 0,
    item: canonicalItem,
    sequence_number: data.sequence_number,
    item_id: data.item_id ?? canonicalItem.id
  });
}

function handleContentPartAdded(data: any): CanonicalStreamingResponse {
  const part = data.part;
  if (part?.type === 'function_call' || part?.type === 'tool_use') {
    return buildCanonicalChunk({
      type: 'function_call',
      name: part.name || part.function?.name,
      arguments_json: part.arguments_json || part.arguments || part.function?.arguments || '',
      id: part.id,
      call_id: part.id
    });
  }

  return buildCanonicalChunk({
    type: 'content_part_start',
    index: data.content_index ?? 0,
    sequence_number: data.sequence_number,
    item_id: data.item_id,
    output_index: data.output_index,
    content_block: part
  });
}

// Provider → Canonical registry
export const providerToCanonical: Record<string, (data: any) => CanonicalStreamingResponse | CanonicalStreamingResponse[] | null> = {
  'response.created': (data: any) => buildCanonicalChunk({
    type: 'response_created',
    id: data.response?.id,
    model: data.response?.model,
    created: data.response?.created_at,
    sequence_number: data.sequence_number,
    response: data.response
  }),
  'response.in_progress': (data: any) => buildCanonicalChunk({
    type: 'response_in_progress',
    sequence_number: data.sequence_number,
    response: data.response
  }),
  'response.output_text.delta': (data: any) => buildCanonicalChunk({
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
  'response.output_text.done': (data: any) => buildCanonicalChunk({
    type: 'output_text_done',
    text: data.text,
    annotations: data.annotations,
    logprobs: data.logprobs
  }),
  'response.output_item.added': (data: any) => handleOutputItemAdded(data),
  'response.content_part.added': (data: any) => handleContentPartAdded(data),
  'response.content_part.done': (data: any) => buildCanonicalChunk({
    type: 'content_part_done',
    index: data.content_index
  }),
  'response.output_item.done': (data: any) => buildCanonicalChunk({
    type: 'output_item_done',
    output_index: data.output_index,
    item: data.item,
    sequence_number: data.sequence_number,
    item_id: data.item?.id ?? data.item_id
  }),
  'response.function_call': (data: any) => buildCanonicalChunk({
    type: 'function_call',
    name: data.name,
    arguments_json: data.arguments_json || '',
    id: data.call_id,
    call_id: data.call_id
  }),
  'response.tool_call': (data: any) => buildCanonicalChunk({
    type: 'tool_call',
    name: data.name,
    arguments_json: data.arguments_json || '',
    id: data.call_id,
    call_id: data.call_id
  }),
  'response.usage': (data: any) => buildCanonicalChunk({
    type: 'usage',
    input_tokens: data.usage?.input_tokens,
    output_tokens: data.usage?.output_tokens,
    reasoning_tokens: data.usage?.reasoning_tokens,
    usage: data.usage
  }),
  // File search → canonical
  'response.file_search_call.in_progress': (data: any) => buildCanonicalChunk({
    type: 'file_search_start',
    call_id: data.call_id,
    tool_call_id: data.tool_call_id,
    file_search: { status: 'in_progress', query: data.file_search?.query }
  }),
  'response.file_search_call.searching': (data: any) => buildCanonicalChunk({
    type: 'file_search_progress',
    call_id: data.call_id,
    tool_call_id: data.tool_call_id,
    file_search: { status: 'searching', query: data.file_search?.query, results: data.file_search?.results }
  }),
  'response.file_search_call.completed': (data: any) => buildCanonicalChunk({
    type: 'file_search_done',
    call_id: data.call_id,
    tool_call_id: data.tool_call_id,
    file_search: { status: 'completed', query: data.file_search?.query, results: data.file_search?.results }
  }),
  // Web search → canonical
  'response.web_search_call.in_progress': (data: any) => buildCanonicalChunk({
    type: 'web_search_start',
    call_id: data.call_id,
    tool_call_id: data.tool_call_id,
    web_search: { status: 'in_progress', query: data.web_search?.query }
  }),
  'response.web_search_call.searching': (data: any) => buildCanonicalChunk({
    type: 'web_search_progress',
    call_id: data.call_id,
    tool_call_id: data.tool_call_id,
    web_search: { status: 'searching', query: data.web_search?.query, results: data.web_search?.results }
  }),
  'response.web_search_call.completed': (data: any) => buildCanonicalChunk({
    type: 'web_search_done',
    call_id: data.call_id,
    tool_call_id: data.tool_call_id,
    web_search: { status: 'completed', query: data.web_search?.query, results: data.web_search?.results }
  }),
  // Reasoning summaries
  'response.reasoning.summary.delta': (data: any) => buildCanonicalChunk({
    type: 'reasoning_summary_text_delta',
    delta: data.delta,
    summary: data.summary
  }),
  'response.reasoning.summary.done': (data: any) => buildCanonicalChunk({
    type: 'reasoning_summary_text_done',
    summary: data.summary
  }),
  // Function call arguments streaming
  'response.function_call.arguments.delta': (data: any) => buildCanonicalChunk({
    type: 'function_call_arguments_delta',
    call_id: data.call_id,
    delta: data.delta,
    arguments: data.arguments
  }),
  'response.function_call.arguments.done': (data: any) => buildCanonicalChunk({
    type: 'function_call_arguments_done',
    call_id: data.call_id,
    arguments: data.arguments
  }),
  // Refusals
  'response.refusal.delta': (data: any) => buildCanonicalChunk({
    type: 'refusal_delta',
    delta: data.delta,
    refusal: data.refusal
  }),
  'response.refusal.done': (data: any) => buildCanonicalChunk({
    type: 'refusal_done',
    refusal: data.refusal
  }),
  'response.completed': (data: any) => buildCanonicalChunk({
    type: 'response_completed',
    finish_reason: mapFinishReasonFromResponsesStatus(data?.response?.status),
    response: data.response
  }),
  'response.error': (data: any) => buildCanonicalChunk({
    type: 'error',
    error: data.error || data
  }),
  error: (data: any) => buildCanonicalChunk({
    type: 'error',
    error: data.error || data
  })
};

// Canonical → Provider registry
export const canonicalToProvider: Record<string, (event: Record<string, any>) => { event: string; data: Record<string, any> } | null> = {
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
  content_delta: (event: Record<string, any>) => ({
    event: 'response.output_text.delta',
    data: {
      type: 'response.output_text.delta',
      delta: event.delta ?? event.value,
      content_index: event.index ?? event.content_index,
      sequence_number: event.sequence_number,
      item_id: event.item_id,
      output_index: event.output_index,
      annotations: event.annotations,
      logprobs: event.logprobs,
      obfuscation: event.obfuscation
    }
  }),
  output_text_done: (event: Record<string, any>) => ({
    event: 'response.output_text.done',
    data: {
      type: 'response.output_text.done',
      text: event.text,
      annotations: event.annotations,
      logprobs: event.logprobs
    }
  }),
  output_item_added: (event: Record<string, any>) => ({
    event: 'response.output_item.added',
    data: {
      type: 'response.output_item.added',
      output_index: event.output_index,
      item: event.item,
      sequence_number: event.sequence_number,
      item_id: event.item_id
    }
  }),
  content_part_start: (event: Record<string, any>) => ({
    event: 'response.content_part.added',
    data: {
      type: 'response.content_part.added',
      content_index: event.index,
      sequence_number: event.sequence_number,
      item_id: event.item_id,
      output_index: event.output_index,
      part: event.content_block
    }
  }),
  content_part_done: (event: Record<string, any>) => ({
    event: 'response.content_part.done',
    data: {
      type: 'response.content_part.done',
      content_index: event.index
    }
  }),
  output_item_done: (event: Record<string, any>) => ({
    event: 'response.output_item.done',
    data: {
      type: 'response.output_item.done',
      output_index: event.output_index,
      item: event.item,
      sequence_number: event.sequence_number,
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
  function_call_arguments_delta: (event: Record<string, any>) => ({
    event: 'response.function_call.arguments.delta',
    data: {
      type: 'response.function_call.arguments.delta',
      call_id: event.call_id,
      delta: event.delta,
      arguments: event.arguments
    }
  }),
  function_call_arguments_done: (event: Record<string, any>) => ({
    event: 'response.function_call.arguments.done',
    data: {
      type: 'response.function_call.arguments.done',
      call_id: event.call_id,
      arguments: event.arguments
    }
  }),
  // Refusals
  refusal_delta: (event: Record<string, any>) => ({
    event: 'response.refusal.delta',
    data: {
      type: 'response.refusal.delta',
      delta: event.delta,
      refusal: event.refusal
    }
  }),
  refusal_done: (event: Record<string, any>) => ({
    event: 'response.refusal.done',
    data: {
      type: 'response.refusal.done',
      refusal: event.refusal
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
      response: event.response || { status: event.finish_reason || 'completed' }
    }
  }),
  reasoning_summary_text_delta: (event: Record<string, any>) => ({
    event: 'response.reasoning.summary.delta',
    data: {
      type: 'response.reasoning.summary.delta',
      delta: event.delta,
      summary: event.summary
    }
  }),
  reasoning_summary_text_done: (event: Record<string, any>) => ({
    event: 'response.reasoning.summary.done',
    data: {
      type: 'response.reasoning.summary.done',
      summary: event.summary
    }
  }),
  // File search canonical → provider
  file_search_start: (event: Record<string, any>) => ({
    event: 'response.file_search_call.in_progress',
    data: {
      type: 'response.file_search_call.in_progress',
      call_id: event.call_id,
      tool_call_id: event.tool_call_id,
      file_search: event.file_search
    }
  }),
  file_search_progress: (event: Record<string, any>) => ({
    event: 'response.file_search_call.searching',
    data: {
      type: 'response.file_search_call.searching',
      call_id: event.call_id,
      tool_call_id: event.tool_call_id,
      file_search: event.file_search
    }
  }),
  file_search_done: (event: Record<string, any>) => ({
    event: 'response.file_search_call.completed',
    data: {
      type: 'response.file_search_call.completed',
      call_id: event.call_id,
      tool_call_id: event.tool_call_id,
      file_search: event.file_search
    }
  }),
  // Web search canonical → provider
  web_search_start: (event: Record<string, any>) => ({
    event: 'response.web_search_call.in_progress',
    data: {
      type: 'response.web_search_call.in_progress',
      call_id: event.call_id,
      tool_call_id: event.tool_call_id,
      web_search: event.web_search
    }
  }),
  web_search_progress: (event: Record<string, any>) => ({
    event: 'response.web_search_call.searching',
    data: {
      type: 'response.web_search_call.searching',
      call_id: event.call_id,
      tool_call_id: event.tool_call_id,
      web_search: event.web_search
    }
  }),
  web_search_done: (event: Record<string, any>) => ({
    event: 'response.web_search_call.completed',
    data: {
      type: 'response.web_search_call.completed',
      call_id: event.call_id,
      tool_call_id: event.tool_call_id,
      web_search: event.web_search
    }
  }),
  error: (event: Record<string, any>) => ({
    event: 'error',
    data: {
      type: 'error',
      error: event.error || { code: event.code, message: event.message }
    }
  })
};
