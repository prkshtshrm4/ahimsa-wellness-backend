import mongoose from 'mongoose';

export const MODULE_KEYS = [
  'bookings.read',
  'bookings.create',
  'bookings.manage',
  'services.manage',
  'staff.manage',
  'payments.collect',
  'payments.link',
  'invoices.read',
  'schedule.own',
  'reports.read',
];

const staffSchema = new mongoose.Schema(
  {
    firebaseUid: { type: String, index: true, sparse: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, sparse: true },
    phone: { type: String, required: true, trim: true, unique: true, index: true },
    role: { type: String, default: 'Staff' },
    grantedModules: {
      type: [String],
      default: [],
      validate: (v) => v.every((k) => MODULE_KEYS.includes(k)),
    },
    isTherapist: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('Staff', staffSchema);
