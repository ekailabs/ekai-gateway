import { dbConnection } from './connection.js';

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
  payment_method?: string;
  created_at: string;
}

export interface SpendLimitRecord {
  amount_usd: number | null;
  alert_only: boolean;
  window: string;
  scope: string;
  updated_at: string;
}

export interface UserPreferences {
  address: string;
  api_address: string;
  model_preferences: string[] | null;
  created_at: string;
  updated_at: string;
}

export class DatabaseQueries {
  private db = dbConnection.getDatabase();

  // Insert a new usage record
  insertUsageRecord(record: Omit<UsageRecord, 'id' | 'created_at'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO usage_records (
        request_id, provider, model, timestamp,
        input_tokens, cache_write_input_tokens, cache_read_input_tokens, output_tokens, total_tokens,
        input_cost, cache_write_cost, cache_read_cost, output_cost, total_cost, currency, payment_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      record.request_id,
      record.provider,
      record.model,
      record.timestamp,
      record.input_tokens,
      record.cache_write_input_tokens,
      record.cache_read_input_tokens,
      record.output_tokens,
      record.total_tokens,
      record.input_cost,
      record.cache_write_cost,
      record.cache_read_cost,
      record.output_cost,
      record.total_cost,
      record.currency,
      record.payment_method || 'api_key'
    );
    
    return result.lastInsertRowid as number;
  }

  // Get all usage records (with optional limit, required date range)
  getAllUsageRecords(limit: number = 100, startDate: string, endDate: string): UsageRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM usage_records 
      WHERE timestamp >= ? AND timestamp < ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    return stmt.all(startDate, endDate, limit) as UsageRecord[];
  }

  // Get usage records by date range
  getUsageRecordsByDateRange(startDate: string, endDate: string): UsageRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM usage_records 
      WHERE timestamp BETWEEN ? AND ? 
      ORDER BY timestamp DESC
    `);
    return stmt.all(startDate, endDate) as UsageRecord[];
  }

  // Get total cost (with date range)
  getTotalCost(startDate: string, endDate: string): number {
    const stmt = this.db.prepare(`
      SELECT SUM(total_cost) as total FROM usage_records 
      WHERE timestamp >= ? AND timestamp < ?
    `);
    const result = stmt.get(startDate, endDate) as { total: number | null };
    return result.total || 0;
  }

  // Get total tokens (with date range)
  getTotalTokens(startDate: string, endDate: string): number {
    const stmt = this.db.prepare(`
      SELECT SUM(total_tokens) as total FROM usage_records 
      WHERE timestamp >= ? AND timestamp < ?
    `);
    const result = stmt.get(startDate, endDate) as { total: number | null };
    return result.total || 0;
  }

  // Get total requests (with date range)
  getTotalRequests(startDate: string, endDate: string): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as total FROM usage_records 
      WHERE timestamp >= ? AND timestamp < ?
    `);
    const result = stmt.get(startDate, endDate) as { total: number };
    return result.total;
  }

  // Get cost by provider (with date range)
  getCostByProvider(startDate: string, endDate: string): Record<string, number> {
    const stmt = this.db.prepare(`
      SELECT provider, SUM(total_cost) as total 
      FROM usage_records 
      WHERE timestamp >= ? AND timestamp < ?
      GROUP BY provider
    `);
    const results = stmt.all(startDate, endDate) as Array<{ provider: string; total: number }>;
    
    const costByProvider: Record<string, number> = {};
    results.forEach(row => {
      costByProvider[row.provider] = row.total;
    });
    
    return costByProvider;
  }

  // Get cost by model (with date range)
  getCostByModel(startDate: string, endDate: string): Record<string, number> {
    const stmt = this.db.prepare(`
      SELECT model, SUM(total_cost) as total 
      FROM usage_records 
      WHERE timestamp >= ? AND timestamp < ?
      GROUP BY model
    `);
    const results = stmt.all(startDate, endDate) as Array<{ model: string; total: number }>;
    
    const costByModel: Record<string, number> = {};
    results.forEach(row => {
      costByModel[row.model] = row.total;
    });
    
    return costByModel;
  }

  // Get global spend limit (single row)
  getGlobalSpendLimit(): SpendLimitRecord | null {
    const stmt = this.db.prepare(`
      SELECT scope, amount_usd, alert_only, window, updated_at
      FROM spend_limits
      WHERE id = 1
      LIMIT 1
    `);
    const result = stmt.get() as { scope: string; amount_usd: number | null; alert_only: number; window: string; updated_at: string } | undefined;
    if (!result) return null;
    return {
      scope: result.scope,
      amount_usd: result.amount_usd,
      alert_only: Boolean(result.alert_only),
      window: result.window,
      updated_at: result.updated_at
    };
  }

  // Upsert global spend limit
  upsertGlobalSpendLimit(amountUsd: number | null, alertOnly: boolean): void {
    const stmt = this.db.prepare(`
      INSERT INTO spend_limits (id, scope, amount_usd, alert_only, window, updated_at)
      VALUES (1, 'global', ?, ?, 'monthly', CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        amount_usd = excluded.amount_usd,
        alert_only = excluded.alert_only,
        window = excluded.window,
        updated_at = excluded.updated_at
    `);

    stmt.run(amountUsd, alertOnly ? 1 : 0);
  }

  // Get user preferences by address
  getUserPreferences(address: string): UserPreferences | null {
    const stmt = this.db.prepare(`
      SELECT address, api_address, model_preferences, created_at, updated_at
      FROM user_preferences
      WHERE address = ?
    `);
    const result = stmt.get(address) as { address: string; api_address: string; model_preferences: string | null; created_at: string; updated_at: string } | undefined;
    if (!result) return null;

    return {
      ...result,
      model_preferences: result.model_preferences ? JSON.parse(result.model_preferences) : null
    };
  }

  // Upsert user preferences
  upsertUserPreferences(address: string, apiAddress: string, modelPreferences: string[] | null): UserPreferences {
    const stmt = this.db.prepare(`
      INSERT INTO user_preferences (address, api_address, model_preferences, created_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(address) DO UPDATE SET
        api_address = excluded.api_address,
        model_preferences = excluded.model_preferences,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(address, apiAddress, modelPreferences ? JSON.stringify(modelPreferences) : null);
    return this.getUserPreferences(address)!;
  }

}

// Export singleton instance
export const dbQueries = new DatabaseQueries();
export default dbQueries;
