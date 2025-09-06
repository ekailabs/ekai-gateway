import { Request as CanonicalRequest } from '../../types/index.js';

/**
 * OpenAI request field mappings
 * Maps canonical fields to OpenAI API fields
 */
export const requestRename: Record<string, string> = {
  // Generation parameters that map directly
  'generation.max_tokens': 'max_tokens',
  'generation.temperature': 'temperature',
  'generation.top_p': 'top_p',
  'generation.top_k': 'top_k', // ✅ Added missing field
  'generation.stop': 'stop',
  'generation.stop_sequences': 'stop_sequences', // ✅ Added missing field
  'generation.seed': 'seed',
  'generation.frequency_penalty': 'frequency_penalty',
  'generation.presence_penalty': 'presence_penalty',
  'generation.n': 'n',
  'generation.logprobs': 'logprobs',
  'generation.top_logprobs': 'top_logprobs',
  'generation.logit_bias': 'logit_bias',
  
  // Safety and moderation
  'safety_settings': 'safety_settings', // ✅ Added missing field
  
  // Response generation
  'candidate_count': 'candidate_count', // ✅ Added missing field
  
  // Stream options
  'stream': 'stream',
  'stream_options': 'stream_options',
  
  // Service and prediction
  'service_tier': 'service_tier',
  'reasoning_effort': 'reasoning_effort',
  'modalities': 'modalities',
  'audio': 'audio',
  'prediction': 'prediction',
  
  // Metadata and context
  'user': 'user',
  'context': 'context', // ✅ Added missing field
  'attachments': 'attachments', // ✅ Added missing field
  'meta': 'meta', // ✅ Added missing field
  
  // Request configuration
  'timeout': 'timeout', // ✅ Added missing field
  'extra_headers': 'extra_headers', // ✅ Added missing field
  
  // Direct passthroughs (these exist in both formats)
  'model': 'model',
  'tools': 'tools',
  'tool_choice': 'tool_choice',
  'parallel_tool_calls': 'parallel_tool_calls',
  'functions': 'functions',
  'function_call': 'function_call',
  'response_format': 'response_format'
};

/**
 * OpenAI response field mappings
 * Maps OpenAI API fields back to canonical fields
 */
export const responseRename: Record<string, string> = {
  // Direct mappings
  'id': 'id',
  'model': 'model', 
  'created': 'created',
  'choices': 'choices',
  'usage': 'usage',
  'system_fingerprint': 'system_fingerprint',
  'service_tier_utilized': 'service_tier_utilized',
  'object': 'object'
};

/**
 * Value mappers for complex field transformations
 */
export const valueMappers = {
  /**
   * Transform canonical response_format to OpenAI format
   */
  response_format: (rf: CanonicalRequest['response_format']) => {
    if (typeof rf === 'string') {
      // Simple string formats
      if (rf === 'json') return 'json_object';
      return rf; // 'text', 'json_object'
    }
    
    if (typeof rf === 'object' && rf?.type === 'json_schema') {
      // Structured JSON schema format
      return {
        type: 'json_schema',
        json_schema: rf.json_schema
      };
    }
    
    return rf;
  },

  /**
   * Transform canonical tool_choice to OpenAI format
   */
  tool_choice: (tc: CanonicalRequest['tool_choice']) => {
    if (typeof tc === 'string') {
      // Handle canonical 'required' -> OpenAI 'auto'
      if (tc === 'required') return 'auto';
      if (tc === 'any') return 'auto';
      return tc; // 'auto', 'none'
    }
    
    if (typeof tc === 'object') {
      if (tc.type === 'function') {
        return {
          type: 'function',
          function: { name: tc.function.name }
        };
      }
      if (tc.type === 'tool') {
        // Convert tool format to function format for OpenAI
        return {
          type: 'function', 
          function: { name: tc.name }
        };
      }
    }
    
    return tc;
  },

  /**
   * Transform canonical stop sequences to OpenAI format
   */
  stop: (stop: CanonicalRequest['generation']) => {
    // OpenAI uses 'stop' directly from generation.stop
    // If generation.stop_sequences exists, prefer that
    const gen = stop;
    return gen?.stop_sequences || gen?.stop;
  }
};

/**
 * OpenAI finish reason mappings
 */
export const finishReasonToCanonical: Record<string, string> = {
  'stop': 'stop',
  'length': 'max_tokens',
  'tool_calls': 'tool_calls',
  'content_filter': 'content_filter',
  'function_call': 'function_call'
};

export const finishReasonFromCanonical: Record<string, string> = {
  'stop': 'stop',
  'max_tokens': 'length', 
  'length': 'length',
  'tool_calls': 'tool_calls',
  'tool_use': 'tool_calls',
  'content_filter': 'content_filter',
  'function_call': 'function_call'
};

/**
 * Usage token mappings (OpenAI format)
 */
export const usageRename: Record<string, string> = {
  'prompt_tokens': 'prompt_tokens',
  'completion_tokens': 'completion_tokens',
  'total_tokens': 'total_tokens',
  'completion_tokens_details': 'completion_tokens_details',
  'prompt_tokens_details': 'prompt_tokens_details',
  'predictions': 'predictions'
};

/**
 * Content type mappings for multimodal inputs
 */
export const contentTypeMap = {
  'image/jpeg': 'image_url',
  'image/png': 'image_url', 
  'image/gif': 'image_url',
  'image/webp': 'image_url',
  'audio/wav': 'input_audio',
  'audio/mp3': 'input_audio',
  'video/mp4': 'input_video'
};

/**
 * Usage examples:
 * 
 * // Basic remapping
 * const openaiReq = remap(canonical, requestRename);
 * 
 * // Value transformation
 * if (canonical.response_format) {
 *   openaiReq.response_format = valueMappers.response_format(canonical.response_format);
 * }
 * 
 * // Finish reason conversion
 * const canonicalReason = finishReasonToCanonical[openaiResponse.choices[0].finish_reason];
 */