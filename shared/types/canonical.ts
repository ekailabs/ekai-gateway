// Canonical format - Universal internal representation for AI requests/responses
// This format serves as the common interface between different AI provider formats

export interface CanonicalContent {
  type: 'text' | 'input_text' | 'output_text';
  text: string;
}

export interface CanonicalMessage {
  role: 'system' | 'user' | 'assistant';
  content: CanonicalContent[];
}

// Extended message types for complex provider formats
export interface CanonicalReasoningMessage {
  type: 'reasoning';
  summary?: any[];
  content?: any;
  encrypted_content?: string;
  role?: undefined; // reasoning messages don't have roles
}

export interface CanonicalInputMessage {
  type: 'message';
  role: 'system' | 'user' | 'assistant';
  content: CanonicalContent[];
}

export type CanonicalInputItem = CanonicalInputMessage | CanonicalReasoningMessage;

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
  // Complex input structure for advanced providers (like OpenAI Responses)
  input?: string | CanonicalInputItem[];
  system?: string; // System prompt/instructions
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
  stream?: boolean;
  // OpenAI Responses API fields
  store?: boolean;
  parallelToolCalls?: boolean;
  reasoning?: {
    enabled?: boolean;
    budget?: number;
  };
  reasoningEffort?: 'low' | 'medium' | 'high';
  // Additional provider fields
  tools?: any[];
  toolChoice?: any;
  responseFormat?: any;
  modalities?: string[];
  audio?: any;
  seed?: number;
  promptCacheKey?: string;
  include?: string[];
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