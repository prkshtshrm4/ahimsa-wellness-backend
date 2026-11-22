/** Parse YYYY-MM-DD as start/end of day in India (IST). */
export function dayStartIst(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return new Date(`${ymd}T00:00:00+05:30`);
}

export function dayEndIst(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return new Date(`${ymd}T23:59:59.999+05:30`);
}

/** Build a Mongo createdAt range filter from ?from=&to= query params. */
export function createdAtFilter(from, to) {
  const start = dayStartIst(String(from || '').trim());
  const end = dayEndIst(String(to || '').trim());
  if (!start && !end) return {};
  const createdAt = {};
  if (start) createdAt.$gte = start;
  if (end) createdAt.$lte = end;
  return { createdAt };
}
