import fetch from 'node-fetch';
import { AIProvider, ChatCompletionRequest, ChatCompletionResponse, ModelsResponse } from '../types.js';

export class OpenRouterProvider implements AIProvider {
  name = 'openrouter';
  private apiKey: string | undefined;
  private baseUrl = 'https://openrouter.ai/api/v1';

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {

    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'OpenRouter Proxy Backend'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<ChatCompletionResponse>;
  }

  async getModels(): Promise<ModelsResponse> {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const response = await fetch(`${this.baseUrl}/models`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'X-Title': 'OpenRouter Proxy Backend'
      }
    });

    if (!response.ok) {
      throw new Error(`OpenRouter models API error: ${response.status}`);
    }

    return response.json() as Promise<ModelsResponse>;
  }
}