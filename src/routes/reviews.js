import { Router } from 'express';
import { authenticate, requireModule } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import Review from '../models/Review.js';
import ApiError from '../utils/ApiError.js';
import { normalizePhone } from '../utils/phone.js';

const router = Router();

router.post(
  '/reviews',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const rating = Number(b.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw ApiError.validation(['rating'], 'Please choose a rating from 1 to 5.');
    }
    const review = await Review.create({
      brand: 'ahimsa',
      name: String(b.name || '').trim().slice(0, 120),
      phone: normalizePhone(b.phone) || '',
      rating,
      comment: String(b.comment || '').trim().slice(0, 2000),
      source: 'qr',
    });
    res.status(201).json({
      ok: true,
      review: { _id: review._id, rating: review.rating, createdAt: review.createdAt },
    });
  })
);

router.get(
  '/admin/reviews',
  authenticate(),
  requireModule('cases.manage'),
  asyncHandler(async (_req, res) => {
    const rows = await Review.find({ brand: 'ahimsa' }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ reviews: rows });
  })
);

export default router;
