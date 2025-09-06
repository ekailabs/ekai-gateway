import { Request as CanonicalRequest } from '../../types/index.js';

/**
 * Anthropic message format interfaces
 */
export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContent[];
}

export interface AnthropicContent {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
  id?: string;
  name?: string;
  input?: any;
  tool_use_id?: string;
  content?: string | AnthropicContent[];
  is_error?: boolean;
}

/**
 * Convert canonical messages to Anthropic format
 * @param messages - Canonical messages array
 * @param system - System message (handled separately in Anthropic)
 */
export function toAnthropicMessages(
  messages: CanonicalRequest['messages']
): AnthropicMessage[] {
  const anthropicMessages: AnthropicMessage[] = [];
  
  for (const message of messages) {
    // Skip system messages (handled at request level in Anthropic)
    if ((message as any).role === 'system') continue;
    
    // Map user and assistant messages
    if (message.role === 'user' || message.role === 'assistant') {
      const anthropicMsg: AnthropicMessage = {
        role: message.role,
        content: typeof message.content === 'string' 
          ? message.content 
          : convertContentBlocks(message.content)
      };
      
      anthropicMessages.push(anthropicMsg);
    }
    
    // Handle tool role messages (convert to user messages with tool_result content)
    if (message.role === 'tool' && message.tool_call_id) {
      const toolResultMsg: AnthropicMessage = {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: message.tool_call_id,
          content: typeof message.content === 'string' 
            ? message.content 
            : JSON.stringify(message.content),
          is_error: false
        }]
      };
      
      anthropicMessages.push(toolResultMsg);
    }
  }
  
  return anthropicMessages;
}

/**
 * Convert canonical content blocks to Anthropic content format
 */
function convertContentBlocks(contentBlocks: any[]): AnthropicContent[] {
  const anthropicContent: AnthropicContent[] = [];
  
  for (const block of contentBlocks) {
    switch (block.type) {
      case 'text':
        anthropicContent.push({
          type: 'text',
          text: block.text
        });
        break;
        
      case 'image':
        if (block.source?.type === 'base64') {
          anthropicContent.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: block.source.media_type,
              data: block.source.data
            }
          });
        }
        // Note: Anthropic doesn't support image URLs directly
        break;
        
      case 'tool_result':
        anthropicContent.push({
          type: 'tool_result',
          tool_use_id: block.tool_use_id,
          content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
          is_error: block.is_error || false
        });
        break;
        
      // Skip other types that Anthropic doesn't support (audio, video, document)
    }
  }
  
  return anthropicContent;
}

/**
 * Convert Anthropic messages back to canonical format
 * @param anthropicMessages - Anthropic format messages
 * @param systemMessage - Anthropic system message (if any)
 */
export function fromAnthropicMessages(
  anthropicMessages: AnthropicMessage[],
  systemMessage?: string
): {
  messages: any[];
  system?: string;
} {
  const canonicalMessages: any[] = [];
  
  for (const msg of anthropicMessages) {
    const canonicalMsg: any = {
      role: msg.role,
      content: convertFromAnthropicContent(msg.content)
    };
    
    canonicalMessages.push(canonicalMsg);
  }
  
  return {
    messages: canonicalMessages,
    system: systemMessage
  };
}

/**
 * Convert Anthropic content back to canonical content blocks
 */
function convertFromAnthropicContent(content: string | AnthropicContent[]): any {
  if (typeof content === 'string') {
    return content;
  }
  
  const canonicalBlocks: any[] = [];
  
  for (const item of content) {
    switch (item.type) {
      case 'text':
        canonicalBlocks.push({
          type: 'text',
          text: item.text
        });
        break;
        
      case 'image':
        if (item.source) {
          canonicalBlocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: item.source.media_type,
              data: item.source.data
            }
          });
        }
        break;
        
      case 'tool_use':
        canonicalBlocks.push({
          type: 'tool_use',
          id: item.id,
          name: item.name,
          input: item.input
        });
        break;
        
      case 'tool_result':
        canonicalBlocks.push({
          type: 'tool_result',
          tool_use_id: item.tool_use_id,
          content: item.content,
          is_error: item.is_error
        });
        break;
    }
  }
  
  return canonicalBlocks;
}

/**
 * Convert Anthropic response content to canonical choices format
 * @param content - Anthropic response content blocks
 * @param stopReason - Anthropic stop reason
 */
export function anthropicContentToCanonicalChoices(
  content: AnthropicContent[],
  stopReason?: string
): any[] {
  return [{
    index: 0,
    message: {
      role: 'assistant' as const,
      content: convertFromAnthropicContent(content)
    },
    finish_reason: mapFinishReason(stopReason)
  }];
}

/**
 * Map Anthropic finish reasons to canonical finish reasons
 */
function mapFinishReason(anthropicReason?: string): string {
  const mapping: Record<string, string> = {
    'end_turn': 'stop',
    'max_tokens': 'max_tokens',
    'stop_sequence': 'stop_sequence', 
    'tool_use': 'tool_calls'
  };
  
  return anthropicReason ? (mapping[anthropicReason] || anthropicReason) : 'stop';
}

/**
 * Extract tool calls from Anthropic content blocks
 * @param content - Anthropic response content
 */
export function extractToolCallsFromContent(content: AnthropicContent[]): any[] {
  return content
    .filter(block => block.type === 'tool_use')
    .map(block => ({
      id: block.id,
      type: 'function',
      function: {
        name: block.name,
        arguments: JSON.stringify(block.input)
      }
    }));
}

/**
 * Usage examples:
 * 
 * // Convert to Anthropic format
 * const anthropicMsgs = toAnthropicMessages(canonical.messages);
 * 
 * // Convert back from Anthropic format
 * const { messages, system } = fromAnthropicMessages(anthropicResponse.content);
 * 
 * // Handle response content
 * const choices = anthropicContentToCanonicalChoices(
 *   anthropicResponse.content, 
 *   anthropicResponse.stop_reason
 * );
 * 
 * // Extract tool calls
 * const toolCalls = extractToolCallsFromContent(anthropicResponse.content);
 */