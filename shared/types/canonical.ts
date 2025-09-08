// Canonical format - Universal internal representation for AI requests/responses
// This format serves as the common interface between different AI provider formats

export interface CanonicalContent {
  type: 'text';
  text: string;
}

export interface CanonicalMessage {
  role: 'system' | 'user' | 'assistant';
  content: CanonicalContent[];
}

export interface CanonicalUsage {
  inputTokens: number;
  cacheWriteInputTokens?: number;
  cacheReadInputTokens?: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CanonicalRequest {
  model: string;
  messages: CanonicalMessage[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
  stream?: boolean;
  metadata?: Record<string, any>; // Provider-specific fields
}

export interface CanonicalResponse {
  id: string;
  model: string;
  created: number;
  message: {
    role: 'assistant';
    content: CanonicalContent[];
  };
  finishReason: 'stop' | 'length' | 'tool_calls' | 'error';
  usage: CanonicalUsage;
}

export interface CanonicalStreamChunk {
  id: string;
  model: string;
  created: number;
  delta: {
    role?: 'assistant';
    content?: CanonicalContent[];
  };
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'error';
  usage?: CanonicalUsage;
}

export interface FormatAdapter<ClientRequest, ClientResponse> {
  toCanonical(input: ClientRequest): CanonicalRequest;
  fromCanonical(response: CanonicalResponse): ClientResponse;
  fromCanonicalStream(chunk: CanonicalStreamChunk): string;
}