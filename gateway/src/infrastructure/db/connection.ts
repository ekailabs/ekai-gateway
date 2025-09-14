import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class DatabaseConnection {
  private db: Database.Database | null = null;

  constructor() {
    this.initialize();
  }

  private initialize() {
    try {
      // Create database file in the same directory as this file
      const dbPath = join(__dirname, 'proxy.db');
      this.db = new Database(dbPath);
      
      // Enable WAL mode for better concurrency
      this.db.pragma('journal_mode = WAL');
      
      // Create tables from schema
      this.createTables();
      
      logger.info('Database initialized', { operation: 'db_init', module: 'db-connection' });
    } catch (error) {
      logger.error('Database initialization failed', error, { operation: 'db_init', module: 'db-connection' });
      throw error;
    }
  }

  private createTables() {
    if (!this.db) throw new Error('Database not initialized');
    
    try {
      // Read and execute schema
      const schemaPath = join(__dirname, 'schema.sql');
      const schema = readFileSync(schemaPath, 'utf8');
      
      // Execute schema (split by semicolon and execute each statement)
      const statements = schema.split(';').filter(stmt => stmt.trim());
      statements.forEach(statement => {
        if (statement.trim()) {
          this.db!.exec(statement);
        }
      });
      
      logger.debug('Database tables created', { operation: 'db_schema', module: 'db-connection' });
    } catch (error) {
      logger.error('Failed to create tables', error, { operation: 'db_schema', module: 'db-connection' });
      throw error;
    }
  }

  getDatabase(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.info('Database connection closed', { operation: 'db_cleanup', module: 'db-connection' });
    }
  }
}

// Export singleton instance
export const dbConnection = new DatabaseConnection();
export default dbConnection;
