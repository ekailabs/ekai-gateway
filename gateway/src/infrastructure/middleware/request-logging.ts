import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export const requestLogging = (req: any, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  req.startTime = startTime;
  
  // Log request start
  logger.info('HTTP Request', {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    requestId: req.requestId,
    ip: req.clientIp || req.ip || req.socket.remoteAddress,
    module: 'http-middleware'
  });

  // Override res.end to capture response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any): Response {
    const duration = Date.now() - startTime;
    
    // Log response
    logger.info('HTTP Response', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      requestId: req.requestId,
      ip: req.clientIp || req.ip || req.socket.remoteAddress,
      contentLength: res.get('Content-Length'),
      module: 'http-middleware'
    });
    
    // Call original end method
    return originalEnd.call(this, chunk, encoding);
  };
  
  next();
};
