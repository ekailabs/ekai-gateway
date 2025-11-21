// API Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

// Types based on your backend response
export interface UsageRecord {
  id: number;
  request_id: string;
  provider: string;
  model: string;
  timestamp: string;
  input_tokens: number;
  cache_write_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_cost: number;
  cache_write_cost: number;
  cache_read_cost: number;
  output_cost: number;
  total_cost: number;
  currency: string;
  created_at: string;
}

export interface UsageResponse {
  totalRequests: number;
  totalCost: number;
  totalTokens: number;
  costByProvider: Record<string, number>;
  costByModel: Record<string, number>;
  records: UsageRecord[];
}

export interface ConfigStatusResponse {
  providers: Record<string, boolean>;
  mode: 'byok' | 'hybrid' | 'x402-only';
  hasApiKeys: boolean;
  x402Enabled: boolean;
  server: {
    environment: string;
    port: number;
  };
}

export interface ModelCatalogEntry {
  id: string;
  provider: string;
  endpoint: 'chat_completions' | 'messages' | 'responses';
  pricing: {
    input: number;
    output: number;
    cache_write?: number;
    cache_read?: number;
    currency: string;
    unit: string;
  } | null;
  source: string;
}

export interface ModelsResponse {
  total: number;
  limit: number;
  offset: number;
  items: ModelCatalogEntry[];
}

// API service functions
export const apiService = {
  // Fetch usage data
  async getUsage(fromDate?: Date, toDate?: Date): Promise<UsageResponse> {
    let url = `${API_BASE_URL}/usage`;
    
    if (fromDate || toDate) {
      const params = new URLSearchParams();
      if (fromDate) {
        params.append('startTime', fromDate.toISOString());
      }
      if (toDate) {
        params.append('endTime', toDate.toISOString());
      }
      url += `?${params.toString()}`;
    }
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch usage data: ${response.statusText}`);
    }
    return response.json();
  },

  // Check health
  async getHealth() {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) {
      throw new Error(`Failed to fetch health: ${response.statusText}`);
    }
    return response.json();
  },

  async downloadUsageCsv(fromDate?: Date, toDate?: Date) {
    const params = new URLSearchParams();
    if (fromDate) params.append('startTime', fromDate.toISOString());
    if (toDate) params.append('endTime', toDate.toISOString());
    params.append('format', 'csv');

    const url = `${API_BASE_URL}/usage?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to export CSV: ${response.statusText}`);
    }

    const blob = await response.blob();
    const link = document.createElement('a');
    const downloadUrl = window.URL.createObjectURL(blob);
    link.href = downloadUrl;

    const startLabel = fromDate ? fromDate.toISOString().slice(0, 10) : 'start';
    const endLabel = toDate ? toDate.toISOString().slice(0, 10) : 'end';
    link.download = `usage-${startLabel}-${endLabel}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
  },

  async getConfigStatus(): Promise<ConfigStatusResponse> {
    const response = await fetch(`${API_BASE_URL}/config/status`);
    if (!response.ok) {
      throw new Error(`Failed to fetch config status: ${response.statusText}`);
    }
    return response.json();
  },

  async getModels(params?: { provider?: string; endpoint?: 'chat_completions' | 'messages' | 'responses'; search?: string; limit?: number; offset?: number }): Promise<ModelsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.provider) searchParams.append('provider', params.provider);
    if (params?.endpoint) searchParams.append('endpoint', params.endpoint);
    if (params?.search) searchParams.append('search', params.search);
    if (params?.limit) searchParams.append('limit', String(params.limit));
    if (params?.offset) searchParams.append('offset', String(params.offset));

    const url = `${API_BASE_URL}/v1/models${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }
    return response.json();
  }
};
