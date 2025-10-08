import { Response as ExpressResponse } from 'express';
import { logger } from '../utils/logger.js';
import { APIError } from '../utils/error-handler.js';
import { CONTENT_TYPES } from '../../domain/types/provider.js';
import { ModelUtils } from '../utils/model-utils.js';

type UsageFormat = 'anthropic_messages';

export interface MessagesAuthConfig {
  envVar: string;
  header: string;
  scheme?: string;
  template?: string;
}

export interface MessagesUsageConfig {
  format: UsageFormat;
}

export interface MessagesModelOptions {
  ensureAnthropicSuffix?: boolean;
}

export interface MessagesPassthroughConfig {
  provider: string;
  baseUrl: string;
  auth: MessagesAuthConfig;
  staticHeaders?: Record<string, string>;
  supportedClientFormats: string[];
  modelOptions?: MessagesModelOptions;
  usage?: MessagesUsageConfig;
  forceStreamOption?: boolean;
}

interface StreamUsageSnapshot {
  inputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export class MessagesPassthrough {
  private initialUsage: StreamUsageSnapshot | null = null;

  constructor(private readonly config: MessagesPassthroughConfig) {}

  private resolveBaseUrl(): string {
    return this.config.baseUrl;
  }

  private get apiKey(): string {
    const envVar = this.config.auth.envVar;
    const token = process.env[envVar];
    if (!token) {
      throw new APIError(401, `${this.config.provider} API key not configured`);
    }
    return token;
  }

  private buildAuthHeader(): string {
    const { scheme, template } = this.config.auth;
    const token = this.apiKey;

    if (template) {
      return template.replace('{{token}}', token);
    }

    if (scheme) {
      return `${scheme} ${token}`.trim();
    }

    return token;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.staticHeaders,
    };

    headers[this.config.auth.header] = this.buildAuthHeader();

    return headers;
  }

  private applyModelOptions(request: any): void {
    const modelOptions = this.config.modelOptions;
    if (!modelOptions) return;

    if (modelOptions.ensureAnthropicSuffix && typeof request.model === 'string') {
      request.model = ModelUtils.ensureAnthropicSuffix(request.model);
    }
  }

  private ensurePayloadBody(body: any, stream: boolean): any {
    if (this.config.forceStreamOption === false) {
      return { ...body };
    }
    return { ...body, stream };
  }

  private async makeRequest(body: any, stream: boolean): Promise<globalThis.Response> {
    const response = await fetch(this.resolveBaseUrl(), {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(this.ensurePayloadBody(body, stream)),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(response.status, `${this.config.provider} API error: ${response.status} - ${errorText}`);
    }

    return response;
  }

  private trackUsage(payloadChunk: string, model: string, clientIp?: string): void {
    if (this.config.usage?.format !== 'anthropic_messages') {
      return;
    }

    try {
      if (payloadChunk.includes('message_start')) {
        const match = payloadChunk.match(/data: ({.*"type":"message_start".*})/);
        if (match) {
          const data = JSON.parse(match[1]);
          if (data.message?.usage) {
            this.initialUsage = {
              inputTokens: data.message.usage.input_tokens || 0,
              cacheCreationTokens: data.message.usage.cache_creation_input_tokens || 0,
              cacheReadTokens: data.message.usage.cache_read_input_tokens || 0,
            };

            logger.debug('Usage tracking started', {
              provider: this.config.provider,
              model,
              ...this.initialUsage,
              module: 'messages-passthrough',
            });
          }
        }
        return;
      }

      if (payloadChunk.includes('message_delta') || payloadChunk.includes('message_stop')) {
        const match = payloadChunk.match(/data: ({.*"type":"(?:message_delta|message_stop)".*})/);
        if (match) {
          const data = JSON.parse(match[1]);
          if (data.usage && this.initialUsage) {
            const outputTokens = data.usage.output_tokens || 0;

            logger.debug('Usage tracking completed', {
              provider: this.config.provider,
              model,
              ...this.initialUsage,
              outputTokens,
              module: 'messages-passthrough',
            });

            import('../utils/usage-tracker.js')
              .then(({ usageTracker }) => {
                usageTracker.trackUsage(
                  model,
                  this.config.provider,
                  this.initialUsage!.inputTokens,
                  outputTokens,
                  this.initialUsage!.cacheCreationTokens,
                  this.initialUsage!.cacheReadTokens,
                  clientIp,
                );
              })
              .catch(error => {
                logger.error('Usage tracking failed', error, {
                  provider: this.config.provider,
                  operation: 'passthrough',
                  module: 'messages-passthrough',
                });
              });

            this.initialUsage = null;
          } else if (data.usage && !this.initialUsage) {
            const inputTokens = data.usage.input_tokens || 0;
            const cacheCreationTokens = data.usage.cache_creation_input_tokens || 0;
            const cacheReadTokens = data.usage.cache_read_input_tokens || 0;
            const outputTokens = data.usage.output_tokens || 0;

            logger.warn('Using fallback usage tracking', {
              provider: this.config.provider,
              reason: 'missed_message_start',
              model,
              inputTokens,
              cacheCreationTokens,
              cacheReadTokens,
              outputTokens,
              module: 'messages-passthrough',
            });

            import('../utils/usage-tracker.js')
              .then(({ usageTracker }) => {
                usageTracker.trackUsage(
                  model,
                  this.config.provider,
                  inputTokens,
                  outputTokens,
                  cacheCreationTokens,
                  cacheReadTokens,
                  clientIp,
                );
              })
              .catch(error => {
                logger.error('Usage tracking failed', error, {
                  provider: this.config.provider,
                  operation: 'passthrough',
                  module: 'messages-passthrough',
                });
              });
          }
        }
      }
    } catch (error) {
      logger.error('Usage tracking failed', error, {
        provider: this.config.provider,
        operation: 'passthrough',
        module: 'messages-passthrough',
      });
    }
  }

  async handleDirectRequest(request: any, res: ExpressResponse, clientIp?: string): Promise<void> {
    this.initialUsage = null;

    this.applyModelOptions(request);

    if (request.stream) {
      const response = await this.makeRequest(request, true);

      res.writeHead(200, {
        'Content-Type': CONTENT_TYPES.TEXT_PLAIN,
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      const reader = response.body!.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunkText = new TextDecoder().decode(value);
        setImmediate(() => this.trackUsage(chunkText, request.model, clientIp));

        res.write(value);
      }
      res.end();
      return;
    }

    const response = await this.makeRequest(request, false);
    const json = await response.json();

    if (json.usage && this.config.usage?.format === 'anthropic_messages') {
      const inputTokens = json.usage.input_tokens || 0;
      const cacheCreationTokens = json.usage.cache_creation_input_tokens || 0;
      const cacheReadTokens = json.usage.cache_read_input_tokens || 0;
      const outputTokens = json.usage.output_tokens || 0;

      logger.debug('Tracking non-streaming usage', {
        provider: this.config.provider,
        model: request.model,
        inputTokens,
        cacheCreationTokens,
        cacheReadTokens,
        outputTokens,
        module: 'messages-passthrough',
      });

      import('../utils/usage-tracker.js')
        .then(({ usageTracker }) => {
          usageTracker.trackUsage(
            request.model,
            this.config.provider,
            inputTokens,
            outputTokens,
            cacheCreationTokens,
            cacheReadTokens,
            clientIp,
          );
        })
        .catch(error => {
          logger.error('Usage tracking failed', error, {
            provider: this.config.provider,
            operation: 'passthrough',
            module: 'messages-passthrough',
          });
        });
    }

    res.json(json);
  }
}
