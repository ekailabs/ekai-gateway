import { CanonicalRequest, CanonicalResponse, ModelsResponse } from 'shared/types/index.js';
import { Response } from 'node-fetch';

// Proper interface with all required methods
export interface AIProvider {
  readonly name: string;
  isConfigured(): boolean;
  chatCompletion(request: CanonicalRequest): Promise<CanonicalResponse>;
  getStreamingResponse(request: CanonicalRequest): Promise<Response>;
  getModels(): Promise<ModelsResponse>;
}

// Type-safe provider transformation interfaces
export interface ProviderRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  [key: string]: unknown;
}

export interface ProviderResponse {
  id: string;
  model: string;
  created?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  [key: string]: unknown;
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