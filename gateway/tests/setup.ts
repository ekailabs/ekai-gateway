import { vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:'; // Use in-memory database for tests

// Clean up any test artifacts
const testDbPath = path.join(__dirname, '../src/infrastructure/db/test.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

// Global test configuration
beforeAll(() => {
  // Set consistent timezone for date testing
  process.env.TZ = 'UTC';
  
  // Mock console methods to reduce noise (but keep errors visible)
  global.console.log = vi.fn();
  global.console.warn = vi.fn();
  // Keep console.error for debugging
});

afterAll(() => {
  // Cleanup any remaining test files
  const testFiles = [
    path.join(__dirname, '../src/infrastructure/db/test.db'),
    path.join(__dirname, '../src/infrastructure/db/test.db-shm'),
    path.join(__dirname, '../src/infrastructure/db/test.db-wal')
  ];
  
  testFiles.forEach(file => {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });
});

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
