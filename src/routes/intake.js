import { Router } from 'express';
import { authenticate, requireModule } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import CaseSheet from '../models/CaseSheet.js';
import Staff from '../models/Staff.js';
import { nextPatientNo } from '../models/Counter.js';
import { normalizePhone } from '../utils/phone.js';
import ApiError from '../utils/ApiError.js';

const router = Router();

const PATIENT_FIELDS = [
  'name', 'gender', 'age', 'occupation', 'maritalStatus', 'address',
  'phone', 'email', 'identificationCard', 'dateOfAdmission',
  'complaintPhysical', 'complaintMental', 'complaintSocial', 'complaintSexual',
  'addictions', 'dietaryHabits', 'sleepHabits', 'pastHistory',
  'investigationsDone', 'medicationsAtPresent',
  'consentAccepted', 'consentSignedName', 'consentSignatureDataUrl',
];

const CLINICAL_FIELDS = [
  'dateOfAdmission', 'dateOfDischarge',
  'facialDiagnosis', 'irisDiagnosis', 'pulseDiagnosis', 'navelDiagnosis', 'tongueDiagnosis',
  'provisionalDiagnosis', 'finalDiagnosis',
  'assignedDoctorId', 'status', 'notes',
];

function serializeCase(doc, { clinical = true } = {}) {
  const c = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const base = {
    _id: c._id,
    patientNo: c.patientNo,
    name: c.name,
    gender: c.gender,
    age: c.age,
    occupation: c.occupation,
    maritalStatus: c.maritalStatus,
    address: c.address,
    phone: c.phone,
    email: c.email,
    identificationCard: c.identificationCard,
    dateOfAdmission: c.dateOfAdmission,
    dateOfDischarge: c.dateOfDischarge,
    complaintPhysical: c.complaintPhysical,
    complaintMental: c.complaintMental,
    complaintSocial: c.complaintSocial,
    complaintSexual: c.complaintSexual,
    addictions: c.addictions,
    dietaryHabits: c.dietaryHabits,
    sleepHabits: c.sleepHabits,
    pastHistory: c.pastHistory,
    investigationsDone: c.investigationsDone,
    medicationsAtPresent: c.medicationsAtPresent,
    consentAccepted: c.consentAccepted,
    consentSignedName: c.consentSignedName,
    consentSignedAt: c.consentSignedAt,
    hasSignature: Boolean(c.consentSignatureDataUrl),
    source: c.source,
    status: c.status,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
  if (!clinical) return base;
  return {
    ...base,
    facialDiagnosis: c.facialDiagnosis,
    irisDiagnosis: c.irisDiagnosis,
    pulseDiagnosis: c.pulseDiagnosis,
    navelDiagnosis: c.navelDiagnosis,
    tongueDiagnosis: c.tongueDiagnosis,
    provisionalDiagnosis: c.provisionalDiagnosis,
    finalDiagnosis: c.finalDiagnosis,
    assignedDoctorId: c.assignedDoctorId,
    assignedDoctorName: c.assignedDoctorName,
    notes: c.notes,
    consentSignatureDataUrl: c.consentSignatureDataUrl || '',
  };
}

function pick(body, keys) {
  const out = {};
  for (const k of keys) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

function clampStr(v, max = 4000) {
  if (v == null) return '';
  return String(v).trim().slice(0, max);
}

/* ─── Public QR intake (no auth) ───────────────────────────────────────── */

router.post(
  '/intake',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const name = clampStr(b.name, 120);
    const phone = normalizePhone(b.phone);
    if (!name) throw ApiError.validation(['name'], 'Patient name is required.');
    if (!phone || phone.replace(/\D/g, '').length < 12) {
      throw ApiError.validation(['phone'], 'A valid 10-digit mobile number is required.');
    }
    if (!b.consentAccepted) {
      throw ApiError.validation(['consentAccepted'], 'Consent must be accepted to submit.');
    }
    const signedName = clampStr(b.consentSignedName, 120) || name;
    let age;
    if (b.age !== undefined && b.age !== '' && b.age !== null) {
      age = Number(b.age);
      if (!Number.isFinite(age) || age < 0 || age > 120) {
        throw ApiError.validation(['age'], 'Age must be between 0 and 120.');
      }
    }

    const signature = typeof b.consentSignatureDataUrl === 'string' ? b.consentSignatureDataUrl : '';
    if (signature && (signature.length > 350_000 || !signature.startsWith('data:image/'))) {
      throw ApiError.validation(['consentSignatureDataUrl'], 'Signature image is invalid or too large.');
    }

    const patientNo = await nextPatientNo();
    const today = new Date().toISOString().slice(0, 10);

    const sheet = await CaseSheet.create({
      patientNo,
      name,
      phone,
      age,
      gender: clampStr(b.gender, 40),
      occupation: clampStr(b.occupation, 120),
      maritalStatus: clampStr(b.maritalStatus, 40),
      address: clampStr(b.address, 500),
      email: clampStr(b.email, 160).toLowerCase(),
      identificationCard: clampStr(b.identificationCard, 120),
      dateOfAdmission: clampStr(b.dateOfAdmission, 20) || today,
      complaintPhysical: clampStr(b.complaintPhysical),
      complaintMental: clampStr(b.complaintMental),
      complaintSocial: clampStr(b.complaintSocial),
      complaintSexual: clampStr(b.complaintSexual),
      addictions: clampStr(b.addictions),
      dietaryHabits: clampStr(b.dietaryHabits),
      sleepHabits: clampStr(b.sleepHabits),
      pastHistory: clampStr(b.pastHistory),
      investigationsDone: clampStr(b.investigationsDone),
      medicationsAtPresent: clampStr(b.medicationsAtPresent),
      consentAccepted: true,
      consentSignedName: signedName,
      consentSignedAt: new Date(),
      consentSignatureDataUrl: signature,
      source: 'qr',
      status: 'submitted',
    });

    res.status(201).json({
      ok: true,
      caseSheet: {
        _id: sheet._id,
        patientNo: sheet.patientNo,
        name: sheet.name,
        createdAt: sheet.createdAt,
      },
    });
  })
);

/* ─── Staff: list / view / update case sheets ──────────────────────────── */

router.get(
  '/admin/cases',
  authenticate(),
  requireModule('cases.manage'),
  asyncHandler(async (req, res) => {
    const q = (req.query.q || '').trim();
    const status = (req.query.status || '').trim();
    const filter = {};
    if (status && ['submitted', 'reviewed', 'closed'].includes(status)) filter.status = status;
    if (q) {
      filter.$or = [
        { name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { phone: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { patientNo: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      ];
    }
    const rows = await CaseSheet.find(filter)
      .sort({ createdAt: -1 })
      .limit(80)
      .select('-consentSignatureDataUrl')
      .lean();
    res.json({
      cases: rows.map((r) => serializeCase(r, { clinical: true })),
    });
  })
);

router.get(
  '/admin/cases/:id',
  authenticate(),
  requireModule('cases.manage'),
  asyncHandler(async (req, res) => {
    const sheet = await CaseSheet.findById(req.params.id).lean();
    if (!sheet) throw ApiError.notFound('Case sheet not found.');
    res.json({ caseSheet: serializeCase(sheet, { clinical: true }) });
  })
);

router.patch(
  '/admin/cases/:id',
  authenticate(),
  requireModule('cases.manage'),
  asyncHandler(async (req, res) => {
    const sheet = await CaseSheet.findById(req.params.id);
    if (!sheet) throw ApiError.notFound('Case sheet not found.');

    const b = req.body || {};
    const clinical = pick(b, CLINICAL_FIELDS);
    const patientExtras = pick(b, PATIENT_FIELDS.filter((k) => !['consentAccepted', 'consentSignedName', 'consentSignatureDataUrl', 'phone'].includes(k)));

    for (const [k, v] of Object.entries({ ...patientExtras, ...clinical })) {
      if (k === 'age') {
        if (v === '' || v == null) sheet.age = undefined;
        else {
          const n = Number(v);
          if (!Number.isFinite(n) || n < 0 || n > 120) throw ApiError.validation(['age']);
          sheet.age = n;
        }
        continue;
      }
      if (k === 'status') {
        if (!['submitted', 'reviewed', 'closed'].includes(v)) throw ApiError.validation(['status']);
        sheet.status = v;
        continue;
      }
      if (k === 'assignedDoctorId') {
        if (!v) {
          sheet.assignedDoctorId = null;
          sheet.assignedDoctorName = '';
        } else {
          const doc = await Staff.findOne({ _id: v, active: true }).lean();
          if (!doc) throw ApiError.validation(['assignedDoctorId'], 'Doctor not found.');
          sheet.assignedDoctorId = doc._id;
          sheet.assignedDoctorName = doc.name;
        }
        continue;
      }
      if (typeof v === 'string') sheet[k] = clampStr(v);
      else if (v != null) sheet[k] = v;
    }

    // Auto-stamp reviewer when clinical notes are saved
    if (
      sheet.status === 'submitted' &&
      (sheet.provisionalDiagnosis || sheet.finalDiagnosis || sheet.facialDiagnosis || sheet.irisDiagnosis)
    ) {
      sheet.status = 'reviewed';
    }

    await sheet.save();
    res.json({ caseSheet: serializeCase(sheet, { clinical: true }) });
  })
);

router.get(
  '/admin/doctors',
  authenticate(),
  requireModule('cases.manage'),
  asyncHandler(async (_req, res) => {
    const doctors = await Staff.find({
      active: true,
      $or: [{ role: /doctor/i }, { grantedModules: 'cases.manage' }],
    })
      .select('name role phone email grantedModules isTherapist')
      .sort({ name: 1 })
      .lean();
    res.json({
      doctors: doctors.map((d) => ({
        _id: d._id,
        name: d.name,
        role: d.role,
        phone: d.phone,
        email: d.email,
      })),
    });
  })
);

export default router;
