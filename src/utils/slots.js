import Booking, { CAPACITY_STATUSES } from '../models/Booking.js';
import { whenIso } from './datetime.js';

// Centre hours (local). First slot starts at OPEN, last must end by CLOSE.
const TREATMENT_WINDOWS = [[8 * 60, 13 * 60], [16 * 60, 19 * 60]];
const CONSULTATION_WINDOWS = [[11 * 60, 13 * 60], [17 * 60, 19 * 60]];

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// Slot cadence derived from duration, rounded up to the nearest 30 min.
export function slotStep(durationMin) {
  return Math.max(30, Math.ceil(durationMin / 30) * 30);
}

export function endTimeFor(startTime, durationMin) {
  return toHHMM(toMin(startTime) + durationMin);
}

/** All candidate start times for a service on a given day. */
export function buildSlotTimes(service) {
  const step = slotStep(service.durationMin);
  const times = [];
  const windows = service.category === 'CONSULTATION' ? CONSULTATION_WINDOWS : TREATMENT_WINDOWS;
  for (const [open, close] of windows) {
    for (let t = open; t + service.durationMin <= close; t += step) times.push(toHHMM(t));
  }
  return times;
}

/**
 * Availability for a service+date. `remaining = capacity - occupying bookings`.
 * A specific `holdRefBooking` can be excluded (used during reschedule).
 */
export async function computeAvailability(service, date, { excludeBookingId } = {}) {
  const times = buildSlotTimes(service);
  const now = new Date();

  const match = {
    serviceId: service._id,
    date,
    status: { $in: CAPACITY_STATUSES },
    $or: [{ holdExpiresAt: null }, { holdExpiresAt: { $gt: now } }, { holdExpiresAt: { $exists: false } }],
  };
  if (excludeBookingId) match._id = { $ne: excludeBookingId };

  const bookings = await Booking.find(match).select('startTime').lean();
  const counts = new Map();
  for (const b of bookings) counts.set(b.startTime, (counts.get(b.startTime) || 0) + 1);

  return times.filter(startTime => new Date(whenIso(date, startTime)) > now).map((startTime) => {
    const used = counts.get(startTime) || 0;
    const remaining = Math.max(0, service.capacity - used);
    return { startTime, endTime: endTimeFor(startTime, service.durationMin), remaining };
  });
}

/** Count live (capacity-occupying) bookings for one exact slot. */
export async function countSlotUsage(serviceId, date, startTime, { excludeBookingId } = {}) {
  const now = new Date();
  const match = {
    serviceId,
    date,
    startTime,
    status: { $in: CAPACITY_STATUSES },
    $or: [{ holdExpiresAt: null }, { holdExpiresAt: { $gt: now } }, { holdExpiresAt: { $exists: false } }],
  };
  if (excludeBookingId) match._id = { $ne: excludeBookingId };
  return Booking.countDocuments(match);
}
