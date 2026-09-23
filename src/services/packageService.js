import ApiError from '../utils/ApiError.js';

// Packages share appointment/payment mechanics with services, but are managed separately.
export function validatePackage(input, { partial = false } = {}) {
  const fields = [], result = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw ApiError.validation(['body']);
  const allowed = ['name', 'blurb', 'priceInPaise', 'durationMin', 'capacity', 'inclusions', 'active', 'visitCount', 'serviceIds', 'enquiryOnly', 'priceLabel'];
  for (const key of Object.keys(input)) if (!allowed.includes(key)) fields.push(key);
  for (const [key, max] of [['name', 120], ['blurb', 1200]]) {
    if (partial && input[key] === undefined) continue;
    const value = input[key];
    if (typeof value !== 'string' || (key === 'name' && !value.trim()) || value.length > max) fields.push(key);
    else result[key] = value.trim();
  }
  for (const [key, min, max] of [['priceInPaise', 1, 100000000], ['durationMin', 5, 600], ['capacity', 1, 100], ['visitCount', 1, 365]]) {
    if (partial && input[key] === undefined) continue;
    if (!Number.isSafeInteger(input[key]) || input[key] < min || input[key] > max) fields.push(key);
    else result[key] = input[key];
  }
  if (!partial || input.inclusions !== undefined) {
    const items = input.inclusions;
    if (!Array.isArray(items) || items.length > 20 || items.some(x => typeof x !== 'string' || !x.trim() || x.length > 200)) fields.push('inclusions');
    else result.inclusions = items.map(x => x.trim());
  }
  if (input.serviceIds !== undefined) {
    if (!Array.isArray(input.serviceIds) || input.serviceIds.length > 50 || input.serviceIds.some(id => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) || new Set(input.serviceIds.map(id => String(id).toLowerCase())).size !== input.serviceIds.length) fields.push('serviceIds');
    else result.serviceIds = input.serviceIds;
  }
  if (input.priceLabel !== undefined) {
    if (typeof input.priceLabel !== 'string' || input.priceLabel.length > 200) fields.push('priceLabel');
    else result.priceLabel = input.priceLabel.trim();
  }
  if (input.enquiryOnly !== undefined) {
    if (typeof input.enquiryOnly !== 'boolean') fields.push('enquiryOnly');
    else result.enquiryOnly = input.enquiryOnly;
  }
  if (input.active !== undefined) {
    if (typeof input.active !== 'boolean') fields.push('active');
    else result.active = input.active;
  }
  if (fields.length) throw ApiError.validation([...new Set(fields)], 'Check the package details. Price, duration and capacity must be valid whole numbers.');
  if (partial && !Object.keys(result).length) throw ApiError.validation(['body'], 'Provide at least one package field.');
  return result;
}

export function createPackageHandlers({ Service, Booking, serialize }) {
  const idFilter = id => {
    if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) throw ApiError.validation(['id']);
    return { _id: id, kind: 'package' };
  };
  async function resolveMembers(body, existing = {}) {
    if (body.serviceIds !== undefined) {
      const previous = new Set((existing.includedServices || []).map(s => String(s.serviceId)));
      const rows = await Service.find({ _id: { $in: body.serviceIds }, kind: { $ne: 'package' } }).lean();
      if (rows.length !== body.serviceIds.length || rows.some(s => !s.active && !previous.has(String(s._id)))) {
        throw ApiError.validation(['serviceIds'], 'Choose existing active services. Packages cannot contain other packages.');
      }
      body.includedServices = body.serviceIds.map(id => {
        const service = rows.find(s => String(s._id) === id.toLowerCase());
        return { serviceId: service._id, name: service.name, durationMin: service.durationMin };
      });
      delete body.serviceIds;
    }
    if (!(body.inclusions ?? existing.inclusions ?? []).length && !(body.includedServices ?? existing.includedServices ?? []).length) {
      throw ApiError.validation(['inclusions', 'serviceIds'], 'Select a service or add a package inclusion.');
    }
    return body;
  }
  return {
    list: async (req, res) => {
      const includeInactive = req.query.includeInactive === 'true' && req.auth?.type === 'staff' && req.auth.staff.grantedModules.includes('services.manage');
      const rows = await Service.find({ kind: 'package', ...(includeInactive ? {} : { active: true }) }).sort({ name: 1 }).lean();
      res.json({ packages: rows.map(serialize) });
    },
    create: async (req, res) => {
      const body = await resolveMembers(validatePackage(req.body));
      const row = await Service.create({ ...body, kind: 'package', category: 'WELLNESS PACKAGES', capacityUnit: 'appointments' });
      res.status(201).json({ package: serialize(row) });
    },
    update: async (req, res) => {
      const filter = idFilter(req.params.id);
      const existing = await Service.findOne(filter).lean();
      if (!existing) throw ApiError.notFound('Package not found.');
      const body = await resolveMembers(validatePackage(req.body, { partial: true }), existing);
      const row = await Service.findOneAndUpdate(filter, { $set: body }, { new: true, runValidators: true });
      if (!row) throw ApiError.notFound('Package not found.');
      res.json({ package: serialize(row) });
    },
    remove: async (req, res) => {
      const filter = idFilter(req.params.id);
      // Retain catalogue records used in any booking, including historical invoices.
      if (await Booking.exists({ serviceId: filter._id })) throw ApiError.conflict('package_in_use', 'This package has bookings. Deactivate it to keep the booking history.');
      const row = await Service.findOneAndDelete(filter);
      if (!row) throw ApiError.notFound('Package not found.');
      res.json({ deleted: true });
    },
  };
}
