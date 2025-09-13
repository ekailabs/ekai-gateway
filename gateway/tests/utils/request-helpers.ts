import request from 'supertest';
import express from 'express';
import type { Express } from 'express';

/**
 * HTTP request testing utilities
 */

export class RequestHelpers {
  
  static createTestApp(): Express {
    const app = express();
    app.use(express.json({ limit: '50mb' }));
    return app;
  }

  static async testUsageEndpoint(
    app: Express, 
    queryParams: Record<string, string> = {}
  ) {
    const queryString = new URLSearchParams(queryParams).toString();
    const url = queryString ? `/usage?${queryString}` : '/usage';
    
    return request(app).get(url);
  }

  static createValidQueryParams(overrides: Record<string, string> = {}) {
    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);

    return {
      startTime: sevenDaysAgo.toISOString(),
      endTime: now.toISOString(),
      timezone: 'UTC',
      ...overrides
    };
  }

  static createInvalidQueryParams() {
    return [
      // Invalid date formats
      { startTime: 'invalid-date', endTime: new Date().toISOString() },
      { startTime: new Date().toISOString(), endTime: 'invalid-date' },
      
      // Invalid date ranges
      { startTime: new Date().toISOString(), endTime: new Date(Date.now() - 86400000).toISOString() },
      
      // Invalid timezones
      { startTime: new Date().toISOString(), endTime: new Date().toISOString(), timezone: 'Invalid/Timezone' },
      
      // Edge cases
      { startTime: '', endTime: '' },
      { startTime: null, endTime: null },
    ];
  }

  static createTimezoneTestCases() {
    return [
      'UTC',
      'America/New_York',
      'Europe/London',
      'Asia/Tokyo',
      'Australia/Sydney',
      'America/Los_Angeles'
    ];
  }

  static createDateRangeTestCases() {
    const now = new Date();
    
    return [
      // Last hour
      {
        name: 'last hour',
        startTime: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
        endTime: now.toISOString()
      },
      
      // Last 24 hours
      {
        name: 'last 24 hours',
        startTime: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        endTime: now.toISOString()
      },
      
      // Last 7 days
      {
        name: 'last 7 days',
        startTime: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        endTime: now.toISOString()
      },
      
      // Last 30 days
      {
        name: 'last 30 days',
        startTime: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        endTime: now.toISOString()
      },
      
      // Custom range
      {
        name: 'custom range',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-02T00:00:00Z'
      }
    ];
  }

  static expectValidUsageResponse(response: any) {
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('totalRequests');
    expect(response.body).toHaveProperty('totalCost');
    expect(response.body).toHaveProperty('totalTokens');
    expect(response.body).toHaveProperty('costByProvider');
    expect(response.body).toHaveProperty('costByModel');
    expect(response.body).toHaveProperty('records');
    
    expect(typeof response.body.totalRequests).toBe('number');
    expect(typeof response.body.totalCost).toBe('number');
    expect(typeof response.body.totalTokens).toBe('number');
    expect(Array.isArray(response.body.records)).toBe(true);
  }

  static expectErrorResponse(response: any, statusCode: number = 400) {
    expect(response.status).toBe(statusCode);
    expect(response.body).toHaveProperty('error');
    expect(typeof response.body.error).toBe('string');
  }

  static async expectResponseTime(
    testFn: () => Promise<any>, 
    maxTimeMs: number = 1000
  ) {
    const startTime = Date.now();
    await testFn();
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    expect(duration).toBeLessThan(maxTimeMs);
    return duration;
  }
}
