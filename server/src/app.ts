import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import studentRoutes from './routes/student.routes';
import attemptRoutes from './routes/attempt.routes';

export const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  })
);

app.use(express.json({ limit: '100kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/students', studentRoutes);
app.use('/api', attemptRoutes);