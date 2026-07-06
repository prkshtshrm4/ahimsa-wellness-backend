import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    provider: { type: String, default: 'razorpay' },
    method: { type: String, default: '' }, // now | link | cash | deposit | atVisit | atWalkIn
    status: { type: String, enum: ['created', 'paid', 'failed', 'refunded'], default: 'created' },
    amountInPaise: { type: Number, required: true },
    razorpayOrderId: { type: String, index: true },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    link: {
      url: String,
      expiresAt: Date,
      status: String,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Payment', paymentSchema);
