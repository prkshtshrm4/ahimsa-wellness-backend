import mongoose from 'mongoose';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import env from '../src/config/env.js';
import Service from '../src/models/Service.js';
import Booking from '../src/models/Booking.js';

const catalogue = JSON.parse(await readFile(new URL('../src/data/brochure-catalogue.json', import.meta.url), 'utf8'));
const apply = process.argv.includes('--apply');
const normalize = name => name.trim().toLowerCase();
async function bookingDigest() {
  const hash = createHash('sha256');
  for await (const row of Booking.collection.find({}).sort({ _id: 1 })) hash.update(JSON.stringify(row));
  return hash.digest('hex');
}
try {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 15000 });
  const existing = await Service.find({}).lean();
  const matched = new Set();
  const operations = catalogue.rows.map(entry => {
    const names = [entry.name, ...entry.aliases].map(normalize);
    const candidates = existing.filter(s => s.catalogueKey === entry.catalogueKey || names.includes(normalize(s.name)));
    if (candidates.length > 1) throw new Error(`Ambiguous service match: ${entry.name}`);
    const current = candidates[0];
    if (current && matched.has(String(current._id))) throw new Error(`Duplicate service match: ${entry.name}`);
    if (current) matched.add(String(current._id));
    const { aliases, ...source } = entry;
    const value = {
      ...source, active: true, packageOnly: false,
      // Unknown scheduling data stays unavailable to online booking, never advertised as a brochure fact.
      durationMin: current?.durationMin || 30,
      capacity: current?.capacity || 1,
      capacityUnit: current?.capacityUnit || 'appointments',
      enquiryOnly: entry.enquiryOnly ?? current?.enquiryOnly ?? !current,
      visitCount: entry.visitCount || 1,
      inclusions: entry.inclusions || [],
      includedServices: current?.includedServices || [],
      priceLabel: entry.priceLabel || '',
    };
    return { current, value };
  });
  const retire = existing.filter(s => !matched.has(String(s._id)) && s.active !== false);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', update: operations.filter(o => o.current).map(o => o.value.name), create: operations.filter(o => !o.current).map(o => o.value.name), deactivate: retire.map(s => s.name) }, null, 2));
  if (apply) {
    const beforeBookings = await bookingDigest();
    const backupDir = new URL('../.local-backups/', import.meta.url);
    await mkdir(backupDir, { recursive: true, mode: 0o700 });
    const backup = new URL(`services-before-brochure-${Date.now()}.json`, backupDir);
    await writeFile(backup, JSON.stringify(existing, null, 2), { mode: 0o600, flag: 'wx' });
    // Validate all documents before the first write. Standalone MongoDB cannot use transactions.
    for (const { value } of operations) await new Service(value).validate();
    const topology = await mongoose.connection.db.admin().command({ hello: 1 });
    const transactional = Boolean(topology.setName || topology.msg === 'isdbgrid');
    const createdIds = [];
    const touched = [];
    async function applyWrites(session) {
      for (const { current, value } of operations) {
        if (current) {
          touched.push(current);
          await Service.updateOne({ _id: current._id }, { $set: value }, { session, runValidators: true });
        } else {
          const id = new mongoose.Types.ObjectId();
          createdIds.push(id);
          await Service.create([{ ...value, _id: id }], { session });
        }
      }
      touched.push(...retire);
      if (retire.length) await Service.updateMany({ _id: { $in: retire.map(s => s._id) } }, { $set: { active: false } }, { session });
    }
    if (transactional) {
      const session = await mongoose.startSession();
      try { await session.withTransaction(() => applyWrites(session)); }
      finally { await session.endSession(); }
    } else {
      console.log('Standalone MongoDB: using validated writes with catalogue backup and rollback on error.');
      try { await applyWrites(undefined); }
      catch (error) {
        // Restore only records touched by this import; no other collection is modified.
        for (const original of touched) await Service.collection.replaceOne({ _id: original._id }, original, { upsert: true });
        await Service.deleteMany({ _id: { $in: createdIds } });
        throw error;
      }
    }
    const actual = await Service.find({ active: true }).lean();
    for (const { value } of operations) {
      const row = actual.find(s => s.catalogueKey === value.catalogueKey);
      if (!row || row.priceInPaise !== value.priceInPaise || row.visitCount !== value.visitCount || JSON.stringify(row.inclusions) !== JSON.stringify(value.inclusions)) throw new Error(`Verification failed: ${value.name}`);
    }
    if (actual.length !== operations.length) throw new Error('Unexpected active catalogue count');
    console.log(JSON.stringify({ verified: true, activeServices: actual.filter(s => s.kind !== 'package').length, activePackages: actual.filter(s => s.kind === 'package').length, onlineBookable: actual.filter(s => !s.enquiryOnly).length, bookingsUnchanged: beforeBookings === await bookingDigest(), backup: backup.pathname }, null, 2));
  }
} catch (e) { console.error('Catalogue sync failed:', e.name, e.message?.includes('mongodb') ? 'Database connection or transaction error' : e.message); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
