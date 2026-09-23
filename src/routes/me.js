import { Router } from 'express';
import { authenticate, requirePatient, requireModule } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import Booking from '../models/Booking.js';
import Payment from '../models/Payment.js';
import Service from '../models/Service.js';
import { whenIso } from '../utils/datetime.js';
import { countSlotUsage, endTimeFor } from '../utils/slots.js';
import { cancellableUntil } from '../utils/datetime.js';
import { refund } from '../utils/razorpay.js';
import ApiError from '../utils/ApiError.js';

const router = Router();

const UPCOMING = ['pendingPayment', 'partiallyPaid', 'confirmed', 'open'];
const PAST = ['completed', 'cancelled', 'noShow'];

// GET /me/bookings?scope=upcoming|past
router.get(
  '/me/bookings',
  authenticate(),
  requirePatient,
  asyncHandler(async (req, res) => {
    const scope = req.query.scope === 'past' ? 'past' : 'upcoming';
    const statuses = scope === 'past' ? PAST : UPCOMING;
    const bookings = await Booking.find({ patientId: req.auth.patient._id, status: { $in: statuses } })
      .sort({ date: scope === 'past' ? -1 : 1, startTime: 1 })
      .lean();

    res.json({
      bookings: bookings.map((b) => ({
        _id: b._id,
        reference: b.reference,
        serviceName: b.serviceSnapshot?.name,
        packagePurchaseId: b.packagePurchaseId,
        packageVisitCount: b.serviceSnapshot?.kind === 'package' ? b.serviceSnapshot.visitCount : 0,
        when: whenIso(b.date, b.startTime),
        date: b.date,
        startTime: b.startTime,
        therapistName: b.therapistName,
        status: b.status,
        priceInPaise: b.amounts?.totalInPaise,
        invoiceId: b.invoiceId,
        cancellableUntil: b.cancellableUntil,
      })),
    });
  })
);

// POST /me/bookings/:id/cancel — enforces the 12-hour rule server-side.
export async function cancelBooking(req, res) {
    const booking = await Booking.findOne({ _id: req.params.id, patientId: req.auth.patient._id });
    if (!booking) throw ApiError.notFound('Booking not found.');

    if (new Date() > new Date(booking.cancellableUntil)) {
      throw ApiError.cancellationClosed(booking.cancellableUntil);
    }

    if (booking.serviceSnapshot?.kind === 'package' && !booking.packagePurchaseId && booking.serviceSnapshot.visitCount > 1) throw ApiError.conflict('package_cancellation', 'Please contact the centre to cancel a multi-visit package.');
    if (booking.status === 'cancelled') {
      if (booking.packagePurchaseId) await Booking.updateOne({ _id: booking.packagePurchaseId }, { $pull: { packageReservations: { bookingId: booking._id } } });
      return res.json({ status: 'cancelled', refundInPaise: 0 });
    }

    let refundInPaise = 0;
    const paidPayment = await Payment.findOne({ bookingId: booking._id, status: 'paid' });
    if (paidPayment) {
      const r = await refund({ paymentId: paidPayment.razorpayPaymentId, amountInPaise: paidPayment.amountInPaise });
      refundInPaise = r.amountInPaise;
      paidPayment.status = 'refunded';
      await paidPayment.save();
    }

    booking.status = 'cancelled';
    booking.cancellation = { at: new Date(), refundInPaise };
    await booking.save();

    if (booking.packagePurchaseId) await Booking.updateOne({ _id: booking.packagePurchaseId }, { $pull: { packageReservations: { bookingId: booking._id } } });

    res.json({ status: 'cancelled', refundInPaise, refundEtaDays: refundInPaise > 0 ? 5 : 0 });
}
router.post('/me/bookings/:id/cancel', authenticate(), requirePatient, asyncHandler(cancelBooking));

// POST /me/bookings/:id/reschedule — re-checks target capacity + 12h window.
router.post(
  '/me/bookings/:id/reschedule',
  authenticate(),
  requirePatient,
  asyncHandler(async (req, res) => {
    const { date, startTime } = req.body || {};
    if (!date || !startTime) throw ApiError.validation(['date', 'startTime']);

    const booking = await Booking.findOne({ _id: req.params.id, patientId: req.auth.patient._id });
    if (!booking) throw ApiError.notFound('Booking not found.');

    if (new Date() > new Date(booking.cancellableUntil)) {
      throw ApiError.cancellationClosed(booking.cancellableUntil);
    }

    if (booking.packagePurchaseId || booking.serviceSnapshot?.kind === 'package') throw ApiError.conflict('package_reschedule', 'For a package follow-up, cancel and book another day. Contact the centre to move the first visit.');
    const service = await Service.findById(booking.serviceId);
    const used = await countSlotUsage(service._id, date, startTime, { excludeBookingId: booking._id });
    if (used >= service.capacity) throw ApiError.slotUnavailable(0);

    booking.date = date;
    booking.startTime = startTime;
    booking.endTime = endTimeFor(startTime, service.durationMin);
    booking.cancellableUntil = cancellableUntil(date, startTime);
    await booking.save();

    res.json({
      booking: {
        _id: booking._id,
        reference: booking.reference,
        date: booking.date,
        startTime: booking.startTime,
        status: booking.status,
      },
    });
  })
);

// GET /me/schedule?date=YYYY-MM-DD — therapist's own day (scoped to the token).
router.get(
  '/me/schedule',
  authenticate(),
  requireModule('schedule.own'),
  asyncHandler(async (req, res) => {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const rows = await Booking.find({
      therapistId: req.auth.staff._id,
      date,
      status: { $in: ['confirmed', 'pendingPayment', 'partiallyPaid', 'completed'] },
    })
      .sort({ startTime: 1 })
      .lean();

    res.json({
      date,
      sessionCount: rows.length,
      rows: rows.map((r) => ({
        startTime: r.startTime,
        serviceName: r.serviceSnapshot?.name,
        patientName: r.patientSnapshot?.name,
        room: r.room,
        note: r.note || '',
      })),
    });
  })
);

export default router;
