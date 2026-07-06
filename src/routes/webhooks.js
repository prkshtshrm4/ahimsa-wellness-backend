import { Router } from 'express';
import { asyncHandler } from '../middleware/error.js';
import Payment from '../models/Payment.js';
import Booking from '../models/Booking.js';
import Patient from '../models/Patient.js';
import { verifyWebhookSignature } from '../utils/razorpay.js';
import { markInvoicePaid } from '../services/invoiceService.js';

const router = Router();

// POST /webhooks/razorpay — authoritative confirm for checkout & payment-link
// captures. Verified by Razorpay's signature header (no user auth).
router.post(
  '/webhooks/razorpay',
  asyncHandler(async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    const raw = req.rawBody || JSON.stringify(req.body || {});
    if (!verifyWebhookSignature(raw, signature)) {
      return res.status(400).json({ error: { code: 'invalid_signature', message: 'Bad webhook signature.' } });
    }

    const event = req.body?.event;
    const entity =
      req.body?.payload?.payment?.entity || req.body?.payload?.payment_link?.entity || {};

    if (event === 'payment.captured' || event === 'payment_link.paid') {
      const orderId = entity.order_id;
      const payment = orderId
        ? await Payment.findOne({ razorpayOrderId: orderId })
        : await Payment.findOne({ 'link.status': 'created' }).sort({ createdAt: -1 });

      if (payment) {
        payment.status = 'paid';
        payment.razorpayPaymentId = entity.id;
        if (payment.link) payment.link.status = 'paid';
        await payment.save();

        const booking = await Booking.findById(payment.bookingId);
        if (booking && booking.status !== 'confirmed') {
          booking.status = 'confirmed';
          booking.holdExpiresAt = undefined;
          booking.amounts.paidInPaise = booking.amounts.totalInPaise;
          booking.amounts.balanceInPaise = 0;
          await booking.save();
          if (booking.patientId) await Patient.findByIdAndUpdate(booking.patientId, { $inc: { visitCount: 1 } });
          await markInvoicePaid(booking);
        }
      }
    }

    res.json({ received: true });
  })
);

export default router;
