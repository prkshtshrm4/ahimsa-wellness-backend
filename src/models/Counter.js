import mongoose from 'mongoose';

// Atomic sequence generator for human-friendly references (AWC-2026-0417).
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model('Counter', counterSchema);

export async function nextReference(year = new Date().getFullYear()) {
  const key = `booking-${year}`;
  const doc = await Counter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `AWC-${year}-${String(doc.seq).padStart(4, '0')}`;
}

export default Counter;
