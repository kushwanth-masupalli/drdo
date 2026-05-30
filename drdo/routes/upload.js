/**
 * routes/upload.js
 *
 * POST /api/upload-flight
 *
 * Accepts a multipart/form-data request with field name "file".
 * Parses the CSV, builds telemetry frames, detects events,
 * extracts metadata, persists everything, and returns:
 *
 *   { "flight_id": "101" }
 *
 * Error responses follow the shape: { "error": "message" }
 */

'use strict';

const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');

const { parseFlightFile } = require('../services/csvParser');
const { detectEvents }    = require('../services/eventDetector');
const { extractMeta }     = require('../services/metaExtractor');
const flightStore         = require('../services/flightStore');

const router = express.Router();

// ---------------------------------------------------------------------------
// Multer storage configuration
// Files are saved to ./uploads/ with a timestamp-prefixed original name.
// ---------------------------------------------------------------------------
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const stamp = Date.now();
    const safe  = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${stamp}_${safe}`);
  },
});

const MAX_SIZE_MB = parseInt(process.env.MAX_UPLOAD_MB || '100', 10);

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.csv') {
      cb(null, true);
    } else {
      cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE',
        `Only .csv files are accepted. Received: ${ext}`));
    }
  },
});

// ---------------------------------------------------------------------------
// POST /api/upload-flight
// ---------------------------------------------------------------------------
router.post('/', upload.single('file'), async (req, res) => {
  // Multer puts the saved file info on req.file
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Send the CSV as form-data field "file".' });
  }

  const filePath     = req.file.path;
  const originalName = req.file.originalname;

  try {
    // 1. Parse CSV → frame array
    const frames = await parseFlightFile(filePath, originalName);

    // 2. Detect events from frames
    const events = detectEvents(frames);

    // 3. Extract metadata summary
    const meta = extractMeta(frames, originalName);

    // 4. Persist to store
    const flight_id = flightStore.save({ frames, events, meta });

    console.log(
      `[Upload] Stored flight ${flight_id}: ${frames.length} frames, ` +
      `${events.length} events — ${originalName}`
    );

    // 5. Respond
    res.status(201).json({
      flight_id,
      total_frames: frames.length,
      total_events: events.length,
      duration_s:   meta.duration_s,
      sortie_id:    meta.sortie_id,
      mission_type: meta.mission_type,
    });

  } catch (err) {
    console.error('[Upload] Error:', err.message);

    // Remove the saved file on parse failure to avoid orphaned uploads
    fs.unlink(filePath, () => {});

    const status = err.message?.includes('missing required') ? 400 : 500;
    res.status(status).json({ error: err.message });

  } finally {
    // Optional: clean up the temp file after processing.
    // Comment this out if you want to keep originals on disk.
    // fs.unlink(filePath, () => {});
  }
});

// Handle Multer-specific errors (file size, file type)
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError || err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: err.message || 'Internal server error' });
});

module.exports = router;