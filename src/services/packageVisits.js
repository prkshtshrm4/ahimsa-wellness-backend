import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { buildSlotTimes, endTimeFor, countSlotUsage, computeAvailability } from '../utils/slots.js';
import { cancellableUntil, whenIso } from '../utils/datetime.js';
import { nextReference } from '../models/Counter.js';

export function packageRemaining(purchase) {
  return Math.max(0, purchase.serviceSnapshot.visitCount - 1 - (purchase.packageReservations?.length || 0));
}

export function validateVisitDate(service, date, startTime) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw ApiError.validation(['date']);
  if (startTime !== undefined && (!buildSlotTimes(service).includes(startTime) || new Date(whenIso(date, startTime)) <= new Date())) throw ApiError.validation(['startTime'], 'Choose an available future appointment.');
}

export function createPackageVisitHandlers({ Booking, Service }) {
  async function purchaseFor(req) {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw ApiError.validation(['id']);
    const purchase = await Booking.findOne({ _id: req.params.id, patientId: req.auth.patient._id, 'serviceSnapshot.kind': 'package', packagePurchaseId: null });
    if (!purchase) throw ApiError.notFound('Package purchase not found.');
    if (!['confirmed', 'completed', 'noShow'].includes(purchase.status) || purchase.amounts.balanceInPaise > 0) throw ApiError.conflict('package_not_paid', 'Complete payment for this package before booking another visit.');
    const current = await Service.findById(purchase.serviceId).lean();
    if (!current) throw ApiError.notFound('Please contact the centre to schedule this package.');
    return { purchase, service: { ...current, ...purchase.serviceSnapshot, _id: current._id } };
  }
  return {
    list: async (req, res) => {
      const purchases = await Booking.find({ patientId: req.auth.patient._id, 'serviceSnapshot.kind': 'package', packagePurchaseId: null, status: { $ne: 'cancelled' } }).sort({ createdAt: -1 }).lean();
      res.json({ packages: purchases.map(p => ({ _id: p._id, name: p.serviceSnapshot.name, firstVisitDate: p.date, visitCount: p.serviceSnapshot.visitCount, remainingVisits: packageRemaining(p), paid: ['confirmed', 'completed', 'noShow'].includes(p.status) && p.amounts.balanceInPaise === 0 })) });
    },
    availability: async (req, res) => {
      const { purchase, service } = await purchaseFor(req);
      const date = req.query.date;
      validateVisitDate(service, date);
      const unavailable = packageRemaining(purchase) <= 0 || date <= purchase.date || purchase.packageReservations.some(r => r.date === date);
      const slots = unavailable ? [] : (await computeAvailability(service, date)).filter(s => new Date(whenIso(date, s.startTime)) > new Date());
      res.json({ name: service.name, remainingVisits: packageRemaining(purchase), slots });
    },
    book: async (req, res) => {
      const { purchase, service } = await purchaseFor(req);
      const { date, startTime } = req.body || {};
      validateVisitDate(service, date, startTime || '');
      if (date <= purchase.date) throw ApiError.validation(['date'], 'Choose a day after the first package visit.');
      if (await countSlotUsage(service._id, date, startTime) >= service.capacity) throw ApiError.slotUnavailable();
      const id = new mongoose.Types.ObjectId();
      // One atomic claim prevents concurrent requests from spending the same visit or date.
      const claimed = await Booking.findOneAndUpdate({
        _id: purchase._id, status: { $in: ['confirmed', 'completed', 'noShow'] }, 'amounts.balanceInPaise': 0,
        'packageReservations.date': { $ne: date },
        $expr: { $lt: [{ $size: { $ifNull: ['$packageReservations', []] } }, { $subtract: ['$serviceSnapshot.visitCount', 1] }] },
      }, { $push: { packageReservations: { bookingId: id, date } } }, { new: true });
      if (!claimed) throw ApiError.conflict('package_visit_unavailable', 'No visits remain, or you already have a visit on that day. Refresh your package.');
      try {
        const booking = await Booking.create({
          _id: id, reference: await nextReference(new Date(date).getFullYear()),
          patientId: req.auth.patient._id, patientSnapshot: purchase.patientSnapshot,
          serviceId: service._id, serviceSnapshot: purchase.serviceSnapshot,
          packagePurchaseId: purchase._id, date, startTime, endTime: endTimeFor(startTime, service.durationMin),
          therapistId: service.therapistId, therapistName: service.therapistName, room: service.room,
          status: 'confirmed', source: 'package', cancellableUntil: cancellableUntil(date, startTime),
          amounts: { subtotalInPaise: 0, totalInPaise: 0, paidInPaise: 0, balanceInPaise: 0 },
        });
        if (await countSlotUsage(service._id, date, startTime) > service.capacity) {
          await Booking.deleteOne({ _id: id });
          throw ApiError.slotUnavailable();
        }
        res.status(201).json({ booking: { _id: booking._id, reference: booking.reference }, remainingVisits: packageRemaining(claimed) });
      } catch (error) {
        await Booking.updateOne({ _id: purchase._id }, { $pull: { packageReservations: { bookingId: id } } });
        throw error;
      }
    },
  };
}
