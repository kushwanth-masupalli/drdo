/**
 * flightStore.js
 *
 * Unified storage layer for flight data.
 * Supports two backends selected by the STORAGE_BACKEND env var:
 *
 *   "memory"  — Fast, zero-setup. Data is lost on server restart.
 *               Good for development.
 *
 *   "sqlite"  — Persistent. Uses better-sqlite3.
 *               Survives restarts, supports future multi-user queries.
 *               Recommended for DRDO deployment.
 *
 * Public API (identical regardless of backend):
 *   init()                        — initialise store (call once at startup)
 *   save({ frames, events, meta }) — persist a flight, returns flight_id
 *   get(flightId)                  — retrieve full flight data or null
 *   listAll()                      — return summary array for all flights
 *   exists(flightId)               — boolean
 *   remove(flightId)               — delete a flight
 */

'use strict';

require('dotenv').config();

const BACKEND = (process.env.STORAGE_BACKEND || 'sqlite').toLowerCase();

// ============================================================
// MEMORY BACKEND
// ============================================================

class MemoryStore {
  constructor() {
    this._store   = new Map(); // flightId → { frames, events, meta }
    this._counter = 100;
  }

  init() {
    console.log('[FlightStore] Using in-memory storage backend.');
  }

  save({ frames, events, meta }) {
    const id = String(++this._counter);
    this._store.set(id, { frames, events, meta });
    return id;
  }

  get(flightId) {
    return this._store.get(String(flightId)) || null;
  }

  listAll() {
    const list = [];
    for (const [id, data] of this._store.entries()) {
      list.push({ flight_id: id, ...data.meta });
    }
    return list;
  }

  exists(flightId) {
    return this._store.has(String(flightId));
  }

  remove(flightId) {
    this._store.delete(String(flightId));
  }
}

// ============================================================
// SQLITE BACKEND
// ============================================================

class SQLiteStore {
  constructor() {
    this._db = null;
  }

  init() {
    const Database = require('better-sqlite3');
    const dbPath   = process.env.SQLITE_PATH || './drdo_fdr.db';

    this._db = new Database(dbPath);

    // WAL mode for better concurrent read performance
    this._db.pragma('journal_mode = WAL');
    this._db.pragma('foreign_keys = ON');

    // Flights metadata table
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS flights (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        sortie_id      TEXT,
        mission_type   TEXT,
        total_frames   INTEGER,
        duration_s     REAL,
        flight_phases  TEXT,
        uploaded_at    TEXT NOT NULL,
        filename       TEXT
      );
    `);

    // Telemetry stored as a single JSON blob per flight
    // For very large datasets (100k+ rows) this can be swapped to
    // a row-per-frame table without changing the public API.
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS telemetry (
        flight_id  INTEGER PRIMARY KEY REFERENCES flights(id) ON DELETE CASCADE,
        frames_json TEXT NOT NULL
      );
    `);

    // Events table — one row per event for easy querying
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        flight_id  INTEGER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
        timestamp  REAL    NOT NULL,
        event      TEXT    NOT NULL,
        severity   TEXT    NOT NULL
      );
    `);

    console.log(`[FlightStore] Using SQLite backend at: ${dbPath}`);
  }

  save({ frames, events, meta }) {
    const insert = this._db.transaction(() => {
      // 1. Insert metadata row
      const stmt = this._db.prepare(`
        INSERT INTO flights (sortie_id, mission_type, total_frames, duration_s, flight_phases, uploaded_at, filename)
        VALUES (@sortie_id, @mission_type, @total_frames, @duration_s, @flight_phases, @uploaded_at, @filename)
      `);
      const result = stmt.run({
        sortie_id:     meta.sortie_id     || null,
        mission_type:  meta.mission_type  || null,
        total_frames:  meta.total_frames,
        duration_s:    meta.duration_s,
        flight_phases: JSON.stringify(meta.flight_phases || []),
        uploaded_at:   meta.uploaded_at,
        filename:      meta.filename      || null,
      });
      const flightId = result.lastInsertRowid;

      // 2. Store frames blob
      this._db.prepare(
        'INSERT INTO telemetry (flight_id, frames_json) VALUES (?, ?)'
      ).run(flightId, JSON.stringify(frames));

      // 3. Store events (bulk insert)
      const evtStmt = this._db.prepare(
        'INSERT INTO events (flight_id, timestamp, event, severity) VALUES (?, ?, ?, ?)'
      );
      for (const evt of events) {
        evtStmt.run(flightId, evt.timestamp, evt.event, evt.severity);
      }

      return String(flightId);
    });

    return insert();
  }

  get(flightId) {
    const id = Number(flightId);
    const meta = this._db
      .prepare('SELECT * FROM flights WHERE id = ?')
      .get(id);
    if (!meta) return null;

    const telRow = this._db
      .prepare('SELECT frames_json FROM telemetry WHERE flight_id = ?')
      .get(id);
    const frames = telRow ? JSON.parse(telRow.frames_json) : [];

    const eventRows = this._db
      .prepare('SELECT timestamp, event, severity FROM events WHERE flight_id = ? ORDER BY timestamp')
      .all(id);

    return {
      frames,
      events: eventRows,
      meta:   this._rowToMeta(meta),
    };
  }

  listAll() {
    const rows = this._db.prepare('SELECT * FROM flights ORDER BY id DESC').all();
    return rows.map((row) => ({ flight_id: String(row.id), ...this._rowToMeta(row) }));
  }

  exists(flightId) {
    const row = this._db
      .prepare('SELECT id FROM flights WHERE id = ?')
      .get(Number(flightId));
    return !!row;
  }

  remove(flightId) {
    this._db.prepare('DELETE FROM flights WHERE id = ?').run(Number(flightId));
  }

  _rowToMeta(row) {
    return {
      sortie_id:    row.sortie_id,
      mission_type: row.mission_type,
      total_frames: row.total_frames,
      duration_s:   row.duration_s,
      flight_phases: JSON.parse(row.flight_phases || '[]'),
      uploaded_at:  row.uploaded_at,
      filename:     row.filename,
    };
  }
}

// ============================================================
// Factory — pick backend from env
// ============================================================

let _store;

function getStore() {
  if (!_store) {
    _store = BACKEND === 'memory' ? new MemoryStore() : new SQLiteStore();
  }
  return _store;
}

/**
 * Initialise the store. Must be called once at server startup.
 */
function init() {
  getStore().init();
}

/**
 * Persist a flight and return its assigned flight_id string.
 *
 * @param {{ frames: Object[], events: Object[], meta: Object }} data
 * @returns {string} flight_id
 */
function save(data) {
  return getStore().save(data);
}

/**
 * Retrieve full flight data (frames + events + meta) by ID.
 *
 * @param {string|number} flightId
 * @returns {{ frames, events, meta }|null}
 */
function get(flightId) {
  return getStore().get(flightId);
}

/**
 * Return summary list of all stored flights (no frames, no events).
 *
 * @returns {Object[]}
 */
function listAll() {
  return getStore().listAll();
}

/**
 * Check whether a flight_id exists.
 *
 * @param {string|number} flightId
 * @returns {boolean}
 */
function exists(flightId) {
  return getStore().exists(flightId);
}

/**
 * Delete a flight by ID.
 *
 * @param {string|number} flightId
 */
function remove(flightId) {
  getStore().remove(flightId);
}

module.exports = { init, save, get, listAll, exists, remove };