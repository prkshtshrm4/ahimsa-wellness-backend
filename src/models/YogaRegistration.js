import mongoose from 'mongoose';

const SLOTS = ['7-8am', '8-9am', '4-5pm'];
const GENDERS = ['female', 'male', 'other', 'prefer_not_to_say'];

const yogaRegistrationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    whatsapp: { type: String, required: true, trim: true, index: true },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
    slots: {
      type: [{ type: String, enum: SLOTS }],
      validate: {
        validator(v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: 'Select at least one slot.',
      },
    },
    gender: { type: String, required: true, enum: GENDERS },
    source: { type: String, default: 'web' },
  },
  { timestamps: true }
);

export const YOGA_SLOTS = SLOTS;
export const YOGA_GENDERS = GENDERS;
export default mongoose.model('YogaRegistration', yogaRegistrationSchema);
