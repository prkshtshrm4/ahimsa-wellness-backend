import mongoose from 'mongoose';
import env from './env.js';

mongoose.set('strictQuery', true);

export async function connectDb() {
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 15000,
  });
  const { host, name } = mongoose.connection;
  console.log(`✓ MongoDB connected (${host}/${name})`);
  return mongoose.connection;
}

export default mongoose;
