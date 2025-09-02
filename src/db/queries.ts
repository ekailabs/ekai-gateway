import { dbConnection } from './connection.js';

export interface UsageRecord {
  id: number;
  request_id: string;
  provider: string;
  model: string;
  timestamp: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_cost: number;
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
        input_tokens, output_tokens, total_tokens,
        input_cost, output_cost, total_cost, currency
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      record.request_id,
      record.provider,
      record.model,
      record.timestamp,
      record.input_tokens,
      record.output_tokens,
      record.total_tokens,
      record.input_cost,
      record.output_cost,
      record.total_cost,
      record.currency
    );
    
    return result.lastInsertRowid as number;
  }

  // Get all usage records (with optional limit)
  getAllUsageRecords(limit?: number): UsageRecord[] {
    const query = limit 
      ? 'SELECT * FROM usage_records ORDER BY timestamp DESC LIMIT ?'
      : 'SELECT * FROM usage_records ORDER BY timestamp DESC';
    
    const stmt = this.db.prepare(query);
    return limit ? stmt.all(limit) : stmt.all();
  }

  // Get usage records by date range
  getUsageRecordsByDateRange(startDate: string, endDate: string): UsageRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM usage_records 
      WHERE timestamp BETWEEN ? AND ? 
      ORDER BY timestamp DESC
    `);
    return stmt.all(startDate, endDate);
  }

  // Get total cost
  getTotalCost(): number {
    const stmt = this.db.prepare('SELECT SUM(total_cost) as total FROM usage_records');
    const result = stmt.get() as { total: number | null };
    return result.total || 0;
  }

  // Get total tokens
  getTotalTokens(): number {
    const stmt = this.db.prepare('SELECT SUM(total_tokens) as total FROM usage_records');
    const result = stmt.get() as { total: number | null };
    return result.total || 0;
  }

  // Get total requests
  getTotalRequests(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as total FROM usage_records');
    const result = stmt.get() as { total: number };
    return result.total;
  }

  // Get cost by provider
  getCostByProvider(): Record<string, number> {
    const stmt = this.db.prepare(`
      SELECT provider, SUM(total_cost) as total 
      FROM usage_records 
      GROUP BY provider
    `);
    const results = stmt.all() as Array<{ provider: string; total: number }>;
    
    const costByProvider: Record<string, number> = {};
    results.forEach(row => {
      costByProvider[row.provider] = row.total;
    });
    
    return costByProvider;
  }

  // Get cost by model
  getCostByModel(): Record<string, number> {
    const stmt = this.db.prepare(`
      SELECT model, SUM(total_cost) as total 
      FROM usage_records 
      GROUP BY model
    `);
    const results = stmt.all() as Array<{ model: string; total: number }>;
    
    const costByModel: Record<string, number> = {};
    results.forEach(row => {
      costByModel[row.model] = row.total;
    });
    
    return costByModel;
  }

  // Clear all usage records
  clearAllRecords(): void {
    const stmt = this.db.prepare('DELETE FROM usage_records');
    stmt.run();
    console.log('🗑️ All usage records cleared');
  }
}

// Export singleton instance
export const dbQueries = new DatabaseQueries();
export default dbQueries;
