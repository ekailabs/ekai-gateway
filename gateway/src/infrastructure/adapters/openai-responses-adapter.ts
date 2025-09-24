// Minimal adapter for OpenAI Responses API request/response shapes
// Converts between Responses API and canonical format used internally.
import {
  CanonicalRequest,
  CanonicalResponse,
  CanonicalStreamChunk,
  CanonicalContent,
  CanonicalMessage,
  CanonicalInputItem,
  CanonicalInputMessage,
  CanonicalReasoningMessage,
  FormatAdapter
} from 'shared/types/canonical.js';

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
    const messages: CanonicalMessage[] = [];
    let canonicalInput: string | CanonicalInputItem[] | undefined = undefined;
    let thinking: any = undefined;

    // 1) Map instructions -> system field
    const instructions = (input as any).instructions;
    let systemPrompt: string | undefined;
    if (instructions) {
      systemPrompt = typeof instructions === 'string' ? instructions : String(instructions);
    }

    // 2) Process input - map to canonical input structure
    if (typeof input.input === 'string') {
      // Simple string input
      canonicalInput = input.input;
      // Also create a message for backward compatibility
      messages.push({
        role: 'user',
        content: [{ type: 'text', text: input.input }] as CanonicalContent[],
      });
    } else if (Array.isArray(input.input)) {
      // Complex input array - map to canonical input items
      const inputItems: CanonicalInputItem[] = [];
      
      for (const item of input.input) {
        const itemType = (item as any).type;
        
        if (itemType === 'message') {
          // Convert to canonical input message
          const role = ((item as any).role as 'system' | 'user' | 'assistant') ?? 'user';
          const content = this.normalizeContent((item as any).content || []);
          
          const canonicalInputMessage: CanonicalInputMessage = {
            type: 'message',
            role,
            content
          };
          inputItems.push(canonicalInputMessage);
          
          // Also add to messages array for backward compatibility
          messages.push({ role, content });
          
        } else if (itemType === 'reasoning') {
          // Convert to canonical reasoning message
          const canonicalReasoningMessage: CanonicalReasoningMessage = {
            type: 'reasoning',
            summary: (item as any).summary,
            content: (item as any).content,
            encrypted_content: (item as any).encrypted_content,
            role: undefined
          };
          inputItems.push(canonicalReasoningMessage);
          
          // Also set thinking field
          thinking = {
            enabled: true,
            summary: (item as any).summary,
            content: (item as any).content,
            encrypted_content: (item as any).encrypted_content
          };
        }
      }
      
      canonicalInput = inputItems;
    }

    // 3) Generation controls & other knobs
    const maxTokens = (input as any).max_output_tokens ?? (input as any).max_tokens;
    const temperature = (input as any).temperature;
    const topP = (input as any).top_p;

    // Stop sequences can be string or string[] in some clients
    let stopSequences: string[] | undefined = undefined;
    const stopAny = (input as any).stop ?? (input as any).stop_sequences;
    if (Array.isArray(stopAny)) stopSequences = stopAny;
    else if (typeof stopAny === 'string') stopSequences = [stopAny];

    // 4) Map Responses-specific fields to canonical
    const store = (input as any).store;
    const parallelToolCalls = (input as any).parallel_tool_calls;
    const reasoning = (input as any).reasoning;
    const reasoningEffort = (input as any).reasoning_effort;
    const promptCacheKey = (input as any).prompt_cache_key;
    const tools = (input as any).tools;
    const toolChoice = (input as any).tool_choice;
    const responseFormat = (input as any).response_format;
    const include = (input as any).include as string[] | undefined;
    const modalities = (input as any).modalities;
    const audio = (input as any).audio;
    const seed = (input as any).seed;

    // 5) Preserve any other unknown fields in metadata
    const metadata: Record<string, any> = {
      useResponsesAPI: true,
      // Map prompt_cache_key to cache_ref for canonical compatibility
      cache_ref: promptCacheKey,
      // Preserve any other unknown fields
      ...Object.fromEntries(
        Object.entries(input).filter(([key]) =>
          ![
            'model',
            'input',
            'instructions',
            'stream',
            'temperature',
            'max_output_tokens',
            'max_tokens',
            'top_p',
            'stop',
            'stop_sequences',
            'store',
            'parallel_tool_calls',
            'reasoning',
            'reasoning_effort',
            'prompt_cache_key',
            'tools',
            'tool_choice',
            'response_format',
            'include',
            'modalities',
            'audio',
            'seed',
          ].includes(key)
        )
      )
    };

    return {
      model: (input as any).model,
      messages,
      input: canonicalInput,
      system: systemPrompt,
      maxTokens,
      temperature,
      topP,
      stopSequences,
      stream: !!input.stream,
      store,
      parallelToolCalls,
      reasoning: reasoning, // Keep the top-level reasoning field as-is
      reasoningEffort,
      tools,
      toolChoice,
      responseFormat,
      include: include as any,
      modalities,
      audio,
      seed,
      promptCacheKey,
      metadata
    } as unknown as CanonicalRequest;
  }

  fromCanonical(response: CanonicalResponse): OpenAIResponsesResponse {
    const textContent = response.message.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');

    // Populate output blocks in addition to output_text for better compatibility
    const outputBlocks = response.message.content.map(c => {
      if (c.type === 'text') {
        return { type: 'text', text: c.text };
      }
      // Fallback: unknown types rendered as empty text to keep structure valid
      return { type: 'text', text: '' };
    });

    return {
      id: response.id,
      object: 'response',
      created: response.created,
      model: response.model,
      output_text: textContent,
      output: [{ content: outputBlocks }],
      usage: {
        input_tokens: response.usage.inputTokens,
        output_tokens: response.usage.outputTokens,
        total_tokens: response.usage.totalTokens
      }
    } as OpenAIResponsesResponse;
  }

  fromCanonicalStream(chunk: CanonicalStreamChunk): string {
    // Map canonical text deltas to Responses API stream-like event lines
    const textDelta = chunk.delta.content
      ?.filter(c => c.type === 'text')
      ?.map(c => c.text)
      ?.join('') || '';

    const lines: string[] = [];

    if (textDelta) {
      // Responses API uses SSE events; this is a best-effort mapping
      const evt = { type: 'response.output_text.delta', delta: textDelta } as const;
      lines.push(`data: ${JSON.stringify(evt)}\n\n`);
    }

    if (chunk.finishReason) {
      // Emit usage info when we finalize
      if (chunk.usage) {
        const usageEvt = {
          type: 'response.usage',
          usage: {
            input_tokens: chunk.usage.inputTokens || 0,
            output_tokens: chunk.usage.outputTokens || 0,
            total_tokens: (chunk.usage.inputTokens || 0) + (chunk.usage.outputTokens || 0)
          }
        } as const;
        lines.push(`data: ${JSON.stringify(usageEvt)}\n\n`);
      }

      const done = { type: 'response.completed', finish_reason: chunk.finishReason } as const;
      lines.push(`data: ${JSON.stringify(done)}\n\n`);
    }

    return lines.join('');
  }

  private normalizeContent(content: unknown): CanonicalContent[] {
    // Accept string or array of blocks with { type, text? }
    if (typeof content === 'string') {
      return [{ type: 'text', text: content }];
    }
    if (Array.isArray(content)) {
      return (content as Array<{ type: string; text?: string }>).flatMap(part => {
        if (part?.type === 'input_text' || part?.type === 'text' || part?.type === 'output_text') {
          return [{ type: part.type === 'output_text' ? 'output_text' : 'text', text: part.text || '' } as CanonicalContent];
        }
        return [];
      });
    }
    return [];
  }
}
