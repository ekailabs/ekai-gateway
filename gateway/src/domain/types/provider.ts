import { Request as CanonicalRequest, Response as CanonicalResponse } from '../../canonical/types/index.js';
import { Response as NodeFetchResponse } from 'node-fetch';

// Proper interface with all required methods
export interface AIProvider {
  readonly name: string;
  isConfigured(): boolean;
  chatCompletion(request: CanonicalRequest): Promise<CanonicalResponse>;
  getStreamingResponse(request: CanonicalRequest): Promise<NodeFetchResponse>;
}

// Type-safe provider transformation interfaces
export interface ProviderRequest {
  [key: string]: any;
}

export interface ProviderResponse {
  [key: string]: any;
}

// HTTP status constants
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500
} as const;

// Content type constants
export const CONTENT_TYPES = {
  JSON: 'application/json',
  TEXT_PLAIN: 'text/plain',
  EVENT_STREAM: 'text/event-stream'
} as const;