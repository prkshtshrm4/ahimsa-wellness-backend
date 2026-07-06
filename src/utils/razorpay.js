import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { nanoid } from 'nanoid';
import env from '../config/env.js';

// When keys are present we use the real Razorpay SDK; otherwise we run a
// deterministic mock so the full booking → pay → confirm flow works locally.
let client = null;
if (env.razorpayLive) {
  client = new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret });
}

export const isLive = env.razorpayLive;
export const keyId = env.razorpay.keyId || 'rzp_mock_key';

export async function createOrder({ amountInPaise, reference }) {
  if (client) {
    const order = await client.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: reference,
    });
    return { id: order.id, amount: order.amount };
  }
  return { id: `order_mock_${nanoid(14)}`, amount: amountInPaise };
}

export async function createPaymentLink({ amountInPaise, reference, customer }) {
  if (client) {
    const link = await client.paymentLink.create({
      amount: amountInPaise,
      currency: 'INR',
      description: `Ahimsa Wellness · ${reference}`,
      customer: { name: customer?.name, contact: customer?.phone, email: customer?.email },
      notify: { sms: Boolean(customer?.phone), email: Boolean(customer?.email) },
      reminder_enable: true,
    });
    return { url: link.short_url, id: link.id };
  }
  return { url: `https://rzp.io/i/${nanoid(8)}`, id: `plink_mock_${nanoid(10)}` };
}

export async function refund({ paymentId, amountInPaise }) {
  if (client && paymentId) {
    const r = await client.payments.refund(paymentId, { amount: amountInPaise });
    return { id: r.id, amountInPaise: r.amount };
  }
  return { id: `rfnd_mock_${nanoid(10)}`, amountInPaise };
}

/** Verify Razorpay checkout signature. */
export function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  if (!client || !orderId || !paymentId || !signature) return false;
  const expected = crypto
    .createHmac('sha256', env.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return expected === signature;
}

/** Verify the raw webhook body signature. */
export function verifyWebhookSignature(rawBody, signature) {
  if (!env.razorpay.webhookSecret) return true; // mock/dev
  const expected = crypto
    .createHmac('sha256', env.razorpay.webhookSecret)
    .update(rawBody)
    .digest('hex');
  return expected === signature;
}
