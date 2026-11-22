import { Router } from 'express';
import { authenticate, requireAnyModule } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import YogaRegistration, { YOGA_GENDERS, YOGA_SLOTS } from '../models/YogaRegistration.js';
import ApiError from '../utils/ApiError.js';
import { normalizePhone } from '../utils/phone.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post(
  '/yoga-registrations',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const name = String(b.name || '').trim().slice(0, 120);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 160);
    const whatsapp = normalizePhone(b.whatsapp || b.phone);
    const gender = String(b.gender || '').trim();
    const slots = Array.isArray(b.slots)
      ? [...new Set(b.slots.map((s) => String(s).trim()).filter((s) => YOGA_SLOTS.includes(s)))]
      : [];

    if (!name) throw ApiError.validation(['name'], 'Name is required.');
    if (!whatsapp || whatsapp.replace(/\D/g, '').length < 12) {
      throw ApiError.validation(['whatsapp'], 'Valid WhatsApp number is required.');
    }
    if (!email || !EMAIL_RE.test(email)) {
      throw ApiError.validation(['email'], 'Valid email is required.');
    }
    if (!slots.length) {
      throw ApiError.validation(['slots'], 'Select at least one time slot.');
    }
    if (!YOGA_GENDERS.includes(gender)) {
      throw ApiError.validation(['gender'], 'Please select a gender.');
    }

    const registration = await YogaRegistration.create({
      name,
      whatsapp,
      email,
      slots,
      gender,
      source: 'web',
    });

    res.status(201).json({
      ok: true,
      registration: {
        _id: registration._id,
        name: registration.name,
        slots: registration.slots,
        createdAt: registration.createdAt,
      },
    });
  })
);

router.get(
  '/admin/yoga-registrations',
  authenticate(),
  requireAnyModule('yoga.read', 'cases.manage'),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const filter = {};
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: re }, { email: re }, { whatsapp: re }];
    }
    const registrations = await YogaRegistration.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json({ registrations });
  })
);

export default router;
