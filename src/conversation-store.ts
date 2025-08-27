import { ConversationHistory, ConversationMessage } from './types.js';

class ConversationStore {
  private conversation: ConversationHistory;

  constructor() {
    this.conversation = {
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  addMessage(role: 'user' | 'assistant', content: string): void {
    const message: ConversationMessage = {
      role,
      content,
      timestamp: new Date().toISOString()
    };

    this.conversation.messages.push(message);
    this.conversation.updatedAt = new Date().toISOString();
    
    console.log(`💬 Added ${role} message to conversation history`);
  }

  addMessages(messages: ConversationMessage[]): void {
    messages.forEach(msg => {
      this.conversation.messages.push({
        ...msg,
        timestamp: new Date().toISOString()
      });
    });
    this.conversation.updatedAt = new Date().toISOString();
  }

  getConversation(): ConversationHistory {
    return { ...this.conversation };
  }

  reset(): void {
    this.conversation = {
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    console.log('🗑️  Conversation history reset');
  }

  getMessageCount(): number {
    return this.conversation.messages.length;
  }
}

export const conversationStore = new ConversationStore();