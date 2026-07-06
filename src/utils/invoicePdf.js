import PDFDocument from 'pdfkit';
import { rupees } from './money.js';

const TEAL = '#1C4B43';
const SAGE = '#7FA88F';
const CHARCOAL = '#1A1F2B';
const MUTED = '#8C9490';

// Streams a professional, GST-free invoice PDF to `res`.
export function streamInvoicePdf(invoice, res) {
  const doc = new PDFDocument({ size: 'A4', margin: 54 });
  doc.pipe(res);

  const issued = new Date(invoice.issuedAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Header
  doc.fillColor(CHARCOAL).font('Helvetica-Bold').fontSize(22).text('AHIMSA', 54, 54);
  doc.fillColor(SAGE).font('Helvetica-Bold').fontSize(8).text('WELLNESS CENTRE · GURUGRAM', 54, 82, {
    characterSpacing: 2,
  });
  doc.fillColor(CHARCOAL).font('Helvetica').fontSize(22).text('Invoice', 400, 54, { align: 'right' });
  doc.fillColor(MUTED).fontSize(11).text(invoice.invoiceNumber, 400, 84, { align: 'right' });

  doc.moveTo(54, 110).lineTo(541, 110).strokeColor('#ECE6DA').stroke();

  // Billed-to + issued
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text('BILLED TO', 54, 128, { characterSpacing: 1.5 });
  doc.fillColor(CHARCOAL).font('Helvetica-Bold').fontSize(12).text(invoice.billedTo?.name || '—', 54, 142);
  doc.font('Helvetica').fillColor(MUTED).fontSize(10);
  if (invoice.billedTo?.phone) doc.text(invoice.billedTo.phone, 54, 160);
  if (invoice.billedTo?.email) doc.text(invoice.billedTo.email, 54, 174);

  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text('ISSUED', 400, 128, {
    align: 'right',
    characterSpacing: 1.5,
  });
  doc.fillColor(CHARCOAL).font('Helvetica').fontSize(11).text(issued, 400, 142, { align: 'right' });
  doc
    .fillColor(invoice.status === 'paid' ? TEAL : '#8A7420')
    .font('Helvetica-Bold')
    .fontSize(10)
    .text(invoice.status === 'paid' ? '● PAID' : '● DUE', 400, 162, { align: 'right' });

  // Items table
  let y = 220;
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text('SERVICE', 54, y, { characterSpacing: 1 });
  doc.text('DATE', 330, y, { characterSpacing: 1 });
  doc.text('AMOUNT', 400, y, { align: 'right', characterSpacing: 1 });
  y += 14;
  doc.moveTo(54, y).lineTo(541, y).strokeColor('#ECE6DA').lineWidth(1.5).stroke();
  y += 12;

  doc.font('Helvetica').fontSize(11);
  for (const it of invoice.items || []) {
    doc.fillColor(CHARCOAL).text(it.description, 54, y, { width: 260 });
    doc.fillColor(MUTED).fontSize(10).text(it.date || '', 330, y);
    doc.fillColor(CHARCOAL).fontSize(11).text(`₹${rupees(it.amountInPaise)}`, 400, y, { align: 'right' });
    y += 26;
    doc.moveTo(54, y - 8).lineTo(541, y - 8).strokeColor('#F5F0E6').lineWidth(1).stroke();
  }

  // Totals
  y += 8;
  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text('Subtotal', 360, y);
  doc.fillColor(CHARCOAL).text(`₹${rupees(invoice.subtotalInPaise)}`, 400, y, { align: 'right' });
  if (invoice.discountInPaise > 0) {
    y += 16;
    doc.fillColor(MUTED).text('Discount', 360, y);
    doc.fillColor(CHARCOAL).text(`− ₹${rupees(invoice.discountInPaise)}`, 400, y, { align: 'right' });
  }
  y += 20;
  doc.moveTo(360, y).lineTo(541, y).strokeColor('#ECE6DA').lineWidth(1.5).stroke();
  y += 10;
  doc.fillColor(CHARCOAL).font('Helvetica-Bold').fontSize(12).text('Total', 360, y);
  doc.fillColor(TEAL).fontSize(16).text(`₹${rupees(invoice.totalInPaise)}`, 380, y - 3, { align: 'right' });

  // Warm closing line
  y += 60;
  doc
    .fillColor(SAGE)
    .font('Helvetica-Oblique')
    .fontSize(12)
    .text('Thank you for letting us care for you. May you leave lighter than you came.', 54, y, {
      width: 320,
    });
  doc
    .fillColor('#A9A192')
    .font('Helvetica')
    .fontSize(8)
    .text('World Peace Centre, Sector 39 · Gurugram, Haryana · India\ncare@ahimsawellnesscentre.com', 360, y, {
      align: 'right',
    });

  doc.end();
}
