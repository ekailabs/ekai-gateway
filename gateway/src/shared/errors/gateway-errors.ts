/**
 * Standardized error hierarchy for the gateway
 * All errors extend from GatewayError with consistent structure
 */

export interface ErrorContext {
  [key: string]: any;
}

/**
 * Base error class for all gateway errors
 */
export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly context?: ErrorContext
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON for logging/API responses
   */
  toJSON() {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      context: this.context,
    };
  }
}

/**
 * Configuration-related errors (missing env vars, invalid config, etc.)
 */
export class ConfigurationError extends GatewayError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'CONFIGURATION_ERROR', 500, context);
  }
}

/**
 * Provider-related errors (API failures, invalid responses, etc.)
 */
export class ProviderError extends GatewayError {
  constructor(
    provider: string,
    message: string,
    statusCode: number = 502,
    context?: ErrorContext
  ) {
    super(
      message,
      'PROVIDER_ERROR',
      statusCode,
      { ...context, provider }
    );
  }
}

/**
 * Authentication/Authorization errors
 */
export class AuthenticationError extends GatewayError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'AUTHENTICATION_ERROR', 401, context);
  }
}

/**
 * Payment-related errors (x402, insufficient balance, etc.)
 */
export class PaymentError extends GatewayError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'PAYMENT_FAILED', 402, context);
  }
}

/**
 * Validation errors (invalid request format, missing required fields, etc.)
 */
export class ValidationError extends GatewayError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'VALIDATION_ERROR', 400, context);
  }
}

/**
 * Rate limit errors
 */
export class RateLimitError extends GatewayError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, context);
  }
}

/**
 * Resource not found errors
 */
export class NotFoundError extends GatewayError {
  constructor(resource: string, context?: ErrorContext) {
    super(
      `${resource} not found`,
      'NOT_FOUND',
      404,
      { ...context, resource }
    );
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends GatewayError {
  constructor(operation: string, timeoutMs: number, context?: ErrorContext) {
    super(
      `${operation} timed out after ${timeoutMs}ms`,
      'TIMEOUT',
      408,
      { ...context, operation, timeoutMs }
    );
  }
}

/**
 * Helper function to convert unknown errors to GatewayError
 */
export function toGatewayError(error: unknown): GatewayError {
  if (error instanceof GatewayError) {
    return error;
  }

  if (error instanceof Error) {
    return new GatewayError(
      error.message,
      'INTERNAL_ERROR',
      500,
      { originalError: error.name, stack: error.stack }
    );
  }

  return new GatewayError(
    String(error),
    'UNKNOWN_ERROR',
    500,
    { originalError: error }
  );
}

/**
 * Helper to check if an error is a specific type
 */
export function isGatewayError(error: unknown): error is GatewayError {
  return error instanceof GatewayError;
}

export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}

export function isPaymentError(error: unknown): error is PaymentError {
  return error instanceof PaymentError;
}

export function isAuthenticationError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError;
}

