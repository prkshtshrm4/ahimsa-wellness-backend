import mongoose from 'mongoose';

export const BOOKING_STATUS = [
  'pendingPayment',
  'partiallyPaid',
  'confirmed',
  'completed',
  'cancelled',
  'noShow',
  'open',
];

// Statuses that occupy physical capacity for a slot.
export const CAPACITY_STATUSES = ['pendingPayment', 'partiallyPaid', 'confirmed', 'completed'];

const bookingSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
    patientSnapshot: {
      name: String,
      phone: String,
      email: String,
      reason: String,
    },
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    serviceSnapshot: {
      kind: String,
      visitCount: { type: Number, default: 1 },
      inclusions: [String],
      includedServices: [{ _id: false, serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' }, name: String, durationMin: Number }],
      name: String,
      durationMin: Number,
      priceInPaise: Number,
      category: String,
    },
    packagePurchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', index: true },
    packageReservations: [{ _id: false, bookingId: mongoose.Schema.Types.ObjectId, date: String }],
    date: { type: String, required: true, index: true }, // YYYY-MM-DD (centre-local)
    startTime: { type: String, required: true }, // HH:mm
    endTime: { type: String },
    therapistId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    therapistName: { type: String, default: '' },
    room: { type: String, default: '' },
    note: { type: String, default: '' },
    status: { type: String, enum: BOOKING_STATUS, default: 'pendingPayment', index: true },
    source: { type: String, default: 'web' }, // web | mobile | frontDesk
    createdByStaffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    holdExpiresAt: { type: Date },
    discount: {
      type: { type: String, enum: ['none', 'percent', 'flat'], default: 'none' },
      value: { type: Number, default: 0 },
    },
    amounts: {
      subtotalInPaise: { type: Number, default: 0 },
      discountInPaise: { type: Number, default: 0 },
      totalInPaise: { type: Number, default: 0 },
      paidInPaise: { type: Number, default: 0 },
      balanceInPaise: { type: Number, default: 0 },
    },
    cancellableUntil: { type: Date },
    cancellation: {
      at: Date,
      refundInPaise: Number,
    },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  },
  { timestamps: true }
);

bookingSchema.index({ serviceId: 1, date: 1, startTime: 1, status: 1 });

export default mongoose.model('Booking', bookingSchema);
