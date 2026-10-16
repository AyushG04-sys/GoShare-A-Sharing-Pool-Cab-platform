import config from '../config/env.js';

/**
 * Centralized Express error-handling middleware.
 */
export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'An unexpected error occurred';

  if (statusCode >= 500) {
    console.error(`[${new Date().toISOString()}] Internal Server Error (${req.method} ${req.originalUrl}):`, err);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code,
      details: err.details || null,
      ...(config.isDev && { stack: err.stack }),
    },
  });
}
