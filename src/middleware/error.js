import ApiError from '../utils/ApiError.js';

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: { code: 'not_found', message: 'Route not found.' } });
}

// Centralized error → error-envelope translator.
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  // Mongoose validation → 422 with field list.
  if (err?.name === 'ValidationError') {
    const fields = Object.keys(err.errors || {});
    return res.status(422).json({
      error: { code: 'validation_error', message: 'Body failed validation.', details: { fields } },
    });
  }

  if (err?.name === 'CastError') {
    return res.status(422).json({
      error: { code: 'validation_error', message: `Invalid ${err.path}.`, details: { fields: [err.path] } },
    });
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong on our end.' } });
}

// Wrap async route handlers so thrown/rejected errors reach the error handler.
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
