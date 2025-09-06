import { Request as CanonicalRequest } from '../../types/index.js';

/**
 * Anthropic request field mappings
 * Maps canonical fields to Anthropic API fields
 */
export const requestRename: Record<string, string> = {
  // Generation parameters
  'generation.max_tokens': 'max_tokens',
  'generation.temperature': 'temperature',
  'generation.top_p': 'top_p',
  'generation.top_k': 'top_k',
  'generation.stop_sequences': 'stop_sequences',
  
  // Anthropic-specific parameters
  'tier': 'tier',
  'thinking': 'thinking',
  'betas': 'betas',
  'extra_headers': 'extra_headers',
  'timeout': 'timeout',
  
  // Safety and moderation
  'safety_settings': 'safety_settings', // ✅ Added missing field
  
  // Response generation
  'candidate_count': 'candidate_count', // ✅ Added missing field
  
  // Stream parameter
  'stream': 'stream',
  
  // Metadata and context
  'user': 'metadata.user_id',
  'context': 'context', // ✅ Added missing field
  'attachments': 'attachments', // ✅ Added missing field
  'meta': 'meta', // ✅ Added missing field
  
  // Direct passthroughs
  'model': 'model',
  'system': 'system',
  'messages': 'messages',
  'tools': 'tools',
  'tool_choice': 'tool_choice'
};

/**
 * Anthropic response field mappings
 * Maps Anthropic API fields back to canonical fields
 */
export const responseRename: Record<string, string> = {
  'id': 'id',
  'model': 'model',
  'role': 'role',
  'content': 'choices[0].message.content',
  'stop_reason': 'stop_reason',
  'stop_sequence': 'stop_sequence',
  'usage': 'usage',
  'type': 'type'
};

/**
 * Value mappers for complex field transformations
 */
export const valueMappers = {
  /**
   * Transform canonical tool_choice to Anthropic format
   */
  tool_choice: (tc: CanonicalRequest['tool_choice']) => {
    if (typeof tc === 'string') {
      // Map canonical strings to Anthropic format
      switch (tc) {
        case 'auto': return 'auto';
        case 'required': return 'any'; // Anthropic uses 'any' for required
        case 'any': return 'any';
        case 'none': return undefined; // Anthropic doesn't send tool_choice for 'none'
        default: return tc;
      }
    }
    
    if (typeof tc === 'object') {
      if (tc.type === 'function' || tc.type === 'tool') {
        const name = tc.type === 'function' ? tc.function?.name : tc.name;
        return {
          type: 'tool',
          name: name
        };
      }
    }
    
    return tc;
  },

  /**
   * Transform canonical system message to Anthropic format
   */
  system: (system: CanonicalRequest['system']) => {
    if (typeof system === 'string') {
      return system;
    }
    
    if (Array.isArray(system)) {
      // Convert content blocks to string for Anthropic system
      return system
        .map(block => {
          if (block.type === 'text') return block.text;
          // Anthropic system only supports text
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }
    
    return system;
  },

  /**
   * Ensure max_tokens is set (required by Anthropic)
   */
  max_tokens: (canonical: CanonicalRequest) => {
    const maxTokens = canonical.generation?.max_tokens;
    if (maxTokens !== undefined) {
      return maxTokens;
    }
    
    // Default max_tokens for different models
    const model = canonical.model;
    if (model.includes('claude-3-5-sonnet')) return 8192;
    if (model.includes('claude-3-opus')) return 4096;
    if (model.includes('claude-3-sonnet')) return 4096;
    if (model.includes('claude-3-haiku')) return 4096;
    
    return 4096; // Safe default
  }
};

/**
 * Anthropic finish reason mappings
 */
export const finishReasonToCanonical: Record<string, string> = {
  'end_turn': 'stop',
  'max_tokens': 'max_tokens', 
  'stop_sequence': 'stop_sequence',
  'tool_use': 'tool_calls'
};

export const finishReasonFromCanonical: Record<string, string> = {
  'stop': 'end_turn',
  'max_tokens': 'max_tokens',
  'length': 'max_tokens',
  'stop_sequence': 'stop_sequence',
  'tool_calls': 'tool_use',
  'tool_use': 'tool_use'
};

/**
 * Usage token mappings (Anthropic format)
 */
export const usageRename: Record<string, string> = {
  'input_tokens': 'input_tokens',
  'output_tokens': 'output_tokens',
  'cache_creation_input_tokens': 'cached_tokens',
  'cache_read_input_tokens': 'cached_tokens'
};

/**
 * Content type mappings for multimodal inputs
 */
export const contentTypeMap = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image', 
  'image/webp': 'image',
  'application/pdf': 'document',
  'text/plain': 'document'
};

/**
 * Anthropic content block type mappings
 */
export const blockTypeMap = {
  'text': 'text',
  'image': 'image',
  'tool_use': 'tool_use',
  'tool_result': 'tool_result'
};

/**
 * Default Anthropic request parameters
 */
export const defaultParams = {
  max_tokens: 4096,
  anthropic_version: '2023-06-01'
};

/**
 * Usage examples:
 * 
 * // Basic remapping
 * const anthropicReq = remap(canonical, requestRename);
 * 
 * // Value transformation
 * if (canonical.tool_choice) {
 *   anthropicReq.tool_choice = valueMappers.tool_choice(canonical.tool_choice);
 * }
 * 
 * // Ensure required fields
 * anthropicReq.max_tokens = valueMappers.max_tokens(canonical);
 * 
 * // Finish reason conversion
 * const canonicalReason = finishReasonToCanonical[anthropicResponse.stop_reason];
 */