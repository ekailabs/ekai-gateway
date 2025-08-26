import fetch from 'node-fetch';
import { AIProvider, ChatCompletionRequest, ChatCompletionResponse, ModelsResponse } from '../types.js';

export class OpenAIProvider implements AIProvider {
  name = 'openai';
  private apiKey: string | undefined;
  private baseUrl = 'https://api.openai.com/v1';

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<ChatCompletionResponse>;
  }

  async getModels(): Promise<ModelsResponse> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch(`${this.baseUrl}/models`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`OpenAI models API error: ${response.status}`);
    }

    return response.json() as Promise<ModelsResponse>;
  }
}