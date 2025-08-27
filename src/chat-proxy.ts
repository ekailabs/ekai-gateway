import { Request, Response } from 'express';
import { ProviderManager } from './provider-manager.js';
import { ChatCompletionRequest, ChatMessage } from './types.js';
import { conversationStore } from './conversation-store.js';

const providerManager = new ProviderManager();

const VALID_ROLES = ['system', 'user', 'assistant'] as const;

function validateMessage(msg: any): msg is ChatMessage {
  return msg && 
         typeof msg.role === 'string' && 
         VALID_ROLES.includes(msg.role as any) &&
         typeof msg.content === 'string';
}

function manageContext(messages: ChatMessage[]): ChatMessage[] {
  // If only a single message is provided, append conversation history
  if (messages.length === 1 && messages[0].role === 'user') {
    const history = conversationStore.getConversation();
    const historicalMessages: ChatMessage[] = history.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    console.log(`📚 Appending ${history.messages.length} historical messages to single user message`);
    return [...historicalMessages, ...messages];
  }
  return messages;
}

export async function chatCompletionProxy(req: Request, res: Response) {
  try {
    const { messages, model, stream = false, ...otherParams } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    if (messages.length === 0) {
      return res.status(400).json({ error: 'At least one message is required' });
    }

    if (!messages.every(validateMessage)) {
      return res.status(400).json({ error: 'Invalid message format. Each message must have role (system/user/assistant) and content (string)' });
    }

    if (!model) {
      return res.status(400).json({ error: 'Model is required' });
    }

    console.log(`🚀 The model is here ${model}`);

    // Manage conversation context
    const messagesToSend = manageContext(messages);

    // Store user messages in conversation history
    const userMessages = messages.filter((msg: ChatMessage) => msg.role === 'user');
    userMessages.forEach((msg: ChatMessage) => {
      conversationStore.addMessage('user', msg.content);
    });

    const request: ChatCompletionRequest = {
      model,
      messages: messagesToSend,
      stream,
      ...otherParams
    };
    
    const response = await providerManager.handleChatCompletion(request);

    // Store assistant response in conversation history
    if (response.choices && response.choices[0]?.message) {
      const assistantMessage = response.choices[0].message;
      conversationStore.addMessage('assistant', assistantMessage.content);
    }

    // Response is already JSON parsed from the provider
    res.json(response);
  } catch (error) {
    console.error('Chat completion proxy error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}