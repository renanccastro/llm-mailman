export class BaseError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(message: string, code: string, statusCode = 500, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends BaseError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class AuthenticationError extends BaseError {
  constructor(message: string, code = 'AUTH_ERROR') {
    super(message, code, 401);
  }
}

export class AuthorizationError extends BaseError {
  constructor(message: string, code = 'AUTHORIZATION_ERROR') {
    super(message, code, 403);
  }
}

export class NotFoundError extends BaseError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id ${id} not found` : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
  }
}

export class ConflictError extends BaseError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONFLICT', 409, details);
  }
}

export class RateLimitError extends BaseError {
  constructor(message = 'Rate limit exceeded', retryAfter?: number) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, { retryAfter });
  }
}

export class ServiceUnavailableError extends BaseError {
  constructor(service: string, details?: unknown) {
    super(`${service} service is unavailable`, 'SERVICE_UNAVAILABLE', 503, details);
  }
}