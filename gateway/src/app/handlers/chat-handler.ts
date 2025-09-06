import { Request, Response } from 'express';
import { ProviderService } from '../../domain/services/provider-service.js';
import { OpenAIAdapter } from '../../infrastructure/adapters/openai-adapter.js';
import { AnthropicAdapter } from '../../infrastructure/adapters/anthropic-adapter.js';
import { handleError } from '../../infrastructure/utils/error-handler.js';
import { logger } from '../../infrastructure/utils/logger.js';
import { HTTP_STATUS, CONTENT_TYPES } from '../../domain/types/provider.js';

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
      const canonicalRequest = this.adapters[clientFormat].toCanonical(originalRequest);
      
      logger.info('Processing chat request', {
        clientFormat,
        model: canonicalRequest.model,
        streaming: canonicalRequest.stream
      });

      if (canonicalRequest.stream) {
        await this.handleStreaming(canonicalRequest, res, clientFormat, originalRequest);
      } else {
        await this.handleNonStreaming(canonicalRequest, res, clientFormat, originalRequest);
      }
    } catch (error) {
      logger.error('Chat request failed', error instanceof Error ? error : new Error(String(error)));
      handleError(error, res, clientFormat === 'anthropic');
    }
  }

  private async handleNonStreaming(canonicalRequest: any, res: Response, clientFormat: ClientFormat, originalRequest?: any): Promise<void> {
    const canonicalResponse = await this.providerService.processChatCompletion(canonicalRequest, originalRequest, clientFormat);
    const clientResponse = this.adapters[clientFormat].fromCanonical(canonicalResponse);
    
    res.status(HTTP_STATUS.OK).json(clientResponse);
  }

  private async handleStreaming(canonicalRequest: any, res: Response, clientFormat: ClientFormat, originalRequest?: any): Promise<void> {
    const streamResponse = await this.providerService.processStreamingRequest(canonicalRequest, originalRequest, clientFormat);
    
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