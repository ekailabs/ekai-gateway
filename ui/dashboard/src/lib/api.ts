// API Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';
export const MEMORY_BASE_URL = process.env.NEXT_PUBLIC_MEMORY_BASE_URL || 'http://localhost:4005';

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
  payment_method?: string;
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

export interface BudgetResponse {
  amountUsd: number | null;
  alertOnly: boolean;
  window: 'monthly';
  spentMonthToDate: number;
  remaining: number | null;
}

export interface MemorySectorSummary {
  sector: 'episodic' | 'semantic' | 'procedural' | 'affective';
  count: number;
  lastCreatedAt: number | null;
}

export interface MemoryRecentItem {
  id: string;
  sector: 'episodic' | 'semantic' | 'procedural' | 'affective';
  createdAt: number;
  lastAccessed: number;
  preview: string;
  details?: {
    trigger?: string;
    goal?: string;
    context?: string;
    result?: string;
    steps?: string[];
  };
}

export interface MemorySummaryResponse {
  summary: MemorySectorSummary[];
  recent: MemoryRecentItem[];
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
  },

  async getBudget(): Promise<BudgetResponse> {
    const response = await fetch(`${API_BASE_URL}/budget`);
    if (!response.ok) {
      throw new Error(`Failed to fetch budget: ${response.statusText}`);
    }
    return response.json();
  },

  async updateBudget(payload: { amountUsd: number | null; alertOnly?: boolean }): Promise<BudgetResponse> {
    const response = await fetch(`${API_BASE_URL}/budget`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Failed to update budget: ${response.statusText}`);
    }

    return response.json();
  },

  async getMemorySummary(limit = 50): Promise<MemorySummaryResponse> {
    const response = await fetch(`${MEMORY_BASE_URL}/v1/summary?limit=${limit}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch memory summary: ${response.statusText}`);
    }
    return response.json();
  },

  async updateMemory(id: string, content: string, sector?: string): Promise<{ updated: boolean; id: string }> {
    const response = await fetch(`${MEMORY_BASE_URL}/v1/memory/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, sector }),
    });
    if (!response.ok) {
      let errorMessage = `Failed to update memory: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = `Failed to update memory: ${errorData.error}`;
        }
      } catch {
        // If response is not JSON, use statusText
      }
      throw new Error(errorMessage);
    }
    return response.json();
  },

  async deleteMemory(id: string): Promise<void> {
    const response = await fetch(`${MEMORY_BASE_URL}/v1/memory/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      let errorMessage = `Failed to delete memory: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = `Failed to delete memory: ${errorData.error}`;
        }
      } catch {
        // If response is not JSON, use statusText
      }
      throw new Error(errorMessage);
    }
  },

  async deleteAllMemories(): Promise<{ deleted: number }> {
    const response = await fetch(`${MEMORY_BASE_URL}/v1/memory`, { method: 'DELETE' });
    if (!response.ok) {
      throw new Error(`Failed to delete all memories: ${response.statusText}`);
    }
    return response.json();
  }
};
