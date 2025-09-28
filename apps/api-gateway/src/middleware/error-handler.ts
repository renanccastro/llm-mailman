import { Request, Response, NextFunction } from 'express';
import { BaseError, ApiResponse } from '@ai-dev/shared';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response<ApiResponse>,
  next: NextFunction,
): void {
  console.error('Error:', err);

  if (err instanceof BaseError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      message: err.code,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Default error
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    timestamp: new Date().toISOString(),
  });
}