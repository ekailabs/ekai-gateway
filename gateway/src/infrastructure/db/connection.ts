import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use persistent data directory if available, otherwise fall back to code directory
const DATA_DIR = process.env.DATA_DIR || '/app/gateway/data';
const USE_PERSISTENT_STORAGE = existsSync(DATA_DIR) || process.env.NODE_ENV === 'production';

class DatabaseConnection {
  private db: Database.Database | null = null;

  constructor() {
    this.initialize();
  }

  private initialize() {
    try {
      // Use persistent storage in production, local storage in development
      let dbPath: string;
      if (USE_PERSISTENT_STORAGE) {
        // Ensure data directory exists
        if (!existsSync(DATA_DIR)) {
          mkdirSync(DATA_DIR, { recursive: true });
        }
        dbPath = join(DATA_DIR, 'proxy.db');
        logger.info('Using persistent database storage', { dbPath, module: 'db-connection' });
      } else {
        dbPath = join(__dirname, 'proxy.db');
        logger.info('Using local database storage', { dbPath, module: 'db-connection' });
      }
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

      // Lightweight migration: add payment_method column if missing
      const columns = this.db.prepare(`PRAGMA table_info(usage_records)`).all();
      const hasPaymentMethod = columns.some((c: any) => c.name === 'payment_method');
      if (!hasPaymentMethod) {
        this.db.exec(`ALTER TABLE usage_records ADD COLUMN payment_method TEXT DEFAULT 'api_key';`);
        logger.info('Added payment_method column to usage_records', { module: 'db-connection', operation: 'db_migration' });
      }

      // Migration: rename allowed_models/default_model to model_preferences
      const prefColumns = this.db.prepare(`PRAGMA table_info(user_preferences)`).all();
      const hasModelPreferences = prefColumns.some((c: any) => c.name === 'model_preferences');
      const hasAllowedModels = prefColumns.some((c: any) => c.name === 'allowed_models');
      const hasDefaultModel = prefColumns.some((c: any) => c.name === 'default_model');

      if (!hasModelPreferences && (hasAllowedModels || hasDefaultModel)) {
        // SQLite doesn't support RENAME COLUMN in older versions, so recreate table
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS user_preferences_new (
            address TEXT PRIMARY KEY,
            api_address TEXT NOT NULL,
            model_preferences TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          INSERT INTO user_preferences_new (address, api_address, model_preferences, created_at, updated_at)
            SELECT address, api_address,
              COALESCE(${hasAllowedModels ? 'allowed_models' : 'NULL'}, ${hasDefaultModel ? "CASE WHEN default_model IS NOT NULL THEN '[\"' || default_model || '\"]' ELSE NULL END" : 'NULL'}),
              created_at, updated_at
            FROM user_preferences;
          DROP TABLE user_preferences;
          ALTER TABLE user_preferences_new RENAME TO user_preferences;
          CREATE INDEX IF NOT EXISTS idx_user_preferences_api_address ON user_preferences(api_address);
        `);
        logger.info('Migrated user_preferences to model_preferences column', { module: 'db-connection', operation: 'db_migration' });
      }
      
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
