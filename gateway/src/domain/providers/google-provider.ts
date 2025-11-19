import fetch, { Response as FetchResponse } from 'node-fetch';
import { CanonicalRequest, CanonicalResponse } from 'shared/types/index.js';
import { BaseProvider } from './base-provider.js';
import { getConfig } from '../../infrastructure/config/app-config.js';
import { ModelUtils } from '../../infrastructure/utils/model-utils.js';
import { ProviderError, AuthenticationError } from '../../shared/errors/index.js';
import { usageTracker } from '../../infrastructure/utils/usage-tracker.js';

interface GoogleContentPart {
  text?: string;
}

interface GoogleContent {
  role: string;
  parts: GoogleContentPart[];
}

interface GoogleResponseCandidate {
  content?: GoogleContent;
  finishReason?: string;
}

interface GoogleResponse {
  candidates?: GoogleResponseCandidate[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

export class GoogleProvider extends BaseProvider {
  readonly name = 'google';
  protected readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  private lastRequestedModel: string | null = null;

  protected get apiKey(): string | undefined {
    return getConfig().providers.google.apiKey;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  protected getHeaders(): Record<string, string> {
    if (!this.apiKey) {
      throw new AuthenticationError('Google API key not configured', { provider: this.name });
    }
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': this.apiKey
    };
  }

  private normalizeModelName(model: string): string {
    return ModelUtils.removeProviderPrefix(model);
  }

  private buildUrl(model: string, endpoint: 'generateContent' | 'streamGenerateContent'): string {
    return `${this.baseUrl}/models/${this.normalizeModelName(model)}:${endpoint}`;
  }

  protected transformRequest(request: CanonicalRequest): Record<string, unknown> {
    const systemMessages = request.messages.filter(msg => msg.role === 'system');
    const conversationMessages = request.messages.filter(msg => msg.role !== 'system');

    const contents = conversationMessages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: msg.content.map(part => ({ text: part.text }))
    }));

    const body: Record<string, unknown> = { contents };

    if (systemMessages.length) {
      body.systemInstruction = {
        parts: systemMessages.flatMap(msg => msg.content.map(part => ({ text: part.text })))
      };
    }

    const generationConfig: Record<string, unknown> = {};
    if (typeof request.temperature === 'number') {
      generationConfig.temperature = request.temperature;
    }
    if (typeof request.topP === 'number') {
      generationConfig.topP = request.topP;
    }
    if (typeof request.maxTokens === 'number') {
      generationConfig.maxOutputTokens = request.maxTokens;
    }
    if (request.stopSequences?.length) {
      generationConfig.stopSequences = request.stopSequences;
    }

    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig;
    }

    return body;
  }

  private toCanonicalResponse(response: GoogleResponse, requestedModel: string): CanonicalResponse {
    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const text = parts
      .map(part => part.text ?? '')
      .join('')
      .trim();

    const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
    const totalTokens = response.usageMetadata?.totalTokenCount ?? (inputTokens + outputTokens);

    return {
      id: `google-${Date.now()}`,
      model: requestedModel,
      created: Math.floor(Date.now() / 1000),
      message: {
        role: 'assistant',
        content: [{
          type: 'text',
          text
        }]
      },
      finishReason: this.mapFinishReason(candidate?.finishReason),
      usage: {
        inputTokens,
        outputTokens,
        totalTokens
      }
    };
  }

  protected transformResponse(response: Record<string, unknown>): CanonicalResponse {
    const model = this.lastRequestedModel ?? 'gemini';
    return this.toCanonicalResponse(response as GoogleResponse, model);
  }

  private mapFinishReason(reason?: string): 'stop' | 'length' | 'tool_calls' | 'error' {
    switch ((reason || '').toUpperCase()) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      default:
        return 'stop';
    }
  }

  async chatCompletion(request: CanonicalRequest): Promise<CanonicalResponse> {
    if (!this.apiKey) {
      throw new AuthenticationError('Google API key not configured', { provider: this.name });
    }

    this.lastRequestedModel = request.model;
    const url = this.buildUrl(request.model, 'generateContent');
    const body = JSON.stringify(this.transformRequest(request));
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ProviderError(this.name, errorText || `HTTP ${response.status}`, response.status, { endpoint: url });
    }

    const json = await response.json() as GoogleResponse;
    const canonical = this.toCanonicalResponse(json, request.model);

    usageTracker.trackUsage(
      request.model,
      this.name,
      canonical.usage.inputTokens,
      canonical.usage.outputTokens,
      canonical.usage.cacheWriteInputTokens || 0,
      canonical.usage.cacheReadInputTokens || 0
    );

    return canonical;
  }

  async getStreamingResponse(request: CanonicalRequest): Promise<FetchResponse> {
    if (!this.apiKey) {
      throw new AuthenticationError('Google API key not configured', { provider: this.name });
    }

    const url = `${this.buildUrl(request.model, 'streamGenerateContent')}?alt=sse`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        Accept: 'text/event-stream'
      },
      body: JSON.stringify(this.transformRequest(request))
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ProviderError(this.name, errorText || `HTTP ${response.status}`, response.status, { endpoint: url, stream: true });
    }

    return response;
  }
}
