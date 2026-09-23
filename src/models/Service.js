import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema(
  {
    catalogueKey: { type: String, index: true },
    enquiryOnly: { type: Boolean, default: false },
    priceLabel: { type: String, default: '' },
    kind: { type: String, enum: ['service', 'package'], default: 'service', index: true },
    visitCount: { type: Number, default: 1, min: 1, max: 365 },
    packageOnly: { type: Boolean, default: false },
    includedServices: [{ _id: false, serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' }, name: String, durationMin: Number }],
    inclusions: { type: [String], default: [] },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    blurb: { type: String, default: '' },
    priceInPaise: { type: Number, required: true, min: 0 },
    durationMin: { type: Number, required: true, min: 5 },
    capacity: { type: Number, required: true, min: 1 },
    capacityUnit: { type: String, default: 'spots' },
    therapistId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    therapistName: { type: String, default: '' },
    room: { type: String, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('Service', serviceSchema);
