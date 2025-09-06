/* eslint-disable */

/**
 * Universal schema for AI provider streaming responses - superset of all streaming capabilities
 */
export type CanonicalAIStreamingResponseSchema =
  | {
      schema_version: '1.0.1';
      stream_type: 'canonical';
      event:
        | {
            type: 'message_start';
            id?: string;
            model?: string;
          }
        | {
            type: 'content_delta';
            part: 'text' | 'tool_call' | 'thinking';
            value: string;
          }
        | {
            type: 'tool_call';
            name: string;
            arguments_json: string;
            id?: string;
          }
        | {
            type: 'usage';
            input_tokens?: number;
            output_tokens?: number;
            prompt_tokens?: number;
            completion_tokens?: number;
          }
        | {
            type: 'complete';
            finish_reason: 'stop' | 'length' | 'tool_call' | 'content_filter' | 'safety' | 'unknown';
          }
        | {
            type: 'error';
            code?: string;
            message: string;
          };
      provider_raw?: {
        [k: string]: unknown;
      };
    }
  | {
      schema_version: '1.0.1';
      stream_type: 'openai';
      id: string;
      object: 'chat.completion.chunk';
      created: number;
      model: string;
      system_fingerprint?: string;
      /**
       * @minItems 1
       */
      choices: [StreamingChoice, ...StreamingChoice[]];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    }
  | {
      schema_version: '1.0.1';
      stream_type: 'anthropic';
      event: AnthropicEvent;
    };
export type AnthropicEvent =
  | {
      type: 'message_start';
      message: {
        id: string;
        type: 'message';
        role: 'assistant';
        content: unknown[];
        model: string;
        stop_reason: null;
        stop_sequence: null;
        usage: {
          input_tokens: number;
          output_tokens: number;
        };
      };
    }
  | {
      type: 'content_block_start';
      index: number;
      content_block:
        | {
            type: 'text';
            text: string;
          }
        | {
            type: 'tool_use';
            id: string;
            name: string;
            input: {
              [k: string]: unknown;
            };
          };
    }
  | {
      type: 'content_block_delta';
      index: number;
      delta:
        | {
            type: 'text_delta';
            text: string;
          }
        | {
            type: 'input_json_delta';
            partial_json: string;
          }
        | {
            type: 'citations_delta';
            citations: {
              [k: string]: unknown;
            }[];
          };
    }
  | {
      type: 'content_block_stop';
      index: number;
    }
  | {
      type: 'message_delta';
      delta: {
        stop_reason?: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
        stop_sequence?: string;
      };
      usage: {
        output_tokens: number;
      };
    }
  | {
      type: 'message_stop';
    }
  | {
      type: 'ping';
    };

export interface StreamingChoice {
  index: number;
  delta?: {
    role?: string;
    content?: string;
    tool_calls?: {
      id?: string;
      index?: number;
      type?: 'function';
      function?: {
        name?: string;
        arguments?: string;
      };
    }[];
    function_call?: {
      name?: string;
      arguments?: string;
    };
  };
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
    | null;
}
