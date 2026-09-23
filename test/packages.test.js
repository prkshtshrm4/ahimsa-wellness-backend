import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Service from '../src/models/Service.js';
import Booking from '../src/models/Booking.js';
import { serializeService, listServices, serviceAvailability } from '../src/routes/services.js';
import { createPackageHandlers, validatePackage } from '../src/services/packageService.js';
import { createPackageVisitHandlers, packageRemaining, validateVisitDate } from '../src/services/packageVisits.js';
import bookingRoutes, { createBooking } from '../src/routes/bookings.js';
import { cancelBooking } from '../src/routes/me.js';
import { requireModule, requirePatient } from '../src/middleware/auth.js';
import { asyncHandler, errorHandler } from '../src/middleware/error.js';

import { createService, updateService, deleteService } from '../src/routes/admin.js';
let mongo;
const patientId = new mongoose.Types.ObjectId();
const otherPatientId = new mongoose.Types.ObjectId();
const payload = { name: 'Ten-day care', blurb: 'A daily care plan', priceInPaise: 100000, durationMin: 60, capacity: 2, visitCount: 10, inclusions: ['Consultation', 'Guided care'], active: true };
const handlers = createPackageHandlers({ Service, Booking, serialize: serializeService });
const visits = createPackageVisitHandlers({ Booking, Service });
const app = express(); app.use(express.json());
// Test-only identities. Production routers always authenticate Firebase tokens.
app.use((req, _res, next) => {
  const role = req.get('x-test-role');
  req.auth = role === 'admin' ? { type: 'staff', staff: { grantedModules: ['services.manage'] } } : role === 'staff' ? { type: 'staff', staff: { grantedModules: [] } } : role === 'patient' || role === 'other' ? { type: 'patient', patient: { _id: role === 'patient' ? patientId : otherPatientId } } : { type: 'guest' };
  next();
});
app.get('/packages', asyncHandler(handlers.list));
app.post('/admin/packages', requireModule('services.manage'), asyncHandler(handlers.create));
app.patch('/admin/packages/:id', requireModule('services.manage'), asyncHandler(handlers.update));
app.delete('/admin/packages/:id', requireModule('services.manage'), asyncHandler(handlers.remove));
app.get('/me/packages', requirePatient, asyncHandler(visits.list));
app.get('/me/packages/:id/availability', requirePatient, asyncHandler(visits.availability));
app.post('/me/packages/:id/visits', requirePatient, asyncHandler(visits.book));
app.post('/me/bookings/:id/cancel', requirePatient, asyncHandler(cancelBooking));
app.post('/bookings', asyncHandler(createBooking));
app.get('/services', asyncHandler(listServices));
app.get('/services/:serviceId/availability', asyncHandler(serviceAvailability));
app.post('/admin/services', requireModule('services.manage'), asyncHandler(createService));
app.patch('/admin/services/:id', requireModule('services.manage'), asyncHandler(updateService));
app.delete('/admin/services/:id', requireModule('services.manage'), asyncHandler(deleteService));
app.use(bookingRoutes);
app.use(errorHandler);
const admin = method => method.set('x-test-role', 'admin');
const patient = method => method.set('x-test-role', 'patient');

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => { await Service.deleteMany({}); await Booking.deleteMany({}); });
async function purchase({ count = 2, paid = true, capacity = 2 } = {}) {
  const service = await Service.create({ ...payload, visitCount: count, capacity, kind: 'package', category: 'WELLNESS PACKAGES' });
  const booking = await Booking.create({ reference: `TEST-${Date.now()}-${Math.random()}`, patientId, patientSnapshot: { name: 'Test Patient' }, serviceId: service._id, serviceSnapshot: { ...serializeService(service) }, date: '2035-01-01', startTime: '09:00', status: 'confirmed', cancellableUntil: new Date('2034-12-31'), amounts: { totalInPaise: 100000, paidInPaise: paid ? 100000 : 0, balanceInPaise: paid ? 0 : 100000 } });
  return { service, booking };
}

test('admin creates, edits, deactivates and deletes a package; public sees active only', async () => {
  let result = await admin(request(app).post('/admin/packages')).send(payload).expect(201);
  const id = result.body.package._id;
  assert.equal(result.body.package.visitCount, 10);
  assert.equal((await request(app).get('/packages').expect(200)).body.packages.length, 1);
  result = await admin(request(app).patch(`/admin/packages/${id}`)).send({ name: 'Two-day care', visitCount: 2, active: false }).expect(200);
  assert.equal(result.body.package.visitCount, 2);
  assert.equal((await request(app).get('/packages?includeInactive=true')).body.packages.length, 0);
  assert.equal((await admin(request(app).get('/packages?includeInactive=true'))).body.packages.length, 1);
  await admin(request(app).delete(`/admin/packages/${id}`)).expect(200);
  assert.equal(await Service.countDocuments(), 0);
});

test('unauthorized users cannot manage packages; invalid data and service IDs are rejected', async () => {
  for (const role of ['guest', 'patient', 'staff']) await request(app).post('/admin/packages').set('x-test-role', role).send(payload).expect(403);
  for (const invalid of [{ priceInPaise: -1 }, { visitCount: 0 }, { visitCount: 1.5 }, { durationMin: 601 }, { capacity: 1.2 }, { inclusions: [] }, { kind: 'service' }, { active: 'false' }]) await admin(request(app).post('/admin/packages')).send({ ...payload, ...invalid }).expect(422);
  await admin(request(app).patch('/admin/packages/nope')).send({ name: 'x' }).expect(422);
  const service = await Service.create({ ...payload, kind: 'service', category: 'Yoga' });
  await admin(request(app).patch(`/admin/packages/${service._id}`)).send({ name: 'Wrong' }).expect(404);
  await admin(request(app).delete(`/admin/packages/${service._id}`)).expect(404);
});

test('booked packages retain history and purchase terms when catalogue changes', async () => {
  const { service, booking } = await purchase({ count: 10 });
  await admin(request(app).delete(`/admin/packages/${service._id}`)).expect(409);
  await admin(request(app).patch(`/admin/packages/${service._id}`)).send({ visitCount: 2, active: false, priceInPaise: 200000 }).expect(200);
  const stored = await Booking.findById(booking._id);
  assert.equal(stored.serviceSnapshot.visitCount, 10);
  assert.equal(stored.serviceSnapshot.priceInPaise, 100000);
  await patient(request(app).post(`/me/packages/${booking._id}/visits`)).send({ date: '2035-01-02', startTime: '09:00' }).expect(201);
});

test('remaining visits are atomically claimed with no second payment', async () => {
  const { booking } = await purchase({ count: 2 });
  const results = await Promise.all(['2035-01-02', '2035-01-03'].map(date => patient(request(app).post(`/me/packages/${booking._id}/visits`)).send({ date, startTime: '09:00' })));
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  const child = await Booking.findOne({ packagePurchaseId: booking._id });
  assert.equal(child.amounts.totalInPaise, 0);
  assert.equal(child.status, 'confirmed');
  assert.equal(packageRemaining(await Booking.findById(booking._id)), 0);
  assert.equal((await patient(request(app).get('/me/packages'))).body.packages[0].remainingVisits, 0);
});

test('same-day duplicates, invalid dates, unauthorized ownership and unpaid packages are rejected', async () => {
  const { booking } = await purchase({ count: 10 });
  await request(app).get(`/me/packages/${booking._id}/availability?date=2035-01-02`).expect(403);
  await request(app).post(`/me/packages/${booking._id}/visits`).set('x-test-role', 'other').send({ date: '2035-01-02', startTime: '09:00' }).expect(404);
  for (const date of ['2035-01-01', '2035-99-99', '2035-02-30']) await patient(request(app).post(`/me/packages/${booking._id}/visits`)).send({ date, startTime: '09:00' }).expect(422);
  await patient(request(app).post(`/me/packages/${booking._id}/visits`)).send({ date: '2035-01-02', startTime: '03:15' }).expect(422);
  await patient(request(app).post(`/me/packages/${booking._id}/visits`)).send({ date: '2035-01-02', startTime: '09:00' }).expect(201);
  await patient(request(app).post(`/me/packages/${booking._id}/visits`)).send({ date: '2035-01-02', startTime: '10:00' }).expect(409);
  const unpaid = await purchase({ paid: false });
  await patient(request(app).post(`/me/packages/${unpaid.booking._id}/visits`)).send({ date: '2035-01-02', startTime: '09:00' }).expect(409);
});

test('cancelling an included visit returns one credit, including repeated requests', async () => {
  const { booking } = await purchase();
  const booked = await patient(request(app).post(`/me/packages/${booking._id}/visits`)).send({ date: '2035-01-02', startTime: '09:00' }).expect(201);
  for (let i=0;i<2;i++) await patient(request(app).post(`/me/bookings/${booked.body.booking._id}/cancel`)).expect(200);
  assert.equal(packageRemaining(await Booking.findById(booking._id)), 1);
  await patient(request(app).post(`/me/bookings/${booking._id}/cancel`)).expect(409);
  await patient(request(app).post(`/me/packages/${booking._id}/visits`)).send({ date: '2035-01-03', startTime: '09:00' }).expect(201);
});

test('full slots do not spend a package credit', async () => {
  const { booking, service } = await purchase({ capacity: 1 });
  await Booking.create({ reference: 'FULL-SLOT', serviceId: service._id, date: '2035-01-02', startTime: '09:00', status: 'confirmed' });
  await patient(request(app).post(`/me/packages/${booking._id}/visits`)).send({ date: '2035-01-02', startTime: '09:00' }).expect(409);
  assert.equal(packageRemaining(await Booking.findById(booking._id)), 1);
});


test('initial package purchase uses the full price once and snapshots its visit count', async () => {
  const service = await Service.create({ ...payload, kind: 'package', category: 'WELLNESS PACKAGES' });
  const body = { serviceId: service.id, date: '2035-01-01', startTime: '09:00', paymentMode: 'atVisit', patientDetails: { name: 'QA Patient', phone: '+919999999999' } };
  await request(app).post('/bookings').send(body).expect(401);
  await patient(request(app).post('/bookings')).send({ ...body, date: '2035-02-30' }).expect(422);
  const result = await patient(request(app).post('/bookings')).send(body).expect(201);
  const stored = await Booking.findById(result.body.booking._id);
  assert.equal(stored.serviceSnapshot.visitCount, 10);
  assert.equal(stored.amounts.totalInPaise, payload.priceInPaise);
  assert.equal(packageRemaining(stored), 9);
  assert.equal((await patient(request(app).get('/me/packages'))).body.packages[0].paid, false);
});


test('an unrelated payment order cannot activate a package', async () => {
  const { booking } = await purchase({ paid: false });
  await request(app).post(`/bookings/${booking._id}/payment/verify`).send({ razorpayOrderId: 'unrelated', razorpayPaymentId: 'unrelated', razorpaySignature: 'test' }).expect(402);
  assert.equal((await Booking.findById(booking._id)).amounts.balanceInPaise, 100000);
});


test('package-only services are selectable by admins but cannot be individually booked', async () => {
  const created = await admin(request(app).post('/admin/services')).send({ name: 'Included yoga', category: 'Yoga', priceInPaise: 0, durationMin: 30, capacity: 3, packageOnly: true }).expect(201);
  const id = created.body.service._id;
  assert.equal((await request(app).get('/services')).body.services.length, 0);
  assert.equal((await request(app).get('/services?includeInactive=true')).body.services.length, 0);
  assert.equal((await admin(request(app).get('/services?includeInactive=true'))).body.services[0].packageOnly, true);
  await request(app).get(`/services/${id}/availability?date=2035-01-01`).expect(404);
  await patient(request(app).post('/bookings')).send({ serviceId: id, date: '2035-01-01', startTime: '09:00', paymentMode: 'atVisit' }).expect(404);
  const result = await admin(request(app).post('/admin/packages')).send({ ...payload, inclusions: [], serviceIds: [id] }).expect(201);
  assert.equal(result.body.package.includedServices[0].name, 'Included yoga');
  await admin(request(app).delete(`/admin/services/${id}`)).expect(409);
  await admin(request(app).patch(`/admin/services/${id}`)).send({ active: false }).expect(200);
  await admin(request(app).patch(`/admin/packages/${result.body.package._id}`)).send({ serviceIds: [id], name: 'Retained inclusion' }).expect(200);
  await admin(request(app).post('/admin/packages')).send({ ...payload, serviceIds: [id] }).expect(422);
});

test('package membership rejects malformed, duplicate, missing and nested package IDs', async () => {
  const service = await Service.create({ ...payload, kind: 'service', category: 'Yoga' });
  const pkg = await Service.create({ ...payload, kind: 'package', category: 'Plans' });
  for (const serviceIds of [['bad'], [service.id, service.id], [new mongoose.Types.ObjectId().toString()], [pkg.id], 'bad']) {
    await admin(request(app).post('/admin/packages')).send({ ...payload, serviceIds }).expect(422);
  }
});

test('purchase and included visits retain selected services after catalogue edits', async () => {
  const service = await Service.create({ ...payload, kind: 'service', category: 'Yoga', name: 'Original yoga' });
  const pkg = await admin(request(app).post('/admin/packages')).send({ ...payload, inclusions: [], serviceIds: [service.id] }).expect(201);
  const first = await patient(request(app).post('/bookings')).send({ serviceId: pkg.body.package._id, date: '2035-01-01', startTime: '09:00', paymentMode: 'atVisit', patientDetails: { name: 'Patient', phone: '+919999999999' } }).expect(201);
  await Booking.updateOne({ _id: first.body.booking._id }, { $set: { status: 'confirmed', 'amounts.balanceInPaise': 0, 'amounts.paidInPaise': payload.priceInPaise } });
  await Service.updateOne({ _id: service._id }, { $set: { name: 'Renamed yoga' } });
  await admin(request(app).patch(`/admin/packages/${pkg.body.package._id}`)).send({ serviceIds: [], inclusions: ['Different care'] }).expect(200);
  const next = await patient(request(app).post(`/me/packages/${first.body.booking._id}/visits`)).send({ date: '2035-01-02', startTime: '09:00' }).expect(201);
  const stored = await Booking.findById(next.body.booking._id);
  assert.equal(stored.serviceSnapshot.includedServices[0].name, 'Original yoga');
  assert.equal(String(stored.serviceSnapshot.includedServices[0].serviceId), service.id);
});
