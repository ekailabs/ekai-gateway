import { Request, Response } from 'express';
import { ProviderService } from '../../domain/services/provider-service.js';
import { OpenAIAdapter } from '../../infrastructure/adapters/openai-adapter.js';
import { OpenAIResponsesAdapter } from '../../infrastructure/adapters/openai-responses-adapter.js';
import { AnthropicAdapter } from '../../infrastructure/adapters/anthropic-adapter.js';
import { handleError, APIError } from '../../infrastructure/utils/error-handler.js';
import { logger } from '../../infrastructure/utils/logger.js';
import { HTTP_STATUS, CONTENT_TYPES } from '../../domain/types/provider.js';
import { ModelUtils } from '../../infrastructure/utils/model-utils.js';
import { CanonicalRequest } from 'shared/types/index.js';
import { anthropicPassthrough } from '../../infrastructure/passthrough/anthropic-passthrough.js';
import { xaiPassthrough } from '../../infrastructure/passthrough/xai-passthrough.js';
import { openaiResponsesPassthrough } from '../../infrastructure/passthrough/openai-responses-passthrough.js';

type ClientFormat = 'openai' | 'anthropic' | 'openai_responses';
type ProviderName = string;

interface StreamingHeaders {
  'Content-Type': string;
  'Cache-Control': string;
  'Connection': string;
  'Access-Control-Allow-Origin': string;
}

const PROVIDERS = {
  ANTHROPIC: 'anthropic'
} as const;

export class ChatHandler {
  constructor(
    private readonly providerService: ProviderService,
    private readonly adapters: {
      openai: OpenAIAdapter;
      anthropic: AnthropicAdapter;
      openai_responses: OpenAIResponsesAdapter;
    }
  ) {}

  async handleChatRequest(req: Request, res: Response, clientFormat: ClientFormat): Promise<void> {
    try {
      logger.debug('Processing chat request', { requestId: req.requestId, module: 'chat-handler' });
      const originalRequest = req.body;

      // For OpenAI responses, we need to determine if we should use passthrough
      // This requires provider selection logic
      let providerName: ProviderName;
      let canonicalRequest: CanonicalRequest;

      if (clientFormat === 'openai_responses') {
        // For responses, we always want to use OpenAI provider (responses API is OpenAI-specific)
        // But we still need to check if passthrough should be used
        providerName = 'openai';
        canonicalRequest = this.adapters[clientFormat].toCanonical(req.body);

        logger.debug('Processing OpenAI Responses request', {
          requestId: req.requestId,
          clientFormat,
          model: canonicalRequest.model,
          streaming: canonicalRequest.stream,
          provider: providerName,
          module: 'chat-handler'
        });
      } else {
        // Normal flow for other client formats
        const result = this.providerService.getMostOptimalProvider(req.body.model, req.requestId);
        if (result.error) {
          const statusCode = result.error.code === 'NO_PROVIDERS_CONFIGURED' ? 503 : 400;
          throw new APIError(statusCode, result.error.message, result.error.code);
        }

        providerName = result.provider;
        canonicalRequest = this.adapters[clientFormat].toCanonical(req.body);
      }

      // Normalize model name, example: anthropic/claude-3-5-sonnet → claude-3-5-sonnet.
      // will need to move it to normalization canonical step in future
      if (req.body.model.includes(providerName)) {
        req.body.model = ModelUtils.removeProviderPrefix(req.body.model);
      }

      // Pass-through scenarios: where clientFormat and providerFormat are the same, we want to take a quick route
      // Currently supporting claude code proxy through pass-through, i.e., we skip the canonicalization step
      let passThrough = this.shouldUsePassThrough(clientFormat, providerName);

      // In canonical transformation test mode, force adapter path to enable comparison
      const canonicalMode = ['true', '1', 'yes'].includes(String(process.env.CANONICAL_CANONICAL_MODE || '').toLowerCase());
      if (canonicalMode && clientFormat === 'openai_responses') {
        passThrough = false;
      }

      logger.info('Chat request received', {
        requestId: req.requestId,
        model: req.body.model,
        provider: providerName,
        streaming: req.body.stream,
        passThrough,
        module: 'chat-handler'
      });

      if (passThrough) {
        await this.handlePassThrough(originalRequest, res, clientFormat, providerName);
        return;
      }

      // For non-passthrough cases, ensure we have canonical request
      if (clientFormat !== 'openai_responses') {
        canonicalRequest = this.adapters[clientFormat].toCanonical(req.body);
      }


      if (canonicalRequest.stream) {
        await this.handleStreaming(canonicalRequest, res, clientFormat, providerName, originalRequest, req);
      } else {
        await this.handleNonStreaming(canonicalRequest, res, clientFormat, providerName, originalRequest, req);
      }
    } catch (error) {
      logger.error('Chat request failed', error, { requestId: req.requestId, module: 'chat-handler' });
      const errorFormat = clientFormat === 'openai_responses' ? 'openai' : clientFormat;
      handleError(error, res, errorFormat);
    }
  }


  private async handleNonStreaming(canonicalRequest: CanonicalRequest, res: Response, clientFormat: ClientFormat, providerName?: ProviderName, originalRequest?: any, req?: Request): Promise<void> {
    if (clientFormat === 'openai_responses') {
      // Test mode: compare request transformation before making API call
      const canonicalMode = ['true', '1', 'yes'].includes(String(process.env.CANONICAL_MODE || '').toLowerCase());
      if (canonicalMode && providerName === 'openai') {
        await this.compareRequestTransformation(originalRequest, canonicalRequest, req?.requestId);
      }

      const canonicalResponse = await this.providerService.processChatCompletion(canonicalRequest, 'openai' as any, 'openai', originalRequest, req.requestId);
      const clientResponse = this.adapters[clientFormat].fromCanonical(canonicalResponse);

      // Test mode: compare response transformation with passthrough
      if (canonicalMode && providerName === 'openai') {
        await this.compareCanonicalTransformation(originalRequest, canonicalResponse, clientResponse, req?.requestId);
      }

      res.status(HTTP_STATUS.OK).json(clientResponse);
      return;
    }

    const canonicalResponse = await this.providerService.processChatCompletion(canonicalRequest, providerName as any, clientFormat, originalRequest, req.requestId);
    const clientResponse = this.adapters[clientFormat].fromCanonical(canonicalResponse);

    res.status(HTTP_STATUS.OK).json(clientResponse);
  }

  private async handleStreaming(canonicalRequest: CanonicalRequest, res: Response, clientFormat: ClientFormat, providerName?: ProviderName, originalRequest?: any, req?: Request): Promise<void> {
    if (clientFormat === 'openai_responses') {
      // Test mode: compare request transformation before making API call
      const canonicalMode = ['true', '1', 'yes'].includes(String(process.env.CANONICAL_MODE || '').toLowerCase());
      if (canonicalMode && providerName === 'openai') {
        await this.compareRequestTransformation(originalRequest, canonicalRequest, req?.requestId);
      }

      const streamResponse = await this.providerService.processStreamingRequest(canonicalRequest, 'openai' as any, 'openai', originalRequest, req.requestId);

      res.writeHead(HTTP_STATUS.OK, {
        'Content-Type': CONTENT_TYPES.EVENT_STREAM,
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      const compareStreaming = canonicalMode;

      if (!streamResponse?.body) {
        throw new Error('No stream body received from provider');
      }

      if (!compareStreaming) {
        streamResponse.body.pipe(res);
        return;
      }

      // In compare mode: stream adapter output to client while capturing it, and
      // concurrently capture a passthrough stream to compare after completion.
      const adapterChunks: string[] = [];
      const adapterDone = new Promise<void>((resolve, reject) => {
        try {
          streamResponse.body.on('data', (chunk: Buffer) => {
            const text = chunk.toString();
            adapterChunks.push(text);
            res.write(chunk);
          });
          streamResponse.body.on('end', () => {
            // Ensure the client stream is closed
            res.end();
            resolve();
          });
          streamResponse.body.on('error', (err: unknown) => {
            try { res.end(); } catch {}
            reject(err);
          });
        } catch (e) {
          try { res.end(); } catch {}
          reject(e);
        }
      });

      const passthroughDone = this.captureOpenAIResponsesPassthroughStream(originalRequest).catch((e) => {
        logger.warn('Passthrough stream capture failed', { error: (e as Error)?.message, requestId: req?.requestId, module: 'chat-handler' });
        return '';
      });

      // Wait for adapter stream to complete (client has received the stream already)
      await adapterDone;

      // Give passthrough a brief grace period to complete as well
      let passthroughData = '';
      try {
        passthroughData = await Promise.race([
          passthroughDone,
          new Promise<string>((resolve) => setTimeout(() => resolve(''), 5000))
        ]);
      } catch {}

      // Compare collected streams and log concise differences
      const adapterData = adapterChunks.join('');
      this.logSSEDifferences(passthroughData, adapterData, req?.requestId);
      return;
    }

    const streamResponse = await this.providerService.processStreamingRequest(canonicalRequest, providerName as any, clientFormat, originalRequest, req.requestId);

    this.setStreamingHeaders(res);

    if (streamResponse?.body) {
      streamResponse.body.pipe(res);
    } else {
      throw new Error('No stream body received from provider');
    }
  }

  // Capture passthrough SSE by mocking an Express Response that buffers writes
  private async captureOpenAIResponsesPassthroughStream(originalRequest: any): Promise<string> {
    const chunks: string[] = [];
    const mockRes: Partial<Response> = {
      writeHead: () => mockRes as any,
      setHeader: () => {},
      status: () => mockRes as any,
      write: (chunk: any) => { try { chunks.push(Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk)); } catch {} return true; },
      end: (chunk?: any) => { if (chunk) { try { chunks.push(Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk)); } catch {} } return mockRes as any; }
    } as any;

    await openaiResponsesPassthrough.handleDirectRequest(originalRequest, mockRes as Response);
    return chunks.join('');
  }

  // Compare request transformation: what gets sent to OpenAI API
  private async compareRequestTransformation(originalRequest: any, canonicalRequest: CanonicalRequest, requestId?: string): Promise<void> {
    try {
      // Import OpenAIProvider to build the request body that would be sent to OpenAI API
      const { OpenAIProvider } = await import('../../domain/providers/openai-provider.js');
      
      // Get what the adapter path would send to OpenAI API
      const adapterRequestBody = OpenAIProvider.buildRequestBodyForResponses(canonicalRequest);
      
      // Compare with what passthrough would send (original request)
      const differences = this.findObjectDifferences(originalRequest, adapterRequestBody);

      if (Object.keys(differences).length > 0) {
        const diffMessages = Object.entries(differences).map(([param, diff]) => 
          `${param}: passthrough="${this.serializeValue(diff.passthrough)}" vs adapter="${this.serializeValue(diff.adapter)}"`
        );
        
        logger.error('Request transformation differences found', {
          requestId,
          message: diffMessages.join(' | '),
          module: 'chat-handler'
        });
      } else {
        logger.info('Request transformation: NO differences found', {
          requestId,
          module: 'chat-handler'
        });
      }
    } catch (e) {
      logger.error('Request comparison failed', { error: (e as Error)?.message, requestId, module: 'chat-handler' });
    }
  }

  // Compare canonical transformation with passthrough ground truth
  private async compareCanonicalTransformation(originalRequest: any, canonicalResponse: any, adapterResponse: any, requestId?: string): Promise<void> {
    try {
      // Get what the passthrough would return by making the same request
      const passthroughResponse = await this.makeDirectPassthroughRequest(originalRequest);
      
      // Compare the passthrough response with the adapter response
      const differences = this.findObjectDifferences(passthroughResponse, adapterResponse);

      if (Object.keys(differences).length > 0) {
        const diffMessages = Object.entries(differences).map(([param, diff]) => 
          `${param}: passthrough="${this.serializeValue(diff.passthrough)}" vs adapter="${this.serializeValue(diff.adapter)}"`
        );
        
        logger.info('Canonical transformation differences found', {
          requestId,
          message: diffMessages.join(' | '),
          module: 'chat-handler'
        });
      } else {
        logger.info('Canonical transformation: NO differences found', {
          requestId,
          module: 'chat-handler'
        });
      }
    } catch (e) {
      logger.info('Canonical comparison failed', { error: (e as Error)?.message, requestId, module: 'chat-handler' });
    }
  }

  private async makeDirectPassthroughRequest(originalRequest: any): Promise<any> {
    // Create a mock response object to capture the passthrough response
    let capturedResponse: any = null;
    const mockRes: Partial<Response> = {
      status: () => mockRes as any,
      json: (data: any) => { capturedResponse = data; return mockRes as any; },
      writeHead: () => mockRes as any,
      write: () => true,
      end: () => mockRes as any
    } as any;

    await openaiResponsesPassthrough.handleDirectRequest(originalRequest, mockRes as Response);
    return capturedResponse;
  }

  private findObjectDifferences(obj1: any, obj2: any, path: string = ''): Record<string, any> {
    const differences: Record<string, any> = {};

    const keys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);

    for (const key of keys) {
      const currentPath = path ? `${path}.${key}` : key;
      const val1 = obj1?.[key];
      const val2 = obj2?.[key];

      if (val1 === val2) continue;

      if (typeof val1 === 'object' && typeof val2 === 'object' && val1 !== null && val2 !== null && !Array.isArray(val1) && !Array.isArray(val2)) {
        const nestedDiffs = this.findObjectDifferences(val1, val2, currentPath);
        Object.assign(differences, nestedDiffs);
      } else {
        differences[currentPath] = {
          passthrough: val1,
          adapter: val2
        };
      }
    }

    return differences;
  }

  private serializeValue(value: any): string {
    if (value === null || value === undefined) {
      return String(value);
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  // Compare two SSE streams; log only differences with limited lines
  private logSSEDifferences(passthrough: string, adapter: string, requestId?: string): void {
    try {
      if (passthrough === adapter) {
        logger.info('Streaming response transformation: NO differences found', { requestId, module: 'chat-handler' });
        return;
      }

      const pLines = passthrough.split(/\r?\n/);
      const aLines = adapter.split(/\r?\n/);
      const max = Math.max(pLines.length, aLines.length);
      const diffs: string[] = [];
      for (let i = 0; i < max && diffs.length < 20; i++) {
        const pl = pLines[i] ?? '';
        const al = aLines[i] ?? '';
        if (pl !== al) {
          // Trim long lines for readability
          const trim = (s: string) => (s.length > 300 ? s.slice(0, 300) + '…' : s);
          diffs.push(`line ${i + 1}: passthrough="${trim(pl)}" vs adapter="${trim(al)}"`);
        }
      }
      logger.info('Streaming response transformation differences:', { requestId, message: diffs.join(' | '), module: 'chat-handler' });
    } catch (e) {
      logger.warn('Streaming diff logging failed', { error: (e as Error)?.message, requestId, module: 'chat-handler' });
    }
  }

  // Pass-through scenarios: where clientFormat and providerFormat are the same, we want to take a quick route
  // Currently supporting claude code proxy and xAI through pass-through, i.e., we skip the canonicalization step
  private shouldUsePassThrough(clientFormat: ClientFormat, providerName: ProviderName): boolean {
    // Anthropic passthrough for Claude models
    if (clientFormat === 'anthropic' && providerName === PROVIDERS.ANTHROPIC) {
      return true;
    }

    // xAI passthrough for Grok models (assuming Anthropic compatibility)
    if (clientFormat === 'anthropic' && providerName === 'xAI') {
      return true;
    }

    // OpenAI responses passthrough for responses API
    if (clientFormat === 'openai_responses' && providerName === 'openai') {
      return true;
    }

    return false;
  }

  private setStreamingHeaders(res: Response): void {
    const headers = {
      'Content-Type': CONTENT_TYPES.TEXT_PLAIN,
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    };
    res.writeHead(HTTP_STATUS.OK, headers);
  }

  private async handlePassThrough(originalRequest: any, res: Response, clientFormat: ClientFormat, providerName: ProviderName): Promise<void> {
    if (providerName === 'xAI') {
      await xaiPassthrough.handleDirectRequest(originalRequest, res);
    } else if (clientFormat === 'openai_responses' && providerName === 'openai') {
      await openaiResponsesPassthrough.handleDirectRequest(originalRequest, res);
    } else {
      // Default to Anthropic passthrough for backward compatibility
      await anthropicPassthrough.handleDirectRequest(originalRequest, res);
    }
  }


}

// Factory function
export function createChatHandler(): ChatHandler {
  const providerService = new ProviderService();
  const adapters = {
    openai: new OpenAIAdapter(),
    anthropic: new AnthropicAdapter(),
    openai_responses: new OpenAIResponsesAdapter()
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

export const handleOpenAIResponses = async (req: Request, res: Response): Promise<void> => {
  await chatHandler.handleChatRequest(req, res, 'openai_responses');
};
