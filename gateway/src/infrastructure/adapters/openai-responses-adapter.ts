// Minimal adapter for OpenAI Responses API request/response shapes
// Converts between Responses API and canonical schema format used internally.
import { FormatAdapter } from '../../canonical/format-adapter.js';
import { Request as CanonicalRequest, Response as CanonicalResponse, StreamingResponse as CanonicalStreamingResponse } from '../../canonical/types/index.js';
import { providerToCanonical, canonicalToProvider } from './openai-responses/stream.map.js';
import { normalizeProviderStream, buildCanonicalChunk } from './openai-responses/stream.helpers.js';
import { encodeRequestToCanonical as mapReqToCanonical, decodeCanonicalRequest as mapCanonicalToReq } from './openai-responses/requests.map.js';

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
    return mapReqToCanonical(clientRequest as any);
  }

  decodeCanonicalRequest(canonicalRequest: CanonicalRequest): any {
    return mapCanonicalToReq(canonicalRequest);
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
    const text = normalizeProviderStream(providerStream);
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
        const doneChunk = buildCanonicalChunk({
          type: 'response_completed',
          finish_reason: 'stop'
        });
        (doneChunk as any).provider_raw = {
          event: currentEvent || undefined,
          raw_event: currentEvent ? `event: ${currentEvent}` : undefined,
          raw_data: 'data: [DONE]'
        };
        chunks.push(doneChunk);
        break;
      }

      try {
        const data = JSON.parse(dataStr);
        const eventType = data?.type || currentEvent;
        if (!eventType) {
          continue;
        }

        const handler = providerToCanonical[eventType];
        let canonicalChunks: CanonicalStreamingResponse[] = [];
        if (handler) {
          const result = handler(data);
          canonicalChunks = Array.isArray(result)
            ? (result.filter(Boolean) as CanonicalStreamingResponse[])
            : result
              ? [result as CanonicalStreamingResponse]
              : [];
        }

        // Unknown or unhandled event: emit provider_raw-only canonical chunk so we can reconstruct exactly
        if (!handler || canonicalChunks.length === 0) {
          const fallback = buildCanonicalChunk({ type: 'unknown_event', event_type: eventType });
          (fallback as any).provider_raw = {
            event: eventType,
            data,
            raw_event: currentEvent ? `event: ${currentEvent}` : undefined,
            raw_data: `data: ${dataStr}`
          };
          chunks.push(fallback);
          continue;
        }

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

    const handler = canonicalToProvider[event.type];
    const payload = handler ? handler(event) : null;
    if (!payload) {
      return '';
    }

    return `event: ${payload.event}\ndata: ${JSON.stringify(payload.data)}\n\n`;
  }

}
