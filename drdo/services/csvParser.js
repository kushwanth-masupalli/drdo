/**
 * csvParser.js
 *
 * Streams a CSV (or future binary FDR) file and converts it into an
 * array of telemetry frames using frameBuilder.
 *
 * Streaming is used so large files (100k+ rows) do not block the event loop
 * or cause memory exhaustion.
 */

'use strict';

const fs          = require('fs');
const path        = require('path');
const csvParser   = require('csv-parser');
const { buildOrigin, buildFrame } = require('./frameBuilder');

// Minimum columns that MUST be present in the CSV for the backend to accept it
const REQUIRED_COLUMNS = [
  'time_s',
  'latitude',
  'longitude',
  'gps_altitude',
  'pitch_angle',
  'roll_angle',
  'yaw_angle',
];

/**
 * Validate that all required columns exist in the parsed headers.
 *
 * @param {string[]} headers
 * @throws {Error} if any required column is missing
 */
function validateHeaders(headers) {
  const headerSet = new Set(headers);
  const missing = REQUIRED_COLUMNS.filter((col) => !headerSet.has(col));
  if (missing.length > 0) {
    throw new Error(
      `CSV is missing required columns: ${missing.join(', ')}`
    );
  }
}

/**
 * Parse a CSV file into an array of telemetry frames.
 *
 * @param {string} filePath - absolute path to the uploaded CSV file
 * @returns {Promise<Object[]>} - resolves with array of telemetry frame objects
 */
function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const rows    = [];
    let origin    = null;
    let validated = false;

    const stream = fs.createReadStream(filePath).pipe(
      csvParser({
        // csv-parser trims whitespace from headers automatically
        mapHeaders: ({ header }) => header.trim(),
      })
    );

    stream.on('headers', (headers) => {
      try {
        validateHeaders(headers);
        validated = true;
      } catch (err) {
        stream.destroy(err);
      }
    });

    stream.on('data', (row) => {
      if (!validated) return;

      // Build coordinate origin from the very first row
      if (origin === null) {
        origin = buildOrigin(row);
      }

      rows.push(buildFrame(row, origin));
    });

    stream.on('end', () => {
      if (rows.length === 0) {
        return reject(new Error('CSV file is empty or contains no data rows.'));
      }
      resolve(rows);
    });

    stream.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Detect the file type from its extension.
 * Future: expand to handle binary FDR formats.
 *
 * @param {string} originalName - original filename from upload
 * @returns {'csv'|'unknown'}
 */
function detectFileType(originalName) {
  const ext = path.extname(originalName).toLowerCase();
  if (ext === '.csv') return 'csv';
  return 'unknown';
}

/**
 * Unified entry point for parsing any supported flight data file.
 *
 * @param {string} filePath      - absolute path to saved upload
 * @param {string} originalName  - original filename (used for type detection)
 * @returns {Promise<Object[]>}  - array of telemetry frames
 */
async function parseFlightFile(filePath, originalName) {
  const fileType = detectFileType(originalName);

  if (fileType === 'csv') {
    return parseCSV(filePath);
  }

  // TODO: Add binary FDR parser here in a future sprint
  throw new Error(
    `Unsupported file type: "${path.extname(originalName)}". Only CSV is supported currently.`
  );
}

module.exports = { parseFlightFile };