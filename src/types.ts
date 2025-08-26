export interface ChatCompletionRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  model: string;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  [key: string]: any;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface Model {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  pricing?: {
    prompt: string;
    completion: string;
  };
}

export interface ModelsResponse {
  object: string;
  data: Model[];
}

export interface AIProvider {
  name: string;
  isConfigured(): boolean;
  chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
  getModels(): Promise<ModelsResponse>;
}

export type ProviderName = 'openai' | 'openrouter';