import { Router } from 'express';
import { authenticate, optionalAuth, requireModule, requirePatient } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import Service from '../models/Service.js';
import Booking from '../models/Booking.js';
import { serializeService } from './services.js';
import { createPackageVisitHandlers } from '../services/packageVisits.js';
import { createPackageHandlers } from '../services/packageService.js';

const router = Router();
const handlers = createPackageHandlers({ Service, Booking, serialize: serializeService });
router.get('/packages', optionalAuth, asyncHandler(handlers.list));
router.get('/admin/packages', authenticate(), requireModule('services.manage'), asyncHandler((req, res) => {
  req.query.includeInactive = 'true';
  return handlers.list(req, res);
}));
router.post('/admin/packages', authenticate(), requireModule('services.manage'), asyncHandler(handlers.create));
router.patch('/admin/packages/:id', authenticate(), requireModule('services.manage'), asyncHandler(handlers.update));
router.delete('/admin/packages/:id', authenticate(), requireModule('services.manage'), asyncHandler(handlers.remove));
const visits = createPackageVisitHandlers({ Booking, Service });
router.get('/me/packages', authenticate(), requirePatient, asyncHandler(visits.list));
router.get('/me/packages/:id/availability', authenticate(), requirePatient, asyncHandler(visits.availability));
router.post('/me/packages/:id/visits', authenticate(), requirePatient, asyncHandler(visits.book));
export default router;
