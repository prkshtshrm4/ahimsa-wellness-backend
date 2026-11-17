import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    brand: { type: String, default: 'ahimsa', index: true },
    name: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, default: '', maxlength: 2000 },
    source: { type: String, default: 'qr' },
  },
  { timestamps: true }
);

export default mongoose.model('Review', reviewSchema);
