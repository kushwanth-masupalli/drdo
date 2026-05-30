/**
 * routes/flights.js
 *
 * GET  /api/flights          — list all uploaded missions (metadata only)
 * GET  /api/flight/:id       — get single flight metadata
 * DELETE /api/flight/:id     — delete a flight
 *
 * These routes never return the full frames array — that is handled
 * exclusively by the /telemetry endpoint to keep response sizes small.
 */

'use strict';

const express     = require('express');
const flightStore = require('../services/flightStore');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/flights
// Returns summary metadata for all stored flights.
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const flights = flightStore.listAll();
  res.json({
    total: flights.length,
    flights,
  });
});

// ---------------------------------------------------------------------------
// GET /api/flight/:id
// Returns metadata for a single flight (no frames, no events).
// ---------------------------------------------------------------------------
router.get('/:id', (req, res) => {
  const { id } = req.params;

  if (!flightStore.exists(id)) {
    return res.status(404).json({ error: `Flight "${id}" not found.` });
  }

  const flight = flightStore.get(id);

  res.json({
    flight_id:    id,
    ...flight.meta,
    total_events: flight.events?.length ?? 0,
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/flight/:id
// Removes a flight from the store.
// ---------------------------------------------------------------------------
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  if (!flightStore.exists(id)) {
    return res.status(404).json({ error: `Flight "${id}" not found.` });
  }

  flightStore.remove(id);
  res.json({ success: true, message: `Flight "${id}" deleted.` });
});

module.exports = router;