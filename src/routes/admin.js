import { Router } from 'express';
import { authenticate, requireModule } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import Booking, { CAPACITY_STATUSES } from '../models/Booking.js';
import Service from '../models/Service.js';
import Patient from '../models/Patient.js';
import Staff, { MODULE_KEYS } from '../models/Staff.js';
import Payment from '../models/Payment.js';
import { nextReference } from '../models/Counter.js';
import { countSlotUsage, endTimeFor } from '../utils/slots.js';
import { computeAmounts } from '../utils/money.js';
import { cancellableUntil } from '../utils/datetime.js';
import { createOrder, createPaymentLink, keyId } from '../utils/razorpay.js';
import { ensureInvoiceForBooking, markInvoicePaid } from '../services/invoiceService.js';
import { serializeService } from './services.js';
import ApiError from '../utils/ApiError.js';
import { normalizePhone } from '../utils/phone.js';

const router = Router();

/* ─── Today / day calendar ─────────────────────────────────────────────── */

router.get(
  '/admin/bookings',
  authenticate(),
  requireModule('bookings.read'),
  asyncHandler(async (req, res) => {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const rows = await Booking.find({ date, status: { $ne: 'cancelled' } })
      .sort({ startTime: 1 })
      .lean();
    res.json({
      date,
      rows: rows.map((b) => ({
        _id: b._id,
        startTime: b.startTime,
        patientName: b.patientSnapshot?.name || null,
        serviceName: b.serviceSnapshot?.name,
        therapistName: b.therapistName,
        room: b.room,
        status: b.status,
        source: b.source,
      })),
    });
  })
);

router.get(
  '/admin/stats',
  authenticate(),
  requireModule('reports.read'),
  asyncHandler(async (req, res) => {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const dayBookings = await Booking.find({ date, status: { $ne: 'cancelled' } }).lean();

    const sessionsToday = dayBookings.length;
    const walkIns = dayBookings.filter((b) => b.source === 'frontDesk').length;
    const awaitingPayment = dayBookings.filter((b) => ['pendingPayment', 'partiallyPaid'].includes(b.status)).length;

    const services = await Service.find({ active: true }).lean();
    const totalCapacitySlots = services.reduce((sum, s) => sum + s.capacity, 0) * 10; // ~10 slots/day
    const occupied = dayBookings.filter((b) => CAPACITY_STATUSES.includes(b.status)).length;
    const capacityUsedPct = totalCapacitySlots ? Math.round((occupied / totalCapacitySlots) * 100) : 0;

    res.json({ sessionsToday, walkIns, awaitingPayment, capacityUsedPct });
  })
);

/* ─── Assisted / walk-in booking ───────────────────────────────────────── */

router.get(
  '/admin/patients',
  authenticate(),
  requireModule('bookings.create'),
  asyncHandler(async (req, res) => {
    const q = (req.query.q || '').trim();
    let patients;
    if (q) {
      patients = await Patient.find({
        $or: [{ name: new RegExp(q, 'i') }, { phone: new RegExp(q, 'i') }],
      })
        .limit(12)
        .lean();
    } else {
      patients = await Patient.find().sort({ visitCount: -1 }).limit(8).lean();
    }
    res.json({
      patients: patients.map((p) => ({ _id: p._id, name: p.name, phone: p.phone, visitCount: p.visitCount })),
    });
  })
);

router.post(
  '/admin/bookings',
  authenticate(),
  requireModule('bookings.create'),
  asyncHandler(async (req, res) => {
    const {
      patientId,
      newPatient,
      serviceId,
      date,
      startTime,
      discount = { type: 'none', value: 0 },
      paymentMode = 'atWalkIn',
      depositInPaise = 0,
      source = 'frontDesk',
    } = req.body || {};

    const modules = req.auth.staff.grantedModules;
    const usesDiscountOrCash = discount?.type !== 'none' || ['cash', 'deposit'].includes(paymentMode);
    if (usesDiscountOrCash && !modules.includes('payments.collect')) throw ApiError.forbidden('payments.collect');
    if (paymentMode === 'link' && !modules.includes('payments.link')) throw ApiError.forbidden('payments.link');

    if (!serviceId || !date || !startTime) throw ApiError.validation(['serviceId', 'date', 'startTime']);
    const service = await Service.findById(serviceId);
    if (!service) throw ApiError.notFound('Service not found.');

    // Resolve patient (existing or quick-add).
    let patient = null;
    if (patientId) {
      patient = await Patient.findById(patientId);
      if (!patient) throw ApiError.notFound('Patient not found.');
    } else if (newPatient?.name && newPatient?.phone) {
      patient = await Patient.findOneAndUpdate(
        { phone: newPatient.phone },
        { $setOnInsert: { name: newPatient.name, phone: newPatient.phone, age: newPatient.age } },
        { new: true, upsert: true }
      );
    } else {
      throw ApiError.validation(['patientId', 'newPatient']);
    }

    const used = await countSlotUsage(service._id, date, startTime);
    if (used >= service.capacity) throw ApiError.slotUnavailable(0);

    const amounts = computeAmounts(service.priceInPaise, discount);
    if (paymentMode === 'deposit' && depositInPaise > amounts.totalInPaise) {
      throw ApiError.validation(['depositInPaise'], 'Deposit cannot exceed the total.');
    }

    // Map payment mode → initial status.
    let status = 'pendingPayment';
    if (paymentMode === 'atWalkIn' || paymentMode === 'cash') status = 'confirmed';
    else if (paymentMode === 'deposit') status = 'partiallyPaid';

    const paidInPaise = paymentMode === 'cash' ? amounts.totalInPaise : paymentMode === 'deposit' ? depositInPaise : 0;

    const reference = await nextReference(new Date(date).getFullYear());
    const booking = await Booking.create({
      reference,
      patientId: patient._id,
      patientSnapshot: { name: patient.name, phone: patient.phone, email: patient.email },
      serviceId: service._id,
      serviceSnapshot: {
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
      status,
      source,
      createdByStaffId: req.auth.staff._id,
      holdExpiresAt: ['pendingPayment', 'partiallyPaid'].includes(status)
        ? new Date(Date.now() + 24 * 60 * 60 * 1000)
        : undefined,
      discount,
      amounts: { ...amounts, paidInPaise, balanceInPaise: amounts.totalInPaise - paidInPaise },
      cancellableUntil: cancellableUntil(date, startTime),
    });

    const response = { booking: { ...booking.toObject() } };

    if (paymentMode === 'cash') {
      await markInvoicePaid(booking);
    } else if (paymentMode === 'atWalkIn' || paymentMode === 'deposit') {
      await ensureInvoiceForBooking(booking, { status: paymentMode === 'deposit' ? 'due' : 'due' });
    } else if (paymentMode === 'now') {
      const order = await createOrder({ amountInPaise: amounts.totalInPaise, reference });
      await Payment.create({
        bookingId: booking._id,
        method: 'now',
        amountInPaise: amounts.totalInPaise,
        razorpayOrderId: order.id,
      });
      response.payment = {
        provider: 'razorpay',
        razorpayOrderId: order.id,
        amountInPaise: amounts.totalInPaise,
        razorpayKeyId: keyId,
      };
    } else if (paymentMode === 'link') {
      const link = await createPaymentLink({
        amountInPaise: amounts.totalInPaise,
        reference,
        customer: { name: patient.name, phone: patient.phone, email: patient.email },
      });
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      await Payment.create({
        bookingId: booking._id,
        method: 'link',
        amountInPaise: amounts.totalInPaise,
        link: { url: link.url, expiresAt, status: 'created' },
      });
      response.paymentLink = { url: link.url, expiresAt, channels: ['email', 'sms'] };
    }

    res.status(201).json(response);
  })
);

router.post(
  '/admin/bookings/:id/payment-link/resend',
  authenticate(),
  requireModule('payments.link'),
  asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw ApiError.notFound('Booking not found.');
    const link = await createPaymentLink({
      amountInPaise: booking.amounts.balanceInPaise || booking.amounts.totalInPaise,
      reference: booking.reference,
      customer: booking.patientSnapshot,
    });
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await Payment.findOneAndUpdate(
      { bookingId: booking._id, method: 'link' },
      { link: { url: link.url, expiresAt, status: 'created' } },
      { upsert: true, new: true }
    );
    res.json({ paymentLink: { url: link.url, expiresAt, channels: ['email', 'sms'] } });
  })
);

router.post(
  '/admin/bookings/:id/payment/collect',
  authenticate(),
  requireModule('payments.collect'),
  asyncHandler(async (req, res) => {
    const { amountInPaise } = req.body || {};
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw ApiError.notFound('Booking not found.');

    const amount = Number(amountInPaise) || booking.amounts.balanceInPaise;
    booking.amounts.paidInPaise = Math.min(booking.amounts.totalInPaise, booking.amounts.paidInPaise + amount);
    booking.amounts.balanceInPaise = booking.amounts.totalInPaise - booking.amounts.paidInPaise;
    booking.status = booking.amounts.balanceInPaise <= 0 ? 'confirmed' : 'partiallyPaid';
    await booking.save();

    await Payment.create({ bookingId: booking._id, method: 'cash', status: 'paid', amountInPaise: amount });
    if (booking.amounts.balanceInPaise <= 0) await markInvoicePaid(booking);

    res.json({ booking: { _id: booking._id, status: booking.status, amounts: booking.amounts } });
  })
);

/* ─── Services & pricing CRUD ──────────────────────────────────────────── */

async function upsertServiceTherapistName(body) {
  if (body.therapistId) {
    const t = await Staff.findById(body.therapistId).lean();
    if (t) return t.name;
  }
  return body.therapistName || '';
}

router.post(
  '/admin/services',
  authenticate(),
  requireModule('services.manage'),
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.name || !(b.priceInPaise > 0) || !(b.capacity > 0)) {
      throw ApiError.validation(['name', 'priceInPaise', 'capacity']);
    }
    b.therapistName = await upsertServiceTherapistName(b);
    const service = await Service.create(b);
    res.status(201).json({ service: serializeService(service) });
  })
);

router.patch(
  '/admin/services/:id',
  authenticate(),
  requireModule('services.manage'),
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (b.therapistId) b.therapistName = await upsertServiceTherapistName(b);
    const service = await Service.findByIdAndUpdate(req.params.id, b, { new: true, runValidators: true });
    if (!service) throw ApiError.notFound('Service not found.');
    res.json({ service: serializeService(service) });
  })
);

router.delete(
  '/admin/services/:id',
  authenticate(),
  requireModule('services.manage'),
  asyncHandler(async (req, res) => {
    const futureRef = await Booking.exists({
      serviceId: req.params.id,
      status: { $in: CAPACITY_STATUSES },
      date: { $gte: new Date().toISOString().slice(0, 10) },
    });
    if (futureRef) {
      throw ApiError.conflict('service_in_use', 'Future bookings reference this service — deactivate it instead.');
    }
    const del = await Service.findByIdAndDelete(req.params.id);
    if (!del) throw ApiError.notFound('Service not found.');
    res.json({ deleted: true });
  })
);

/* ─── Staff & permissions ──────────────────────────────────────────────── */

function serializeStaff(s) {
  return {
    _id: s._id,
    name: s.name,
    email: s.email,
    phone: s.phone,
    role: s.role,
    isTherapist: s.isTherapist,
    grantedModules: s.grantedModules,
    active: s.active,
  };
}

router.get(
  '/admin/staff',
  authenticate(),
  requireModule('staff.manage'),
  asyncHandler(async (req, res) => {
    const staff = await Staff.find().sort({ createdAt: 1 }).lean();
    res.json({ staff: staff.map(serializeStaff) });
  })
);

router.patch(
  '/admin/staff/:id',
  authenticate(),
  requireModule('staff.manage'),
  asyncHandler(async (req, res) => {
    const { grantedModules, name, role, isTherapist, active } = req.body || {};

    if (grantedModules) {
      const invalid = grantedModules.filter((k) => !MODULE_KEYS.includes(k));
      if (invalid.length) throw ApiError.validation(['grantedModules'], `Unknown modules: ${invalid.join(', ')}`);

      // Guardrail: never strip staff.manage from the last remaining admin.
      const target = await Staff.findById(req.params.id);
      if (!target) throw ApiError.notFound('Staff not found.');
      if (target.grantedModules.includes('staff.manage') && !grantedModules.includes('staff.manage')) {
        const admins = await Staff.countDocuments({ grantedModules: 'staff.manage', active: true });
        if (admins <= 1) throw ApiError.conflict('last_admin', 'You cannot remove the last remaining admin.');
      }
    }

    const update = {};
    if (grantedModules) update.grantedModules = grantedModules;
    if (name !== undefined) update.name = name;
    if (role !== undefined) update.role = role;
    if (isTherapist !== undefined) update.isTherapist = isTherapist;
    if (active !== undefined) update.active = active;

    const staff = await Staff.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!staff) throw ApiError.notFound('Staff not found.');
    res.json({ staff: serializeStaff(staff) });
  })
);

router.post(
  '/admin/staff/invite',
  authenticate(),
  requireModule('staff.manage'),
  asyncHandler(async (req, res) => {
    const { name, email, phone, role, grantedModules = [], isTherapist = false } = req.body || {};
    if (!name || !email || !phone) throw ApiError.validation(['name', 'email', 'phone']);
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) throw ApiError.validation(['phone'], 'A valid mobile number is required.');

    const exists = await Staff.findOne({ $or: [{ email: email.toLowerCase() }, { phone: normalizedPhone }] });
    if (exists) throw ApiError.conflict('staff_exists', 'A staff member with that email or phone already exists.');

    const staff = await Staff.create({
      name,
      email: email.toLowerCase(),
      phone: normalizedPhone,
      role: role || 'Staff',
      grantedModules,
      isTherapist,
    });
    res.status(201).json({ staff: serializeStaff(staff) });
  })
);

export default router;
