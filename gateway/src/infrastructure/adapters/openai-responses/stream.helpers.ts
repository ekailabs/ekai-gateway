import { StreamingResponse as CanonicalStreamingResponse } from '../../../canonical/types/index.js';

export function buildCanonicalChunk(event: Record<string, any>): CanonicalStreamingResponse {
  return {
    schema_version: '1.0.1',
    stream_type: 'canonical',
    event
  } as CanonicalStreamingResponse;
}

export function attachProviderRaw(
  chunk: CanonicalStreamingResponse,
  raw: { event?: string; data?: any; raw_event?: string; raw_data?: string }
): CanonicalStreamingResponse {
  (chunk as any).provider_raw = {
    event: raw.event,
    data: raw.data,
    raw_event: raw.raw_event,
    raw_data: raw.raw_data
  };
  return chunk;
}

export function normalizeProviderStream(stream: any): string {
  if (typeof stream === 'string') return stream;
  if (stream instanceof Uint8Array) return new TextDecoder('utf-8').decode(stream);
  if (Array.isArray(stream)) return new TextDecoder('utf-8').decode(new Uint8Array(stream));
  return stream && typeof stream === 'object' && 'toString' in stream ? String(stream) : '';
}

export function mapFinishReasonFromResponsesStatus(status?: string): any {
  if (status === 'completed') return 'stop';
  if (status === 'incomplete') return 'length';
  return undefined;
}

