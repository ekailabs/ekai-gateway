import { Response } from 'express';
import { logger } from './logger.js';
import { GatewayError, toGatewayError } from '../../shared/errors/index.js';

/**
 * @deprecated Use GatewayError and its subclasses instead
 * Kept for backward compatibility
 */
export class APIError extends Error {
  constructor(
    public statusCode: number, 
    message: string, 
    public code?: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export function createErrorResponse(message: string, code?: string) {
  return {
    error: 'Request failed',
    message,
    ...(code && { code })
  };
}

export function createAnthropicErrorResponse(message: string, code?: string) {
  return {
    type: 'error',
    error: { 
      message,
      ...(code && { code })
    }
  };
}

/**
 * @deprecated Use the errorHandler middleware from middleware/error-handler.ts instead
 * Kept for backward compatibility with existing code
 */
export function handleError(error: unknown, res: Response, clientFormat: 'openai' | 'anthropic' = 'openai') {
  const req = res.req as any;
  const requestId = req?.requestId;
  
  const isAnthropic = clientFormat === 'anthropic';
  
  // Convert to GatewayError for consistent handling
  const gatewayError = toGatewayError(error);
  
  // Log error
  if (gatewayError.statusCode >= 500) {
    logger.error('API Error', gatewayError, { requestId, ...gatewayError.context, module: 'error-handler' });
  } else {
    logger.warn('API Error', { requestId, ...gatewayError.context, message: gatewayError.message, module: 'error-handler' });
  }
  
  // Handle legacy APIError for backward compatibility
  if (error instanceof APIError) {
    const errorResponse = isAnthropic 
      ? createAnthropicErrorResponse(error.message, error.code)
      : createErrorResponse(error.message, error.code);
    return res.status(error.statusCode).json(errorResponse);
  }
  
  // Handle new GatewayError classes
  if (error instanceof GatewayError) {
    const errorResponse = isAnthropic
      ? createAnthropicErrorResponse(gatewayError.message, gatewayError.code)
      : createErrorResponse(gatewayError.message, gatewayError.code);
    return res.status(gatewayError.statusCode).json(errorResponse);
  }
  
  // Fallback for unknown errors
  const message = error instanceof Error ? error.message : 'Unknown error';
  const errorResponse = isAnthropic
    ? createAnthropicErrorResponse(message)
    : createErrorResponse(message);
  
  res.status(500).json(errorResponse);
}

