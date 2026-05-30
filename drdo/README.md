# DRDO FDR Backend

Node.js + Express backend for the Flight Data Recorder (FDR) replay and telemetry system.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (defaults work out of the box)
cp .env .env.local   # optional — edit if needed

# 3. Start the server
npm start            # production
npm run dev          # development (auto-restart on file changes)
```

Server starts on **http://localhost:3001** by default.

---

## Environment Variables (`.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | HTTP port |
| `STORAGE_BACKEND` | `sqlite` | `sqlite` or `memory` |
| `SQLITE_PATH` | `./drdo_fdr.db` | SQLite database file path |
| `MAX_UPLOAD_MB` | `100` | Max upload file size in MB |
| `CORS_ORIGIN` | `http://localhost:3000` | React frontend origin (comma-separated for multiple) |

---

## API Reference

### Health Check
```
GET /health
```
```json
{ "status": "ok", "service": "drdo-fdr-backend", "timestamp": "...", "storage": "sqlite" }
```

---

### Upload Flight File
```
POST /api/upload-flight
Content-Type: multipart/form-data
Field: file  (CSV file)
```

**Response `201`:**
```json
{
  "flight_id": "101",
  "total_frames": 10000,
  "total_events": 2444,
  "duration_s": 1249.875,
  "sortie_id": "SORTIE_001",
  "mission_type": "BVR_COMBAT"
}
```

**Error `400`** — wrong file type, missing required columns, or empty file.

---

### Get Telemetry Frames
```
GET /api/flight/:id/telemetry
```

Returns the full frame array for replay. This is the primary endpoint the frontend consumes.

**Optional query params:**
| Param | Example | Description |
|---|---|---|
| `start` | `?start=120` | Only frames with `timestamp >= 120s` |
| `end` | `?end=600` | Only frames with `timestamp <= 600s` |
| `downsample` | `?downsample=4` | Return every 4th frame (reduces payload) |

**Response frame shape:**
```json
[
  {
    "timestamp": 0,
    "position": { "x": 0.0, "y": 950.0, "z": 0.0 },
    "orientation": { "pitch": -0.17, "roll": 0.0, "yaw": 0.052 },
    "parameters": {
      "ground_speed": 14.71,
      "engine1_rpm": 51.98,
      "fuel_pressure": 46.73,
      "flight_phase": "taxi",
      "...": "195 parameters total"
    }
  }
]
```

Position `x/y/z` are in **metres**, relative to the first frame's lat/lon as origin.
`y` = altitude (metres above GPS altitude of frame 0).

Response headers include `X-Total-Frames` and `X-Returned-Frames`.

---

### Get Flight Events
```
GET /api/flight/:id/events
```

Returns detected flight events. Events are generated once at upload time using threshold-based rules.

**Optional query params:**
| Param | Example | Description |
|---|---|---|
| `severity` | `?severity=HIGH` | Filter by severity: HIGH, MEDIUM, LOW, INFO |
| `after` | `?after=120` | Events after 120s |
| `before` | `?before=600` | Events before 600s |

**Response:**
```json
[
  { "timestamp": 42.5,  "event": "ENGINE OVERHEAT",           "severity": "HIGH"   },
  { "timestamp": 50.0,  "event": "PHASE CHANGE: TAXI → TAKEOFF", "severity": "INFO" },
  { "timestamp": 600.0, "event": "AFTERBURNER ENGAGED",        "severity": "INFO"   }
]
```

**Detected event types:**

| Event | Severity | Trigger |
|---|---|---|
| ENGINE 1/2 OVERHEAT | HIGH | EGT > 900°C |
| ENGINE 1/2 OIL PRESSURE LOW | HIGH | Oil pressure < 20 |
| ENGINE 1/2 HIGH VIBRATION | HIGH | Vibration > 2.5 |
| AFTERBURNER ENGAGED/DISENGAGED | INFO | `afterburner_status` edge |
| G-LOC RISK HIGH | HIGH | `gloc_risk` > 0.7 |
| HIGH G-LOAD WARNING | HIGH | |Gz| > 7 |
| STALL WARNING | HIGH | `warn_stall=1` or AoA > 25° |
| OVERSPEED WARNING | HIGH | `warn_overspeed=1` |
| LOW FUEL WARNING | HIGH | `total_fuel_on_board` < 1000kg |
| HYDRAULIC PRESSURE LOW | MEDIUM | Pressure A or B < 1500 PSI |
| ICE DETECTED | MEDIUM | `ice_detection_status=1` |
| LANDING GEAR UP/DOWN | INFO | `landing_gear_position` edge |
| TARGET LOCK ACQUIRED/LOST | INFO | `target_lock_status` edge |
| MASTER WARNING | HIGH | `master_warning=1` |
| MASTER CAUTION | MEDIUM | `master_caution=1` |
| FAULT DETECTED | HIGH | `fault_code != 0` |
| SYSTEM FAILURE | HIGH | `system_failure_code != 0` |
| GPWS — TERRAIN WARNING | HIGH | `gpws_warning=1` |
| TCAS ADVISORY | MEDIUM | `tcas_advisory=1` |
| PHASE CHANGE: X → Y | INFO | `flight_phase` transitions |

---

### List All Flights
```
GET /api/flights
```

Returns metadata summary for all stored flights (no frames).

```json
{
  "total": 3,
  "flights": [
    {
      "flight_id": "101",
      "sortie_id": "SORTIE_001",
      "mission_type": "BVR_COMBAT",
      "total_frames": 10000,
      "duration_s": 1249.875,
      "flight_phases": ["taxi", "takeoff", "climb", "cruise", "combat", "descent", "approach", "landing", "taxi2"],
      "uploaded_at": "2025-06-01T10:30:00.000Z",
      "filename": "rafale_fdr_200param_1.csv"
    }
  ]
}
```

---

### Get Single Flight Metadata
```
GET /api/flight/:id
```

Returns metadata + event count for one flight.

---

### Delete Flight
```
DELETE /api/flight/:id
```

```json
{ "success": true, "message": "Flight \"101\" deleted." }
```

---

## Project Structure

```
drdo-fdr-backend/
├── server.js                    Express app, routes, startup
├── .env                         Environment configuration
│
├── routes/
│   ├── upload.js                POST /api/upload-flight
│   ├── telemetry.js             GET  /api/flight/:id/telemetry
│   ├── events.js                GET  /api/flight/:id/events
│   └── flights.js               GET  /api/flights  |  GET/DELETE /api/flight/:id
│
├── services/
│   ├── csvParser.js             Streams CSV → raw rows (validates headers)
│   ├── frameBuilder.js          Converts one CSV row → telemetry frame
│   ├── eventDetector.js         Scans frames, fires threshold-based events
│   ├── metaExtractor.js         Derives flight metadata from frames
│   └── flightStore.js           Storage layer (memory or SQLite)
│
├── middleware/
│   └── errorHandler.js          Global Express error handler
│
└── uploads/                     Multer temp files (auto-created)
```

---

## CSV Requirements

The backend accepts any CSV file with at minimum these columns:

```
time_s, latitude, longitude, gps_altitude, pitch_angle, roll_angle, yaw_angle
```

The `rafale_fdr_200param_1.csv` file has **202 columns** and satisfies all requirements with zero modifications needed.

---

## Future Extensions

The architecture is designed to support these additions:

- **WebSocket / live streaming** — add `ws` or `socket.io` alongside Express; `csvParser.js` emits frames per-row
- **Anomaly detection** — extend `eventDetector.js` with ML model inference (ONNX Runtime)
- **Multi-user access** — add JWT middleware; `flightStore.js` already isolates the storage layer
- **Binary FDR files** — add a parser in `csvParser.js` `parseFlightFile()` behind the `detectFileType()` switch
- **Postgres** — replace SQLite in `flightStore.js` without touching any route or service
