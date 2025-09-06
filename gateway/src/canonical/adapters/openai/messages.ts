import { Request as CanonicalRequest } from '../../types/index.js';

/**
 * OpenAI message format interfaces
 */
export interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | OpenAIContent[];
  name?: string;
  tool_call_id?: string;
  tool_calls?: OpenAIToolCall[];
}

export interface OpenAIContent {
  type: 'text' | 'image_url' | 'input_audio';
  text?: string;
  image_url?: { url: string; detail?: 'low' | 'high' | 'auto' };
  input_audio?: { data: string; format: 'wav' | 'mp3' };
}

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Convert canonical messages to OpenAI format
 * @param messages - Canonical messages array
 * @param system - System message (gets converted to system role)
 */
export function toOpenAIMessages(
  messages: CanonicalRequest['messages'], 
  system?: CanonicalRequest['system']
): OpenAIMessage[] {
  const openaiMessages: OpenAIMessage[] = [];
  
  // Add system message first if present
  if (system) {
    openaiMessages.push({
      role: 'system',
      content: typeof system === 'string' ? system : convertContentBlocks(system)
    });
  }
  
  // Convert each canonical message
  for (const message of messages) {
    if (message.role === 'user' || message.role === 'assistant' || message.role === 'tool') {
      const openaiMsg: OpenAIMessage = {
        role: message.role,
        content: typeof message.content === 'string' 
          ? message.content 
          : convertContentBlocks(message.content)
      };
      
      // Add optional fields
      if (message.name) openaiMsg.name = message.name;
      if (message.tool_call_id) openaiMsg.tool_call_id = message.tool_call_id;
      if (message.tool_calls) {
        openaiMsg.tool_calls = message.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments
          }
        }));
      }
      
      openaiMessages.push(openaiMsg);
    }
  }
  
  return openaiMessages;
}

/**
 * Convert canonical content blocks to OpenAI content format
 */
function convertContentBlocks(contentBlocks: any[]): OpenAIContent[] {
  const openaiContent: OpenAIContent[] = [];
  
  for (const block of contentBlocks) {
    switch (block.type) {
      case 'text':
        openaiContent.push({
          type: 'text',
          text: block.text
        });
        break;
        
      case 'image':
        if (block.source?.type === 'url') {
          openaiContent.push({
            type: 'image_url',
            image_url: { 
              url: block.source.url,
              detail: 'auto' // Could be made configurable
            }
          });
        } else if (block.source?.type === 'base64') {
          openaiContent.push({
            type: 'image_url',
            image_url: { 
              url: `data:${block.source.media_type};base64,${block.source.data}`,
              detail: 'auto'
            }
          });
        }
        break;
        
      case 'audio':
        if (block.source?.type === 'base64') {
          const format = block.source.media_type.includes('wav') ? 'wav' : 'mp3';
          openaiContent.push({
            type: 'input_audio',
            input_audio: {
              data: block.source.data,
              format
            }
          });
        }
        break;
        
      case 'tool_result':
        // Tool results become text content in OpenAI
        openaiContent.push({
          type: 'text',
          text: typeof block.content === 'string' ? block.content : JSON.stringify(block.content)
        });
        break;
        
      // Skip other types that OpenAI doesn't support
    }
  }
  
  return openaiContent;
}

/**
 * Convert OpenAI messages back to canonical format
 * @param openaiMessages - OpenAI format messages
 */
export function fromOpenAIMessages(openaiMessages: OpenAIMessage[]): {
  messages: any[];
  system?: string;
} {
  const canonicalMessages: any[] = [];
  let systemMessage: string | undefined;
  
  for (const msg of openaiMessages) {
    if (msg.role === 'system') {
      // Extract system message
      systemMessage = typeof msg.content === 'string' 
        ? msg.content 
        : msg.content.map(c => c.text || '').join('');
    } else {
      const canonicalMsg: any = {
        role: msg.role,
        content: convertFromOpenAIContent(msg.content)
      };
      
      // Add optional fields
      if (msg.name) canonicalMsg.name = msg.name;
      if (msg.tool_call_id) canonicalMsg.tool_call_id = msg.tool_call_id;
      if (msg.tool_calls) {
        canonicalMsg.tool_calls = msg.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments
          }
        }));
      }
      
      canonicalMessages.push(canonicalMsg);
    }
  }
  
  return {
    messages: canonicalMessages,
    system: systemMessage
  };
}

/**
 * Convert OpenAI content back to canonical content blocks
 */
function convertFromOpenAIContent(content: string | OpenAIContent[]): any {
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
        
      case 'image_url':
        const url = item.image_url?.url;
        if (url?.startsWith('data:')) {
          // Parse base64 data URL
          const [header, data] = url.split(',');
          const mediaType = header.match(/data:([^;]+)/)?.[1];
          canonicalBlocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data
            }
          });
        } else if (url) {
          canonicalBlocks.push({
            type: 'image',
            source: {
              type: 'url',
              url
            }
          });
        }
        break;
        
      case 'input_audio':
        if (item.input_audio) {
          canonicalBlocks.push({
            type: 'audio',
            source: {
              type: 'base64',
              media_type: `audio/${item.input_audio.format}`,
              data: item.input_audio.data
            }
          });
        }
        break;
    }
  }
  
  return canonicalBlocks;
}

/**
 * Usage examples:
 * 
 * // Convert to OpenAI format
 * const openaiMsgs = toOpenAIMessages(canonical.messages, canonical.system);
 * 
 * // Convert back from OpenAI format  
 * const { messages, system } = fromOpenAIMessages(openaiResponse.messages);
 */