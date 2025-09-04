import { Request, Response } from 'express';
import { ProviderService } from '../../domain/services/provider-service.js';
import { OpenAIAdapter } from '../../infrastructure/adapters/openai-adapter.js';
import { AnthropicAdapter } from '../../infrastructure/adapters/anthropic-adapter.js';
import { handleError } from '../../infrastructure/utils/error-handler.js';
import { logger } from '../../infrastructure/utils/logger.js';
import { HTTP_STATUS, CONTENT_TYPES } from '../../domain/types/provider.js';
import { passthroughValidator } from '../../infrastructure/utils/passthrough-validator.js';

type ClientType = 'openai' | 'anthropic';

export class ChatHandler {
  constructor(
    private readonly providerService: ProviderService,
    private readonly adapters: {
      openai: OpenAIAdapter;
      anthropic: AnthropicAdapter;
    }
  ) {}

  async handleChatRequest(req: Request, res: Response, clientType: ClientType): Promise<void> {
    try {
      const originalRequest = req.body;
      const canonicalRequest = this.adapters[clientType].toCanonical(originalRequest);
      
      logger.info('Processing chat request', {
        clientType,
        model: canonicalRequest.model,
        streaming: canonicalRequest.stream
      });

      // Check if this is a passthrough scenario
      const isPassthrough = passthroughValidator.shouldValidatePassthrough(clientType, canonicalRequest.model);
      
      if (isPassthrough) {
        logger.info('🔍 PASSTHROUGH SCENARIO DETECTED', {
          clientType,
          model: canonicalRequest.model,
          scenario: `${clientType} → ${this.getProviderForModel(canonicalRequest.model)}`
        });
      }

      if (canonicalRequest.stream) {
        await this.handleStreaming(canonicalRequest, res, clientType, originalRequest, isPassthrough);
      } else {
        await this.handleNonStreaming(canonicalRequest, res, clientType, originalRequest, isPassthrough);
      }
    } catch (error) {
      logger.error('Chat request failed', error instanceof Error ? error : new Error(String(error)));
      handleError(error, res, clientType === 'anthropic');
    }
  }

  private async handleNonStreaming(canonicalRequest: any, res: Response, clientType: ClientType, originalRequest?: any, isPassthrough?: boolean): Promise<void> {
    const canonicalResponse = await this.providerService.processChatCompletion(canonicalRequest, originalRequest, isPassthrough, clientType);
    const clientResponse = this.adapters[clientType].fromCanonical(canonicalResponse);
    
    res.status(HTTP_STATUS.OK).json(clientResponse);
  }

  private async handleStreaming(canonicalRequest: any, res: Response, clientType: ClientType, originalRequest?: any, isPassthrough?: boolean): Promise<void> {
    const streamResponse = await this.providerService.processStreamingRequest(canonicalRequest, originalRequest, isPassthrough, clientType);
    
    res.writeHead(HTTP_STATUS.OK, {
      'Content-Type': CONTENT_TYPES.TEXT_PLAIN,
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    if (streamResponse?.body) {
      streamResponse.body.pipe(res);
    } else {
      throw new Error('No stream body received from provider');
    }
  }

  private getProviderForModel(model: string): string {
    if (model.startsWith('claude-')) return 'anthropic';
    if (!model.includes('/')) return 'openai';
    return 'openrouter';
  }
}

// Factory function
export function createChatHandler(): ChatHandler {
  const providerService = new ProviderService();
  const adapters = {
    openai: new OpenAIAdapter(),
    anthropic: new AnthropicAdapter()
  };

  return new ChatHandler(providerService, adapters);
}

// Singleton instance
const chatHandler = createChatHandler();

// Endpoint functions
export const handleOpenAIChat = async (req: Request, res: Response): Promise<void> => {
  await chatHandler.handleChatRequest(req, res, 'openai');
};

export const handleAnthropicChat = async (req: Request, res: Response): Promise<void> => {
  await chatHandler.handleChatRequest(req, res, 'anthropic');
};