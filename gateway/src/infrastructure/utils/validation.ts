import { AnthropicMessagesRequest } from 'shared/types/index.js';

export const VALID_ROLES = ['system', 'user', 'assistant'] as const;
export const VALID_ANTHROPIC_ROLES = ['user', 'assistant'] as const;

export function validateMessage(msg: any): msg is { role: string; content: string } {
  return msg && 
         typeof msg.role === 'string' && 
         VALID_ROLES.includes(msg.role as any) &&
         typeof msg.content === 'string';
}

export function validateAnthropicMessage(msg: any): boolean {
  if (!msg || typeof msg.role !== 'string' || !VALID_ANTHROPIC_ROLES.includes(msg.role as any)) {
    return false;
  }
  
  // Handle both string content and array content (real Anthropic API format)
  if (typeof msg.content === 'string') {
    return true;
  }
  
  if (Array.isArray(msg.content)) {
    return msg.content.every((item: any) => 
      item && typeof item.type === 'string' && typeof item.text === 'string'
    );
  }
  
  return false;
}

export function validateMessagesArray(messages: any[]): string | null {
  if (!messages || !Array.isArray(messages)) {
    return 'Messages array is required';
  }

  if (messages.length === 0) {
    return 'At least one message is required';
  }

  return null;
}

export function validateAnthropicRequest(req: AnthropicMessagesRequest): string | null {
  const messagesError = validateMessagesArray(req.messages);
  if (messagesError) return messagesError;

  if (!req.messages.every(validateAnthropicMessage)) {
    return 'Invalid message format. Each message must have role (user/assistant) and content (string or array)';
  }

  if (!req.model) {
    return 'Model is required';
  }

  // Validate system field if present - can be string or array
  if (req.system !== undefined && req.system !== null) {
    if (typeof req.system !== 'string' && !Array.isArray(req.system)) {
      return 'System field must be a string or array';
    }
    
    if (Array.isArray(req.system)) {
      const isValidArray = req.system.every((item: any) => 
        item && typeof item.type === 'string' && typeof item.text === 'string'
      );
      if (!isValidArray) {
        return 'System array must contain objects with type and text fields';
      }
    }
  }

  // max_tokens is optional for some Claude models - make it optional
  // if (!req.max_tokens) {
  //   return 'max_tokens is required';
  // }

  return null;
}

export function validateChatCompletionRequest(req: any): string | null {
  const messagesError = validateMessagesArray(req.messages);
  if (messagesError) return messagesError;

  if (!req.messages.every(validateMessage)) {
    return 'Invalid message format. Each message must have role (system/user/assistant) and content (string)';
  }

  if (!req.model) {
    return 'Model is required';
  }

  return null;
}