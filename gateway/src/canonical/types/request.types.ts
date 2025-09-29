/* eslint-disable */

export type InputContent = TextInput | ImageInput | AudioInput | VideoInput | DocumentInput | ToolResultInput;
export type ToolChoice =
  | ('auto' | 'none' | 'any' | 'required')
  | {
      type: 'function';
      function: {
        name: string;
      };
      allow_parallel?: boolean;
    }
  | {
      type: 'tool';
      name: string;
      allow_parallel?: boolean;
    };
export type ResponseFormat =
  | ('text' | 'json' | 'json_object')
  | {
      type: 'json_schema';
      json_schema: {
        name: string;
        description?: string;
        schema: {
          [k: string]: unknown;
        };
        strict?: boolean;
      };
    };

/**
 * Universal schema for AI provider requests, superset of all input capabilities
 */
export type IncludeItem =
  | 'web_search_call.action.sources'
  | 'code_interpreter_call.outputs'
  | 'computer_call_output.output.image_url'
  | 'file_search_call.results'
  | 'message.input_image.image_url'
  | 'message.output_text.logprobs'
  | 'reasoning.encrypted_content';

export interface CanonicalAIRequestSchema {
  schema_version: '1.0.1';
  model: string;
  /**
   * @minItems 1
   */
  messages: [Message, ...Message[]];
  system?: string | InputContent[];
  generation?: {
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    top_k?: number;
    stop?: string | string[];
    seed?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    n?: number;
    logprobs?: boolean;
    top_logprobs?: number;
    logit_bias?: {
      /**
       * This interface was referenced by `undefined`'s JSON-Schema definition
       * via the `patternProperty` "^\d+$".
       */
      [k: string]: number;
    };
    /**
     * @maxItems 64
     */
    stop_sequences?: string[];
  };
  tools?: Tool[];
  tool_choice?: ToolChoice;
  parallel_tool_calls?: boolean;
  functions?: {
    name: string;
    description?: string;
    parameters?: {
      [k: string]: unknown;
    };
  }[];
  function_call?:
    | ('auto' | 'none')
    | {
        name: string;
      };
  response_format?: ResponseFormat;
  /**
   * Specify additional output data to include in the model response
   * Mirrors OpenAI Responses API include array
   */
  include?: IncludeItem[];
  safety_settings?: SafetySettings[];
  candidate_count?: number;
  stream?: boolean;
  stream_options?: {
    include_usage?: boolean;
  };
  store?: boolean;
  service_tier?: 'auto' | 'default' | 'scale' | 'flex' | 'priority' | null;
  reasoning_effort?: 'low' | 'medium' | 'high' | 'minimal';
  modalities?: ('text' | 'audio')[];
  audio?: {
    voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
    format?: 'wav' | 'mp3' | 'flac' | 'aac' | 'opus' | 'pcm16';
  };
  prediction?: {
    type: 'content';
    content: string | InputContent[];
  };
  tier?: 'priority' | 'standard';
  thinking?: {
    enabled?: boolean;
    budget?: number;
    // OpenAI Responses reasoning fields
    summary?: any[];
    content?: any;
    encrypted_content?: string;
  };
  betas?: string[];
  extra_headers?: {
    [k: string]: string;
  };
  timeout?: number;
  user?: string;
  context?: {
    previous_response_id?: string;
    cache_ref?: string;
    provider_state?: {
      [k: string]: unknown;
    };
  };
  attachments?: {
    id: string;
    name: string;
    content_type?: string;
    size?: number;
    url?: string;
  }[];
  provider_params?: {
    openai?: {
      [k: string]: unknown;
    };
    anthropic?: {
      [k: string]: unknown;
    };
    gemini?: {
      [k: string]: unknown;
    };
  };
  meta?: {
    user_id?: string;
    session_id?: string;
    tags?: string[];
    [k: string]: unknown;
  };
}
export interface Message {
  role: 'user' | 'assistant' | 'tool';
  content: string | [InputContent, ...InputContent[]];
  name?: string;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }[];
}
export interface TextInput {
  type: 'text';
  text: string;
}
export interface ImageInput {
  type: 'image';
  source:
    | {
        type: 'base64';
        media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
        data: string;
      }
    | {
        type: 'url';
        url: string;
      };
}
export interface AudioInput {
  type: 'audio';
  source:
    | {
        type: 'base64';
        media_type: 'audio/wav' | 'audio/mp3' | 'audio/aac' | 'audio/ogg' | 'audio/flac';
        data: string;
      }
    | {
        type: 'url';
        url: string;
      };
}
export interface VideoInput {
  type: 'video';
  source:
    | {
        type: 'base64';
        media_type: 'video/mp4' | 'video/mpeg' | 'video/quicktime' | 'video/webm';
        data: string;
      }
    | {
        type: 'url';
        url: string;
      };
}
export interface DocumentInput {
  type: 'document';
  source:
    | {
        type: 'base64';
        media_type: 'application/pdf' | 'text/plain' | 'text/html' | 'text/markdown';
        data: string;
      }
    | {
        type: 'url';
        url: string;
      };
}
export interface ToolResultInput {
  type: 'tool_result';
  tool_use_id: string;
  content: string | InputContent[];
  is_error?: boolean;
}
export interface Tool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: {
      [k: string]: unknown;
    };
    strict?: boolean;
  };
}
export interface SafetySettings {
  category:
    | 'HARM_CATEGORY_HARASSMENT'
    | 'HARM_CATEGORY_HATE_SPEECH'
    | 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
    | 'HARM_CATEGORY_DANGEROUS_CONTENT'
    | 'HARM_CATEGORY_UNSPECIFIED';
  threshold: 'BLOCK_NONE' | 'BLOCK_ONLY_HIGH' | 'BLOCK_MEDIUM_AND_ABOVE' | 'BLOCK_LOW_AND_ABOVE';
}
