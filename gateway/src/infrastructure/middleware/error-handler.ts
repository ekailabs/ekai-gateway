import { Request, Response, NextFunction } from 'express';
import { GatewayError, toGatewayError } from '../../shared/errors/index.js';
import { logger } from '../utils/logger.js';

/**
 * Centralized error handling middleware
 * Converts all errors to consistent format and logs them
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Convert to GatewayError if not already
  const gatewayError = toGatewayError(error);

  // Log error with context
  const logContext = {
    requestId: (req as any).requestId,
    method: req.method,
    path: req.path,
    errorCode: gatewayError.code,
    statusCode: gatewayError.statusCode,
    ...gatewayError.context,
    module: 'error-handler',
  };

  if (gatewayError.statusCode >= 500) {
    logger.error(gatewayError.message, gatewayError, logContext);
  } else {
    logger.warn(gatewayError.message, logContext);
  }

  // Send error response
  res.status(gatewayError.statusCode).json({
    error: {
      code: gatewayError.code,
      message: gatewayError.message,
      ...(gatewayError.context && { context: gatewayError.context }),
    },
    ...(req.app.get('env') === 'development' && {
      stack: gatewayError.stack,
    }),
  });
}

/**
 * Async handler wrapper to catch promise rejections
 */
export function asyncHandler<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: T, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

