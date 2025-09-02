import { BaseProvider } from './base-provider.js';

export class OpenAIProvider extends BaseProvider {
  readonly name = 'openai';
  protected readonly baseUrl = 'https://api.openai.com/v1';
  protected readonly apiKey = process.env.OPENAI_API_KEY;
}