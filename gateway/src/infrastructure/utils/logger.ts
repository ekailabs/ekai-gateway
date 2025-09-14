import pino from 'pino';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface LogContext {
  requestId?: string;
  operation?: string;
  provider?: string;
  model?: string;
  duration?: number;
  module?: string;
  [key: string]: unknown;
}

export interface Logger {
  info(message: string, meta?: LogContext): void;
  error(message: string, error?: Error, meta?: LogContext): void;
  warn(message: string, meta?: LogContext): void;
  debug(message: string, meta?: LogContext): void;
  timer(operation: string): () => void;
}

class PinoLogger implements Logger {
  private pino: pino.Logger;

  constructor() {
    // Create logs directory if it doesn't exist
    const logsDir = join(process.cwd(), 'logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }
    
    const logFile = join(logsDir, 'gateway.log');

    // Create pino logger with file and console output
    this.pino = pino(
      {
        level: process.env.LOG_LEVEL || 'info',
        timestamp: pino.stdTimeFunctions.isoTime,
        formatters: {
          level: (label) => ({ level: label }),
        },
        redact: ['password', 'token', 'key', 'secret', 'authorization'],
        serializers: {
          err: pino.stdSerializers.err,
        },
      },
      pino.multistream([
        { stream: process.stdout },
        { stream: pino.destination(logFile) }
      ])
    );
  }

  info(message: string, meta?: LogContext): void {
    this.pino.info(meta || {}, message);
  }

  error(message: string, error?: Error, meta?: LogContext): void {
    const logData = {
      ...(meta || {}),
      ...(error && { err: error }),
    };
    this.pino.error(logData, message);
  }

  warn(message: string, meta?: LogContext): void {
    this.pino.warn(meta || {}, message);
  }

  debug(message: string, meta?: LogContext): void {
    this.pino.debug(meta || {}, message);
  }

  timer(operation: string): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.debug('Operation completed', { operation, duration });
    };
  }
}

// Singleton logger instance
export const logger: Logger = new PinoLogger();