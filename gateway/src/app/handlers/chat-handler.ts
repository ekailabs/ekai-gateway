import { Request, Response } from 'express';
import { ProviderService } from '../../domain/services/provider-service.js';
import { OpenAIAdapter } from '../../infrastructure/adapters/openai-adapter.js';
import { OpenAIResponsesAdapter } from '../../infrastructure/adapters/openai-responses-adapter.js';
import { AnthropicAdapter } from '../../infrastructure/adapters/anthropic-adapter.js';
import { handleError, APIError } from '../../infrastructure/utils/error-handler.js';
import { logger } from '../../infrastructure/utils/logger.js';
import { HTTP_STATUS, CONTENT_TYPES } from '../../domain/types/provider.js';
import { ModelUtils } from '../../infrastructure/utils/model-utils.js';
import { Request as CanonicalRequest } from '../../canonical/types/index.js';
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
        providerName = 'openai';
        
        // Create canonical request only for logging purposes
        const canonicalMode = ['true', '1', 'yes'].includes(String(process.env.CANONICAL_MODE || '').toLowerCase());
        if (canonicalMode) {
          canonicalRequest = this.adapters[clientFormat].encodeRequestToCanonical(req.body);
        } else {
          // Create minimal canonical request for compatibility
          canonicalRequest = {
            schema_version: '1.0.1',
            model: req.body.model,
            messages: [],
            stream: req.body.stream || false
          } as any;
        }

        logger.debug('Processing OpenAI Responses request', {
          requestId: req.requestId,
          clientFormat,
          model: req.body.model,
          streaming: req.body.stream,
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
        
        // Create canonical request only for logging purposes
        const canonicalMode = ['true', '1', 'yes'].includes(String(process.env.CANONICAL_MODE || '').toLowerCase());
        if (canonicalMode) {
          canonicalRequest = this.adapters[clientFormat].encodeRequestToCanonical(req.body);
        } else {
          // Create minimal canonical request for compatibility
          canonicalRequest = {
            schema_version: '1.0.1',
            model: req.body.model,
            messages: [],
            stream: req.body.stream || false
          } as any;
        }
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
      const canonicalMode = ['true', '1', 'yes'].includes(String(process.env.CANONICAL_MODE || '').toLowerCase());
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
        canonicalRequest = this.adapters[clientFormat].encodeRequestToCanonical(req.body);
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
    const canonicalMode = ['true', '1', 'yes'].includes(String(process.env.CANONICAL_MODE || '').toLowerCase());
    
    // Always use passthrough for the actual response to user
    const passthroughResponse = await this.makeDirectPassthroughRequest(originalRequest);
    res.status(HTTP_STATUS.OK).json(passthroughResponse);

    // Run canonical transformation in parallel for logging only (if enabled)
    if (canonicalMode) {
      try {
        // Compare request transformation
        await this.compareRequestTransformation(originalRequest, canonicalRequest, req?.requestId, clientFormat);
        
        // Process canonical transformation for comparison logging
        const canonicalResponse = await this.providerService.processChatCompletion(canonicalRequest, providerName as any, clientFormat, originalRequest, req.requestId);
        const clientResponse = this.adapters[clientFormat].decodeResponseToClient(canonicalResponse);
        await this.compareCanonicalTransformation(originalRequest, canonicalResponse, clientResponse, req?.requestId, clientFormat);
      } catch (error) {
        // Log canonical transformation errors but don't affect user response
        logger.error('Canonical transformation error (logging only)', {
          error: error instanceof Error ? error.message : String(error),
          requestId: req?.requestId,
          module: 'chat-handler'
        });
      }
    }
  }

  private async handleStreaming(canonicalRequest: CanonicalRequest, res: Response, clientFormat: ClientFormat, providerName?: ProviderName, originalRequest?: any, req?: Request): Promise<void> {
    const canonicalMode = ['true', '1', 'yes'].includes(String(process.env.CANONICAL_MODE || '').toLowerCase());

      res.writeHead(HTTP_STATUS.OK, {
        'Content-Type': CONTENT_TYPES.EVENT_STREAM,
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

    // Always use passthrough for the actual streaming response to user
    if (clientFormat === 'openai_responses') {
      const passthroughStream = await this.captureOpenAIResponsesPassthroughStream(originalRequest);
      res.write(passthroughStream);
      res.end();
    } else {
      // For other formats, use normal passthrough
      const streamingResponse = await this.providerService.getStreamingChunks(canonicalRequest, providerName as any, req.requestId);
      if (streamingResponse && 'body' in streamingResponse && streamingResponse.body) {
        (streamingResponse.body as any).pipe(res);
      } else {
        throw new Error('No stream body received from provider');
      }
    }

    // Run canonical transformation in parallel for logging only (if enabled)
    if (canonicalMode) {
      try {
        // Compare request transformation
        await this.compareRequestTransformation(originalRequest, canonicalRequest, req?.requestId, clientFormat);
        
        // Process canonical chunks for comparison logging
        const streamingResponse = await this.providerService.getStreamingChunks(canonicalRequest, providerName as any, req.requestId);
        const adapterChunks: string[] = [];
        const passthroughChunks: string[] = [];
        
        const adapter = this.adapters[clientFormat];
        
        for (const chunk of streamingResponse) {
          // Process through adapter for comparison
          if ('decodeStreamToClient' in adapter && adapter.decodeStreamToClient) {
            const clientChunk = adapter.decodeStreamToClient(chunk);
            if (clientChunk) {
              adapterChunks.push(clientChunk);
            }
          }
          
          // For comparison: convert canonical chunks back to raw SSE format
          if (chunk.stream_type === 'canonical') {
            const passthroughChunk = this.canonicalToSSE(chunk);
            passthroughChunks.push(passthroughChunk);
          }
        }
        
        // Compare the outputs for logging only
        const adapterData = adapterChunks.join('');
        const passthroughData = passthroughChunks.join('');
        this.logSSEDifferences(passthroughData, adapterData, req?.requestId, clientFormat);
      } catch (error) {
        // Log canonical transformation errors but don't affect user response
        logger.error('Canonical streaming transformation error (logging only)', {
          error: error instanceof Error ? error.message : String(error),
          requestId: req?.requestId,
          module: 'chat-handler'
        });
      }
    }
  }

  // Convert OpenAI Responses chunk back to SSE format for passthrough comparison
  private openaiResponsesToSSE(chunk: any): string {
    if (chunk.stream_type === 'openai_responses' && chunk.event && chunk.data) {
      const event = chunk.event;
      const data = chunk.data;
      
      if (event === 'response.output_text.delta') {
        return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      } else if (event === 'response.function_call') {
        return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      } else if (event === 'response.tool_call') {
        return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      } else if (event === 'response.usage') {
        return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      } else if (event === 'response.completed') {
        return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      } else if (event === 'response.created') {
        return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      } else if (event === 'response.output_item.done') {
        return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      } else if (event === 'error') {
        return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      }
    }
    
    return '';
  }

  // Convert canonical chunk back to SSE format for passthrough comparison
  private canonicalToSSE(chunk: any): string {
    if (chunk.stream_type === 'canonical' && chunk.event) {
      const event = chunk.event;
      
      if (event.type === 'message_start') {
        return `event: response.created\ndata: ${JSON.stringify({
          type: 'response.created',
          response: event.response || {
            id: event.id || `resp_${Date.now()}`,
            object: 'response',
            created_at: event.created || Math.floor(Date.now() / 1000),
            status: 'in_progress'
          }
        })}\n\n`;
      } else if (event.type === 'content_delta') {
        return `event: response.output_text.delta\ndata: ${JSON.stringify({
          type: 'response.output_text.delta',
          delta: event.value || event.delta
        })}\n\n`;
      } else if (event.type === 'output_item_done') {
        return `event: response.output_item.done\ndata: ${JSON.stringify({
          type: 'response.output_item.done',
          output_index: event.output_index || 0,
          item: event.item
        })}\n\n`;
      } else if (event.type === 'function_call') {
        return `event: response.function_call\ndata: ${JSON.stringify({
          type: 'response.function_call',
          name: event.name,
          arguments_json: event.arguments_json,
          call_id: event.id || event.call_id
        })}\n\n`;
      } else if (event.type === 'tool_call') {
        return `event: response.tool_call\ndata: ${JSON.stringify({
          type: 'response.tool_call',
          name: event.name,
          arguments_json: event.arguments_json,
          call_id: event.id || event.call_id
        })}\n\n`;
      } else if (event.type === 'usage') {
        return `event: response.usage\ndata: ${JSON.stringify({
          type: 'response.usage',
          usage: event.usage || {
            input_tokens: event.input_tokens,
            output_tokens: event.output_tokens,
            reasoning_tokens: event.reasoning_tokens
          }
        })}\n\n`;
      } else if (event.type === 'complete') {
        return `event: response.completed\ndata: ${JSON.stringify({
          type: 'response.completed',
          response: event.response || {
            status: 'completed',
            finish_reason: event.finish_reason
          }
        })}\n\n`;
      } else if (event.type === 'error') {
        return `event: error\ndata: ${JSON.stringify({
          type: 'error',
          error: event.error || {
            code: event.code,
            message: event.message
          }
        })}\n\n`;
      }
    }
    
    return '';
  }

  // Capture passthrough SSE by mocking an Express Response that buffers writes
  private async captureOpenAIResponsesPassthroughStream(originalRequest: any): Promise<string> {
    const chunks: string[] = [];
    const mockRes: Partial<Response> = {
      writeHead: () => mockRes as any,
      setHeader: () => {},
      status: () => mockRes as any,
      write: (chunk: any) => { 
        try { 
          let text: string;
          if (Buffer.isBuffer(chunk)) {
            text = chunk.toString('utf8');
          } else if (chunk instanceof Uint8Array) {
            text = new TextDecoder('utf-8').decode(chunk);
          } else if (Array.isArray(chunk)) {
            text = new TextDecoder('utf-8').decode(new Uint8Array(chunk));
          } else {
            text = String(chunk);
          }
          chunks.push(text);
        } catch (e) {
          // Silently handle chunk processing errors
        } 
        return true; 
      },
      end: (chunk?: any) => { 
        if (chunk) { 
          try { 
            let text: string;
            if (Buffer.isBuffer(chunk)) {
              text = chunk.toString('utf8');
            } else if (chunk instanceof Uint8Array) {
              text = new TextDecoder('utf-8').decode(chunk);
            } else if (Array.isArray(chunk)) {
              text = new TextDecoder('utf-8').decode(new Uint8Array(chunk));
            } else {
              text = String(chunk);
            }
            chunks.push(text);
          } catch (e) {
            // Silently handle chunk processing errors
          } 
        } 
        return mockRes as any; 
      }
    } as any;

    await openaiResponsesPassthrough.handleDirectRequest(originalRequest, mockRes as Response);
    return chunks.join('');
  }

  // Compare request transformation: what gets sent to OpenAI API
  private async compareRequestTransformation(originalRequest: any, canonicalRequest: CanonicalRequest, requestId?: string, clientFormat?: string): Promise<void> {
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
          clientFormat,
          message: diffMessages.join(' | '),
          module: 'chat-handler'
        });
      } else {
        logger.info('Request transformation: NO differences found', {
          requestId,
          clientFormat,
          module: 'chat-handler'
        });
      }
    } catch (e) {
      logger.error('Request comparison failed', { error: (e as Error)?.message, requestId, clientFormat, module: 'chat-handler' });
    }
  }

  // Compare canonical transformation with passthrough ground truth
  private async compareCanonicalTransformation(originalRequest: any, canonicalResponse: any, adapterResponse: any, requestId?: string, clientFormat?: string): Promise<void> {
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
          clientFormat,
          message: diffMessages.join(' | '),
          module: 'chat-handler'
        });
      } else {
        logger.info('Canonical transformation: NO differences found', {
          requestId,
          clientFormat,
          module: 'chat-handler'
        });
      }
    } catch (e) {
      logger.info('Canonical comparison failed', { error: (e as Error)?.message, requestId, clientFormat, module: 'chat-handler' });
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

    // Handle arrays
    if (Array.isArray(obj1) && Array.isArray(obj2)) {
      const maxLength = Math.max(obj1.length, obj2.length);
      for (let i = 0; i < maxLength; i++) {
        const currentPath = path ? `${path}[${i}]` : `[${i}]`;
        const val1 = obj1[i];
        const val2 = obj2[i];

        if (val1 === val2) continue;

        if (typeof val1 === 'object' && typeof val2 === 'object' && val1 !== null && val2 !== null) {
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

    // Handle objects
    if (typeof obj1 === 'object' && typeof obj2 === 'object' && obj1 !== null && obj2 !== null && !Array.isArray(obj1) && !Array.isArray(obj2)) {
      const keys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);

      for (const key of keys) {
        const currentPath = path ? `${path}.${key}` : key;
        const val1 = obj1?.[key];
        const val2 = obj2?.[key];

        if (val1 === val2) continue;

        const nestedDiffs = this.findObjectDifferences(val1, val2, currentPath);
        Object.assign(differences, nestedDiffs);
      }
      return differences;
    }

    // Handle primitives
    if (obj1 !== obj2) {
      differences[path || 'root'] = {
        passthrough: obj1,
        adapter: obj2
      };
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
  private logSSEDifferences(passthrough: string, adapter: string, requestId?: string, clientFormat?: string): void {
    try {
      if (passthrough === adapter) {
        logger.info('Streaming response transformation: NO differences found', { 
          requestId, 
          clientFormat,
          module: 'chat-handler' 
        });
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
      logger.info('Streaming response transformation differences:', { 
        requestId, 
        clientFormat,
        message: diffs.join(' | '), 
        module: 'chat-handler' 
      });
    } catch (e) {
      logger.warn('Streaming diff logging failed', { 
        error: (e as Error)?.message, 
        requestId, 
        clientFormat,
        module: 'chat-handler' 
      });
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
