import fetch from 'node-fetch';
import { AIProvider, ChatCompletionRequest, ChatCompletionResponse, ModelsResponse } from '../types.js';
import { APIError } from '../utils/error-handler.js';
import { usageTracker } from '../utils/usage-tracker.js';

export abstract class BaseProvider implements AIProvider {
  abstract readonly name: string;
  protected abstract readonly baseUrl: string;
  protected abstract readonly apiKey: string | undefined;
  protected readonly extraHeaders?: Record<string, string>;

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  protected async makeAPIRequest<T>(endpoint: string, options: any = {}): Promise<T> {
    if (!this.apiKey) {
      throw new APIError(401, `${this.name} API key not configured`);
    }

    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...this.extraHeaders,
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(
        response.status, 
        `${this.name} API error: ${response.status} - ${errorText}`
      );
    }

    return response.json() as Promise<T>;
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const response = await this.makeAPIRequest<ChatCompletionResponse>('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(request)
    });
    
    usageTracker.trackUsage(this.name, request.model, response);
    
    return response;
  }

  async getModels(): Promise<ModelsResponse> {
    return this.makeAPIRequest<ModelsResponse>('/models');
  }
}