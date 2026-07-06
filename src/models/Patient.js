import mongoose from 'mongoose';

const patientSchema = new mongoose.Schema(
  {
    firebaseUid: { type: String, index: true, unique: true, sparse: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true },
    age: { type: Number },
    visitCount: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

patientSchema.index({ name: 'text', phone: 'text' });

export default mongoose.model('Patient', patientSchema);
