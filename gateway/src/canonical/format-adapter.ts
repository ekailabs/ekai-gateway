import { Request, Response, StreamingResponse } from './types/index.js';

export interface FormatAdapter<ClientRequest, ClientResponse> {
  toCanonical(input: ClientRequest): Request;
  fromCanonical(response: Response): ClientResponse;
  // Optional: not all adapters need to render streaming chunks directly
  fromCanonicalStream?(chunk: StreamingResponse): string;
}


