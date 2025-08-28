import { BaseProvider } from './base-provider.js';

export class OpenRouterProvider extends BaseProvider {
  readonly name = 'openrouter';
  protected readonly baseUrl = 'https://openrouter.ai/api/v1';
  protected readonly apiKey = process.env.OPENROUTER_API_KEY;
  protected readonly extraHeaders = {
    'X-Title': 'OpenRouter Proxy Backend'
  };
}