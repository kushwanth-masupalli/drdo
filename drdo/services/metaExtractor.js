/**
 * metaExtractor.js
 *
 * Derives the metadata summary object from a parsed frame array.
 * This metadata is stored alongside frames and returned by GET /api/flights.
 */

'use strict';

/**
 * Extract summary metadata from a frame array.
 *
 * @param {Object[]} frames        - telemetry frames built by frameBuilder
 * @param {string}   originalName  - original uploaded filename
 * @returns {Object}               - metadata object for flightStore
 */
function extractMeta(frames, originalName) {
  if (!frames || frames.length === 0) {
    return {
      sortie_id:    null,
      mission_type: null,
      total_frames: 0,
      duration_s:   0,
      flight_phases: [],
      uploaded_at:  new Date().toISOString(),
      filename:     originalName || null,
    };
  }

  const firstFrame = frames[0];
  const lastFrame  = frames[frames.length - 1];

  // Pull metadata columns that pass through into parameters
  const sortie_id    = firstFrame.parameters?.sortie_id    || null;
  const mission_type = firstFrame.parameters?.mission_type || null;

  // Duration: last timestamp minus first
  const duration_s =
    parseFloat(lastFrame.timestamp) - parseFloat(firstFrame.timestamp);

  // Ordered unique list of flight phases (preserving order of first appearance)
  const seenPhases = new Set();
  const flight_phases = [];
  for (const frame of frames) {
    const phase = frame.parameters?.flight_phase;
    if (phase && !seenPhases.has(phase)) {
      seenPhases.add(phase);
      flight_phases.push(phase);
    }
  }

  return {
    sortie_id,
    mission_type,
    total_frames:  frames.length,
    duration_s:    Math.round(duration_s * 1000) / 1000,
    flight_phases,
    uploaded_at:   new Date().toISOString(),
    filename:      originalName || null,
  };
}

module.exports = { extractMeta };