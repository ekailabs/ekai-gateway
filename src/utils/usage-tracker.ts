export interface UsageRecord {
  requestId: string;
  provider: string;
  model: string;
  timestamp: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

const PRICING = {
  openai: {
    'gpt-4o': { input: 2.50, output: 10.00 },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 }
  },
  openrouter: {
    'anthropic/claude-3-5-sonnet': { input: 3.00, output: 15.00 },
    'meta-llama/llama-3.1-8b-instruct': { input: 0.18, output: 0.18 },
    'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 }
  }
} as const;

class UsageTracker {
  private records: UsageRecord[] = [];

  trackUsage(provider: string, model: string, response: any): UsageRecord | null {
    const usage = response.usage;
    if (!usage) return null;

    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;
    const totalTokens = usage.total_tokens || inputTokens + outputTokens;

    const pricing = this.getPricing(provider, model);
    if (!pricing) {
      console.warn(`No pricing found for ${provider}/${model}`);
      return null;
    }

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    const totalCost = inputCost + outputCost;

    const record: UsageRecord = {
      requestId: response.id,
      provider,
      model,
      timestamp: new Date().toISOString(),
      inputTokens,
      outputTokens,
      totalTokens,
      inputCost,
      outputCost,
      totalCost
    };

    this.records.push(record);
    console.log(`💰 Usage tracked: $${totalCost.toFixed(6)} for ${totalTokens} tokens`);
    
    return record;
  }

  getUsage() {
    const totalCost = this.records.reduce((sum, r) => sum + r.totalCost, 0);
    const totalTokens = this.records.reduce((sum, r) => sum + r.totalTokens, 0);

    return {
      totalRequests: this.records.length,
      totalCost: Number(totalCost.toFixed(6)),
      totalTokens,
      records: this.records
    };
  }

  private getPricing(provider: string, model: string): { input: number; output: number } | null {
    const providerPricing = PRICING[provider as keyof typeof PRICING];
    if (!providerPricing) return null;
    
    return (providerPricing as any)[model] || null;
  }
}

export const usageTracker = new UsageTracker();