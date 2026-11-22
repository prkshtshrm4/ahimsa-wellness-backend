import { Router } from 'express';
import { authenticate, requireAnyModule } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import YogaRegistration, { YOGA_GENDERS, YOGA_SLOTS } from '../models/YogaRegistration.js';
import ApiError from '../utils/ApiError.js';
import { normalizePhone } from '../utils/phone.js';
import { createdAtFilter } from '../utils/dateRange.js';
import { sendCsv } from '../utils/csv.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SLOT_LABEL = {
  '7-8am': '7-8 am',
  '8-9am': '8-9 am',
  '4-5pm': '4-5 pm',
};

const GENDER_LABEL = {
  female: 'Female',
  male: 'Male',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
};

function buildYogaFilter(req) {
  const q = String(req.query.q || '').trim();
  const filter = { ...createdAtFilter(req.query.from, req.query.to) };
  if (q) {
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: re }, { email: re }, { whatsapp: re }];
  }
  return filter;
}

function serializeYoga(row) {
  return {
    _id: row._id,
    name: row.name,
    whatsapp: row.whatsapp,
    email: row.email,
    slots: row.slots || [],
    gender: row.gender,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

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
    const filter = buildYogaFilter(req);
    const limit = Math.min(2000, Math.max(1, Number(req.query.limit) || 200));
    const registrations = await YogaRegistration.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ registrations: registrations.map(serializeYoga), total: registrations.length });
  })
);

router.get(
  '/admin/yoga-registrations/export',
  authenticate(),
  requireAnyModule('yoga.export'),
  asyncHandler(async (req, res) => {
    const filter = buildYogaFilter(req);
    const rows = await YogaRegistration.find(filter).sort({ createdAt: -1 }).limit(5000).lean();
    const from = String(req.query.from || 'all');
    const to = String(req.query.to || 'all');
    const headers = ['Date', 'Name', 'WhatsApp', 'Email', 'Slots', 'Gender'];
    const data = rows.map((r) => ({
      Date: new Date(r.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      Name: r.name,
      WhatsApp: r.whatsapp,
      Email: r.email,
      Slots: (r.slots || []).map((s) => SLOT_LABEL[s] || s).join(' | '),
      Gender: GENDER_LABEL[r.gender] || r.gender,
    }));
    sendCsv(res, `yoga-registrations_${from}_to_${to}.csv`, headers, data);
  })
);

router.get(
  '/admin/yoga-registrations/:id',
  authenticate(),
  requireAnyModule('yoga.read', 'cases.manage'),
  asyncHandler(async (req, res) => {
    const row = await YogaRegistration.findById(req.params.id).lean();
    if (!row) throw ApiError.notFound('Registration not found.');
    res.json({ registration: serializeYoga(row) });
  })
);

export default router;
