import pino from 'pino';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { TELEMETRY_ENABLED, TELEMETRY_ENDPOINT, TELEMETRY_LEVEL, LOG_LEVEL } from '../config.js';

import httpTransportFactory from '../telemetry/pino-http-transport.js';

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
  error(message: string, error?: unknown, meta?: LogContext): void;
  warn(message: string, meta?: LogContext): void;
  debug(message: string, meta?: LogContext): void;
  timer(operation: string): () => void;
}

class PinoLogger implements Logger {
  private p: pino.Logger;
  private httpStreamAdded = false;

  constructor() {
    // Ensure logs dir exists
    const logsDir = join(process.cwd(), 'logs');
    if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });
    const logFile = join(logsDir, 'gateway.log');

     // Build base streams: stdout (raw JSON) + file (same as your old code)
     const streams: { stream: any; level?: string }[] = [
       { stream: process.stdout, level: LOG_LEVEL || 'info' },
       { stream: pino.destination(logFile), level: LOG_LEVEL || 'info' },
     ];

    // Optionally add HTTP sender as a third stream (no worker thread)
    // Top-level await is fine in ESM; if you’re in CJS, wrap in an async init.
    const addHttp = async () => {
      if (TELEMETRY_ENABLED && TELEMETRY_ENDPOINT) {
        const httpStream = await httpTransportFactory({
          url: TELEMETRY_ENDPOINT,
          batch: 20,
          interval: 2000,
          headers: { 'content-type': 'application/x-ndjson' }
        });
        // only push if created
        streams.push({ stream: httpStream, level: TELEMETRY_LEVEL || 'info' });
      }
    };

    // Because constructor cannot be async, we synchronously create a temporary logger,
    // then promote it once the HTTP stream is ready. This preserves early logs to stdout/file.
    const baseOpts: pino.LoggerOptions = {
      level: LOG_LEVEL || 'info',
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      redact: ['password','token','key','secret','authorization','headers.authorization'],
      serializers: { err: pino.stdSerializers.err },
      base: { service: 'ekai-gateway', version: process.env.npm_package_version || 'dev' }
    };

    // start with stdout+file immediately
    this.p = pino(baseOpts, pino.multistream(streams));

     // attach HTTP stream as soon as it's ready (non-blocking)
     addHttp().then(() => {
       if (!this.httpStreamAdded) {
         this.httpStreamAdded = true;
         // Create a new logger with the HTTP stream included
         const newLogger = pino(baseOpts, pino.multistream(streams));
         // Replace the logger instance
         this.p = newLogger;
         // Optional: emit a marker so you know remote shipping is active
         this.p.info({ telemetry: 'enabled' }, 'Telemetry HTTP stream attached');
       }
     }).catch(() => {
       // swallow — telemetry is best-effort
       this.p.warn({ telemetry: 'attach_failed' }, 'Telemetry HTTP stream not attached');
     });
  }

  info(message: string, meta?: LogContext): void {
    this.p.info(meta || {}, message);
  }
  error(message: string, error?: unknown, meta?: LogContext): void {
    const logData = { ...(meta || {}), ...(error && { err: error }) };
    this.p.error(logData, message);
  }
  warn(message: string, meta?: LogContext): void {
    this.p.warn(meta || {}, message);
  }
  debug(message: string, meta?: LogContext): void {
    this.p.debug(meta || {}, message);
  }
  timer(operation: string): () => void {
    const start = Date.now();
    return () => this.debug('Operation completed', { operation, duration: Date.now() - start });
  }
}

// Singleton
export const logger: Logger = new PinoLogger();
