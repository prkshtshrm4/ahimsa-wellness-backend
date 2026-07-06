// Error envelope matching the API spec: { error: { code, message, details } }.
// `code` is the string clients switch on to render a specific UI state.
export default class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static unauthenticated(message = 'Missing or invalid credentials.') {
    return new ApiError(401, 'unauthenticated', message);
  }

  static forbidden(module, message = 'You do not have access to this module.') {
    return new ApiError(403, 'forbidden_module', message, { module });
  }

  static validation(fields, message = 'Some fields need your attention.') {
    return new ApiError(422, 'validation_error', message, { fields });
  }

  static notFound(message = 'Not found.') {
    return new ApiError(404, 'not_found', message);
  }

  static slotUnavailable(remaining = 0, message = 'That time is fully booked.') {
    return new ApiError(409, 'slot_unavailable', message, { remaining });
  }

  static cancellationClosed(cancellableUntil, message = 'The free cancellation window has closed.') {
    return new ApiError(409, 'cancellation_window_closed', message, { cancellableUntil });
  }

  static paymentFailed(message = 'Payment did not go through.') {
    return new ApiError(402, 'payment_failed', message);
  }

  static conflict(code, message, details) {
    return new ApiError(409, code, message, details);
  }
}
