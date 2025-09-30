/* eslint-disable */

/**
 * Universal canonical schema for AI provider streaming responses - superset of all streaming capabilities
 * Notes:
 * - Maps OpenAI Responses + Anthropic Messages.
 * - Anthropic `message_start/stop`, `content_block_*`, `thinking_delta`, and `signature_delta` are covered via:
 *   - `response_created/response_completed` (lifecycle)
 *   - `content_part_start/content_part_done` (block start/stop)
 *   - `content_delta` with part: 'thinking' (thinking tokens)
 * - OpenAI tool/file/web search families covered with *_start/progress/done.
 */

export type CanonicalAIStreamingResponseSchema = {
      schema_version: '1.0.1';
      stream_type: 'canonical';

      event:
    // ────────────────────────────────────────────────────────────────────────────
    // LIFECYCLE (OpenAI: response.created/response.completed/response.error,
    //            Anthropic: message_start/message_stop)
    // ────────────────────────────────────────────────────────────────────────────
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
          /** Corrected name (typo): */
          precompute_cache_key?: string | null;
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
        /** Anthropic-parity placeholder (present when providers expose a message object) */
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
        type: 'response_completed';
        finish_reason?:
          | 'stop'
          | 'length'
          | 'tool_call'
          | 'content_filter'
          | 'safety'
          | 'unknown'
          | 'tool_calls'
          | 'function_call'
          | 'end_turn'
          | 'max_tokens'
          | 'stop_sequence'
          | 'tool_use';
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
          precompute_cache_key: string | null;
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
        /** Anthropic-like terminal deltas (stop_reason/sequence) */
        delta?: {
          stop_reason?: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
          stop_sequence?: string;
        };
      }
    | {
        /** Anthropic: message_delta (periodic cumulative usage / terminal flags) */
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
        /** Anthropic: message_stop equivalent */
        type: 'message_done';
      }
    | {
        /** Anthropic keepalive */
        type: 'ping';
      }

    // ────────────────────────────────────────────────────────────────────────────
    // CONTENT/TEXT (OpenAI: output_text.*, content_part.*, output_item.*)
    //               Anthropic: content_block_start/delta/stop, text_delta, thinking_delta
    // ────────────────────────────────────────────────────────────────────────────
    | {
        /** General streaming delta:
         *  part:
         *   - 'text'      → normal text tokens (OpenAI output_text.delta / Anthropic text_delta)
         *   - 'tool_call' → tool/function arg tokens (Anthropic input_json_delta analogue)
         *   - 'thinking'  → Anthropic thinking_delta
         */
        type: 'content_delta';
        part: 'text' | 'tool_call' | 'thinking';
        value: string;
        delta?: string;
        index?: number;
        content_block?:
          | {
              type: 'text';
              text: string;
            }
          | {
              type: 'tool_use';
              id: string;
              name: string;
              input: { [k: string]: unknown };
            };
      }
    | {
        /** Anthropic integrity signature for thinking stream (NEW) */
        type: 'thinking_signature_delta';
        index?: number;
        delta?: string;
        signature?: string;
      }
    | {
        /** OpenAI: output_text.done */
        type: 'output_text_done';
        text?: string;
        annotations?: unknown[];
        logprobs?: unknown[];
      }
    | {
        /** OpenAI: output_text.annotation.added */
        type: 'output_text_annotation_added';
        annotation?: unknown;
        text?: string;
      }
    | {
        /** OpenAI: content_part.added (Anthropic: content_block_start) */
        type: 'content_part_start';
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
              input: { [k: string]: unknown };
          };
    }
  | {
        /** OpenAI: content_part.done (Anthropic: content_block_stop) */
        type: 'content_part_done';
      index: number;
      }
    | {
        /** OpenAI: output_item.added */
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
        /** OpenAI: output_item.done */
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

    // ────────────────────────────────────────────────────────────────────────────
    // REFUSAL (OpenAI has explicit refusal.*; Anthropic uses stop_reason="refusal")
    // ────────────────────────────────────────────────────────────────────────────
    | {
        type: 'refusal_delta';
        delta?: string;
        refusal?: string;
      }
    | {
        type: 'refusal_done';
        refusal?: string;
      }

    // ────────────────────────────────────────────────────────────────────────────
    // FUNCTION / TOOL CALLING (OpenAI function/mcp/code-interpreter; Anthropic tool_use)
    // ────────────────────────────────────────────────────────────────────────────
    | {
        /** Token-by-token function args (OpenAI: response.function_call.arguments.delta) */
        type: 'function_call_arguments_delta';
        call_id?: string;
        delta?: string;
        arguments?: string;
      }
    | {
        /** End of function args (OpenAI: response.function_call.arguments.done) */
        type: 'function_call_arguments_done';
        call_id?: string;
        arguments?: string;
      }
    | {
        /** Tool output return (provider-agnostic) */
        type: 'function_call_output';
        call_id?: string;
        output?: string;
      }
    | {
        /** MCP tool calling (OpenAI: response.mcp_call.arguments.delta) */
        type: 'mcp_call_arguments_delta';
        call_id?: string;
        delta?: string;
        arguments?: string;
      }
    | {
        /** MCP tool calling done (OpenAI: response.mcp_call.arguments.done) */
        type: 'mcp_call_arguments_done';
        call_id?: string;
        arguments?: string;
      }
    | {
        /** Code Interpreter code stream (OpenAI: response.code_interpreter_call.code.delta) */
        type: 'code_interpreter_call_code_delta';
        call_id?: string;
        delta?: string;
        code?: string;
      }
    | {
        /** Code Interpreter code done (OpenAI: response.code_interpreter_call.code.done) */
        type: 'code_interpreter_call_code_done';
        call_id?: string;
        code?: string;
      }
    | {
        /** High-level "call start" (use for tool/function invocation envelopes) */
        type: 'tool_call_start';
        name: string;
        arguments_json: string;
      id?: string;
        call_id?: string;
      index?: number;
        /** Convenience mirror of OpenAI function object shape */
      function?: {
        name?: string;
        arguments?: string;
      };
      }
    | {
        /** Optional alias specifically for functions if you want both */
        type: 'function_call_start';
        name: string;
        arguments_json: string;
        id?: string;
        call_id?: string;
      arguments?: string;
      }

    // ────────────────────────────────────────────────────────────────────────────
    // REASONING SUMMARY (OpenAI: response.reasoning_summary_text.*)
    // ────────────────────────────────────────────────────────────────────────────
    | {
        type: 'reasoning_summary_text_delta';
        delta?: string;
        summary?: string;
      }
    | {
        type: 'reasoning_summary_text_done';
        summary?: string;
      }

    // ────────────────────────────────────────────────────────────────────────────
    // USAGE (both vendors; Anthropic reports periodically via message_delta)
    // ────────────────────────────────────────────────────────────────────────────
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

    // ────────────────────────────────────────────────────────────────────────────
    // SEARCH TOOLS (OpenAI Responses: file_search_call.*, web_search_call.*)
    // ────────────────────────────────────────────────────────────────────────────
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
        type: 'web_search_start';
        call_id: string;
        tool_call_id?: string;
        web_search?: {
          status: 'in_progress';
          query?: string;
        };
      }
    | {
        type: 'web_search_progress';
        call_id: string;
        tool_call_id?: string;
        web_search?: {
          status: 'searching';
          query?: string;
          results?: unknown[];
        };
      }
    | {
        type: 'web_search_done';
        call_id: string;
        tool_call_id?: string;
        web_search?: {
          status: 'completed';
          query?: string;
          results?: unknown[];
        };
      }

    // ────────────────────────────────────────────────────────────────────────────
    // ERRORS (OpenAI: response.error, Anthropic: error)
    // ────────────────────────────────────────────────────────────────────────────
    | {
        type: 'error';
        code?: string;
        message: string;
        error?: {
          code: string;
          message: string;
        };
      };

  /** Raw passthrough from the source provider (optional, for debugging/forensics). */
  provider_raw?: {
    [k: string]: unknown;
  };
};