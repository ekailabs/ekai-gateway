import { Request, Response, NextFunction } from 'express';
import { tokenManager } from '../../domain/services/token-manager.js';
import { logger } from '../utils/logger.js';
import { AuthenticationError } from '../../shared/errors/gateway-errors.js';
import { dbQueries } from '../db/queries.js';

declare global {
  namespace Express {
    interface Request {
      user?: {
        address: string;
        apiAddress: string;
        modelPreferences: string[] | null;
      };
    }
  }
}

/**
 * Extract bearer token from Authorization header or x-api-key header.
 */
function extractToken(req: Request): string | null {
  let token: string | null = null;

  // Try Authorization header first (standard approach)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  // Fall back to x-api-key header for backward compatibility
  if (!token) {
    const apiKey = req.headers['x-api-key'];
    if (apiKey && typeof apiKey === 'string') {
      token = apiKey;
    }
  }

  // Strip sk-ant- prefix if Claude Code adds it
  if (token) {
    return token.replace(/^sk-ant-/, '');
  }

  return null;
}

/**
 * Required authentication middleware.
 * Throws 401 error if token is missing or invalid.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  try {
    const token = extractToken(req);

    if (!token) {
      logger.warn('Authentication failed: missing token', {
        requestId: req.requestId,
        module: 'auth-middleware'
      });
      throw new AuthenticationError('Authorization error. Please login again.');
    }

    const address = tokenManager.validateToken(token);

    if (!address) {
      logger.warn('Authentication failed: invalid or expired token', {
        requestId: req.requestId,
        module: 'auth-middleware'
      });
      throw new AuthenticationError('Authorization error. Please login again.');
    }

    // Load user preferences
    const prefs = dbQueries.getUserPreferences(address);

    // Attach user to request for downstream handlers
    req.user = {
      address,
      apiAddress: prefs?.api_address ?? address,
      modelPreferences: prefs?.model_preferences ?? null
    };

    logger.debug('Authentication successful', {
      address,
      apiAddress: req.user.apiAddress,
      modelPreferences: req.user.modelPreferences,
      requestId: req.requestId,
      module: 'auth-middleware'
    });

    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      res.status(401).json({
        error: {
          message: error.message,
          type: error.name,
          code: error.code
        }
      });
    } else {
      logger.error('Unexpected error in auth middleware', error, {
        requestId: req.requestId,
        module: 'auth-middleware'
      });
      res.status(500).json({
        error: {
          message: 'Authorization error. Please login again.',
          type: 'AuthenticationError',
          code: 'AUTHENTICATION_ERROR'
        }
      });
    }
  }
}

/**
 * Optional authentication middleware.
 * Sets req.user if token is valid, but doesn't throw if missing.
 * Useful for endpoints that work with or without authentication.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const token = extractToken(req);

    if (token) {
      const address = tokenManager.validateToken(token);
      if (address) {
        const prefs = dbQueries.getUserPreferences(address);
        req.user = {
          address,
          apiAddress: prefs?.api_address ?? address,
          modelPreferences: prefs?.model_preferences ?? null
        };
        logger.debug('Optional authentication successful', {
          address,
          apiAddress: req.user.apiAddress,
          modelPreferences: req.user.modelPreferences,
          requestId: req.requestId,
          module: 'auth-middleware'
        });
      }
    }

    next();
  } catch (error) {
    logger.error('Unexpected error in optional auth middleware', error, {
      requestId: req.requestId,
      module: 'auth-middleware'
    });
    // Don't throw for optional auth - just continue
    next();
  }
}
