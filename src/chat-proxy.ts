import { Request, Response } from 'express';
import { ProviderManager } from './provider-manager.js';
import { ChatCompletionRequest, ChatMessage } from './types.js';
import { conversationStore } from './conversation-store.js';
import { validateChatCompletionRequest } from './utils/validation.js';
import { handleError, APIError } from './utils/error-handler.js';

const providerManager = new ProviderManager();

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

    const validationError = validateChatCompletionRequest(req.body);
    if (validationError) {
      throw new APIError(400, validationError);
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

    res.json(response);
  } catch (error) {
    handleError(error, res, false);
  }
}