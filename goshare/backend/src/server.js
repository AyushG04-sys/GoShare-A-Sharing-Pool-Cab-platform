import app from './app.js';
import config from './config/env.js';

const PORT = config.port;

// Server bootstrap
const server = app.listen(PORT, () => {
  console.log(`🚀 GoShare Backend API listening on http://localhost:${PORT}`);
  console.log(`📡 Environment: ${config.nodeEnv}`);
});

// Unhandled exception and rejection handlers for production stability
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received. Closing HTTP server gracefully.');
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received. Closing HTTP server.');
  server.close(() => {
    process.exit(0);
  });
});

export default server;
