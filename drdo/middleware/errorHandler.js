/**
 * middleware/errorHandler.js
 *
 * Global Express error handler.
 * Catches any error passed to next(err) from route handlers.
 *
 * Always returns a JSON error response so the frontend never receives
 * an HTML error page.
 */

'use strict';

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status  = err.status || err.statusCode || 500;
  const message = err.message || 'An unexpected error occurred.';

  // Log server errors (5xx) with full stack; client errors (4xx) without
  if (status >= 500) {
    console.error(`[Error] ${status} ${req.method} ${req.path}:`, err);
  } else {
    console.warn(`[Warn]  ${status} ${req.method} ${req.path}: ${message}`);
  }

  res.status(status).json({
    error:  message,
    status,
    path:   req.path,
    method: req.method,
  });
}

module.exports = errorHandler;