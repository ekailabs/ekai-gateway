import { Request, Response } from 'express';
import { ProviderService } from '../../domain/services/provider-service.js';
import { OpenAIAdapter } from '../../infrastructure/adapters/openai-adapter.js';
import { AnthropicAdapter } from '../../infrastructure/adapters/anthropic-adapter.js';
import { handleError, APIError } from '../../infrastructure/utils/error-handler.js';
import { logger } from '../../infrastructure/utils/logger.js';
import { HTTP_STATUS, CONTENT_TYPES } from '../../domain/types/provider.js';
import { ModelUtils } from '../../infrastructure/utils/model-utils.js';

type ClientFormat = 'openai' | 'anthropic';

export class ChatHandler {
  constructor(
    private readonly providerService: ProviderService,
    private readonly adapters: {
      openai: OpenAIAdapter;
      anthropic: AnthropicAdapter;
    }
  ) {}

  async handleChatRequest(req: Request, res: Response, clientFormat: ClientFormat): Promise<void> {
    try {
      const originalRequest = req.body;
      const result = this.providerService.getMostOptimalProvider(req.body.model);
      
      if (result.error) {
        const statusCode = result.error.code === 'NO_PROVIDERS_CONFIGURED' ? 503 : 400;
        throw new APIError(statusCode, result.error.message, result.error.code);
      }
      
      const providerName = result.provider;

      if (req.body.model.includes(providerName)) {
        req.body.model = ModelUtils.removeProviderPrefix(req.body.model);
      }
      
      logger.info('Processing chat request', {
        clientFormat,
        model: req.body.model,
        provider: providerName,
        streaming: req.body.stream
      });

      const canonicalRequest = this.adapters[clientFormat].toCanonical(req.body);

      if (canonicalRequest.stream) {
        await this.handleStreaming(canonicalRequest, res, clientFormat, providerName, originalRequest);
      } else {
        await this.handleNonStreaming(canonicalRequest, res, clientFormat, providerName, originalRequest);
      }
    } catch (error) {
      logger.error('Chat request failed', error instanceof Error ? error : new Error(String(error)));
      handleError(error, res, clientFormat);
    }
  }


  private async handleNonStreaming(canonicalRequest: any, res: Response, clientFormat: ClientFormat, providerName: any, originalRequest?: any): Promise<void> {
    const canonicalResponse = await this.providerService.processChatCompletion(canonicalRequest, providerName, clientFormat, originalRequest);
    const clientResponse = this.adapters[clientFormat].fromCanonical(canonicalResponse);
    
    res.status(HTTP_STATUS.OK).json(clientResponse);
  }

  private async handleStreaming(canonicalRequest: any, res: Response, clientFormat: ClientFormat, providerName: any, originalRequest?: any): Promise<void> {
    const streamResponse = await this.providerService.processStreamingRequest(canonicalRequest, providerName, clientFormat, originalRequest);
    
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
export const handleOpenAIFormatChat = async (req: Request, res: Response): Promise<void> => {
  await chatHandler.handleChatRequest(req, res, 'openai');
};

export const handleAnthropicFormatChat = async (req: Request, res: Response): Promise<void> => {
  await chatHandler.handleChatRequest(req, res, 'anthropic');
};