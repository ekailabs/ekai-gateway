import { Request as CanonicalRequest } from '../../../canonical/types/index.js';
import {
  OpenAIResponsesRequestShape,
  decodeResponsesInputToCanonical,
  encodeCanonicalMessagesToResponsesInput,
  buildCanonicalGenerationFromResponses
} from './requests.helpers.js';

export function encodeRequestToCanonical(clientRequest: OpenAIResponsesRequestShape): CanonicalRequest {
  const instructions = (clientRequest as any).instructions;
  const systemPrompt = instructions ? (typeof instructions === 'string' ? instructions : String(instructions)) : undefined;

  const { messages, thinking: extractedThinking } = decodeResponsesInputToCanonical((clientRequest as any).input);

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
    } : extractedThinking,
    generation: buildCanonicalGenerationFromResponses(clientRequest as any),
    provider_params: { openai: { use_responses_api: true, prompt_cache_key: (clientRequest as any).prompt_cache_key } }
  };

  return canonical as CanonicalRequest;
}

export function decodeCanonicalRequest(canonicalRequest: CanonicalRequest): any {
  // Derive instructions from canonical system (string or array of text parts)
  let instructions: string | undefined;
  const sys = (canonicalRequest as any).system;
  if (typeof sys === 'string') {
    instructions = sys;
  } else if (Array.isArray(sys)) {
    instructions = sys
      .filter((c: any) => c?.type === 'text')
      .map((c: any) => c.text || '')
      .join('');
  }

  // Map optional context fields if present
  const context = (canonicalRequest as any).context;

  return {
    model: canonicalRequest.model,
    input: encodeCanonicalMessagesToResponsesInput(canonicalRequest.messages as any),
    stream: canonicalRequest.stream,
    temperature: canonicalRequest.generation?.temperature,
    max_output_tokens: canonicalRequest.generation?.max_tokens,
    top_p: canonicalRequest.generation?.top_p,
    stop: canonicalRequest.generation?.stop,
    stop_sequences: canonicalRequest.generation?.stop_sequences,
    seed: canonicalRequest.generation?.seed,
    instructions,
    tools: canonicalRequest.tools,
    tool_choice: canonicalRequest.tool_choice,
    parallel_tool_calls: canonicalRequest.parallel_tool_calls,
    response_format: canonicalRequest.response_format,
    include: canonicalRequest.include,
    store: canonicalRequest.store,
    service_tier: (canonicalRequest as any).service_tier,
    reasoning: canonicalRequest.thinking ? {
      budget: canonicalRequest.thinking.budget,
      summary: canonicalRequest.thinking.summary,
      content: canonicalRequest.thinking.content,
      encrypted_content: canonicalRequest.thinking.encrypted_content,
      effort: canonicalRequest.reasoning_effort
    } : undefined,
    modalities: canonicalRequest.modalities,
    audio: canonicalRequest.audio,
    prompt_cache_key: (canonicalRequest as any).provider_params?.openai?.prompt_cache_key,
    context: context ? {
      previous_response_id: context.previous_response_id,
      cache_ref: context.cache_ref,
      provider_state: context.provider_state
    } : undefined
  };
}
