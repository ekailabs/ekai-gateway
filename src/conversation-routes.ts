import { Request, Response } from 'express';
import { conversationStore } from './conversation-store.js';

export function getConversationHistory(req: Request, res: Response) {
  try {
    const conversation = conversationStore.getConversation();
    res.json({
      conversation,
      messageCount: conversationStore.getMessageCount()
    });
  } catch (error) {
    console.error('Error retrieving conversation history:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export function resetConversationHistory(req: Request, res: Response) {
  try {
    conversationStore.reset();
    res.json({ 
      message: 'Conversation history reset successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error resetting conversation history:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}