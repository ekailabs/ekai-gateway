import { beforeEach, afterEach, vi } from 'vitest';
import { UsageHandler, handleUsageRequest } from '../../../../src/app/handlers/usage-handler.js';
import { mockRequest, mockResponse, expectValidUsageSummary } from '../../../utils/test-helpers.js';
import { RequestHelpers } from '../../../utils/request-helpers.js';

// Mock dependencies
vi.mock('../../../../src/infrastructure/utils/usage-tracker.js', () => ({
  usageTracker: {
    getUsageFromDatabase: vi.fn()
  }
}));

vi.mock('../../../../src/infrastructure/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('../../../../src/infrastructure/utils/error-handler.js', () => ({
  handleError: vi.fn()
}));

describe('UsageHandler', () => {
  let usageHandler: UsageHandler;
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    usageHandler = new UsageHandler();
    mockReq = mockRequest();
    mockRes = mockResponse();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getUsage', () => {
    describe('Parameter Validation', () => {
    it('should use default date range when no parameters provided', async () => {
      const { usageTracker } = await import('../../../../src/infrastructure/utils/usage-tracker.js');
      const mockUsageData = {
        totalRequests: 5,
        totalCost: 0.015,
        totalTokens: 750,
        costByProvider: { openai: 0.015 },
        costByModel: { 'gpt-4o': 0.015 },
        records: []
      };
      
      (usageTracker.getUsageFromDatabase as any).mockReturnValue(mockUsageData);

      await usageHandler.getUsage(mockReq, mockRes);

      expect(usageTracker.getUsageFromDatabase).toHaveBeenCalledWith(
        expect.any(String), // startDate (7 days ago)
        expect.any(String)  // endDate (now)
      );
      expect(mockRes.json).toHaveBeenCalledWith(mockUsageData);
    });

    it('should use provided startTime and endTime', async () => {
      const { usageTracker } = await import('../../../../src/infrastructure/utils/usage-tracker.js');
      const startTime = '2024-01-01T00:00:00.000Z';
      const endTime = '2024-01-02T00:00:00.000Z';
      
      mockReq.query = { startTime, endTime };
      
      const mockUsageData = {
        totalRequests: 0,
        totalCost: 0,
        totalTokens: 0,
        costByProvider: {},
        costByModel: {},
        records: []
      };
      
      (usageTracker.getUsageFromDatabase as any).mockReturnValue(mockUsageData);

      await usageHandler.getUsage(mockReq, mockRes);

      expect(usageTracker.getUsageFromDatabase).toHaveBeenCalledWith(startTime, endTime);
      expect(mockRes.json).toHaveBeenCalledWith(mockUsageData);
    });

      it('should default timezone to UTC when not provided', async () => {
        const { logger } = await import('../../../../src/infrastructure/utils/logger.js');
        const { usageTracker } = await import('../../../../src/infrastructure/utils/usage-tracker.js');
        
        (usageTracker.getUsageFromDatabase as any).mockReturnValue({
          totalRequests: 0, totalCost: 0, totalTokens: 0,
          costByProvider: {}, costByModel: {}, records: []
        });

        await usageHandler.getUsage(mockReq, mockRes);

        expect(logger.info).toHaveBeenCalledWith(
          'USAGE_TRACKER: Fetching usage data',
          expect.objectContaining({
            tz: 'UTC'
          })
        );
      });

      it('should use provided timezone', async () => {
        const { logger } = await import('../../../../src/infrastructure/utils/logger.js');
        const { usageTracker } = await import('../../../../src/infrastructure/utils/usage-tracker.js');
        
        mockReq.query = { timezone: 'America/New_York' };
        
        (usageTracker.getUsageFromDatabase as any).mockReturnValue({
          totalRequests: 0, totalCost: 0, totalTokens: 0,
          costByProvider: {}, costByModel: {}, records: []
        });

        await usageHandler.getUsage(mockReq, mockRes);

        expect(logger.info).toHaveBeenCalledWith(
          'USAGE_TRACKER: Fetching usage data',
          expect.objectContaining({
            tz: 'America/New_York'
          })
        );
      });
    });

    describe('Date Validation', () => {
      it('should reject invalid startTime format', async () => {
        mockReq.query = { startTime: 'invalid-date' };

        await usageHandler.getUsage(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Invalid startTime format. Use RFC3339 (e.g., 2024-01-01T00:00:00Z)'
        });
      });

      it('should reject invalid endTime format', async () => {
        mockReq.query = { 
          startTime: '2024-01-01T00:00:00Z',
          endTime: 'invalid-date' 
        };

        await usageHandler.getUsage(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Invalid endTime format. Use RFC3339 (e.g., 2024-01-01T23:59:59Z)'
        });
      });

      it('should reject startTime >= endTime', async () => {
        mockReq.query = {
          startTime: '2024-01-02T00:00:00Z',
          endTime: '2024-01-01T00:00:00Z'
        };

        await usageHandler.getUsage(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'startTime must be before endTime'
        });
      });

      it('should reject equal startTime and endTime', async () => {
        const sameTime = '2024-01-01T00:00:00Z';
        mockReq.query = {
          startTime: sameTime,
          endTime: sameTime
        };

        await usageHandler.getUsage(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'startTime must be before endTime'
        });
      });

      it('should accept valid date range', async () => {
        const { usageTracker } = await import('../../../../src/infrastructure/utils/usage-tracker.js');
        
        mockReq.query = {
          startTime: '2024-01-01T00:00:00Z',
          endTime: '2024-01-02T00:00:00Z'
        };
        
        (usageTracker.getUsageFromDatabase as any).mockReturnValue({
          totalRequests: 0, totalCost: 0, totalTokens: 0,
          costByProvider: {}, costByModel: {}, records: []
        });

        await usageHandler.getUsage(mockReq, mockRes);

        expect(mockRes.status).not.toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalled();
      });
    });

    describe('Timezone Validation', () => {
      const validTimezones = RequestHelpers.createTimezoneTestCases();
      
      validTimezones.forEach(timezone => {
        it(`should accept valid timezone: ${timezone}`, async () => {
          const { usageTracker } = await import('../../../../src/infrastructure/utils/usage-tracker.js');
          
          mockReq.query = { timezone };
          
          vi.mocked(usageTracker.getUsageFromDatabase).mockReturnValue({
            totalRequests: 0, totalCost: 0, totalTokens: 0,
            costByProvider: {}, costByModel: {}, records: []
          });

          await usageHandler.getUsage(mockReq, mockRes);

          expect(mockRes.status).not.toHaveBeenCalledWith(400);
          expect(mockRes.json).toHaveBeenCalled();
        });
      });

      it('should reject invalid timezone', async () => {
        mockReq.query = { timezone: 'Invalid/Timezone' };

        await usageHandler.getUsage(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Invalid timezone. Use IANA format (e.g., America/New_York, UTC)'
        });
      });

      it('should treat empty timezone as UTC', async () => {
        const { usageTracker } = await import('../../../../src/infrastructure/utils/usage-tracker.js');
        (usageTracker.getUsageFromDatabase as any).mockReturnValue({
          totalRequests: 0,
          totalCost: 0,
          totalTokens: 0,
          costByProvider: {},
          costByModel: {},
          records: []
        });

        mockReq.query = { timezone: '' };

        await usageHandler.getUsage(mockReq, mockRes);

        expect(mockRes.status).not.toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalled();
      });
    });

    describe('Response Format', () => {
      it('should return valid usage summary structure', async () => {
        const { usageTracker } = await import('../../../../src/infrastructure/utils/usage-tracker.js');
        
        const mockUsageData = {
          totalRequests: 10,
          totalCost: 0.025,
          totalTokens: 1500,
          costByProvider: { 
            openai: 0.015,
            anthropic: 0.010 
          },
          costByModel: { 
            'gpt-4o': 0.015,
            'claude-3-5-sonnet': 0.010 
          },
          records: [
            {
              id: 1,
              request_id: 'test-123',
              provider: 'openai',
              model: 'gpt-4o',
              timestamp: '2024-01-01T00:00:00Z',
              input_tokens: 100,
              output_tokens: 50,
              total_tokens: 150,
              total_cost: 0.015,
              currency: 'USD'
            }
          ]
        };
        
        (usageTracker.getUsageFromDatabase as any).mockReturnValue(mockUsageData);

        await usageHandler.getUsage(mockReq, mockRes);

        expect(mockRes.json).toHaveBeenCalledWith(mockUsageData);
        expectValidUsageSummary(mockUsageData);
      });

      it('should handle empty usage data', async () => {
        const { usageTracker } = await import('../../../../src/infrastructure/utils/usage-tracker.js');
        
        const emptyUsageData = {
          totalRequests: 0,
          totalCost: 0,
          totalTokens: 0,
          costByProvider: {},
          costByModel: {},
          records: []
        };
        
        (usageTracker.getUsageFromDatabase as any).mockReturnValue(emptyUsageData);

        await usageHandler.getUsage(mockReq, mockRes);

        expect(mockRes.json).toHaveBeenCalledWith(emptyUsageData);
        expectValidUsageSummary(emptyUsageData);
      });
    });

    describe('Error Handling', () => {
      it('should handle usageTracker errors', async () => {
        const { handleError } = await import('../../../../src/infrastructure/utils/error-handler.js');
        const { logger } = await import('../../../../src/infrastructure/utils/logger.js');
        const { usageTracker } = await import('../../../../src/infrastructure/utils/usage-tracker.js');
        
        const testError = new Error('Database connection failed');
        (usageTracker.getUsageFromDatabase as any).mockImplementation(() => {
          throw testError;
        });

        await usageHandler.getUsage(mockReq, mockRes);

        expect(logger.error).toHaveBeenCalledWith('Failed to fetch usage data', testError, expect.objectContaining({ module: 'usage-handler' }));
        expect(handleError).toHaveBeenCalledWith(testError, mockRes);
      });

      it('should handle non-Error exceptions', async () => {
        const { handleError } = await import('../../../../src/infrastructure/utils/error-handler.js');
        const { logger } = await import('../../../../src/infrastructure/utils/logger.js');
        const { usageTracker } = await import('../../../../src/infrastructure/utils/usage-tracker.js');
        
        const testError = 'String error';
        (usageTracker.getUsageFromDatabase as any).mockImplementation(() => {
          throw testError;
        });

        await usageHandler.getUsage(mockReq, mockRes);

        expect(logger.error).toHaveBeenCalledWith(
          'Failed to fetch usage data', 
          new Error('String error'),
          expect.objectContaining({ module: 'usage-handler' })
        );
        expect(handleError).toHaveBeenCalledWith(testError, mockRes);
      });
    });
  });

  describe('handleUsageRequest function', () => {
    it('should delegate to UsageHandler.getUsage', async () => {
      const { usageTracker } = await import('../../../../src/infrastructure/utils/usage-tracker.js');
      
      (usageTracker.getUsageFromDatabase as any).mockReturnValue({
        totalRequests: 0, totalCost: 0, totalTokens: 0,
        costByProvider: {}, costByModel: {}, records: []
      });

      await handleUsageRequest(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
    });
  });
});
