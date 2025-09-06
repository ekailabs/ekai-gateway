import { openaiAdapter } from '../../canonical/index.js';
import { Request as CanonicalRequest, Response as CanonicalResponse } from '../../canonical/types/index.js';

/**
 * OpenAI adapter wrapper that provides the interface expected by the chat handler
 */
export class OpenAIAdapter {
  /**
   * Convert client request to canonical format
   */
  toCanonical(clientRequest: any): CanonicalRequest {
    return openaiAdapter.clientToCanonical(clientRequest);
  }

  /**
   * Convert canonical response to client format
   */
  fromCanonical(canonicalResponse: CanonicalResponse): any {
    return openaiAdapter.canonicalToClient(canonicalResponse);
  }
}