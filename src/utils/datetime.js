// The centre operates in IST (+05:30). Build absolute instants from the
// stored date (YYYY-MM-DD) + startTime (HH:mm) so business rules like the
// 12-hour cancellation window are computed server-side, never trusted from the client.
const IST_OFFSET = '+05:30';

export function slotStart(date, startTime) {
  return new Date(`${date}T${startTime}:00${IST_OFFSET}`);
}

export function cancellableUntil(date, startTime) {
  return new Date(slotStart(date, startTime).getTime() - 12 * 60 * 60 * 1000);
}

export function whenIso(date, startTime) {
  return slotStart(date, startTime).toISOString().replace('Z', '+00:00');
}
