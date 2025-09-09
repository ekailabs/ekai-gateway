import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

// Simple logger interface - can be extended to use winston/pino later
export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

class FileLogger implements Logger {
  private logFile: string;

  constructor() {
    // Create logs directory if it doesn't exist
    const logsDir = join(process.cwd(), 'logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }
    
    this.logFile = join(logsDir, 'gateway.log');
  }

  private writeLog(level: string, message: string, meta?: Record<string, unknown>, error?: Error): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(meta && { meta }),
      ...(error && { error: error.message, stack: error.stack })
    };
    
    const logLine = JSON.stringify(logEntry) + '\n';
    
    try {
      appendFileSync(this.logFile, logLine);
    } catch (err) {
      console.error('Failed to write to log file:', err);
    }
    
    // Also log to console for development
    console.log(`[${level}] ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.writeLog('INFO', message, meta);
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this.writeLog('ERROR', message, meta, error);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.writeLog('WARN', message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.writeLog('DEBUG', message, meta);
  }
}

// Singleton logger instance
export const logger: Logger = new FileLogger();