import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import CaseSheet from '../src/models/CaseSheet.js';
import intakeRoutes from '../src/routes/intake.js';
import { errorHandler } from '../src/middleware/error.js';

let mongo;
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/v1', intakeRoutes);
app.use(errorHandler);

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('POST /v1/intake creates a case sheet with patient number', async () => {
  const res = await request(app)
    .post('/v1/intake')
    .send({
      name: 'Test Patient',
      phone: '9876543210',
      age: 34,
      gender: 'Female',
      complaintPhysical: 'Lower back pain',
      consentAccepted: true,
      consentSignedName: 'Test Patient',
    })
    .expect(201);

  assert.equal(res.body.ok, true);
  assert.match(res.body.caseSheet.patientNo, /^AWC-CS-\d{4}-\d{4}$/);
  assert.equal(res.body.caseSheet.name, 'Test Patient');
  assert.equal(await CaseSheet.countDocuments(), 1);
});

test('POST /v1/intake rejects missing consent', async () => {
  await request(app)
    .post('/v1/intake')
    .send({ name: 'No Consent', phone: '9876543211', consentAccepted: false })
    .expect(422);
});
