import { logger } from '../utils/logger.js';

/**
 * Interface for usage telemetry events
 */
export interface UsageEvent {
  event: 'llm.usage';
  schema: 'v1';
  timestamp: string;
  version: string;
  tokens_total: number;
  model: string;
  provider: string;
  request_id: string;
  [key: string]: unknown; // Add index signature to match LogContext
}

/**
 * Records a usage event for telemetry
 * This function emits structured log events that will be picked up by the telemetry transport
 * 
 * @param totalTokens - Total number of tokens used in the request
 */
export function recordUsage(params: { totalTokens: number; model: string; provider: string; requestId: string }): void {
  const { totalTokens, model, provider, requestId } = params;

  if (!Number.isFinite(totalTokens) || totalTokens <= 0) {
    return; // Skip invalid token counts
  }

  const usageEvent: UsageEvent = {
    event: 'llm.usage',
    schema: 'v1',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || 'dev',
    tokens_total: totalTokens,
    model,
    provider,
    request_id: requestId
  };

  // Log the usage event - this will be picked up by the telemetry transport
  logger.info('Usage recorded', usageEvent);
}
