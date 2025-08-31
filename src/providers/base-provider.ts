import fetch from 'node-fetch';
import { AIProvider, ChatCompletionRequest, ChatCompletionResponse, ModelsResponse } from '../types.js';
import { APIError } from '../utils/error-handler.js';
import { usageTracker } from '../utils/usage-tracker.js';

export abstract class BaseProvider implements AIProvider {
  abstract readonly name: string;
  protected abstract readonly baseUrl: string;
  protected abstract readonly apiKey: string | undefined;

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  // Template method pattern: allow providers to customize headers
  protected getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  // Template method pattern: allow providers to transform requests
  protected transformRequest(request: ChatCompletionRequest): any {
    return request;
  }

  // Template method pattern: allow providers to transform responses
  protected transformResponse(response: any): ChatCompletionResponse {
    return response;
  }

  // Template method pattern: allow providers to customize endpoint
  protected getChatCompletionEndpoint(): string {
    return '/chat/completions';
  }

  protected getModelsEndpoint(): string {
    return '/models';
  }

  protected async makeAPIRequest<T>(endpoint: string, options: any = {}): Promise<T> {
    if (!this.apiKey) {
      throw new APIError(401, `${this.name} API key not configured`);
    }

    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      ...this.getHeaders(),
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
    const transformedRequest = this.transformRequest(request);
    const response = await this.makeAPIRequest(this.getChatCompletionEndpoint(), {
      method: 'POST',
      body: JSON.stringify(transformedRequest)
    });
    
    const transformedResponse = this.transformResponse(response);
    usageTracker.trackUsage(this.name, request.model, transformedResponse);
    
    return transformedResponse;
  }

  async getModels(): Promise<ModelsResponse> {
    return this.makeAPIRequest<ModelsResponse>(this.getModelsEndpoint());
  }
}