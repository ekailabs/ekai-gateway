/* eslint-disable */

/**
 * Universal canonical schema for AI provider streaming responses - superset of all streaming capabilities
 */
export type CanonicalAIStreamingResponseSchema = {
      schema_version: '1.0.1';
      stream_type: 'canonical';
      event:
        | {
        type: 'response_created';
            id?: string;
            model?: string;
        created?: number;
        response?: {
      id: string;
          object: 'response';
          created_at: number;
          status: 'in_progress';
          background?: boolean;
          error?: null;
          incomplete_details?: null;
          instructions?: string | null;
          max_output_tokens?: number | null;
          max_tool_calls?: number | null;
          model?: string;
          output?: unknown[];
          parallel_tool_calls?: boolean;
          previous_response_id?: string | null;
          precompt_cache_key?: string | null;
          reasoning?: {
            effort: 'low' | 'medium' | 'high';
            summary: string | null;
          } | null;
          safety_identifier?: string | null;
          service_tier?: string | null;
          store?: boolean;
      usage?: {
            input_tokens: number;
            output_tokens: number;
            reasoning_tokens?: number;
          } | null;
        };
        message?: {
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
        type: 'content_delta';
        part: 'text' | 'tool_call' | 'thinking';
        value: string;
        delta?: string;
        index?: number;
        content_block?: {
            type: 'text';
            text: string;
        } | {
          type: 'tool_use';
          id: string;
          name: string;
          input: { [k: string]: unknown };
        };
      }
    | {
        type: 'output_text_done';
        text?: string;
        annotations?: unknown[];
        logprobs?: unknown[];
      }
    | {
        type: 'refusal_delta';
        delta?: string;
        refusal?: string;
      }
    | {
        type: 'refusal_done';
        refusal?: string;
      }
    | {
        type: 'function_call_arguments_delta';
        call_id?: string;
        delta?: string;
        arguments?: string;
      }
    | {
        type: 'function_call_arguments_done';
        call_id?: string;
        arguments?: string;
      }
    | {
        type: 'function_call_output';
        call_id?: string;
        output?: string;
      }
    | {
        type: 'reasoning_summary_text_delta';
        delta?: string;
        summary?: string;
      }
    | {
        type: 'reasoning_summary_text_done';
        summary?: string;
      }
    | {
        type: 'content_part_start';
        index: number;
        content_block: {
          type: 'text';
          text: string;
        } | {
            type: 'tool_use';
            id: string;
            name: string;
          input: { [k: string]: unknown };
          };
    }
  | {
        type: 'content_part_done';
      index: number;
      }
    | {
        type: 'output_item_added';
        output_index: number;
        item: {
          id: string;
          status: 'in_progress' | 'completed';
          type: 'message' | 'reasoning';
          role?: 'assistant';
          content: unknown[];
        };
        sequence_number?: number;
      }
    | {
        type: 'output_item_done';
        output_index?: number;
        item?: {
          id: string;
          type: 'message';
          status: 'completed';
          content: {
            type: 'output_text';
            annotations: unknown[];
            logprobs: unknown[];
            text: string;
          }[];
          role: 'assistant';
        };
      }
    | {
        type: 'tool_call_start';
        name: string;
        arguments_json: string;
        id?: string;
        call_id?: string;
        index?: number;
        function?: {
          name?: string;
          arguments?: string;
        };
      }
    | {
        type: 'function_call_start';
        name: string;
        arguments_json: string;
        id?: string;
        call_id?: string;
        arguments?: string;
      }
    | {
        type: 'usage';
        input_tokens?: number;
        output_tokens?: number;
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        reasoning_tokens?: number;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          reasoning_tokens?: number;
        };
      }
    | {
        type: 'response_completed';
        finish_reason?: 'stop' | 'length' | 'tool_call' | 'content_filter' | 'safety' | 'unknown' | 'tool_calls' | 'function_call' | 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
        response?: {
          id: string;
          object: 'response';
          created_at: number;
          status: 'completed';
          background: boolean;
          error: null;
          incomplete_details: null;
          instructions: string | null;
          max_output_tokens: number | null;
          max_tool_calls: number | null;
          model: string;
          output: {
            id: string;
            type: 'message' | 'reasoning';
            status?: 'completed';
            content?: {
              type: 'output_text';
              annotations: unknown[];
              logprobs: unknown[];
              text: string;
            }[];
            role?: 'assistant';
            summary?: unknown[];
          }[];
          parallel_tool_calls: boolean;
          previous_response_id: string | null;
          precompt_cache_key: string | null;
          reasoning: {
            effort: 'low' | 'medium' | 'high';
            summary: string | null;
          } | null;
          safety_identifier: string | null;
          service_tier: string | null;
          store: boolean;
          usage: {
            input_tokens: number;
            output_tokens: number;
            reasoning_tokens?: number;
          };
        };
        delta?: {
          stop_reason?: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
          stop_sequence?: string;
        };
    }
  | {
      type: 'message_delta';
      delta: {
        stop_reason?: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
        stop_sequence?: string;
      };
        usage?: {
        output_tokens: number;
      };
    }
  | {
        type: 'message_done';
    }
  | {
      type: 'ping';
      }
    | {
        type: 'file_search_start';
        call_id: string;
        tool_call_id?: string;
        file_search?: {
          status: 'in_progress';
          query?: string;
        };
      }
    | {
        type: 'file_search_progress';
        call_id: string;
        tool_call_id?: string;
        file_search?: {
          status: 'searching';
          query?: string;
          results?: unknown[];
        };
      }
    | {
        type: 'file_search_done';
        call_id: string;
        tool_call_id?: string;
        file_search?: {
          status: 'completed';
          query?: string;
          results?: {
            id: string;
            name: string;
    content?: string;
            url?: string;
            created_at?: number;
            updated_at?: number;
            size?: number;
            mime_type?: string;
          }[];
        };
      }
    | {
        type: 'error';
        code?: string;
        message: string;
        error?: {
          code: string;
          message: string;
        };
      };
  provider_raw?: {
    [k: string]: unknown;
  };
};
