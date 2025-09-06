import { FormatAdapter, CanonicalStreamEvent, FormatType } from '../registry.js';
import { Request as CanonicalRequest, Response as CanonicalResponse } from '../../types/index.js';
import { remap, merge, removeUndefined } from '../core/object-map.js';
import { requestRename, responseRename, valueMappers, finishReasonToCanonical, usageRename, defaultParams } from './maps.js';
import { toAnthropicMessages, fromAnthropicMessages, anthropicContentToCanonicalChoices, extractToolCallsFromContent } from './messages.js';
import { 
  toAnthropicTools, 
  toAnthropicToolChoice,
  fromAnthropicTools,
  fromAnthropicToolChoice,
  hasTools,
  validateToolChoice 
} from './tools.js';
import { anthropicEventToCanonical, createAnthropicStreamProcessor, AnthropicStreamEvent } from './streaming.js';

/**
 * Anthropic request format (subset of fields we care about)
 */
export interface AnthropicRequest {
  model: string;
  messages: any[];
  system?: string;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  tools?: any[];
  tool_choice?: any;
  tier?: 'priority' | 'standard';
  thinking?: { enabled: boolean; budget?: number };
  betas?: string[];
  extra_headers?: Record<string, string>;
  timeout?: number;
  metadata?: { user_id?: string };
  [key: string]: any;
}

/**
 * Anthropic response format (subset of fields we care about)
 */
export interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text' | 'tool_use';
    text?: string;
    id?: string;
    name?: string;
    input?: any;
  }>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  [key: string]: any;
}

/**
 * Anthropic adapter implementation
 */
export const anthropicAdapter: FormatAdapter<AnthropicRequest, AnthropicResponse, AnthropicRequest, AnthropicResponse, AnthropicStreamEvent> = {
  formatType: 'anthropic' as FormatType,

  clientToCanonical(clientRequest: AnthropicRequest): CanonicalRequest {
    // Start with basic structure
    const result: any = {
      schema_version: '1.0.1',
      model: clientRequest.model,
      messages: clientRequest.messages?.map(msg => ({
        role: msg.role,
        content: Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: msg.content || '' }],
        name: msg.name,
        tool_call_id: msg.tool_call_id,
        tool_calls: msg.tool_calls
      })) || []
    };

    if (clientRequest.system) {
      result.system = clientRequest.system;
    }

    // Build generation object with parameters
    const generation: any = {};
    if (clientRequest.max_tokens !== undefined) generation.max_tokens = clientRequest.max_tokens;
    if (clientRequest.temperature !== undefined) generation.temperature = clientRequest.temperature;
    if (clientRequest.top_p !== undefined) generation.top_p = clientRequest.top_p;
    if (clientRequest.top_k !== undefined) generation.top_k = clientRequest.top_k;
    if (clientRequest.stop_sequences !== undefined) generation.stop_sequences = clientRequest.stop_sequences;
    if (Object.keys(generation).length > 0) {
      result.generation = generation;
    }

    if (hasTools(clientRequest)) {
      // Convert Anthropic tools to canonical format
      const canonicalTools = clientRequest.tools.map((tool: any) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema || {}
        }
      }));
      result.tools = canonicalTools;
      
      if (clientRequest.tool_choice !== undefined) {
        result.tool_choice = clientRequest.tool_choice;
      }
    }

    if (clientRequest.stream !== undefined) {
      result.stream = clientRequest.stream;
    }

    removeUndefined(result, true);
    return result as CanonicalRequest;
  },

  canonicalToClient(canonical: CanonicalResponse): AnthropicResponse {
    // Since client/provider formats are identical, use same logic as providerToCanonical but reversed
    // This is Canonical Response → Anthropic Response
    const choices = anthropicContentToCanonicalChoices(canonical.choices?.[0]?.message?.content || [], canonical.choices?.[0]?.finish_reason || 'stop');
    
    const usage: any = {};
    if (canonical.usage) {
      usage.input_tokens = canonical.usage.input_tokens || 0;
      usage.output_tokens = canonical.usage.output_tokens || 0;
    }

    const response: AnthropicResponse = {
      id: canonical.id,
      type: 'message',
      role: 'assistant',
      content: canonical.choices?.[0]?.message?.content || [],
      model: canonical.model,
      stop_reason: (canonical.choices?.[0]?.finish_reason || 'stop') as any,
      usage
    };

    removeUndefined(response, true);
    return response;
  },

  canonicalToProvider(canonical: CanonicalRequest): AnthropicRequest {
    // Start with basic structure
    const result: any = {
      model: canonical.model,
      messages: canonical.messages?.map(msg => ({
        role: msg.role,
        content: Array.isArray(msg.content) ? msg.content : msg.content,
        name: msg.name,
        tool_call_id: msg.tool_call_id,
        tool_calls: msg.tool_calls
      })) || [],
      max_tokens: 100  // Default required by Anthropic
    };

    // Handle system message
    if (canonical.system) {
      result.system = canonical.system;
    }

    // Handle generation parameters - extract from generation object
    if (canonical.generation) {
      if (canonical.generation.max_tokens !== undefined) result.max_tokens = canonical.generation.max_tokens;
      if (canonical.generation.temperature !== undefined) result.temperature = canonical.generation.temperature;
      if (canonical.generation.top_p !== undefined) result.top_p = canonical.generation.top_p;
      if (canonical.generation.top_k !== undefined) result.top_k = canonical.generation.top_k;
      if (canonical.generation.stop_sequences !== undefined) result.stop_sequences = canonical.generation.stop_sequences;
      if (canonical.generation.stop !== undefined) {
        const stop = canonical.generation.stop;
        const stopSequences = Array.isArray(stop) ? stop : [stop];
        result.stop_sequences = stopSequences;
      }
    }

    // Handle tools if present
    if (hasTools(canonical)) {
      const anthropicTools = toAnthropicTools(canonical.tools);
      const anthropicToolChoice = toAnthropicToolChoice(canonical.tool_choice);
      
      result.tools = anthropicTools;
      
      if (anthropicToolChoice !== undefined) {
        result.tool_choice = anthropicToolChoice;
        
        if (!validateToolChoice(anthropicToolChoice, anthropicTools)) {
          console.warn('Invalid tool_choice for available tools, falling back to auto');
          result.tool_choice = 'auto';
        }
      }
    }

    if (canonical.stream !== undefined) {
      result.stream = canonical.stream;
    }

    // Provider-specific parameter pass-through
    if (canonical.provider_params?.anthropic) {
      Object.assign(result, canonical.provider_params.anthropic);
    }

    // Handle user metadata
    if (canonical.user) {
      result.metadata = { 
        ...result.metadata, 
        user_id: canonical.user 
      };
    }

    removeUndefined(result, true);
    return result as AnthropicRequest;
  },

  providerToCanonical(raw: AnthropicResponse): CanonicalResponse {
    // 1. Transform content to canonical choices format
    const choices = anthropicContentToCanonicalChoices(raw.content, raw.stop_reason);

    // 2. Add tool_calls to choices if present
    const toolCalls = extractToolCallsFromContent(raw.content);
    if (toolCalls.length > 0 && choices.length > 0) {
      choices[0].tool_calls = toolCalls;
    }

    // 3. Transform usage to canonical format
    const usage: any = {};
    if (raw.usage) {
      usage.input_tokens = raw.usage.input_tokens;
      usage.output_tokens = raw.usage.output_tokens;
      usage.prompt_tokens = raw.usage.input_tokens; // For OpenAI compatibility
      usage.completion_tokens = raw.usage.output_tokens; // For OpenAI compatibility
      usage.total_tokens = raw.usage.input_tokens + raw.usage.output_tokens;
      
      if (raw.usage.cache_creation_input_tokens || raw.usage.cache_read_input_tokens) {
        usage.cached_tokens = (raw.usage.cache_creation_input_tokens || 0) + (raw.usage.cache_read_input_tokens || 0);
      }
    }

    // 4. Build canonical response
    const canonical: CanonicalResponse = {
      schema_version: '1.0.1',
      id: raw.id,
      model: raw.model,
      created: Math.floor(Date.now() / 1000), // Anthropic doesn't provide created timestamp
      choices: choices.length > 0 ? (choices as any) : [{ 
        index: 0, 
        message: { role: 'assistant' as const, content: [] }, 
        finish_reason: 'stop' 
      }] as any,
      usage
    };

    // 5. Clean up undefined values
    removeUndefined(canonical, true);

    return canonical;
  },

  stream: {
    sourceToCanonical(event: AnthropicStreamEvent): CanonicalStreamEvent[] {
      return anthropicEventToCanonical(event);
    }
  }
};

/**
 * Create a stateful Anthropic stream processor
 * Useful for processing a continuous stream of events
 */
export function createAnthropicAdapter() {
  const streamProcessor = createAnthropicStreamProcessor();
  
  return {
    ...anthropicAdapter,
    stream: {
      sourceToCanonical: streamProcessor
    }
  };
}

/**
 * Usage examples:
 * 
 * // Convert to Anthropic format
 * const anthropicReq = anthropicAdapter.toProviderRequest(canonicalRequest);
 * 
 * // Convert back from Anthropic format
 * const canonicalRes = anthropicAdapter.fromProviderResponse(anthropicResponse);
 * 
 * // Handle streaming
 * const events = anthropicAdapter.stream.toCanonical(event);
 * 
 * // Use with registry
 * registerAdapter(anthropicAdapter);
 * const adapter = getAdapter('anthropic');
 */