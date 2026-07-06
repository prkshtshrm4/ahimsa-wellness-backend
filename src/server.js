import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import env from './config/env.js';
import { connectDb } from './config/db.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import { isLive } from './utils/razorpay.js';

import authRoutes from './routes/auth.js';
import serviceRoutes from './routes/services.js';
import bookingRoutes from './routes/bookings.js';
import meRoutes from './routes/me.js';
import invoiceRoutes from './routes/invoices.js';
import adminRoutes from './routes/admin.js';
import webhookRoutes from './routes/webhooks.js';

const app = express();

const corsOrigin =
  env.allowedOrigins === '*' ? true : env.allowedOrigins;

app.use(
  cors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(morgan('dev'));
// Capture raw body so the Razorpay webhook can verify its signature.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);

app.get('/health', (_req, res) =>
  res.json({
    ok: true,
    service: 'ahimsa-wellness-api',
    authMode: env.authMode,
    razorpay: isLive ? 'live' : 'mock',
    time: new Date().toISOString(),
  })
);

const v1 = express.Router();
v1.use(authRoutes);
v1.use(serviceRoutes);
v1.use(bookingRoutes);
v1.use(meRoutes);
v1.use(invoiceRoutes);
v1.use(adminRoutes);
v1.use(webhookRoutes);
app.use('/v1', v1);

app.use(notFoundHandler);
app.use(errorHandler);

async function start() {
  try {
    await connectDb();
    app.listen(env.port, () => {
      console.log(`✓ Ahimsa API listening on http://localhost:${env.port}`);
      console.log(`  auth mode: ${env.authMode} · razorpay: ${isLive ? 'live' : 'mock'}`);
      if (env.allowedOrigins !== '*') {
        console.log(`  CORS origins: ${env.allowedOrigins.join(', ')}`);
      }
    });
  } catch (err) {
    console.error('✗ Failed to start server:', err.message);
    process.exit(1);
  }
}

start();

export default app;
