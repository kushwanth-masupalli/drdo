/**
 * frameBuilder.js
 *
 * Converts a raw CSV row object into a telemetry frame that the
 * frontend replay system expects:
 *   { timestamp, position, orientation, parameters }
 *
 * Position is converted from real-world lat/lon/alt into relative
 * XYZ offsets (metres) from a reference origin (first frame).
 * This keeps the aircraft near the Three.js scene origin and avoids
 * floating-point precision loss at large coordinate values.
 */

'use strict';

// ---------------------------------------------------------------------------
// Columns consumed by timestamp / position / orientation — they are NOT
// forwarded into the parameters object.
// ---------------------------------------------------------------------------
const TIMESTAMP_COL   = 'time_s';
const POSITION_COLS   = new Set(['latitude', 'longitude', 'gps_altitude']);
const ORIENTATION_COLS = new Set(['pitch_angle', 'roll_angle', 'yaw_angle']);

// Earth geometry constants for lat/lon → metres conversion
const METERS_PER_DEG_LAT = 111_320; // constant (north–south)

/**
 * Build the reference origin from the very first CSV row.
 * Call this once before processing the full frame array.
 *
 * @param {Object} firstRow - first CSV row as plain object
 * @returns {{ refLat: number, refLon: number, metersPerDegLon: number }}
 */
function buildOrigin(firstRow) {
  const refLat = parseFloat(firstRow.latitude);
  const refLon = parseFloat(firstRow.longitude);
  const metersPerDegLon =
    METERS_PER_DEG_LAT * Math.cos((refLat * Math.PI) / 180);
  return { refLat, refLon, metersPerDegLon };
}

/**
 * Parse a single value from a CSV cell.
 * Numbers are cast to float; "true"/"false"/"1"/"0" strings are treated as
 * numbers (booleans travel as 0/1 in this CSV).
 * Strings that cannot be numeric are kept as strings.
 *
 * @param {string} val
 * @returns {number|string}
 */
function parseVal(val) {
  if (val === null || val === undefined || val === '') return null;
  const trimmed = String(val).trim();
  const asNum = Number(trimmed);
  return Number.isNaN(asNum) ? trimmed : asNum;
}

/**
 * Convert one CSV row into a telemetry frame.
 *
 * @param {Object} row    - raw CSV row (all values are strings from csv-parser)
 * @param {Object} origin - reference origin from buildOrigin()
 * @returns {Object}      - telemetry frame
 */
function buildFrame(row, origin) {
  const lat = parseFloat(row.latitude);
  const lon = parseFloat(row.longitude);
  const alt = parseFloat(row.gps_altitude);

  // -----------------------------------------------------------------------
  // Position — relative metres from the reference origin
  // x = east–west, y = vertical (altitude), z = north–south
  // -----------------------------------------------------------------------
  const position = {
    x: (lon - origin.refLon) * origin.metersPerDegLon,
    y: alt,
    z: (lat - origin.refLat) * METERS_PER_DEG_LAT,
  };

  // -----------------------------------------------------------------------
  // Orientation
  // -----------------------------------------------------------------------
  const orientation = {
    pitch: parseFloat(row.pitch_angle),
    roll:  parseFloat(row.roll_angle),
    yaw:   parseFloat(row.yaw_angle),
  };

  // -----------------------------------------------------------------------
  // Parameters — every column that is NOT used for timestamp/position/orientation
  // -----------------------------------------------------------------------
  const parameters = {};
  for (const key of Object.keys(row)) {
    if (
      key === TIMESTAMP_COL ||
      POSITION_COLS.has(key) ||
      ORIENTATION_COLS.has(key)
    ) {
      continue;
    }
    parameters[key] = parseVal(row[key]);
  }

  return {
    timestamp:   parseFloat(row[TIMESTAMP_COL]),
    position,
    orientation,
    parameters,
  };
}

module.exports = { buildOrigin, buildFrame };