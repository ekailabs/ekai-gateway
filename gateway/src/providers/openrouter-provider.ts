import { BaseProvider } from './base-provider.js';

export class OpenRouterProvider extends BaseProvider {
  readonly name = 'openrouter';
  protected readonly baseUrl = 'https://openrouter.ai/api/v1';
  protected readonly apiKey = process.env.OPENROUTER_API_KEY;

  protected getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'OpenRouter Proxy Backend'
    };
  }
}