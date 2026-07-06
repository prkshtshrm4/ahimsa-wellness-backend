import dotenv from 'dotenv';

dotenv.config();

const env = {
  port: Number(process.env.PORT || 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  mongoUri:
    process.env.MONGODB_URI ||
    'mongodb://127.0.0.1:27017/ahimsa',
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || 'ahimsa-wellness',
  authMode: (process.env.AUTH_MODE || 'hybrid').toLowerCase(), // firebase | dev | hybrid
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
};

env.razorpayLive = Boolean(env.razorpay.keyId && env.razorpay.keySecret);

export default env;
