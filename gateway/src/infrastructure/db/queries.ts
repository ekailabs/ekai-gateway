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
  created_at: string;
}

export class DatabaseQueries {
  private db = dbConnection.getDatabase();

  // Insert a new usage record
  insertUsageRecord(record: Omit<UsageRecord, 'id' | 'created_at'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO usage_records (
        request_id, provider, model, timestamp,
        input_tokens, cache_write_input_tokens, cache_read_input_tokens, output_tokens, total_tokens,
        input_cost, cache_write_cost, cache_read_cost, output_cost, total_cost, currency
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      record.currency
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

}

// Export singleton instance
export const dbQueries = new DatabaseQueries();
export default dbQueries;
