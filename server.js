/**
 * server.js
 *
 * DRDO FDR Backend — Main entry point
 *
 * Starts an Express HTTP server that exposes four endpoints:
 *
 *   POST   /api/upload-flight          Upload a CSV flight data file
 *   GET    /api/flight/:id/telemetry   Retrieve telemetry frames for replay
 *   GET    /api/flight/:id/events      Retrieve detected flight events
 *   GET    /api/flights                List all uploaded missions
 *   GET    /api/flight/:id             Get single flight metadata
 *   DELETE /api/flight/:id             Delete a flight
 *
 * The server is structured for easy future extension to WebSockets
 * and live telemetry streaming (Section 11 of the FDR requirements).
 */

'use strict';

require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const path         = require('path');

// Routes
const uploadRoute    = require('./routes/upload');
const telemetryRoute = require('./routes/telemetry');
const eventsRoute    = require('./routes/events');
const flightsRoute   = require('./routes/flights');

// Middleware
const errorHandler = require('./middleware/errorHandler');

// Store (must be initialised before any request is handled)
const flightStore = require('./services/flightStore');

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app  = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// ---------------------------------------------------------------------------
// CORS
// Allow the React frontend origin (set CORS_ORIGIN in .env).
// In production, restrict this to the exact frontend URL.
// ---------------------------------------------------------------------------
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      callback(new Error(`CORS: origin "${origin}" not allowed.`));
    },
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ---------------------------------------------------------------------------
// Body parsers
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Request logger (lightweight — replace with morgan in production)
// ---------------------------------------------------------------------------
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'drdo-fdr-backend',
    timestamp: new Date().toISOString(),
    storage: process.env.STORAGE_BACKEND || 'sqlite',
  });
});

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------

// Upload
app.use('/api/upload-flight', uploadRoute);

// Telemetry & Events (scoped under /api/flight/:id)
app.use('/api/flight/:id/telemetry', telemetryRoute);
app.use('/api/flight/:id/events',    eventsRoute);

// Flights listing + single flight + delete
app.use('/api/flights', flightsRoute);
app.use('/api/flight',  flightsRoute);

// ---------------------------------------------------------------------------
// 404 handler (must be after all routes)
// ---------------------------------------------------------------------------
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// ---------------------------------------------------------------------------
// Global error handler (must be last)
// ---------------------------------------------------------------------------
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Initialise store and start server
// ---------------------------------------------------------------------------
flightStore.init();

const server = app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║        DRDO FDR Backend — Started            ║');
  console.log(`║  Listening on http://localhost:${PORT}          ║`);
  console.log(`║  Storage: ${(process.env.STORAGE_BACKEND || 'sqlite').padEnd(35)}║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log('Available endpoints:');
  console.log(`  POST   http://localhost:${PORT}/api/upload-flight`);
  console.log(`  GET    http://localhost:${PORT}/api/flight/:id/telemetry`);
  console.log(`  GET    http://localhost:${PORT}/api/flight/:id/events`);
  console.log(`  GET    http://localhost:${PORT}/api/flights`);
  console.log(`  GET    http://localhost:${PORT}/api/flight/:id`);
  console.log(`  DELETE http://localhost:${PORT}/api/flight/:id`);
  console.log(`  GET    http://localhost:${PORT}/health`);
  console.log('');
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// Allows in-flight requests to finish before closing.
// ---------------------------------------------------------------------------
function shutdown(signal) {
  console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('[Server] HTTP server closed.');
    process.exit(0);
  });

  // Force exit after 10 seconds if requests stall
  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout.');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

module.exports = app; // exported for testing