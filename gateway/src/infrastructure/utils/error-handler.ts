import { Response } from 'express';

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

export function handleError(error: unknown, res: Response, isAnthropic = false) {
  console.error('API Error:', error);
  
  if (error instanceof APIError) {
    const errorResponse = isAnthropic 
      ? createAnthropicErrorResponse(error.message, error.code)
      : createErrorResponse(error.message, error.code);
    return res.status(error.statusCode).json(errorResponse);
  }
  
  const message = error instanceof Error ? error.message : 'Unknown error';
  const errorResponse = isAnthropic
    ? createAnthropicErrorResponse(message)
    : createErrorResponse(message);
  
  res.status(500).json(errorResponse);
}

