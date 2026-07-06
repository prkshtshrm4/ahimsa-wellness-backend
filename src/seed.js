import mongoose from 'mongoose';
import { connectDb } from './config/db.js';
import Service from './models/Service.js';
import Staff from './models/Staff.js';
import Patient from './models/Patient.js';
import Booking from './models/Booking.js';
import Payment from './models/Payment.js';
import Invoice from './models/Invoice.js';
import Counter from './models/Counter.js';

const ADMIN_PHONE = '+911234567890';

async function run() {
  await connectDb();
  console.log('Clearing existing data…');
  await Promise.all([
    Service.deleteMany({}),
    Staff.deleteMany({}),
    Patient.deleteMany({}),
    Booking.deleteMany({}),
    Payment.deleteMany({}),
    Invoice.deleteMany({}),
    Counter.deleteMany({}),
  ]);

  console.log('Seeding admin staff…');
  await Staff.create({
    name: 'Admin',
    email: 'admin@ahimsa.in',
    phone: ADMIN_PHONE,
    role: 'Admin / Owner',
    grantedModules: [
      'bookings.read', 'bookings.create', 'bookings.manage', 'services.manage',
      'staff.manage', 'payments.collect', 'payments.link', 'invoices.read',
      'schedule.own', 'reports.read',
    ],
  });

  console.log('Seeding services…');
  await Service.create([
    { name: 'Mud Therapy', category: 'HYDRO & MUD THERAPY', blurb: 'Cooling full-body mud pack to draw out heat.', priceInPaise: 80000, durationMin: 45, capacity: 2, capacityUnit: 'tubs', therapistName: 'Therapist on duty', room: 'Mud Bay 1' },
    { name: 'Hydrotherapy', category: 'HYDRO & MUD THERAPY', blurb: 'Guided water-pressure therapy for circulation & relief.', priceInPaise: 90000, durationMin: 45, capacity: 2, capacityUnit: 'rooms', therapistName: 'Therapist on duty', room: 'Hydro 1' },
    { name: 'Sauna / Air Therapy', category: 'HEAT & LIGHT', blurb: 'Dry-heat detox to loosen the body and calm the mind.', priceInPaise: 60000, durationMin: 30, capacity: 4, capacityUnit: 'seats', therapistName: 'Therapist on duty', room: 'Cabin 2' },
    { name: 'Sun / Chromotherapy', category: 'HEAT & LIGHT', blurb: 'Colour-light therapy to rebalance energy and mood.', priceInPaise: 55000, durationMin: 30, capacity: 3, capacityUnit: 'beds', therapistName: 'Therapist on duty', room: 'Light Room' },
    { name: 'Yoga', category: 'MOVEMENT & MIND', blurb: 'Therapeutic guided practice for breath and mobility.', priceInPaise: 40000, durationMin: 60, capacity: 8, capacityUnit: 'mats', therapistName: 'Yoga instructor', room: 'Yoga Hall' },
    { name: 'Physiotherapy', category: 'MOVEMENT & MIND', blurb: 'One-on-one rehab for pain, posture and recovery.', priceInPaise: 120000, durationMin: 45, capacity: 2, capacityUnit: 'rooms', therapistName: 'Physiotherapist', room: 'Physio 1' },
    { name: 'Ayurveda / Panchkarma', category: 'AYURVEDA & CLINICAL', blurb: 'Classical detox & rejuvenation therapy under supervision.', priceInPaise: 250000, durationMin: 90, capacity: 2, capacityUnit: 'rooms', therapistName: 'Ayurveda physician', room: 'Panchkarma 1' },
    { name: 'Acupuncture', category: 'AYURVEDA & CLINICAL', blurb: 'Fine-needle therapy to restore flow and ease pain.', priceInPaise: 100000, durationMin: 45, capacity: 2, capacityUnit: 'rooms', therapistName: 'Clinic physician', room: 'Clinic 3' },
    { name: 'Magnetotherapy', category: 'AYURVEDA & CLINICAL', blurb: 'Targeted magnetic-field therapy for joints & healing.', priceInPaise: 70000, durationMin: 30, capacity: 3, capacityUnit: 'beds', therapistName: 'Clinic physician', room: 'Clinic 2' },
    { name: 'OPD Consultation', category: 'AYURVEDA & CLINICAL', blurb: 'Initial assessment with our naturopath.', priceInPaise: 100000, durationMin: 30, capacity: 4, capacityUnit: 'slots', therapistName: 'Naturopath', room: 'OPD' },
  ]);

  console.log('\n✓ Seed complete — services + admin only.');
  console.log(`  Admin mobile: ${ADMIN_PHONE}`);
  console.log('  Firebase: add this as a test phone with OTP 191001 (Authentication → Sign-in method → Phone).');
  console.log('  Staff sign-in: /staff/login → enter 1234567890 → OTP 191001');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
