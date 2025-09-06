import { Request as CanonicalRequest, Response as CanonicalResponse } from '../types/index.js';

/**
 * Format Types - API communication formats
 */
export type FormatType = 'openai' | 'anthropic';

/**
 * Provider Names - Actual services
 */
export type ProviderName = 'openai' | 'anthropic';

/**
 * Provider to Format mapping
 */
export const PROVIDER_FORMATS: Record<ProviderName, FormatType> = {
  'openai': 'openai',
  'anthropic': 'anthropic'
};

/**
 * Canonical streaming event
 */
export interface CanonicalStreamEvent {
  type: 'message_start' | 'content_delta' | 'tool_call' | 'usage' | 'complete' | 'error';
  data?: any;
  source_raw?: any;
}

/**
 * Format Adapter - converts between client/provider formats and canonical
 */
export interface FormatAdapter<ClientReq = any, ClientRes = any, ProviderReq = any, ProviderRes = any, StreamEvt = any> {
  readonly formatType: FormatType;
  
  // Client ↔ Canonical  
  clientToCanonical(clientRequest: ClientReq): CanonicalRequest;
  canonicalToClient(canonical: CanonicalResponse): ClientRes;
  
  // Canonical ↔ Provider
  canonicalToProvider(canonical: CanonicalRequest): ProviderReq;
  providerToCanonical(providerResponse: ProviderRes): CanonicalResponse;
  
  // Streaming
  stream: {
    sourceToCanonical(event: StreamEvt): CanonicalStreamEvent[];
  };
}

/**
 * Registry
 */
class Registry {
  private adapters = new Map<FormatType, FormatAdapter>();

  register(adapter: FormatAdapter): void {
    this.adapters.set(adapter.formatType, adapter);
  }

  getAdapter(formatType: FormatType): FormatAdapter {
    const adapter = this.adapters.get(formatType);
    if (!adapter) throw new Error(`No adapter for format: ${formatType}`);
    return adapter;
  }

  getProviderAdapter(providerName: ProviderName): FormatAdapter {
    const formatType = PROVIDER_FORMATS[providerName];
    if (!formatType) throw new Error(`Unknown provider: ${providerName}`);
    return this.getAdapter(formatType);
  }

  clear(): void {
    this.adapters.clear();
  }
}

const registry = new Registry();

export function registerAdapter(adapter: FormatAdapter): void {
  registry.register(adapter);
}

export function getAdapter(formatType: FormatType): FormatAdapter {
  return registry.getAdapter(formatType);
}

export function getProviderAdapter(providerName: ProviderName): FormatAdapter {
  return registry.getProviderAdapter(providerName);
}

export function clearRegistry(): void {
  registry.clear();
}