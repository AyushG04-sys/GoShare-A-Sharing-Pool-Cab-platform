import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import config from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { NotFoundError } from './utils/errors.js';

// Route imports
import authRoutes from './routes/auth.routes.js';
import bookingRoutes from './routes/booking.routes.js';
import driverRoutes from './routes/driver.routes.js';
import adminRoutes from './routes/admin.routes.js';
import sosRoutes from './routes/sos.routes.js';
import ratingRoutes from './routes/rating.routes.js';

const app = express();

// Disable ETag caching to prevent 304 Not Modified polling loops on real-time ride states
app.set('etag', false);

// Prevent browser/proxy caching for real-time API endpoints
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Parse CORS allowed origins: supports comma-separated list, '*', or single URL
const getCorsOriginSetting = () => {
  const raw = config.corsOrigin;
  if (!raw || raw === '*') {
    return true; // reflects origin dynamically for credentials support
  }
  const origins = raw.split(',').map((o) => o.trim()).filter(Boolean);
  return origins.length === 1 ? origins[0] : origins;
};

// Global middleware
app.use(
  cors({
    origin: getCorsOriginSetting(),
    credentials: true,
  })
);
app.use(express.json());

if (!config.isTest) {
  app.use(morgan(config.isDev ? 'dev' : 'combined'));
}

// Health check endpoints for cloud load balancers & monitoring
const healthResponse = (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'GoShare Ride-Sharing API',
    version: '1.0.0',
    env: config.nodeEnv,
  });
};

app.get('/health', healthResponse);
app.get('/api/health', healthResponse);
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'GoShare Ride-Sharing Backend API is live.',
    health: '/health',
    version: '1.0.0',
  });
});

// Mount modular API routes
app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/sos', sosRoutes);
app.use('/api/ratings', ratingRoutes);

// Catch 404 for undefined routes
app.use((req, res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
});

// Centralized error handling
app.use(errorHandler);

export default app;
