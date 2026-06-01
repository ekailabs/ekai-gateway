// All vitest globals are available globally due to vitest config globals: true
import { setupTestDatabase } from '../../../utils/database-helpers.js';

describe('UsageTracker', () => {
  const { setup, cleanup } = setupTestDatabase();

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    cleanup();
    vi.resetModules();
  });

  it('should persist usage records when pricing is unavailable', async () => {
    const testDb = setup();

    vi.doMock('../../../../src/infrastructure/db/connection.js', () => ({
      dbConnection: {
        getDatabase: () => testDb.getDatabase()
      }
    }));
    vi.doMock('../../../../src/infrastructure/utils/pricing-loader.js', () => ({
      pricingLoader: {
        loadAllPricing: vi.fn(),
        getModelPricing: vi.fn(() => null),
        calculateCost: vi.fn(() => null)
      }
    }));
    vi.doMock('../../../../src/infrastructure/telemetry/usage.js', () => ({
      recordUsage: vi.fn()
    }));

    const { UsageTracker } = await import('../../../../src/infrastructure/utils/usage-tracker.js');
    const usageTracker = new UsageTracker();

    const result = usageTracker.trackUsage('unknown-model', 'unknown-provider', 10, 5, 2, 3);

    expect(result).toBeNull();
    const records = testDb.getAllRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      provider: 'unknown-provider',
      model: 'unknown-model',
      input_tokens: 10,
      cache_write_input_tokens: 2,
      cache_read_input_tokens: 3,
      output_tokens: 5,
      total_tokens: 20,
      input_cost: 0,
      cache_write_cost: 0,
      cache_read_cost: 0,
      output_cost: 0,
      total_cost: 0,
      currency: 'USD',
      payment_method: 'api_key'
    });
  });
});
