import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import Service from '../models/Service.js';
import Booking from '../models/Booking.js';
import Payment from '../models/Payment.js';
import Patient from '../models/Patient.js';
import { nextReference } from '../models/Counter.js';
import { countSlotUsage, endTimeFor } from '../utils/slots.js';
import { computeAmounts } from '../utils/money.js';
import { cancellableUntil } from '../utils/datetime.js';
import { createOrder, verifyCheckoutSignature, keyId } from '../utils/razorpay.js';
import { ensureInvoiceForBooking, markInvoicePaid } from '../services/invoiceService.js';
import ApiError from '../utils/ApiError.js';
import { validateVisitDate } from '../services/packageVisits.js';

const router = Router();

const HOLD_MINUTES = 10;

export function serializeBooking(b) {
  return {
    _id: b._id,
    reference: b.reference,
    status: b.status,
    serviceSnapshot: b.serviceSnapshot,
    date: b.date,
    startTime: b.startTime,
    endTime: b.endTime,
    therapistName: b.therapistName,
    holdExpiresAt: b.holdExpiresAt,
    amounts: b.amounts,
    createdByStaffId: b.createdByStaffId,
  };
}

// POST /bookings — create booking (+ Razorpay order for pay-now) in one call.
export async function createBooking(req, res) {
    const { serviceId, date, startTime, patientDetails, paymentMode = 'now', source = 'web' } = req.body || {};

    const missing = [];
    if (!serviceId) missing.push('serviceId');
    if (!date) missing.push('date');
    if (!startTime) missing.push('startTime');
    if (missing.length) throw ApiError.validation(missing);

    const service = await Service.findById(serviceId);
    if (!service || !service.active) throw ApiError.notFound('Service not found.');

    if (service.kind === 'package' && req.auth?.type !== 'patient') throw ApiError.unauthenticated('Please sign in to purchase a package and manage its visits.');

    if (service.kind === 'package') validateVisitDate(service, date, startTime);

    // Resolve patient identity (linked account) or inline guest details.
    let patient = req.auth?.type === 'patient' ? req.auth.patient : null;
    const snapshot = {
      name: patient?.name || patientDetails?.name,
      phone: patient?.phone || patientDetails?.phone,
      email: patient?.email || patientDetails?.email,
      reason: patientDetails?.reason,
    };
    const fieldErrors = [];
    if (!snapshot.name) fieldErrors.push('patientDetails.name');
    if (!snapshot.phone) fieldErrors.push('patientDetails.phone');
    if (fieldErrors.length) throw ApiError.validation(fieldErrors);

    // Authoritative capacity gate (best-effort atomic check for standalone Mongo).
    const used = await countSlotUsage(service._id, date, startTime);
    if (used >= service.capacity) throw ApiError.slotUnavailable(0);

    const amounts = computeAmounts(service.priceInPaise, { type: 'none', value: 0 });
    const isAtVisit = paymentMode === 'atVisit';
    const reference = await nextReference(new Date(date).getFullYear());

    const booking = await Booking.create({
      reference,
      patientId: patient?._id,
      patientSnapshot: snapshot,
      serviceId: service._id,
      serviceSnapshot: {
        kind: service.kind || 'service',
        visitCount: service.visitCount || 1,
        inclusions: service.inclusions || [],
        name: service.name,
        durationMin: service.durationMin,
        priceInPaise: service.priceInPaise,
        category: service.category,
      },
      date,
      startTime,
      endTime: endTimeFor(startTime, service.durationMin),
      therapistId: service.therapistId,
      therapistName: service.therapistName,
      room: service.room,
      status: isAtVisit ? 'confirmed' : 'pendingPayment',
      source,
      holdExpiresAt: isAtVisit ? undefined : new Date(Date.now() + HOLD_MINUTES * 60 * 1000),
      amounts: { ...amounts, paidInPaise: 0, balanceInPaise: amounts.totalInPaise },
      cancellableUntil: cancellableUntil(date, startTime),
    });

    // Recount guard against a race that slipped past the first check.
    const after = await countSlotUsage(service._id, date, startTime);
    if (after > service.capacity) {
      await booking.deleteOne();
      throw ApiError.slotUnavailable(0, 'That time just filled up.');
    }

    const response = { booking: serializeBooking(booking) };

    if (isAtVisit) {
      await ensureInvoiceForBooking(booking, { status: 'due' });
    } else if (paymentMode === 'now') {
      const order = await createOrder({ amountInPaise: amounts.totalInPaise, reference });
      await Payment.create({
        bookingId: booking._id,
        method: 'now',
        status: 'created',
        amountInPaise: amounts.totalInPaise,
        razorpayOrderId: order.id,
      });
      response.payment = {
        provider: 'razorpay',
        razorpayOrderId: order.id,
        amountInPaise: amounts.totalInPaise,
        razorpayKeyId: keyId,
      };
    }

    res.status(201).json(response);
}
router.post('/bookings', optionalAuth, asyncHandler(createBooking));

// POST /bookings/:id/payment/verify — confirm pay-now after checkout returns.
router.post(
  '/bookings/:id/payment/verify',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body || {};
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw ApiError.notFound('Booking not found.');

    const payment = await Payment.findOne({ bookingId: booking._id, razorpayOrderId });
    if (!payment || payment.amountInPaise !== booking.amounts.totalInPaise || booking.status === 'cancelled') {
      throw ApiError.paymentFailed('This payment order does not match the booking.');
    }

    const ok = verifyCheckoutSignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });
    if (!ok) {
      throw ApiError.paymentFailed('Payment could not be verified — your slot is still held.');
    }

    if (payment.status === 'paid' && booking.amounts.balanceInPaise === 0) {
      return res.json({ booking: { _id: booking._id, status: booking.status, reference: booking.reference }, invoiceId: booking.invoiceId });
    }
    if (payment) {
      payment.status = 'paid';
      payment.razorpayPaymentId = razorpayPaymentId;
      payment.razorpaySignature = razorpaySignature;
      await payment.save();
    }

    booking.status = 'confirmed';
    booking.holdExpiresAt = undefined;
    booking.amounts.paidInPaise = booking.amounts.totalInPaise;
    booking.amounts.balanceInPaise = 0;
    await booking.save();

    if (booking.patientId) {
      await Patient.findByIdAndUpdate(booking.patientId, { $inc: { visitCount: 1 } });
    }

    const invoice = await markInvoicePaid(booking);

    res.json({
      booking: { _id: booking._id, status: booking.status, reference: booking.reference },
      invoiceId: invoice._id,
    });
  })
);

export default router;
