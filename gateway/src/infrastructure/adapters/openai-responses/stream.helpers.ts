import { StreamingResponse as CanonicalStreamingResponse } from '../../../canonical/types/index.js';

export function buildCanonicalChunk(event: Record<string, any>): CanonicalStreamingResponse {
  return {
    schema_version: '1.0.1',
    stream_type: 'canonical',
    event
  } as CanonicalStreamingResponse;
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
