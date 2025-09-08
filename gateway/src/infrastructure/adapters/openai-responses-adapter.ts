// Minimal adapter for OpenAI Responses API request/response shapes
// Converts between Responses API and canonical format used internally.
import {
  CanonicalRequest,
  CanonicalResponse,
  CanonicalStreamChunk,
  CanonicalContent,
  CanonicalMessage,
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

    // Normalize input to canonical messages
    if (typeof input.input === 'string') {
      messages.push({
        role: 'user',
        content: [{ type: 'text', text: input.input }] as CanonicalContent[],
      });
    } else if (Array.isArray(input.input)) {
      for (const item of input.input) {
        const role = item.role ?? 'user';
        const parts: CanonicalContent[] = [];
        for (const c of item.content || []) {
          if (c.type === 'input_text' || c.type === 'text') {
            parts.push({ type: 'text', text: c.text || '' });
          }
        }
        messages.push({ role, content: parts });
      }
    }

    return {
      model: (input as any).model,
      messages,
      maxTokens: (input as any).max_output_tokens ?? (input as any).max_tokens,
      temperature: input.temperature,
      stream: !!input.stream,
      metadata: { useResponsesAPI: true }
    } as unknown as CanonicalRequest;
  }

  fromCanonical(response: CanonicalResponse): OpenAIResponsesResponse {
    const textContent = response.message.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');

    return {
      id: response.id,
      object: 'response',
      created: response.created,
      model: response.model,
      output_text: textContent,
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

    if (textDelta) {
      // Responses API uses SSE events; this is a best-effort mapping
      const evt = { type: 'response.output_text.delta', delta: textDelta };
      return `data: ${JSON.stringify(evt)}\n\n`;
    }

    if (chunk.finishReason) {
      const done = { type: 'response.completed' };
      return `data: ${JSON.stringify(done)}\n\n`;
    }

    return '';
  }
}
