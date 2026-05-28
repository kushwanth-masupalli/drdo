/**
 * routes/telemetry.js
 *
 * GET /api/flight/:id/telemetry
 *
 * Returns the full array of telemetry frames for a given flight.
 * This is the most critical endpoint — the frontend replay system
 * depends entirely on the shape of data returned here.
 *
 * Response shape (array):
 * [
 *   {
 *     "timestamp": 0,
 *     "position":    { "x": 0, "y": 0, "z": 0 },
 *     "orientation": { "pitch": 0, "roll": 0, "yaw": 0 },
 *     "parameters":  { "gps_altitude": 1200, ... }
 *   },
 *   ...
 * ]
 *
 * Query parameters:
 *   ?start=0      — only return frames with timestamp >= start (seconds)
 *   ?end=999      — only return frames with timestamp <= end (seconds)
 *   ?downsample=N — return every Nth frame (reduces payload for preview/scrubbing)
 */

'use strict';

const express     = require('express');
const flightStore = require('../services/flightStore');

const router = express.Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// GET /api/flight/:id/telemetry
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const { id } = req.params;

  if (!flightStore.exists(id)) {
    return res.status(404).json({ error: `Flight "${id}" not found.` });
  }

  const flight = flightStore.get(id);
  let frames   = flight.frames;

  // -----------------------------------------------------------------------
  // Optional query filtering
  // -----------------------------------------------------------------------
  const { start, end, downsample } = req.query;

  if (start !== undefined || end !== undefined) {
    const t0 = start !== undefined ? parseFloat(start) : -Infinity;
    const t1 = end   !== undefined ? parseFloat(end)   :  Infinity;

    if (Number.isNaN(t0) || Number.isNaN(t1)) {
      return res.status(400).json({ error: '?start and ?end must be numeric seconds.' });
    }

    frames = frames.filter((f) => f.timestamp >= t0 && f.timestamp <= t1);
  }

  if (downsample !== undefined) {
    const n = parseInt(downsample, 10);
    if (Number.isNaN(n) || n < 1) {
      return res.status(400).json({ error: '?downsample must be a positive integer.' });
    }
    frames = frames.filter((_, i) => i % n === 0);
  }

  // -----------------------------------------------------------------------
  // Set Content-Length so the frontend can show progress on large payloads
  // -----------------------------------------------------------------------
  res.setHeader('X-Total-Frames', flight.frames.length);
  res.setHeader('X-Returned-Frames', frames.length);

  res.json(frames);
});

module.exports = router;