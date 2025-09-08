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

// API service functions
export const apiService = {
  // Fetch usage data
  async getUsage(): Promise<UsageResponse> {
    const response = await fetch(`${API_BASE_URL}/usage`);
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