import fetch from 'node-fetch';
import { CanonicalRequest, CanonicalResponse } from 'shared/types/index.js';
import { ProviderError, AuthenticationError } from '../../shared/errors/index.js';
import { usageTracker } from '../../infrastructure/utils/usage-tracker.js';
import { AIProvider, ProviderRequest, ProviderResponse, HTTP_STATUS } from '../types/provider.js';
import { logger } from '../../infrastructure/utils/logger.js';
import type { SapphireRequestContext } from '../../infrastructure/middleware/sapphire-context.js';

/**
 * Request context passed to getApiKey for ROFL authorization
 */
export interface ApiKeyContext {
  sapphireContext?: SapphireRequestContext;
}

export abstract class BaseProvider implements AIProvider {
  abstract readonly name: string;
  protected abstract readonly baseUrl: string;

  /**
   * Get the API key for this provider
   *
   * In Sapphire mode, this performs the full ROFL authorization workflow:
   * 1. Check delegate permission
   * 2. Check model permission
   * 3. Get encrypted secret
   * 4. Decrypt in TEE
   *
   * @param context - Optional context for ROFL authorization
   * @returns The API key, or undefined if not configured
   */
  protected abstract getApiKey(context?: ApiKeyContext): Promise<string | undefined>;

  /**
   * Check if the provider is configured
   *
   * Note: In Sapphire mode, this checks configuration availability,
   * not actual key retrieval (which requires request context).
   */
  abstract isConfigured(): boolean;

  /**
   * Get headers for API requests
   * Override in subclasses for provider-specific headers
   *
   * @param apiKey - The API key to use for authorization
   */
  protected getHeaders(apiKey: string): Record<string, string> {
    return {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  // Provider-specific transformations with proper types
  protected abstract transformRequest(request: CanonicalRequest): ProviderRequest;
  protected abstract transformResponse(response: ProviderResponse): CanonicalResponse;

  // Template method pattern: allow providers to customize endpoint
  protected getChatCompletionEndpoint(): string {
    return '/chat/completions';
  }


  protected async makeAPIRequest<T>(
    endpoint: string,
    options: Record<string, unknown> = {},
    context?: ApiKeyContext
  ): Promise<T> {
    const apiKey = await this.getApiKey(context);

    if (!apiKey) {
      throw new AuthenticationError(`${this.name} API key not configured`, { provider: this.name });
    }

    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      ...this.getHeaders(apiKey),
      ...(options.headers as Record<string, string> || {})
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ProviderError(
        this.name,
        errorText || `HTTP ${response.status}`,
        response.status,
        { endpoint, statusText: response.statusText }
      );
    }

    return response.json() as Promise<T>;
  }

  async chatCompletion(request: CanonicalRequest, context?: ApiKeyContext): Promise<CanonicalResponse> {
    const transformedRequest = this.transformRequest(request);
    const response = await this.makeAPIRequest(this.getChatCompletionEndpoint(), {
      method: 'POST',
      body: JSON.stringify(transformedRequest)
    }, context);

    const transformedResponse = this.transformResponse(response);

    // Track usage
    if (transformedResponse.usage) {
      const clientIp = (response as any)?._clientIp;
      usageTracker.trackUsage(
        request.model,
        this.name,
        transformedResponse.usage.inputTokens,
        transformedResponse.usage.outputTokens,
        transformedResponse.usage.cacheWriteInputTokens || 0,
        transformedResponse.usage.cacheReadInputTokens || 0,
        clientIp
      );
    }

    return transformedResponse;
  }

  async getStreamingResponse(request: CanonicalRequest, context?: ApiKeyContext): Promise<any> {
    const transformedRequest = this.transformRequest(request);

    // Set stream: true for streaming requests
    const streamingRequest = { ...transformedRequest, stream: true };

    const apiKey = await this.getApiKey(context);

    if (!apiKey) {
      throw new AuthenticationError(`${this.name} API key not configured`, { provider: this.name });
    }

    const url = `${this.baseUrl}${this.getChatCompletionEndpoint()}`;
    const headers = {
      ...this.getHeaders(apiKey),
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache'
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(streamingRequest)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ProviderError(
        this.name,
        errorText || `HTTP ${response.status}`,
        response.status,
        { endpoint: this.getChatCompletionEndpoint(), stream: true, statusText: response.statusText }
      );
    }

    return response;
  }

}
