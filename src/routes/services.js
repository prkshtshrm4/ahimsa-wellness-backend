import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import Service from '../models/Service.js';
import { computeAvailability } from '../utils/slots.js';
import ApiError from '../utils/ApiError.js';

const router = Router();

function serializeService(s) {
  return {
    _id: s._id,
    kind: s.kind || 'service',
    visitCount: s.visitCount || 1,
    inclusions: s.inclusions || [],
    includedServices: s.includedServices || [],
    packageOnly: s.packageOnly === true,
    name: s.name,
    category: s.category,
    blurb: s.blurb,
    priceInPaise: s.priceInPaise,
    durationMin: s.durationMin,
    capacity: s.capacity,
    capacityUnit: s.capacityUnit,
    therapistId: s.therapistId,
    therapistName: s.therapistName,
    room: s.room,
    active: s.active,
  };
}

// GET /services — public catalogue (active only). Staff with services.manage
// may pass ?includeInactive=true to power the admin Services table.
router.get(
  '/services',
  optionalAuth,
  asyncHandler(listServices)
);

// GET /services/:serviceId/availability?date=YYYY-MM-DD — per-slot remaining.
router.get(
  '/services/:serviceId/availability',
  asyncHandler(serviceAvailability)
);

export { serializeService };
export default router;

export async function listServices(req, res) {
    const includeInactive =
      req.query.includeInactive === 'true' &&
      req.auth?.type === 'staff' &&
      req.auth.staff.grantedModules.includes('services.manage');

    const filter = includeInactive ? {} : { active: true, packageOnly: { $ne: true } };
    if (req.query.kind === 'service') filter.kind = { $ne: 'package' };
    if (req.query.kind === 'package') filter.kind = 'package';
    const services = await Service.find(filter).sort({ category: 1, name: 1 }).lean();
    res.json({ services: services.map(serializeService) });
}

export async function serviceAvailability(req, res) {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw ApiError.validation(['date'], 'A valid date (YYYY-MM-DD) is required.');
    }
    const service = await Service.findById(req.params.serviceId);
    if (!service || !service.active || service.packageOnly) throw ApiError.notFound('Service not found.');

    const slots = await computeAvailability(service, date);
    res.json({ serviceId: service._id, date, capacity: service.capacity, slots });
}
