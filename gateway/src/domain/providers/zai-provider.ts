import { CanonicalRequest, CanonicalResponse } from 'shared/types/index.js';
import { Response as NodeFetchResponse } from 'node-fetch';
import { AIProvider } from '../types/provider.js';
import { ProviderError } from '../../shared/errors/index.js';
import { getConfig } from '../../infrastructure/config/app-config.js';
import type { ApiKeyContext } from './base-provider.js';

/**
 * Z AI provider placeholder used to participate in provider selection.
 * Requests are expected to go through the messages passthrough pipeline.
 */
export class ZAIProvider implements AIProvider {
  readonly name = 'zai';

  isConfigured(): boolean {
    // Always configured - key retrieval happens via Sapphire
    return true;
  }

  async chatCompletion(_request: CanonicalRequest, _context?: ApiKeyContext): Promise<CanonicalResponse> {
    throw new ProviderError('zai', 'Z AI provider supports passthrough-only requests', 501);
  }

  async getStreamingResponse(_request: CanonicalRequest, _context?: ApiKeyContext): Promise<NodeFetchResponse> {
    throw new ProviderError('zai', 'Z AI provider supports passthrough-only requests', 501);
  }
}
