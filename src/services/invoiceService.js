import Invoice from '../models/Invoice.js';
import Booking from '../models/Booking.js';

// Generate (or return existing) invoice for a booking. Invoices are system-
// generated on payment capture / confirmation, never hand-created.
export async function ensureInvoiceForBooking(booking, { status } = {}) {
  if (booking.invoiceId) {
    const existing = await Invoice.findById(booking.invoiceId);
    if (existing) {
      if (status && existing.status !== status) {
        existing.status = status;
        await existing.save();
      }
      return existing;
    }
  }

  const invoice = await Invoice.create({
    invoiceNumber: booking.reference,
    bookingIds: [booking._id],
    patientId: booking.patientId,
    billedTo: {
      name: booking.patientSnapshot?.name,
      phone: booking.patientSnapshot?.phone,
      email: booking.patientSnapshot?.email,
    },
    items: [
      {
        description: `${booking.serviceSnapshot?.name} — ${booking.serviceSnapshot?.durationMin} min session`,
        date: booking.date,
        amountInPaise: booking.serviceSnapshot?.priceInPaise ?? booking.amounts.subtotalInPaise,
      },
    ],
    subtotalInPaise: booking.amounts.subtotalInPaise,
    discountInPaise: booking.amounts.discountInPaise,
    totalInPaise: booking.amounts.totalInPaise,
    status: status || 'due',
    issuedAt: new Date(),
  });

  booking.invoiceId = invoice._id;
  await booking.save();
  return invoice;
}

export async function markInvoicePaid(booking) {
  return ensureInvoiceForBooking(booking, { status: 'paid' });
}
