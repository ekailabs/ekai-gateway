import { pricingLoader, CostCalculation } from './pricing-loader.js';
import { dbQueries } from '../db/queries.js';

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

interface UsageMetrics {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  requestsByModel: Record<string, number>;
  tokensByModel: Record<string, number>;
  costByModel: Record<string, number>;
  lastRequestTime: string | null;
}

interface RequestLog {
  timestamp: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  currency: string;
}

export class UsageTracker {
  private metrics: UsageMetrics = {
    totalRequests: 0,
    totalTokens: 0,
    totalCost: 0,
    requestsByModel: {},
    tokensByModel: {},
    costByModel: {},
    lastRequestTime: null
  };

  private requestLog: RequestLog[] = [];
  private maxLogSize = 1000; // Keep last 1000 requests

  constructor() {
    // Ensure pricing is loaded when UsageTracker is instantiated
    pricingLoader.loadAllPricing();
  }

  /**
   * Track a chat completion request and calculate costs
   */
  trackUsage(
    model: string, 
    provider: string, 
    inputTokens: number, 
    outputTokens: number
  ): CostCalculation | null {
    const now = new Date();
    
    // Calculate cost using the new pricing system
    const costCalculation = pricingLoader.calculateCost(provider, model, inputTokens, outputTokens);
    
    if (costCalculation) {
      // Generate unique request ID
      const requestId = `${provider}-${model}-${now.getTime()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Save to database
      try {
        dbQueries.insertUsageRecord({
          request_id: requestId,
          provider,
          model,
          timestamp: now.toISOString(),
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
          input_cost: costCalculation.inputCost,
          output_cost: costCalculation.outputCost,
          total_cost: costCalculation.totalCost,
          currency: costCalculation.currency
        });
      } catch (error) {
        console.error('❌ Failed to save usage record to database:', error);
      }

      // Update metrics
      this.metrics.totalRequests++;
      this.metrics.totalTokens += inputTokens + outputTokens;
      this.metrics.totalCost += costCalculation.totalCost;
      this.metrics.lastRequestTime = now.toISOString();

      // Update model-specific metrics
      this.metrics.requestsByModel[model] = (this.metrics.requestsByModel[model] || 0) + 1;
      this.metrics.tokensByModel[model] = (this.metrics.tokensByModel[model] || 0) + inputTokens + outputTokens;
      this.metrics.costByModel[model] = (this.metrics.costByModel[model] || 0) + costCalculation.totalCost;

      // Log the request
      this.logRequest({
        timestamp: now.toISOString(),
        model,
        provider,
        inputTokens,
        outputTokens,
        cost: costCalculation.totalCost,
        currency: costCalculation.currency
      });

      console.log(`💰 Cost for ${model} (${provider}): $${costCalculation.totalCost.toFixed(6)} (${inputTokens} input + ${outputTokens} output tokens)`);
    } else {
      console.warn(`⚠️ No pricing found for model: ${model} (${provider})`);
    }

    return costCalculation;
  }

  /**
   * Get current usage metrics
   */
  getMetrics(): UsageMetrics {
    return { ...this.metrics };
  }

  /**
   * Get usage summary and records (equivalent to old getUsage)
   */
  getUsage() {
    return {
      totalRequests: this.metrics.totalRequests,
      totalCost: Number(this.metrics.totalCost.toFixed(6)),
      totalTokens: this.metrics.totalTokens,
      records: this.requestLog
    };
  }

  /**
   * Get usage summary from database (more accurate and persistent)
   */
  getUsageFromDatabase() {
    try {
      return {
        totalRequests: dbQueries.getTotalRequests(),
        totalCost: Number(dbQueries.getTotalCost().toFixed(6)),
        totalTokens: dbQueries.getTotalTokens(),
        costByProvider: dbQueries.getCostByProvider(),
        costByModel: dbQueries.getCostByModel(),
        records: dbQueries.getAllUsageRecords(100) // Get last 100 records
      };
    } catch (error) {
      console.error('❌ Failed to get usage from database:', error);
      return this.getUsage(); // Fallback to in-memory
    }
  }

  /**
   * Get request log
   */
  getRequestLog(): RequestLog[] {
    return [...this.requestLog];
  }

  /**
   * Get cost breakdown by provider
   */
  getCostByProvider(): Record<string, number> {
    const costByProvider: Record<string, number> = {};
    
    this.requestLog.forEach(log => {
      costByProvider[log.provider] = (costByProvider[log.provider] || 0) + log.cost;
    });

    return costByProvider;
  }

  /**
   * Get cost breakdown by model type
   */
  getCostByModelType(): Record<string, number> {
    const costByModelType: Record<string, number> = {};
    
    this.requestLog.forEach(log => {
      // Extract model type from model name (e.g., "gpt-4" from "gpt-4o")
      const modelType = log.model.split('-')[0] + '-' + log.model.split('-')[1];
      costByModelType[modelType] = (costByModelType[modelType] || 0) + log.cost;
    });

    return costByModelType;
  }

  /**
   * Get hourly cost breakdown for the last 24 hours
   */
  getHourlyCostBreakdown(): Record<string, number> {
    const hourlyCosts: Record<string, number> = {};
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    this.requestLog
      .filter(log => new Date(log.timestamp) > oneDayAgo)
      .forEach(log => {
        const hour = new Date(log.timestamp).toISOString().slice(0, 13) + ':00:00Z';
        hourlyCosts[hour] = (hourlyCosts[hour] || 0) + log.cost;
      });

    return hourlyCosts;
  }

  /**
   * Reset all metrics and logs
   */
  reset(): void {
    this.metrics = {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      requestsByModel: {},
      tokensByModel: {},
      costByModel: {},
      lastRequestTime: null
    };
    this.requestLog = [];
    console.log('🔄 Usage tracker reset');
  }

  /**
   * Export metrics to JSON
   */
  exportMetrics(): string {
    return JSON.stringify({
      metrics: this.metrics,
      requestLog: this.requestLog,
      exportTime: new Date().toISOString()
    }, null, 2);
  }

  /**
   * Get pricing information for all available models
   */
  getPricingInfo() {
    return pricingLoader.getPricingSummary();
  }

  /**
   * Search for models by name or description
   */
  searchModels(query: string) {
    return pricingLoader.searchModels(query);
  }

  /**
   * Get estimated cost for a specific model and token usage
   */
  estimateCost(model: string, provider: string, inputTokens: number, outputTokens: number): CostCalculation | null {
    return pricingLoader.calculateCost(provider, model, inputTokens, outputTokens);
  }

  private logRequest(log: RequestLog): void {
    this.requestLog.push(log);
    
    // Keep only the last maxLogSize requests
    if (this.requestLog.length > this.maxLogSize) {
      this.requestLog = this.requestLog.slice(-this.maxLogSize);
    }
  }
}

export const usageTracker = new UsageTracker();