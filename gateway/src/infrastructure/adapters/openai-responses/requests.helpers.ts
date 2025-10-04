import { Request as CanonicalRequest } from '../../../canonical/types/index.js';

type ResponsesInput =
  | string
  | Array<{ type: string; role?: 'system' | 'user' | 'assistant'; content?: Array<{ type: string; text?: string }> }>;

export interface OpenAIResponsesRequestShape {
  model: string;
  input: ResponsesInput;
  stream?: boolean;
  temperature?: number;
  max_output_tokens?: number;
  top_p?: number;
  stop?: string | string[];
  stop_sequences?: string[];
  seed?: number;
  instructions?: string;
  tools?: unknown[];
  tool_choice?: unknown;
  parallel_tool_calls?: boolean;
  response_format?: unknown;
  include?: unknown[];
  store?: boolean;
  reasoning?: { effort?: string; budget?: number; summary?: any[]; content?: any; encrypted_content?: string };
  modalities?: ('text' | 'audio')[];
  audio?: Record<string, unknown>;
  prompt_cache_key?: string;
  [k: string]: unknown;
}

export function decodeResponsesInputToCanonical(input: ResponsesInput): { messages: any[]; thinking?: { budget?: number; summary?: any[]; content?: any; encrypted_content?: string } } {
  const messages: any[] = [];
  let thinking: { budget?: number; summary?: any[]; content?: any; encrypted_content?: string } | undefined;
  if (typeof input === 'string') {
    messages.push({ role: 'user', content: input });
    return { messages };
  }
  if (!Array.isArray(input)) return { messages };

  for (const item of input) {
    if (item?.type === 'message') {
      const role = (item as any).role || 'user';
      const contentArr = Array.isArray((item as any).content) ? (item as any).content : [];
      const content = contentArr.map((c: any) => ({ type: c.type === 'input_text' ? 'text' : c.type, text: c.text || '' }));
      messages.push({ role, content });
    } else if (item?.type === 'reasoning') {
      // Extract into top-level canonical thinking instead of injecting a synthetic message
      thinking = {
        summary: (item as any).summary,
        content: (item as any).content,
        encrypted_content: (item as any).encrypted_content
      };
    }
  }
  return { messages, thinking };
}

export function encodeCanonicalMessagesToResponsesInput(messages: any[]): any[] {
  const input: any[] = [];
  for (const message of messages || []) {
    if ((message as any).role === 'system') {
      const content = Array.isArray(message.content) ? message.content[0] : message.content;
      if ((content as any)?.type === 'reasoning') {
        input.push({
          type: 'reasoning',
          summary: (content as any).summary,
          content: (content as any).content,
          encrypted_content: (content as any).encrypted_content
        });
        continue;
      }
    }

    input.push({
      type: 'message',
      role: message.role,
      content: Array.isArray(message.content)
        ? message.content.map((c: any) => ({ type: c.type === 'text' ? 'input_text' : c.type, text: c.text || '' }))
        : [{ type: 'input_text', text: String(message.content || '') }]
    });
  }
  return input.length > 0 ? input : [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: '' }] }];
}

export function buildCanonicalGenerationFromResponses(req: OpenAIResponsesRequestShape): CanonicalRequest['generation'] {
  return {
    max_tokens: (req as any).max_output_tokens ?? (req as any).max_tokens,
    temperature: req.temperature as number | undefined,
    top_p: req.top_p as number | undefined,
    stop: req.stop as any,
    stop_sequences: req.stop_sequences as any,
    seed: req.seed as any
  };
}
