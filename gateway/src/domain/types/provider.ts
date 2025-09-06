export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500
} as const;

export const CONTENT_TYPES = {
  JSON: 'application/json',
  TEXT_PLAIN: 'text/plain; charset=utf-8',
  SSE: 'text/event-stream'
} as const;

export type HttpStatus = typeof HTTP_STATUS[keyof typeof HTTP_STATUS];
export type ContentType = typeof CONTENT_TYPES[keyof typeof CONTENT_TYPES];