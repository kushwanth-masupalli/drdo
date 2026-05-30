/**
 * routes/events.js
 *
 * GET /api/flight/:id/events
 *
 * Returns the list of detected flight events for a given flight.
 * Events are generated at upload time by eventDetector.js.
 *
 * Response shape (array):
 * [
 *   {
 *     "timestamp": 42.5,
 *     "event":     "ENGINE 1 OVERHEAT",
 *     "severity":  "HIGH"
 *   },
 *   ...
 * ]
 *
 * Severity values: HIGH | MEDIUM | LOW | INFO
 *
 * Query parameters:
 *   ?severity=HIGH          — filter by severity level
 *   ?after=120              — only events with timestamp > 120s
 *   ?before=600             — only events with timestamp < 600s
 */

'use strict';

const express     = require('express');
const flightStore = require('../services/flightStore');

const router = express.Router({ mergeParams: true });

const VALID_SEVERITIES = new Set(['HIGH', 'MEDIUM', 'LOW', 'INFO']);

// ---------------------------------------------------------------------------
// GET /api/flight/:id/events
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const { id } = req.params;

  if (!flightStore.exists(id)) {
    return res.status(404).json({ error: `Flight "${id}" not found.` });
  }

  const flight = flightStore.get(id);
  let events   = flight.events || [];

  // -----------------------------------------------------------------------
  // Optional filters
  // -----------------------------------------------------------------------
  const { severity, after, before } = req.query;

  if (severity) {
    const sev = severity.toUpperCase();
    if (!VALID_SEVERITIES.has(sev)) {
      return res.status(400).json({
        error: `Invalid severity "${severity}". Valid values: HIGH, MEDIUM, LOW, INFO`,
      });
    }
    events = events.filter((e) => e.severity === sev);
  }

  if (after !== undefined) {
    const t = parseFloat(after);
    if (Number.isNaN(t)) return res.status(400).json({ error: '?after must be numeric seconds.' });
    events = events.filter((e) => e.timestamp > t);
  }

  if (before !== undefined) {
    const t = parseFloat(before);
    if (Number.isNaN(t)) return res.status(400).json({ error: '?before must be numeric seconds.' });
    events = events.filter((e) => e.timestamp < t);
  }

  res.setHeader('X-Total-Events', flight.events?.length ?? 0);
  res.setHeader('X-Returned-Events', events.length);

  res.json(events);
});

module.exports = router;