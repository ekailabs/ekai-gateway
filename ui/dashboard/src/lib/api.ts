// API Configuration with smart runtime detection
const API_BASE_URL = (() => {
  // Server-side: use env var
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';
  }
  
  // Client-side: check if placeholder wasn't replaced
  const envUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (envUrl && envUrl !== '__API_URL_PLACEHOLDER__') {
    return envUrl;
  }
  
  // Smart fallback: derive from browser location (works for ROFL and proxies)
  const { protocol, hostname } = window.location;
  if (hostname.includes('p3000')) {
    // ROFL-style proxy URL pattern (p3000 -> p3001)
    return `${protocol}//${hostname.replace('p3000', 'p3001')}`;
  }
  
  // Default for local dev
  return 'http://localhost:3001';
})();

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

  // Fetch models data
  async getModels() {
    const response = await fetch(`${API_BASE_URL}/v1/models`);
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
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
  }
};