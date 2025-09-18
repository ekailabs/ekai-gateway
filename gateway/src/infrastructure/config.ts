import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Resolve path to project root .env from src/infrastructure/
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment exactly once for any module that imports config
dotenv.config({ path: join(__dirname, '../../.env') });

// Export normalized configuration values
export const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
export const TELEMETRY_ENABLED = (process.env.TELEMETRY_ENABLED ?? 'true').toLowerCase();
export const TELEMETRY_ENDPOINT = process.env.TELEMETRY_ENDPOINT || 'https://ingest.ekailabs.xyz/ndjson';
export const TELEMETRY_LEVEL = process.env.TELEMETRY_LEVEL || 'info';

// Optionally export service metadata
export const SERVICE_NAME = 'ekai-gateway';
export const SERVICE_VERSION = process.env.npm_package_version || 'dev';
