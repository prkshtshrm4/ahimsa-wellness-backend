/**
 * One-time: grant cases.manage to every active staff member who already
 * has staff.manage (owners/admins). Safe to re-run.
 *
 *   node scripts/grant-cases-manage.mjs
 *   railway run node scripts/grant-cases-manage.mjs
 */
import mongoose from 'mongoose';
import { connectDb } from '../src/config/db.js';
import Staff from '../src/models/Staff.js';

await connectDb();

const result = await Staff.updateMany(
  { active: true, grantedModules: { $all: ['staff.manage'], $nin: ['cases.manage'] } },
  { $addToSet: { grantedModules: 'cases.manage' } }
);

console.log(`✓ Granted cases.manage to ${result.modifiedCount} admin(s).`);
await mongoose.disconnect();
