import mongoose from 'mongoose';

export async function connectMongoDB() {
  const mongoUrl = process.env.MONGODB_URL;

  if (!mongoUrl) {
    throw new Error('MONGODB_URL is not configured');
  }

  await mongoose.connect(mongoUrl);

  console.log('MongoDB connected');
}

export async function disconnectMongoDB() {
  await mongoose.disconnect();
}