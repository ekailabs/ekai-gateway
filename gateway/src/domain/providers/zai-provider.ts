import { CanonicalRequest, CanonicalResponse } from 'shared/types/index.js';
import { Response as NodeFetchResponse } from 'node-fetch';
import { AIProvider } from '../types/provider.js';
import { APIError } from '../../infrastructure/utils/error-handler.js';

/**
 * Z AI provider placeholder used to participate in provider selection.
 * Requests are expected to go through the messages passthrough pipeline.
 */
export class ZAIProvider implements AIProvider {
  readonly name = 'zai';

  isConfigured(): boolean {
    return Boolean(process.env.ZAI_API_KEY);
  }

  async chatCompletion(_request: CanonicalRequest): Promise<CanonicalResponse> {
    throw new APIError(501, 'Z AI provider supports passthrough-only requests');
  }

  async getStreamingResponse(_request: CanonicalRequest): Promise<NodeFetchResponse> {
    throw new APIError(501, 'Z AI provider supports passthrough-only requests');
  }
}
