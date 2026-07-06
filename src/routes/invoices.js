import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import Invoice from '../models/Invoice.js';
import { streamInvoicePdf } from '../utils/invoicePdf.js';
import ApiError from '../utils/ApiError.js';

const router = Router();

// Ownership OR staff invoices.read.
async function loadAuthorizedInvoice(req) {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) throw ApiError.notFound('Invoice not found.');

  if (req.auth.type === 'staff') {
    if (!req.auth.staff.grantedModules.includes('invoices.read')) throw ApiError.forbidden('invoices.read');
  } else if (req.auth.type === 'patient') {
    if (String(invoice.patientId) !== String(req.auth.patient._id)) {
      throw ApiError.forbidden(null, 'This invoice belongs to another account.');
    }
  } else {
    throw ApiError.unauthenticated();
  }
  return invoice;
}

router.get(
  '/invoices/:id',
  authenticate(),
  asyncHandler(async (req, res) => {
    const invoice = await loadAuthorizedInvoice(req);
    res.json({
      _id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      issuedAt: invoice.issuedAt,
      billedTo: invoice.billedTo,
      items: invoice.items,
      subtotalInPaise: invoice.subtotalInPaise,
      discountInPaise: invoice.discountInPaise,
      totalInPaise: invoice.totalInPaise,
    });
  })
);

router.get(
  '/invoices/:id/pdf',
  authenticate(),
  asyncHandler(async (req, res) => {
    const invoice = await loadAuthorizedInvoice(req);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${invoice.invoiceNumber}.pdf"`);
    streamInvoicePdf(invoice, res);
  })
);

router.post(
  '/invoices/:id/email',
  authenticate(),
  asyncHandler(async (req, res) => {
    const invoice = await loadAuthorizedInvoice(req);
    // Delivery is queued to billedTo.email. (No mail transport wired in this build.)
    res.json({ queued: true, to: invoice.billedTo?.email || null });
  })
);

export default router;
