import 'dotenv/config';
import { app } from './app';
import { connectMongoDB } from './config/mongodb';
import { publishPendingOutboxEvents } from './services/outbox.service';

const port = Number(process.env.PORT ?? 4000);

async function startServer() {
  try {
    await connectMongoDB();
    await publishPendingOutboxEvents();

setInterval(async () => {
  try {
    await publishPendingOutboxEvents();
  } catch (error) {
    console.error('Outbox publisher failed:', error);
  }
}, 5000);

    app.listen(port, () => {
      console.log(`API listening on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();