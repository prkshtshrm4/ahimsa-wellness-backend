import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    bookingIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Booking' }],
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
    billedTo: {
      name: String,
      phone: String,
      email: String,
    },
    items: [
      {
        description: String,
        date: String,
        amountInPaise: Number,
      },
    ],
    subtotalInPaise: { type: Number, default: 0 },
    discountInPaise: { type: Number, default: 0 },
    totalInPaise: { type: Number, default: 0 },
    status: { type: String, enum: ['due', 'paid'], default: 'due' },
    issuedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model('Invoice', invoiceSchema);
