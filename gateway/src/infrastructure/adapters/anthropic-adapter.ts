import { anthropicAdapter } from '../../canonical/index.js';
import { Request as CanonicalRequest, Response as CanonicalResponse } from '../../canonical/types/index.js';

/**
 * Anthropic adapter wrapper that provides the interface expected by the chat handler
 */
export class AnthropicAdapter {
  /**
   * Convert client request to canonical format
   */
  toCanonical(clientRequest: any): CanonicalRequest {
    return anthropicAdapter.clientToCanonical(clientRequest);
  }

  /**
   * Convert canonical response to client format
   */
  fromCanonical(canonicalResponse: CanonicalResponse): any {
    return anthropicAdapter.canonicalToClient(canonicalResponse);
  }
}