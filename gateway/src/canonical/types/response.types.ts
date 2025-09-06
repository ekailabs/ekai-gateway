/* eslint-disable */

export type OutputContent =
  | TextOutput
  | ThinkingOutput
  | ToolUseOutput
  | CodeExecutionOutput
  | WebSearchOutput
  | CitationOutput;

/**
 * Universal schema for AI provider responses - superset of all output capabilities
 */
export interface CanonicalAIResponseSchema {
  schema_version: '1.0.1';
  id: string;
  model: string;
  created: number;
  /**
   * @minItems 1
   */
  choices: [Choice, ...Choice[]];
  candidates?: Choice[];
  usage?: Usage;
  system_fingerprint?: string;
  service_tier_utilized?: 'default' | 'scale' | 'auto' | 'flex' | 'priority';
  object?: string;
  type?: string;
  role?: string;
  stop_reason?: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
  stop_sequence?: string;
  provider?: 'openai' | 'anthropic' | 'gemini';
  provider_raw?: {
    [k: string]: unknown;
  };
  safety_feedback?: {
    category:
      | 'HARM_CATEGORY_HARASSMENT'
      | 'HARM_CATEGORY_HATE_SPEECH'
      | 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
      | 'HARM_CATEGORY_DANGEROUS_CONTENT';
    probability: 'NEGLIGIBLE' | 'LOW' | 'MEDIUM' | 'HIGH';
    blocked?: boolean;
  }[];
  metadata?: {
    provider?: string;
    original_model?: string;
    processing_time?: number;
    [k: string]: unknown;
  };
}
export interface Choice {
  index: number;
  message: Message;
  finish_reason?:
    | 'stop'
    | 'length'
    | 'tool_calls'
    | 'content_filter'
    | 'function_call'
    | 'end_turn'
    | 'max_tokens'
    | 'stop_sequence'
    | 'tool_use'
    | 'error'
    | 'recitation'
    | 'safety';
  tool_calls?: {
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }[];
  logprobs?: {
    content?: {
      token: string;
      logprob: number;
      bytes?: number[];
      top_logprobs?: {
        token: string;
        logprob: number;
        bytes?: number[];
      }[];
    }[];
  };
  safety_ratings?: {
    category:
      | 'HARM_CATEGORY_HARASSMENT'
      | 'HARM_CATEGORY_HATE_SPEECH'
      | 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
      | 'HARM_CATEGORY_DANGEROUS_CONTENT';
    probability: 'NEGLIGIBLE' | 'LOW' | 'MEDIUM' | 'HIGH';
    blocked?: boolean;
  }[];
}
export interface Message {
  role: 'assistant';
  /**
   * @minItems 1
   */
  content: [OutputContent, ...OutputContent[]];
}
export interface TextOutput {
  type: 'text';
  text: string;
  annotations?: {
    citations?: Citation[];
  };
}
export interface Citation {
  url: string;
  title?: string;
  start_index?: number;
  end_index?: number;
  confidence?: number;
}
export interface ThinkingOutput {
  type: 'thinking';
  thinking: string;
}
export interface ToolUseOutput {
  type: 'tool_use';
  id: string;
  name: string;
  input:
    | {
        [k: string]: unknown;
      }
    | string
    | unknown[]
    | null;
}
export interface CodeExecutionOutput {
  type: 'code_execution';
  language: string;
  code: string;
  output?: string;
  error?: string;
  execution_time?: number;
}
export interface WebSearchOutput {
  type: 'web_search';
  query: string;
  results: {
    url: string;
    title: string;
    snippet?: string;
    relevance_score?: number;
  }[];
}
export interface CitationOutput {
  type: 'citation';
  sources: Citation[];
}
export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
    audio_tokens?: number;
    accepted_prediction_tokens?: number;
    rejected_prediction_tokens?: number;
  };
  predictions?: {
    accepted_tokens?: number;
    rejected_tokens?: number;
  };
  provider_breakdown?: {
    [k: string]:
      | number
      | string
      | {
          [k: string]: unknown;
        }
      | null;
  };
  prompt_tokens_details?: {
    cached_tokens?: number;
    audio_tokens?: number;
  };
}
