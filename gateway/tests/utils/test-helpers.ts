import { vi } from 'vitest';
import type { Request, Response } from 'express';
import type { UsageRecord } from '../../src/infrastructure/db/queries.js';
import type { PricingConfig } from '../../src/infrastructure/utils/pricing-loader.js';

/**
 * Test helper utilities for usage-related tests
 */

export const createMockUsageRecord = (overrides: Partial<UsageRecord> = {}): Omit<UsageRecord, 'id' | 'created_at'> => ({
  request_id: `test-request-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
  provider: 'openai',
  model: 'gpt-4o',
  timestamp: new Date().toISOString(),
  input_tokens: 100,
  cache_write_input_tokens: 0,
  cache_read_input_tokens: 0,
  output_tokens: 50,
  total_tokens: 150,
  input_cost: 0.001,
  cache_write_cost: 0,
  cache_read_cost: 0,
  output_cost: 0.002,
  total_cost: 0.003,
  currency: 'USD',
  ...overrides
});

/**
 * Create mock usage record with realistic provider/model combinations from real pricing
 */
export const createRealisticMockUsageRecord = (overrides: Partial<UsageRecord> = {}): Omit<UsageRecord, 'id' | 'created_at'> => {
  // Use real provider/model combinations
  const combinations = [
    { provider: 'openai', model: 'gpt-4o' },
    { provider: 'openai', model: 'gpt-3.5-turbo' },
    { provider: 'anthropic', model: 'claude-3-5-sonnet' },
    { provider: 'anthropic', model: 'claude-3-haiku' },
    { provider: 'xai', model: 'grok-4' },
    { provider: 'openrouter', model: 'gpt-5' }
  ];
  
  const combo = combinations[Math.floor(Math.random() * combinations.length)];
  
  return createMockUsageRecord({
    provider: combo.provider,
    model: combo.model,
    ...overrides
  });
};

export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const createSequentialTimestamps = (baseDate: Date, count: number, intervalMs: number = 3600000): string[] => {
  const timestamps = [];
  for (let i = 0; i < count; i++) {
    const date = new Date(baseDate.getTime() + (i * intervalMs));
    timestamps.push(date.toISOString());
  }
  return timestamps;
};

export const createDateRange = (daysAgo: number = 7): { start: string; end: string } => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysAgo);
  
  return {
    start: start.toISOString(),
    end: end.toISOString()
  };
};

export const createFixedDate = (dateString: string): Date => {
  return new Date(dateString);
};

export const mockResponse = (): Response => {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
};

export const mockRequest = (query: any = {}, body: any = {}, params: any = {}): Request => ({
  query,
  body,
  params,
  headers: {},
  method: 'GET',
  url: '/usage',
  path: '/usage'
} as Request);

export const expectValidUsageSummary = (summary: any) => {
  expect(summary).toHaveProperty('totalRequests');
  expect(summary).toHaveProperty('totalCost');
  expect(summary).toHaveProperty('totalTokens');
  expect(summary).toHaveProperty('costByProvider');
  expect(summary).toHaveProperty('costByModel');
  expect(summary).toHaveProperty('records');
  
  expect(typeof summary.totalRequests).toBe('number');
  expect(typeof summary.totalCost).toBe('number');
  expect(typeof summary.totalTokens).toBe('number');
  expect(Array.isArray(summary.records)).toBe(true);
  expect(typeof summary.costByProvider).toBe('object');
  expect(typeof summary.costByModel).toBe('object');
};

export const expectValidUsageRecord = (record: any) => {
  expect(record).toHaveProperty('id');
  expect(record).toHaveProperty('request_id');
  expect(record).toHaveProperty('provider');
  expect(record).toHaveProperty('model');
  expect(record).toHaveProperty('timestamp');
  expect(record).toHaveProperty('input_tokens');
  expect(record).toHaveProperty('output_tokens');
  expect(record).toHaveProperty('total_tokens');
  expect(record).toHaveProperty('total_cost');
  expect(record).toHaveProperty('currency');
  
  expect(typeof record.id).toBe('number');
  expect(typeof record.request_id).toBe('string');
  expect(typeof record.provider).toBe('string');
  expect(typeof record.model).toBe('string');
  expect(typeof record.timestamp).toBe('string');
  expect(typeof record.input_tokens).toBe('number');
  expect(typeof record.output_tokens).toBe('number');
  expect(typeof record.total_tokens).toBe('number');
  expect(typeof record.total_cost).toBe('number');
  expect(typeof record.currency).toBe('string');
};

export const createBulkUsageRecords = (count: number, baseDate: Date = new Date()): Array<Omit<UsageRecord, 'id' | 'created_at'>> => {
  const records = [];
  const providers = ['openai', 'anthropic', 'xai'];
  const models = ['gpt-4o', 'claude-3-5-sonnet', 'grok-4'];
  
  for (let i = 0; i < count; i++) {
    const date = new Date(baseDate);
    // Add time intervals instead of subtracting (go forward in time)
    date.setHours(date.getHours() + i);
    
    records.push(createMockUsageRecord({
      request_id: `bulk-record-${i}-${Date.now()}`, // Ensure unique IDs
      timestamp: date.toISOString(),
      provider: providers[i % providers.length],
      model: models[i % models.length],
      input_tokens: 100 + (i * 10), // Predictable values for testing
      output_tokens: 50 + (i * 5),
      total_tokens: 150 + (i * 15),
      input_cost: 0.001 + (i * 0.0001),
      output_cost: 0.002 + (i * 0.0001),
      total_cost: 0.003 + (i * 0.0002)
    }));
  }
  
  return records;
};
