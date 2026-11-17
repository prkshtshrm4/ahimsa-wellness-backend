import mongoose from 'mongoose';

/**
 * Drive / centre intake case sheet.
 * Patient-facing fields come from the QR mobile form.
 * Clinical fields (diagnosis*) are filled later by staff with cases.manage.
 */
const caseSheetSchema = new mongoose.Schema(
  {
    patientNo: { type: String, required: true, unique: true, index: true },
    // Demographics
    name: { type: String, required: true, trim: true },
    gender: { type: String, trim: true, default: '' },
    age: { type: Number },
    occupation: { type: String, trim: true, default: '' },
    maritalStatus: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    phone: { type: String, required: true, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true, default: '' },
    identificationCard: { type: String, trim: true, default: '' },
    dateOfAdmission: { type: String, trim: true, default: '' }, // YYYY-MM-DD
    dateOfDischarge: { type: String, trim: true, default: '' },

    // Present complaints
    complaintPhysical: { type: String, trim: true, default: '' },
    complaintMental: { type: String, trim: true, default: '' },
    complaintSocial: { type: String, trim: true, default: '' },
    complaintSexual: { type: String, trim: true, default: '' },

    // Habits & history
    addictions: { type: String, trim: true, default: '' },
    dietaryHabits: { type: String, trim: true, default: '' },
    sleepHabits: { type: String, trim: true, default: '' },
    pastHistory: { type: String, trim: true, default: '' },
    investigationsDone: { type: String, trim: true, default: '' },
    medicationsAtPresent: { type: String, trim: true, default: '' },

    // Doctor-only clinical
    facialDiagnosis: { type: String, trim: true, default: '' },
    irisDiagnosis: { type: String, trim: true, default: '' },
    pulseDiagnosis: { type: String, trim: true, default: '' },
    navelDiagnosis: { type: String, trim: true, default: '' },
    tongueDiagnosis: { type: String, trim: true, default: '' },
    provisionalDiagnosis: { type: String, trim: true, default: '' },
    finalDiagnosis: { type: String, trim: true, default: '' },
    assignedDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', default: null },
    assignedDoctorName: { type: String, trim: true, default: '' },

    // Consent
    consentAccepted: { type: Boolean, required: true, default: false },
    consentSignedName: { type: String, trim: true, default: '' },
    consentSignedAt: { type: Date },
    consentSignatureDataUrl: { type: String, default: '' }, // optional canvas PNG data URL

    source: { type: String, enum: ['qr', 'frontDesk', 'web'], default: 'qr' },
    status: {
      type: String,
      enum: ['submitted', 'reviewed', 'closed'],
      default: 'submitted',
      index: true,
    },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

caseSheetSchema.index({ name: 'text', phone: 'text', patientNo: 'text' });

export default mongoose.model('CaseSheet', caseSheetSchema);
