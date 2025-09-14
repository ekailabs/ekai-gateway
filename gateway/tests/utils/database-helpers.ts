import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { vi } from 'vitest';
import type { UsageRecord } from '../../src/infrastructure/db/queries.js';

/**
 * Database testing utilities
 */

export const REAL_PRICING_DIR = path.join(__dirname, '../../src/costs');
export const TEST_PRICING_DIR = path.join(__dirname, '../fixtures/pricing');

export class TestDatabase {
  private db: Database.Database;
  private schemaPath: string;

  constructor() {
    // Create in-memory database for each test
    this.db = new Database(':memory:');
    this.schemaPath = path.join(__dirname, '../../src/infrastructure/db/schema.sql');
    this.initializeSchema();
  }

  private initializeSchema(): void {
    if (!fs.existsSync(this.schemaPath)) {
      throw new Error(`Schema file not found: ${this.schemaPath}`);
    }

    const schema = fs.readFileSync(this.schemaPath, 'utf8');
    this.db.exec(schema);
  }

  getDatabase(): Database.Database {
    return this.db;
  }

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

  insertBulkUsageRecords(records: Array<Omit<UsageRecord, 'id' | 'created_at'>>): number[] {
    const ids: number[] = [];
    const transaction = this.db.transaction((records: Array<Omit<UsageRecord, 'id' | 'created_at'>>) => {
      for (const record of records) {
        const id = this.insertUsageRecord(record);
        ids.push(id);
      }
    });

    transaction(records);
    return ids;
  }

  getAllRecords(): UsageRecord[] {
    const stmt = this.db.prepare('SELECT * FROM usage_records ORDER BY timestamp DESC');
    return stmt.all() as UsageRecord[];
  }

  getRecordCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM usage_records');
    const result = stmt.get() as { count: number };
    return result.count;
  }

  clearAllRecords(): void {
    this.db.exec('DELETE FROM usage_records');
  }

  close(): void {
    this.db.close();
  }

  // Helper to create a mock database connection for dependency injection
  static createMockConnection(testDb: TestDatabase): any {
    return {
      getDatabase: () => testDb.getDatabase()
    };
  }
}

/**
 * Mock the database connection module for testing
 */
export const mockDatabaseConnection = (testDb: TestDatabase) => {
  vi.doMock('../../src/infrastructure/db/connection.js', () => ({
    dbConnection: TestDatabase.createMockConnection(testDb)
  }));
};

/**
 * Create a fresh test database for each test
 */
export const createTestDatabase = (): TestDatabase => {
  return new TestDatabase();
};

/**
 * Setup database for testing with automatic cleanup
 */
export const setupTestDatabase = () => {
  let testDb: TestDatabase;

  const setup = () => {
    testDb = createTestDatabase();
    mockDatabaseConnection(testDb);
    return testDb;
  };

  const cleanup = () => {
    if (testDb) {
      testDb.close();
    }
  };

  return { setup, cleanup };
};
