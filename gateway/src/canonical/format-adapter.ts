import { Request, Response, StreamingResponse } from './types/index.js';

export interface FormatAdapter<ClientRequest, ClientResponse, ProviderRequest = any, ProviderResponse = any> {
  // Request path: Client → Canonical → Provider
  encodeRequestToCanonical(clientRequest: ClientRequest): Request;
  decodeCanonicalRequest(canonicalRequest: Request): ProviderRequest;
  
  // Response path: Provider → Canonical → Client
  encodeResponseToCanonical(providerResponse: ProviderResponse): Response;
  decodeResponseToClient(canonicalResponse: Response): ClientResponse;
  
  // Streaming response path: Provider → Canonical → Client
  encodeStreamToCanonical?(providerChunk: any): StreamingResponse;
  decodeStreamToClient?(canonicalChunk: StreamingResponse): string;
}


