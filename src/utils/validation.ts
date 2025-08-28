import { ChatMessage, AnthropicMessagesRequest } from '../types.js';

export const VALID_ROLES = ['system', 'user', 'assistant'] as const;
export const VALID_ANTHROPIC_ROLES = ['user', 'assistant'] as const;

export function validateMessage(msg: any): msg is ChatMessage {
  return msg && 
         typeof msg.role === 'string' && 
         VALID_ROLES.includes(msg.role as any) &&
         typeof msg.content === 'string';
}

export function validateAnthropicMessage(msg: any): boolean {
  return msg && 
         typeof msg.role === 'string' && 
         VALID_ANTHROPIC_ROLES.includes(msg.role as any) &&
         typeof msg.content === 'string';
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
    return 'Invalid message format. Each message must have role (user/assistant) and content (string)';
  }

  if (!req.model) {
    return 'Model is required';
  }

  if (!req.max_tokens) {
    return 'max_tokens is required';
  }

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