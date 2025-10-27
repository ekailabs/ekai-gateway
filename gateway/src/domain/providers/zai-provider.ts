import { CanonicalRequest, CanonicalResponse } from 'shared/types/index.js';
import { Response as NodeFetchResponse } from 'node-fetch';
import { AIProvider } from '../types/provider.js';
import { APIError } from '../../infrastructure/utils/error-handler.js';
import { getConfig } from '../../infrastructure/config/app-config.js';

/**
 * Z AI provider placeholder used to participate in provider selection.
 * Requests are expected to go through the messages passthrough pipeline.
 */
export class ZAIProvider implements AIProvider {
  readonly name = 'zai';

  isConfigured(): boolean {
    const config = getConfig();
    // ZAI is available via x402 for /v1/messages
    if (config.x402.enabled) {
      return true;
    }
    return Boolean(config.providers.zai.apiKey);
  }

  async chatCompletion(_request: CanonicalRequest): Promise<CanonicalResponse> {
    throw new APIError(501, 'Z AI provider supports passthrough-only requests');
  }

  async getStreamingResponse(_request: CanonicalRequest): Promise<NodeFetchResponse> {
    throw new APIError(501, 'Z AI provider supports passthrough-only requests');
  }
}
