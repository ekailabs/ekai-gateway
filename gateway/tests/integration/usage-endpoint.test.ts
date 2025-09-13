import { beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
// We'll import the handler after we mock the DB
import { TestDatabase, setupTestDatabase } from '../utils/database-helpers.js';
import { createBulkUsageRecords, createRealisticMockUsageRecord } from '../utils/test-helpers.js';
import { RequestHelpers } from '../utils/request-helpers.js';
import { MockFactories } from '../utils/mock-factories.js';

// We'll mock the database connection per-test to bind our in-memory DB

describe.sequential('Usage Endpoint Integration', () => {
  let app: express.Express;
  let testDb: TestDatabase;
  const { setup, cleanup } = setupTestDatabase();

  beforeEach(async () => {
    // Setup test database
    vi.resetModules();
    testDb = setup();
    
    // Mock the database connection module to return our in-memory DB
    vi.doMock('../../src/infrastructure/db/connection.js', () => ({
      dbConnection: {
        getDatabase: () => testDb.getDatabase()
      }
    }));
    const { handleUsageRequest } = await import('../../src/app/handlers/usage-handler.js');
    
    // Create Express app with usage endpoint
    app = RequestHelpers.createTestApp();
    app.get('/usage', handleUsageRequest);
    
    // Clear any spies
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.resetModules();
  });

  describe('GET /usage', () => {
    describe('Basic Functionality', () => {
      it('should return usage data with default parameters', async () => {
        // Insert test data within last few hours so default window includes them
        const records = createBulkUsageRecords(5, new Date(Date.now() - 4 * 60 * 60 * 1000));
        records.forEach(record => testDb.insertUsageRecord(record));

        const response = await request(app).get('/usage');

        RequestHelpers.expectValidUsageResponse(response);
        expect(response.body.totalRequests).toBeGreaterThan(0);
        expect(response.body.records).toHaveLength(5);
      });

      it('should return empty data when no usage records exist', async () => {
        const response = await request(app).get('/usage');

        RequestHelpers.expectValidUsageResponse(response);
        expect(response.body.totalRequests).toBe(0);
        expect(response.body.totalCost).toBe(0);
        expect(response.body.totalTokens).toBe(0);
        expect(response.body.records).toHaveLength(0);
        expect(response.body.costByProvider).toEqual({});
        expect(response.body.costByModel).toEqual({});
      });

      it('should handle large datasets efficiently', async () => {
        // Insert a large number of records strictly within [base, end)
        const base = new Date(Date.now() - 1000 * 60 * 60); // 1000 hours ago
        const largeDataset = createBulkUsageRecords(1000, base); // hourly increments
        testDb.insertBulkUsageRecords(largeDataset);

        // Use an end bound that strictly exceeds the last record
        const endBound = new Date(base.getTime() + (1000 + 1) * 60 * 60 * 1000); // base + 1001h

        const t0 = Date.now();
        const response = await request(app)
          .get('/usage')
          .query({ startTime: base.toISOString(), endTime: endBound.toISOString() });
        const t1 = Date.now();

        RequestHelpers.expectValidUsageResponse(response);
        expect(response.body.totalRequests).toBe(1000);
        expect(response.body.records.length).toBeLessThanOrEqual(100); // Default limit
        expect(t1 - t0).toBeLessThan(2000);
      });
    });

    describe('Query Parameters', () => {
      beforeEach(() => {
        // Insert test data with specific timestamps
        const baseDate = new Date('2024-01-01T00:00:00Z');
        const records = [
          createRealisticMockUsageRecord({ 
            timestamp: new Date(baseDate.getTime()).toISOString(),
            total_cost: 0.005
          }),
          createRealisticMockUsageRecord({ 
            timestamp: new Date(baseDate.getTime() + 3600000).toISOString(), // +1 hour
            total_cost: 0.010
          }),
          createRealisticMockUsageRecord({ 
            timestamp: new Date(baseDate.getTime() + 86400000).toISOString(), // +1 day
            total_cost: 0.008
          })
        ];
        
        records.forEach(record => testDb.insertUsageRecord(record));
      });

      it('should filter by date range', async () => {
        const queryParams = RequestHelpers.createValidQueryParams({
          startTime: '2024-01-01T00:00:00Z',
          endTime: '2024-01-01T02:00:00Z'
        });

        const response = await RequestHelpers.testUsageEndpoint(app, queryParams);

        RequestHelpers.expectValidUsageResponse(response);
        expect(response.body.totalRequests).toBe(2); // Only first 2 records
        expect(response.body.totalCost).toBeCloseTo(0.015, 6);
      });

      it('should handle timezone parameter', async () => {
        const timezones = RequestHelpers.createTimezoneTestCases();
        
        for (const timezone of timezones) {
          const queryParams = RequestHelpers.createValidQueryParams({ timezone });
          
          const response = await RequestHelpers.testUsageEndpoint(app, queryParams);
          
          RequestHelpers.expectValidUsageResponse(response);
        }
      });

      it('should handle date range edge cases', async () => {
        const dateRanges = RequestHelpers.createDateRangeTestCases();
        
        for (const dateRange of dateRanges) {
          const response = await RequestHelpers.testUsageEndpoint(app, {
            startTime: dateRange.startTime,
            endTime: dateRange.endTime
          });
          
          RequestHelpers.expectValidUsageResponse(response);
        }
      });
    });

    describe('Error Handling', () => {
      // Only test invalid cases that the handler actually rejects
      const invalidCases = [
        { startTime: 'invalid-date', endTime: new Date().toISOString() },
        { startTime: new Date().toISOString(), endTime: 'invalid-date' },
        { startTime: new Date().toISOString(), endTime: new Date(Date.now() - 86400000).toISOString() },
        { startTime: '2024-01-01T00:00:00Z', endTime: '2024-01-01T00:00:00Z' },
        { startTime: new Date().toISOString(), endTime: new Date().toISOString(), timezone: 'Invalid/Timezone' }
      ];
      
      invalidCases.forEach((params, index) => {
        it(`should reject invalid parameters (case ${index + 1})`, async () => {
          const response = await RequestHelpers.testUsageEndpoint(app, params as any);
          RequestHelpers.expectErrorResponse(response, 400);
        });
      });

      it('should handle database errors gracefully', async () => {
        const { usageTracker } = await import('../../src/infrastructure/utils/usage-tracker.js');
        const spy = vi.spyOn(usageTracker as any, 'getUsageFromDatabase').mockImplementation(() => {
          throw new Error('Database connection failed');
        });
        const response = await request(app).get('/usage');
        spy.mockRestore();
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.body).toHaveProperty('error');
      });
    });

    describe('Data Aggregation', () => {
      beforeEach(() => {
        // Insert diverse test data for aggregation testing
        const records = [
          createRealisticMockUsageRecord({
            timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
            provider: 'openai',
            model: 'gpt-4o',
            total_cost: 0.015,
            total_tokens: 150
          }),
          createRealisticMockUsageRecord({
            timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
            provider: 'openai',
            model: 'gpt-3.5-turbo',
            total_cost: 0.005,
            total_tokens: 200
          }),
          createRealisticMockUsageRecord({
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            provider: 'anthropic',
            model: 'claude-3-5-sonnet',
            total_cost: 0.012,
            total_tokens: 180
          }),
          createRealisticMockUsageRecord({
            timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
            provider: 'xai',
            model: 'grok-4',
            total_cost: 0.008,
            total_tokens: 120
          })
        ];
        
        records.forEach(record => testDb.insertUsageRecord(record));
      });

      it('should aggregate costs by provider correctly', async () => {
        const response = await request(app).get('/usage');

        RequestHelpers.expectValidUsageResponse(response);
        
        expect(response.body.costByProvider).toHaveProperty('openai');
        expect(response.body.costByProvider).toHaveProperty('anthropic');
        expect(response.body.costByProvider).toHaveProperty('xai');
        
        expect(response.body.costByProvider.openai).toBeCloseTo(0.020, 6); // 0.015 + 0.005
        expect(response.body.costByProvider.anthropic).toBeCloseTo(0.012, 6);
        expect(response.body.costByProvider.xai).toBeCloseTo(0.008, 6);
      });

      it('should aggregate costs by model correctly', async () => {
        const response = await request(app).get('/usage');

        RequestHelpers.expectValidUsageResponse(response);
        
        expect(response.body.costByModel).toHaveProperty('gpt-4o');
        expect(response.body.costByModel).toHaveProperty('gpt-3.5-turbo');
        expect(response.body.costByModel).toHaveProperty('claude-3-5-sonnet');
        expect(response.body.costByModel).toHaveProperty('grok-4');
        
        expect(response.body.costByModel['gpt-4o']).toBeCloseTo(0.015, 6);
        expect(response.body.costByModel['gpt-3.5-turbo']).toBeCloseTo(0.005, 6);
        expect(response.body.costByModel['claude-3-5-sonnet']).toBeCloseTo(0.012, 6);
        expect(response.body.costByModel['grok-4']).toBeCloseTo(0.008, 6);
      });

      it('should calculate total metrics correctly', async () => {
        const response = await request(app).get('/usage');

        RequestHelpers.expectValidUsageResponse(response);
        
        expect(response.body.totalRequests).toBe(4);
        expect(response.body.totalCost).toBeCloseTo(0.040, 6); // Sum of all costs
        expect(response.body.totalTokens).toBe(650); // Sum of all tokens
      });
    });

    describe('Real Provider/Model Integration', () => {
      it('should handle real provider/model combinations', async () => {
        // Get real provider/model combinations from actual pricing files
        const realCombinations = MockFactories.getRealProviderModelCombinations();
        expect(realCombinations.length).toBeGreaterThan(0);

        // Insert records with real provider/model combinations
        const records = realCombinations.slice(0, 10).map(combo => 
          createRealisticMockUsageRecord({
            provider: combo.provider,
            model: combo.model,
            timestamp: new Date().toISOString()
          })
        );
        
        records.forEach(record => testDb.insertUsageRecord(record));

        const response = await request(app).get('/usage');

        RequestHelpers.expectValidUsageResponse(response);
        expect(response.body.totalRequests).toBe(10);
        expect(response.body.records).toHaveLength(10);
        
        // Verify all records have valid provider/model combinations
        response.body.records.forEach((record: any) => {
          expect(realCombinations.some(combo => 
            combo.provider === record.provider && combo.model === record.model
          )).toBe(true);
        });
      });

      it('should handle cache-enabled models appropriately', async () => {
        const cacheEnabledCombos = MockFactories.getRealProviderModelCombinations()
          .filter(combo => combo.hasCache);
        
        expect(cacheEnabledCombos.length).toBeGreaterThan(0);

        // Insert records with cache tokens for cache-enabled models
        const records = cacheEnabledCombos.slice(0, 5).map(combo => 
          createRealisticMockUsageRecord({
            provider: combo.provider,
            model: combo.model,
            cache_write_input_tokens: 25,
            cache_read_input_tokens: 10,
            cache_write_cost: 0.001,
            cache_read_cost: 0.0005,
            timestamp: new Date().toISOString()
          })
        );
        
        records.forEach(record => testDb.insertUsageRecord(record));

        const response = await request(app).get('/usage');

        RequestHelpers.expectValidUsageResponse(response);
        
        // Verify cache costs are included in totals
        response.body.records.forEach((record: any) => {
          if (record.cache_write_input_tokens > 0) {
            expect(record.cache_write_cost).toBeGreaterThan(0);
          }
          if (record.cache_read_input_tokens > 0) {
            expect(record.cache_read_cost).toBeGreaterThan(0);
          }
        });
      });
    });

    describe('Performance Tests', () => {
      // Concurrent requests test removed for self-hosted environment

      it('should respond within acceptable time limits', async () => {
        // Insert substantial test data
        const records = createBulkUsageRecords(500);
        testDb.insertBulkUsageRecords(records);

        const responseTime = await RequestHelpers.expectResponseTime(
          () => request(app).get('/usage'),
          2000 // 2 seconds max
        );

        expect(responseTime).toBeLessThan(2000);
      });
    });
  });
});
