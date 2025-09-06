import { FormatAdapter, CanonicalStreamEvent, FormatType } from '../registry.js';
import { Request as CanonicalRequest, Response as CanonicalResponse } from '../../types/index.js';
import { remap, merge, removeUndefined } from '../core/object-map.js';
import { requestRename, responseRename, valueMappers, finishReasonToCanonical, usageRename } from './maps.js';
import { toOpenAIMessages } from './messages.js';
import { 
  toOpenAITools, 
  toOpenAIFunctions, 
  toOpenAIToolChoice, 
  toOpenAIFunctionCall,
  fromOpenAIResponseToolCalls,
  getToolingType 
} from './tools.js';
import { openaiChunkToCanonical, createOpenAIStreamProcessor, OpenAIStreamChunk } from './streaming.js';

/**
 * OpenAI request/response format (used for both client and provider since they're identical)
 */
export interface OpenAIRequest {
  model: string;
  messages: any[];
  system?: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string | string[];
  stream?: boolean;
  tools?: any[];
  tool_choice?: any;
  functions?: any[];
  function_call?: any;
  response_format?: any;
  user?: string;
  [key: string]: any;
}

export interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: any[];
      function_call?: any;
    };
    finish_reason: string;
    logprobs?: any;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    [key: string]: any;
  };
  system_fingerprint?: string;
  [key: string]: any;
}

/**
 * OpenAI format adapter
 */
export const openaiAdapter: FormatAdapter<OpenAIRequest, OpenAIResponse, OpenAIRequest, OpenAIResponse, OpenAIStreamChunk> = {
  formatType: 'openai' as FormatType,

  /**
   * Client → Canonical
   */
  clientToCanonical(clientRequest: OpenAIRequest): CanonicalRequest {
    // Extract system message from messages array if present
    let systemMessage = clientRequest.system;
    let filteredMessages = clientRequest.messages || [];
    
    if (filteredMessages.length > 0 && filteredMessages[0].role === 'system') {
      const systemMsg = filteredMessages[0];
      systemMessage = typeof systemMsg.content === 'string' ? systemMsg.content : 
        systemMsg.content?.find((c: any) => c.type === 'text')?.text || '';
      filteredMessages = filteredMessages.slice(1); // Remove system message from messages
    }

    // Start with basic structure
    const result: any = {
      schema_version: '1.0.1',
      model: clientRequest.model,
      messages: filteredMessages.map(msg => ({
        role: msg.role,
        content: typeof msg.content === 'string' ? [{ type: 'text', text: msg.content }] : msg.content || [],
        name: msg.name,
        tool_call_id: msg.tool_call_id,
        tool_calls: msg.tool_calls
      }))
    };

    // Handle system message
    if (systemMessage) {
      result.system = systemMessage;
    }

    // Handle generation parameters
    const generation: any = {};
    if (clientRequest.max_tokens !== undefined) generation.max_tokens = clientRequest.max_tokens;
    if (clientRequest.temperature !== undefined) generation.temperature = clientRequest.temperature;
    if (clientRequest.top_p !== undefined) generation.top_p = clientRequest.top_p;
    if (clientRequest.stop !== undefined) generation.stop = clientRequest.stop;
    if (Object.keys(generation).length > 0) {
      result.generation = generation;
    }

    // Handle tools vs functions
    const toolingType = getToolingType(clientRequest);
    if (toolingType === 'tools') {
      if (clientRequest.tools) result.tools = toOpenAITools(clientRequest.tools);
      if (clientRequest.tool_choice) result.tool_choice = toOpenAIToolChoice(clientRequest.tool_choice);
    } else if (toolingType === 'functions') {
      if (clientRequest.functions) result.functions = toOpenAIFunctions(clientRequest.functions);
      if (clientRequest.function_call) result.function_call = toOpenAIFunctionCall(clientRequest.function_call);
    }

    if (clientRequest.response_format) {
      result.response_format = valueMappers.response_format(clientRequest.response_format);
    }

    if (clientRequest.stream !== undefined) {
      result.stream = clientRequest.stream;
    }

    removeUndefined(result, true);
    return result as CanonicalRequest;
  },

  /**
   * Canonical → Client
   */
  canonicalToClient(canonical: CanonicalResponse): OpenAIResponse {
    const choices = canonical.choices?.map(choice => ({
      index: choice.index,
      message: {
        role: choice.message.role,
        content: choice.message.content.find(c => c.type === 'text')?.text || null,
        tool_calls: choice.tool_calls,
        function_call: choice.function_call
      },
      finish_reason: choice.finish_reason,
      logprobs: choice.logprobs
    })) || [];

    const response: OpenAIResponse = {
      id: canonical.id,
      object: 'chat.completion',
      created: canonical.created,
      model: canonical.model,
      choices,
      usage: canonical.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      system_fingerprint: canonical.system_fingerprint
    };

    removeUndefined(response, true);
    return response;
  },

  /**
   * Canonical → Provider
   */
  canonicalToProvider(canonical: CanonicalRequest): OpenAIRequest {
    // Transform messages from canonical to OpenAI format
    let messages = canonical.messages?.map(msg => ({
      role: msg.role,
      content: Array.isArray(msg.content) ? 
        (msg.content.find(c => c.type === 'text')?.text || '') : 
        msg.content,
      name: msg.name,
      tool_call_id: msg.tool_call_id,
      tool_calls: msg.tool_calls
    })) || [];

    // Handle system message - add to messages array for OpenAI
    if (canonical.system) {
      messages = [{ role: 'system', content: canonical.system }, ...messages];
    }

    const result: any = {
      model: canonical.model,
      messages
    };

    // Handle generation parameters
    if (canonical.generation) {
      if (canonical.generation.max_tokens !== undefined) result.max_tokens = canonical.generation.max_tokens;
      if (canonical.generation.temperature !== undefined) result.temperature = canonical.generation.temperature;
      if (canonical.generation.top_p !== undefined) result.top_p = canonical.generation.top_p;
      if (canonical.generation.stop !== undefined) result.stop = canonical.generation.stop;
    }

    // Handle tools/functions
    const toolingType = getToolingType(canonical);
    if (toolingType === 'tools') {
      if (canonical.tools) result.tools = toOpenAITools(canonical.tools);
      if (canonical.tool_choice) result.tool_choice = toOpenAIToolChoice(canonical.tool_choice);
    } else if (toolingType === 'functions') {
      if (canonical.functions) result.functions = toOpenAIFunctions(canonical.functions);
      if (canonical.function_call) result.function_call = toOpenAIFunctionCall(canonical.function_call);
    }

    if (canonical.response_format) {
      result.response_format = canonical.response_format;
    }

    if (canonical.stream !== undefined) {
      result.stream = canonical.stream;
    }

    removeUndefined(result, true);
    return result as OpenAIRequest;
  },

  /**
   * Provider → Canonical
   */
  providerToCanonical(providerResponse: OpenAIResponse): CanonicalResponse {
    const choices = providerResponse.choices?.map(choice => ({
      index: choice.index,
      message: {
        role: 'assistant' as const,
        content: choice.message.content ? [{
          type: 'text',
          text: choice.message.content
        }] : []
      },
      finish_reason: finishReasonToCanonical[choice.finish_reason] || choice.finish_reason,
      tool_calls: choice.message.tool_calls ? fromOpenAIResponseToolCalls(choice.message.tool_calls) : undefined,
      logprobs: choice.logprobs || undefined
    })) || [];

    const usage = providerResponse.usage ? remap(providerResponse.usage, usageRename) : undefined;

    const canonical: CanonicalResponse = {
      schema_version: '1.0.1',
      id: providerResponse.id,
      model: providerResponse.model,
      created: providerResponse.created,
      choices,
      usage,
      system_fingerprint: providerResponse.system_fingerprint
    };

    removeUndefined(canonical, true);
    return canonical;
  },

  stream: {
    sourceToCanonical(event: OpenAIStreamChunk): CanonicalStreamEvent[] {
      return openaiChunkToCanonical(event);
    }
  }
};

export function createOpenAIAdapter() {
  const streamProcessor = createOpenAIStreamProcessor();
  return {
    ...openaiAdapter,
    stream: { sourceToCanonical: streamProcessor }
  };
}