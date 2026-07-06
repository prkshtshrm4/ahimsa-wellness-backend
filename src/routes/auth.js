import { Router } from 'express';
import { authenticate, requirePatient } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import ApiError from '../utils/ApiError.js';
import { normalizePhone } from '../utils/phone.js';
import Patient from '../models/Patient.js';

const router = Router();

// POST /auth/session — provision / update patient after Firebase sign-in.
router.post(
  '/auth/session',
  authenticate({ provisionPatient: false }),
  asyncHandler(async (req, res) => {
    if (req.auth.type === 'staff') {
      throw ApiError.forbidden(null, 'Staff accounts use the staff sign-in flow.');
    }

    const { name, email, phone } = req.body || {};
    const uid = req.auth.claims.uid;
    const normalizedPhone = phone ? normalizePhone(phone) : req.auth.claims.phone;

    let patient = await Patient.findOne({ firebaseUid: uid });
    const isNewPatient = !patient;

    if (!patient && normalizedPhone) {
      patient = await Patient.findOne({ phone: normalizedPhone });
    }
    if (!patient) {
      patient = new Patient({ firebaseUid: uid });
    } else if (!patient.firebaseUid) {
      patient.firebaseUid = uid;
    }

    patient.name = name || patient.name || req.auth.claims.name || 'Guest';
    if (email || req.auth.claims.email) patient.email = email || req.auth.claims.email;
    if (normalizedPhone) patient.phone = normalizedPhone;
    await patient.save();

    res.json({
      patient: {
        _id: patient._id,
        firebaseUid: patient.firebaseUid,
        name: patient.name,
        phone: patient.phone,
        email: patient.email,
        isNewPatient,
        createdAt: patient.createdAt,
      },
    });
  })
);

// GET /auth/check-phone?phone=+91… — booking flow: is this number already registered?
router.get(
  '/auth/check-phone',
  asyncHandler(async (req, res) => {
    const phone = normalizePhone(req.query.phone);
    if (!phone || phone.length < 12) {
      return res.json({ exists: false });
    }
    const patient = await Patient.findOne({ phone }).select('name firebaseUid').lean();
    if (!patient) return res.json({ exists: false });
    res.json({
      exists: true,
      firstName: patient.name?.split(' ')[0] || 'there',
      hasAccount: Boolean(patient.firebaseUid),
    });
  })
);

// PATCH /auth/link-phone — after Firebase linkWithCredential on the client.
router.patch(
  '/auth/link-phone',
  authenticate(),
  requirePatient,
  asyncHandler(async (req, res) => {
    const phone = normalizePhone(req.body?.phone || req.auth.claims.phone);
    if (!phone) throw ApiError.validation(['phone'], 'A valid mobile number is required.');

    const taken = await Patient.findOne({
      phone,
      firebaseUid: { $ne: req.auth.claims.uid },
    });
    if (taken) {
      throw ApiError.conflict('phone_in_use', 'This number is linked to another account.');
    }

    const patient = req.auth.patient;
    patient.phone = phone;
    await patient.save();

    res.json({
      patient: {
        _id: patient._id,
        name: patient.name,
        phone: patient.phone,
        email: patient.email,
      },
    });
  })
);

// GET /me
router.get(
  '/me',
  authenticate(),
  asyncHandler(async (req, res) => {
    if (req.auth.type === 'staff') {
      const s = req.auth.staff;
      return res.json({
        type: 'staff',
        staff: {
          _id: s._id,
          name: s.name,
          role: s.role,
          email: s.email,
          phone: s.phone,
          isTherapist: s.isTherapist,
          grantedModules: s.grantedModules,
        },
      });
    }
    const p = req.auth.patient;
    res.json({
      type: 'patient',
      patient: {
        _id: p._id,
        name: p.name,
        phone: p.phone,
        email: p.email,
        visitCount: p.visitCount,
        needsPhoneLink: !p.phone,
      },
    });
  })
);

export default router;
