import 'dotenv/config';
import mongoose from 'mongoose';
import { Event } from '../models/event.model';

async function main() {
  await mongoose.connect(process.env.MONGODB_URL!);

  const events = await Event.find({
    type: 'attempt.succeeded',
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  console.log(JSON.stringify(events, null, 2));

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});