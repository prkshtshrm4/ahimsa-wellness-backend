import ApiError from '../utils/ApiError.js';
import { verifyFirebaseToken } from '../utils/firebaseVerify.js';
import { normalizePhone } from '../utils/phone.js';
import Patient from '../models/Patient.js';
import Staff from '../models/Staff.js';

function readBearer(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7).trim();
}

async function resolveClaims(token) {
  try {
    const claim = await verifyFirebaseToken(token);
    return {
      source: 'firebase',
      uid: claim.uid,
      email: claim.email || null,
      phone: claim.phone ? normalizePhone(claim.phone) : null,
      name: claim.name || null,
    };
  } catch {
    throw ApiError.unauthenticated('Your session has expired. Please sign in again.');
  }
}

async function resolveStaff(claims) {
  const or = [{ firebaseUid: claims.uid }];
  if (claims.email) or.push({ email: claims.email.toLowerCase() });
  if (claims.phone) or.push({ phone: claims.phone });

  const staff = await Staff.findOne({ $or: or, active: true });
  if (!staff) return null;

  let dirty = false;
  if (!staff.firebaseUid) {
    staff.firebaseUid = claims.uid;
    dirty = true;
  }
  if (!staff.phone && claims.phone) {
    staff.phone = claims.phone;
    dirty = true;
  }
  if (dirty) await staff.save();
  return staff;
}

async function resolvePatient(claims, { provisionPatient = false } = {}) {
  let patient = await Patient.findOne({ firebaseUid: claims.uid });

  // Merge guest history when the same mobile signs in with Firebase.
  if (!patient && claims.phone) {
    patient = await Patient.findOne({ phone: claims.phone });
    if (patient) {
      patient.firebaseUid = claims.uid;
      if (claims.email && !patient.email) patient.email = claims.email;
      if (claims.name && (!patient.name || patient.name === 'Guest')) patient.name = claims.name;
      await patient.save();
    }
  }

  if (!patient && provisionPatient) {
    patient = await Patient.create({
      firebaseUid: claims.uid,
      name: claims.name || 'Guest',
      email: claims.email || undefined,
      phone: claims.phone || undefined,
    });
  }

  return patient;
}

async function resolveIdentity(claims, { provisionPatient = false } = {}) {
  const staff = await resolveStaff(claims);
  if (staff) {
    return { type: 'staff', staff, claims };
  }

  const patient = await resolvePatient(claims, { provisionPatient });
  return { type: 'patient', patient, claims };
}

export function authenticate(opts = {}) {
  return async (req, _res, next) => {
    try {
      const token = readBearer(req);
      if (!token) throw ApiError.unauthenticated();
      const claims = await resolveClaims(token);
      req.auth = await resolveIdentity(claims, { provisionPatient: opts.provisionPatient ?? true });
      if (req.auth.type === 'patient' && !req.auth.patient) {
        throw ApiError.unauthenticated('Patient profile not found.');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export async function optionalAuth(req, _res, next) {
  try {
    const token = readBearer(req);
    if (!token) {
      req.auth = { type: 'guest' };
      return next();
    }
    try {
      const claims = await resolveClaims(token);
      req.auth = await resolveIdentity(claims, { provisionPatient: true });
    } catch {
      req.auth = { type: 'guest' };
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requirePatient(req, _res, next) {
  if (req.auth?.type !== 'patient' || !req.auth.patient) {
    return next(ApiError.forbidden(null, 'This action is for patient accounts.'));
  }
  next();
}

export function requireModule(key) {
  return (req, _res, next) => {
    if (req.auth?.type !== 'staff') {
      return next(ApiError.forbidden(key, 'Staff access required.'));
    }
    if (!req.auth.staff.grantedModules.includes(key)) {
      return next(ApiError.forbidden(key));
    }
    next();
  };
}
