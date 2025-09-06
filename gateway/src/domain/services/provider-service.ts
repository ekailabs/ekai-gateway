import { openaiAdapter, anthropicAdapter, canonicalValidator } from '../../canonical/index.js';
import { Request as CanonicalRequest, Response as CanonicalResponse } from '../../canonical/types/index.js';
import { logger } from '../../infrastructure/utils/logger.js';

type ProviderName = 'anthropic' | 'openai' | 'openrouter';

interface Provider {
  name: ProviderName;
  baseURL: string;
  apiKey: string;
  makeRequest: (request: any, streaming?: boolean) => Promise<any>;
}

export class ProviderService {
  private providers: Map<ProviderName, Provider> = new Map();
  private readonly PROVIDER_NAMES: ProviderName[] = ['anthropic', 'openai', 'openrouter'];

  constructor() {
    // Initialize providers based on available environment variables
    this.initializeProviders();
  }

  private initializeProviders() {
    logger.info('Initializing providers', {
      openaiKey: !!process.env.OPENAI_API_KEY,
      anthropicKey: !!process.env.ANTHROPIC_API_KEY,
      openrouterKey: !!process.env.OPENROUTER_API_KEY
    });
    
    // OpenAI Provider
    if (process.env.OPENAI_API_KEY) {
      this.providers.set('openai', {
        name: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey: process.env.OPENAI_API_KEY,
        makeRequest: this.makeOpenAIRequest.bind(this)
      });
      logger.info('OpenAI provider configured');
    }

    // Anthropic Provider
    if (process.env.ANTHROPIC_API_KEY) {
      this.providers.set('anthropic', {
        name: 'anthropic',
        baseURL: 'https://api.anthropic.com/v1',
        apiKey: process.env.ANTHROPIC_API_KEY,
        makeRequest: this.makeAnthropicRequest.bind(this)
      });
      logger.info('Anthropic provider configured');
    }

    // OpenRouter Provider  
    if (process.env.OPENROUTER_API_KEY) {
      this.providers.set('openrouter', {
        name: 'openrouter',
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY,
        makeRequest: this.makeOpenRouterRequest.bind(this)
      });
      logger.info('OpenRouter provider configured');
    }

    logger.info('Initialized providers', { 
      available: Array.from(this.providers.keys()),
      total: this.providers.size 
    });
  }

  private getProviderForModel(model: string): ProviderName {
    if (model.startsWith('claude-')) {
      return 'anthropic';
    }
    
    if (!model.includes('/')) {
      return 'openai';
    }
    
    return 'openrouter';
  }

  getAvailableProviders(): ProviderName[] {
    return Array.from(this.providers.keys());
  }

  private getConfiguredProvider(providerName: ProviderName): Provider {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider ${providerName} is not configured. Please check your environment variables.`);
    }
    return provider;
  }

  async processChatCompletion(
    request: CanonicalRequest, 
    originalRequest?: unknown, 
    isPassthrough?: boolean, 
    clientType?: 'openai' | 'anthropic'
  ): Promise<CanonicalResponse> {
    const providerName = this.getProviderForModel(request.model);
    const provider = this.getConfiguredProvider(providerName);

    logger.info('Processing chat completion', {
      model: request.model,
      provider: providerName,
      streaming: false,
      passthrough: isPassthrough
    });

    // Convert canonical request to provider format
    let providerRequest: any;
    
    switch (providerName) {
      case 'anthropic':
        providerRequest = anthropicAdapter.canonicalToProvider(request);
        break;
      case 'openai':
      case 'openrouter':
        providerRequest = openaiAdapter.canonicalToProvider(request);
        break;
      default:
        throw new Error(`Unsupported provider: ${providerName}`);
    }

    logger.debug('Converted to provider format', { 
      provider: providerName, 
      model: providerRequest.model 
    });

    // Make request to provider
    const providerResponse = await provider.makeRequest(providerRequest, false);

    logger.debug('Received provider response', { 
      provider: providerName,
      responseId: providerResponse.id || 'no-id'
    });

    // Convert provider response back to canonical format
    let canonicalResponse: CanonicalResponse;
    
    switch (providerName) {
      case 'anthropic':
        canonicalResponse = anthropicAdapter.providerToCanonical(providerResponse);
        break;
      case 'openai':
      case 'openrouter':
        canonicalResponse = openaiAdapter.providerToCanonical(providerResponse);
        break;
      default:
        throw new Error(`Unsupported provider: ${providerName}`);
    }

    // Mark as passthrough if applicable
    if (isPassthrough) {
      (canonicalResponse as any)._isPassthrough = true;
    }

    return canonicalResponse;
  }

  async processStreamingRequest(
    request: CanonicalRequest,
    originalRequest?: unknown,
    isPassthrough?: boolean,
    clientType?: 'openai' | 'anthropic'
  ): Promise<any> {
    const providerName = this.getProviderForModel(request.model);
    const provider = this.getConfiguredProvider(providerName);

    logger.info('Processing streaming request', {
      model: request.model,
      provider: providerName,
      streaming: true,
      passthrough: isPassthrough
    });

    // Convert canonical request to provider format
    let providerRequest: any;
    
    switch (providerName) {
      case 'anthropic':
        providerRequest = anthropicAdapter.canonicalToProvider(request);
        break;
      case 'openai':
      case 'openrouter':
        providerRequest = openaiAdapter.canonicalToProvider(request);
        break;
      default:
        throw new Error(`Unsupported provider: ${providerName}`);
    }

    // Ensure streaming is enabled
    providerRequest.stream = true;

    return await provider.makeRequest(providerRequest, true);
  }

  private async makeOpenAIRequest(request: any, streaming: boolean = false): Promise<any> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
    }

    if (streaming) {
      return { body: response.body };
    }

    return await response.json();
  }

  private async makeAnthropicRequest(request: any, streaming: boolean = false): Promise<any> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${error}`);
    }

    if (streaming) {
      return { body: response.body };
    }

    return await response.json();
  }

  private async makeOpenRouterRequest(request: any, streaming: boolean = false): Promise<any> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'http://localhost:3001',
        'X-Title': 'AI Proxy'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} ${error}`);
    }

    if (streaming) {
      return { body: response.body };
    }

    return await response.json();
  }

  async getAllModels(): Promise<any> {
    // Return available models based on configured providers
    const models: any = {};
    
    for (const providerName of this.getAvailableProviders()) {
      switch (providerName) {
        case 'openai':
          models.openai = ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'];
          break;
        case 'anthropic':
          models.anthropic = ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'];
          break;
        case 'openrouter':
          models.openrouter = ['anthropic/claude-3.5-sonnet', 'meta-llama/llama-3.1-8b-instruct'];
          break;
      }
    }
    
    return models;
  }
}