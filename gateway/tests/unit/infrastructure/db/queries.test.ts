// All vitest globals (beforeEach, afterEach, vi, describe, it, expect) are available globally due to vitest config globals: true
import type { UsageRecord } from '../../../../src/infrastructure/db/queries.js';
import { TestDatabase, setupTestDatabase } from '../../../utils/database-helpers.js';
import { createMockUsageRecord, createBulkUsageRecords, expectValidUsageRecord } from '../../../utils/test-helpers.js';

describe('DatabaseQueries', () => {
  let testDb: TestDatabase;
  let queries: any; // DatabaseQueries instance loaded after mocking
  let DatabaseQueriesClass: any;
  const { setup, cleanup } = setupTestDatabase();

  beforeEach(async () => {
    // Ensure fresh module graph each test
    vi.resetModules();
    testDb = setup();
    
    // Mock the connection module to return our in-memory DB
    vi.doMock('../../../../src/infrastructure/db/connection.js', () => ({
      dbConnection: {
        getDatabase: () => testDb.getDatabase()
      }
    }));
    // Import the class only after mocking connection
    ({ DatabaseQueries: DatabaseQueriesClass } = await import('../../../../src/infrastructure/db/queries.js'));
    
    // Create a fresh DatabaseQueries instance
    queries = new DatabaseQueriesClass();
  });

  afterEach(() => {
    cleanup();
  });

  describe('insertUsageRecord', () => {
    it('should insert a valid usage record', () => {
      const record = createMockUsageRecord();
      
      const insertId = queries.insertUsageRecord(record);
      
      expect(insertId).toBeTypeOf('number');
      expect(insertId).toBeGreaterThan(0);
      
      // Verify the record was inserted
      const allRecords = testDb.getAllRecords();
      expect(allRecords).toHaveLength(1);
      expect(allRecords[0].request_id).toBe(record.request_id);
    });

    it('should insert record with all fields correctly', () => {
      const record = createMockUsageRecord({
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        input_tokens: 200,
        cache_write_input_tokens: 50,
        cache_read_input_tokens: 25,
        output_tokens: 100,
        total_tokens: 375,
        input_cost: 0.0006,
        cache_write_cost: 0.0001875,
        cache_read_cost: 0.0000075,
        output_cost: 0.0015,
        total_cost: 0.0022950
      });
      
      const insertId = queries.insertUsageRecord(record);
      
      const allRecords = testDb.getAllRecords();
      const insertedRecord = allRecords[0];
      
      expect(insertedRecord.id).toBe(insertId);
      expect(insertedRecord.provider).toBe('anthropic');
      expect(insertedRecord.model).toBe('claude-3-5-sonnet');
      expect(insertedRecord.input_tokens).toBe(200);
      expect(insertedRecord.cache_write_input_tokens).toBe(50);
      expect(insertedRecord.cache_read_input_tokens).toBe(25);
      expect(insertedRecord.output_tokens).toBe(100);
      expect(insertedRecord.total_tokens).toBe(375);
      expect(insertedRecord.total_cost).toBeCloseTo(0.0022950, 6);
      expect(insertedRecord.currency).toBe('USD');
      expect(insertedRecord.created_at).toBeTruthy();
    });

    it('should handle multiple inserts', () => {
      const records = createBulkUsageRecords(5);
      const insertIds: number[] = [];
      
      records.forEach(record => {
        const insertId = queries.insertUsageRecord(record);
        insertIds.push(insertId);
      });
      
      expect(insertIds).toHaveLength(5);
      expect(new Set(insertIds).size).toBe(5); // All IDs should be unique
      expect(testDb.getRecordCount()).toBe(5);
    });

    it('should enforce unique request_id constraint', () => {
      const record1 = createMockUsageRecord({ request_id: 'duplicate-id' });
      const record2 = createMockUsageRecord({ request_id: 'duplicate-id' });
      
      queries.insertUsageRecord(record1);
      
      expect(() => queries.insertUsageRecord(record2)).toThrow();
    });
  });

  describe('getAllUsageRecords', () => {
    let testRecords: Array<Omit<UsageRecord, 'id' | 'created_at'>>;
    let baseDate: Date;
    
    beforeEach(() => {
      // Insert test data with specific, predictable timestamps
      baseDate = new Date('2024-01-01T00:00:00.000Z');
      testRecords = [
        createMockUsageRecord({ 
          request_id: 'test-record-1',
          timestamp: baseDate.toISOString(), // 00:00:00
          provider: 'openai',
          model: 'gpt-4o',
          total_cost: 0.005
        }),
        createMockUsageRecord({ 
          request_id: 'test-record-2',
          timestamp: new Date(baseDate.getTime() + 3600000).toISOString(), // 01:00:00
          provider: 'anthropic',
          model: 'claude-3-5-sonnet',
          total_cost: 0.010
        }),
        createMockUsageRecord({ 
          request_id: 'test-record-3',
          timestamp: new Date(baseDate.getTime() + 7200000).toISOString(), // 02:00:00
          provider: 'xai',
          model: 'grok-4',
          total_cost: 0.008
        })
      ];
      
      testRecords.forEach(record => queries.insertUsageRecord(record));
    });

    it('should return records within date range', () => {
      const startDate = '2024-01-01T00:00:00.000Z';
      const endDate = '2024-01-01T03:00:00.000Z';
      
      const records = queries.getAllUsageRecords(100, startDate, endDate);
      
      expect(records).toHaveLength(3);
      records.forEach(record => {
        expectValidUsageRecord(record);
        const recordTime = new Date(record.timestamp).getTime();
        const startTime = new Date(startDate).getTime();
        const endTime = new Date(endDate).getTime();
        
        expect(recordTime).toBeGreaterThanOrEqual(startTime);
        expect(recordTime).toBeLessThan(endTime);
      });
    });

    it('should respect limit parameter', () => {
      const startDate = '2024-01-01T00:00:00Z';
      const endDate = '2024-01-01T03:00:00Z';
      
      const records = queries.getAllUsageRecords(2, startDate, endDate);
      
      expect(records).toHaveLength(2);
    });

    it('should return records in descending timestamp order', () => {
      const startDate = '2024-01-01T00:00:00.000Z';
      const endDate = '2024-01-01T03:00:00.000Z';
      
      const records = queries.getAllUsageRecords(100, startDate, endDate);
      
      expect(records).toHaveLength(3);
      
      // Records should be ordered: newest first (02:00:00, 01:00:00, 00:00:00)
      expect(records[0].timestamp).toBe(new Date(baseDate.getTime() + 7200000).toISOString()); // 02:00:00
      expect(records[1].timestamp).toBe(new Date(baseDate.getTime() + 3600000).toISOString()); // 01:00:00  
      expect(records[2].timestamp).toBe(baseDate.toISOString()); // 00:00:00
      
      // Double-check with time comparison
      for (let i = 0; i < records.length - 1; i++) {
        const currentTime = new Date(records[i].timestamp).getTime();
        const nextTime = new Date(records[i + 1].timestamp).getTime();
        expect(currentTime).toBeGreaterThanOrEqual(nextTime);
      }
    });

    it('should return empty array for date range with no data', () => {
      const startDate = '2023-01-01T00:00:00Z';
      const endDate = '2023-01-02T00:00:00Z';
      
      const records = queries.getAllUsageRecords(100, startDate, endDate);
      
      expect(records).toHaveLength(0);
    });
  });

  describe('getUsageRecordsByDateRange', () => {
    it('should return records between dates (inclusive)', () => {
      const baseDate = new Date('2024-01-01T12:00:00Z');
      const records = [
        createMockUsageRecord({ timestamp: new Date(baseDate.getTime() - 3600000).toISOString() }), // -1 hour
        createMockUsageRecord({ timestamp: baseDate.toISOString() }), // exact start
        createMockUsageRecord({ timestamp: new Date(baseDate.getTime() + 3600000).toISOString() }), // +1 hour
        createMockUsageRecord({ timestamp: new Date(baseDate.getTime() + 7200000).toISOString() }) // +2 hours
      ];
      
      records.forEach(record => queries.insertUsageRecord(record));
      
      const startDate = baseDate.toISOString();
      const endDate = new Date(baseDate.getTime() + 3600000).toISOString();
      
      const result = queries.getUsageRecordsByDateRange(startDate, endDate);
      
      expect(result).toHaveLength(2); // Should include start and end times
    });
  });

  describe('getTotalCost', () => {
    beforeEach(() => {
      const records = [
        createMockUsageRecord({ 
          timestamp: '2024-01-01T00:00:00Z',
          total_cost: 0.005 
        }),
        createMockUsageRecord({ 
          timestamp: '2024-01-01T01:00:00Z',
          total_cost: 0.010 
        }),
        createMockUsageRecord({ 
          timestamp: '2024-01-02T00:00:00Z',
          total_cost: 0.015 
        })
      ];
      
      records.forEach(record => queries.insertUsageRecord(record));
    });

    it('should return total cost within date range', () => {
      const startDate = '2024-01-01T00:00:00Z';
      const endDate = '2024-01-01T02:00:00Z';
      
      const totalCost = queries.getTotalCost(startDate, endDate);
      
      expect(totalCost).toBeCloseTo(0.015, 6);
    });

    it('should return 0 for date range with no data', () => {
      const startDate = '2023-01-01T00:00:00Z';
      const endDate = '2023-01-02T00:00:00Z';
      
      const totalCost = queries.getTotalCost(startDate, endDate);
      
      expect(totalCost).toBe(0);
    });
  });

  describe('getTotalTokens', () => {
    beforeEach(() => {
      const records = [
        createMockUsageRecord({ 
          timestamp: '2024-01-01T00:00:00Z',
          total_tokens: 150 
        }),
        createMockUsageRecord({ 
          timestamp: '2024-01-01T01:00:00Z',
          total_tokens: 200 
        }),
        createMockUsageRecord({ 
          timestamp: '2024-01-02T00:00:00Z',
          total_tokens: 100 
        })
      ];
      
      records.forEach(record => queries.insertUsageRecord(record));
    });

    it('should return total tokens within date range', () => {
      const startDate = '2024-01-01T00:00:00Z';
      const endDate = '2024-01-01T02:00:00Z';
      
      const totalTokens = queries.getTotalTokens(startDate, endDate);
      
      expect(totalTokens).toBe(350);
    });

    it('should return 0 for date range with no data', () => {
      const startDate = '2023-01-01T00:00:00Z';
      const endDate = '2023-01-02T00:00:00Z';
      
      const totalTokens = queries.getTotalTokens(startDate, endDate);
      
      expect(totalTokens).toBe(0);
    });
  });

  describe('getTotalRequests', () => {
    beforeEach(() => {
      // Create 5 records within the target date range
      const baseDate = new Date('2024-01-01T10:00:00.000Z');
      const records = [];
      
      for (let i = 0; i < 5; i++) {
        const timestamp = new Date(baseDate.getTime() + (i * 3600000)).toISOString(); // Each hour apart
        records.push(createMockUsageRecord({ 
          request_id: `total-requests-test-${i}`,
          timestamp
        }));
      }
      
      records.forEach(record => queries.insertUsageRecord(record));
      
      // Add one more record outside the date range (next day)
      const outsideRecord = createMockUsageRecord({ 
        request_id: 'outside-range-record',
        timestamp: '2024-01-02T10:00:00.000Z' 
      });
      queries.insertUsageRecord(outsideRecord);
    });

    it('should return request count within date range', () => {
      const startDate = '2024-01-01T00:00:00.000Z';
      const endDate = '2024-01-02T00:00:00.000Z'; // End before the outside record
      
      const totalRequests = queries.getTotalRequests(startDate, endDate);
      
      expect(totalRequests).toBe(5);
    });

    it('should return 0 for date range with no data', () => {
      const startDate = '2023-01-01T00:00:00Z';
      const endDate = '2023-01-02T00:00:00Z';
      
      const totalRequests = queries.getTotalRequests(startDate, endDate);
      
      expect(totalRequests).toBe(0);
    });
  });

  describe('getCostByProvider', () => {
    beforeEach(() => {
      const records = [
        createMockUsageRecord({ 
          timestamp: '2024-01-01T00:00:00Z',
          provider: 'openai',
          total_cost: 0.005 
        }),
        createMockUsageRecord({ 
          timestamp: '2024-01-01T01:00:00Z',
          provider: 'openai',
          total_cost: 0.010 
        }),
        createMockUsageRecord({ 
          timestamp: '2024-01-01T02:00:00Z',
          provider: 'anthropic',
          total_cost: 0.008 
        }),
        createMockUsageRecord({ 
          timestamp: '2024-01-01T03:00:00Z',
          provider: 'xai',
          total_cost: 0.012 
        })
      ];
      
      records.forEach(record => queries.insertUsageRecord(record));
    });

    it('should return cost grouped by provider', () => {
      const startDate = '2024-01-01T00:00:00Z';
      const endDate = '2024-01-01T04:00:00Z';
      
      const costByProvider = queries.getCostByProvider(startDate, endDate);
      
      expect(costByProvider).toEqual({
        openai: 0.015,
        anthropic: 0.008,
        xai: 0.012
      });
    });

    it('should return empty object for date range with no data', () => {
      const startDate = '2023-01-01T00:00:00Z';
      const endDate = '2023-01-02T00:00:00Z';
      
      const costByProvider = queries.getCostByProvider(startDate, endDate);
      
      expect(costByProvider).toEqual({});
    });
  });

  describe('getCostByModel', () => {
    beforeEach(() => {
      const records = [
        createMockUsageRecord({ 
          timestamp: '2024-01-01T00:00:00Z',
          model: 'gpt-4o',
          total_cost: 0.005 
        }),
        createMockUsageRecord({ 
          timestamp: '2024-01-01T01:00:00Z',
          model: 'gpt-4o',
          total_cost: 0.010 
        }),
        createMockUsageRecord({ 
          timestamp: '2024-01-01T02:00:00Z',
          model: 'claude-3-5-sonnet',
          total_cost: 0.008 
        }),
        createMockUsageRecord({ 
          timestamp: '2024-01-01T03:00:00Z',
          model: 'grok-4',
          total_cost: 0.012 
        })
      ];
      
      records.forEach(record => queries.insertUsageRecord(record));
    });

    it('should return cost grouped by model', () => {
      const startDate = '2024-01-01T00:00:00Z';
      const endDate = '2024-01-01T04:00:00Z';
      
      const costByModel = queries.getCostByModel(startDate, endDate);
      
      expect(costByModel).toEqual({
        'gpt-4o': 0.015,
        'claude-3-5-sonnet': 0.008,
        'grok-4': 0.012
      });
    });

    it('should return empty object for date range with no data', () => {
      const startDate = '2023-01-01T00:00:00Z';
      const endDate = '2023-01-02T00:00:00Z';
      
      const costByModel = queries.getCostByModel(startDate, endDate);
      
      expect(costByModel).toEqual({});
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large numbers', () => {
      const record = createMockUsageRecord({
        input_tokens: 1000000,
        output_tokens: 500000,
        total_tokens: 1500000,
        total_cost: 999.999999
      });
      
      const insertId = queries.insertUsageRecord(record);
      expect(insertId).toBeTypeOf('number');
      
      const records = testDb.getAllRecords();
      expect(records[0].input_tokens).toBe(1000000);
      expect(records[0].total_cost).toBeCloseTo(999.999999, 6);
    });

    it('should handle zero values', () => {
      const record = createMockUsageRecord({
        input_tokens: 0,
        cache_write_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        input_cost: 0,
        cache_write_cost: 0,
        cache_read_cost: 0,
        output_cost: 0,
        total_cost: 0
      });
      
      const insertId = queries.insertUsageRecord(record);
      expect(insertId).toBeTypeOf('number');
      
      const records = testDb.getAllRecords();
      expect(records[0].total_tokens).toBe(0);
      expect(records[0].total_cost).toBe(0);
    });

    it('should handle date range edge cases', () => {
      const record = createMockUsageRecord({ 
        timestamp: '2024-01-01T00:00:00.000Z' 
      });
      queries.insertUsageRecord(record);
      
      // Exact boundary test
      const records1 = queries.getAllUsageRecords(100, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.001Z');
      expect(records1).toHaveLength(1);
      
      // Just before boundary
      const records2 = queries.getAllUsageRecords(100, '2023-12-31T23:59:59.999Z', '2024-01-01T00:00:00.000Z');
      expect(records2).toHaveLength(0);
    });
  });
});
