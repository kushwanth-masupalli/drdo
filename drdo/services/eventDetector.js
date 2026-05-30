/**
 * eventDetector.js
 *
 * Scans the telemetry frame array and produces an array of flight events.
 *
 * All rules use RISING EDGE detection — an event fires only when a condition
 * first becomes true, not every frame while it remains true.
 * This keeps the events list clean and meaningful.
 *
 * Event severities: HIGH | MEDIUM | LOW | INFO
 */

'use strict';

// ---------------------------------------------------------------------------
// Helper: safely read a numeric parameter from a frame
// ---------------------------------------------------------------------------
function param(frame, key, defaultVal = 0) {
  const val = frame.parameters?.[key];
  if (val === null || val === undefined || val === '') return defaultVal;
  const n = Number(val);
  return Number.isNaN(n) ? defaultVal : n;
}

// ---------------------------------------------------------------------------
// Rule definitions
//
// Each rule is an object with:
//   id         {string}   - unique key (used for rising-edge tracking)
//   check      {Function} - (frame, prev) → boolean  — true = condition active
//   event      {string|Function} - event name string, or fn(frame) → string
//   severity   {'HIGH'|'MEDIUM'|'LOW'|'INFO'}
//   risingOnly {boolean}  - default true; set false to fire every frame (rare)
// ---------------------------------------------------------------------------
const RULES = [
  // -----------------------------------------------------------------------
  // ENGINE
  // -----------------------------------------------------------------------
  {
    id: 'engine1_overheat',
    check: (f) => param(f, 'engine1_egt') > 900,
    event: 'ENGINE 1 OVERHEAT',
    severity: 'HIGH',
  },
  {
    id: 'engine2_overheat',
    check: (f) => param(f, 'engine2_egt') > 900,
    event: 'ENGINE 2 OVERHEAT',
    severity: 'HIGH',
  },
  {
    id: 'engine1_oil_low',
    check: (f) => param(f, 'engine1_oil_pressure') < 20,
    event: 'ENGINE 1 OIL PRESSURE LOW',
    severity: 'HIGH',
  },
  {
    id: 'engine2_oil_low',
    check: (f) => param(f, 'engine2_oil_pressure') < 20,
    event: 'ENGINE 2 OIL PRESSURE LOW',
    severity: 'HIGH',
  },
  {
    id: 'engine1_vibration',
    check: (f) => param(f, 'engine1_vibration') > 2.5,
    event: 'ENGINE 1 HIGH VIBRATION',
    severity: 'HIGH',
  },
  {
    id: 'engine2_vibration',
    check: (f) => param(f, 'engine2_vibration') > 2.5,
    event: 'ENGINE 2 HIGH VIBRATION',
    severity: 'HIGH',
  },
  {
    id: 'afterburner_engaged',
    check: (f) => param(f, 'afterburner_status') === 1,
    event: 'AFTERBURNER ENGAGED',
    severity: 'INFO',
  },
  {
    id: 'afterburner_disengaged',
    check: (f, prev) =>
      prev !== null &&
      param(prev, 'afterburner_status') === 1 &&
      param(f, 'afterburner_status') === 0,
    event: 'AFTERBURNER DISENGAGED',
    severity: 'INFO',
    risingOnly: false, // falling-edge rule — always fires when condition true
  },

  // -----------------------------------------------------------------------
  // FLIGHT DYNAMICS
  // -----------------------------------------------------------------------
  {
    id: 'gloc_risk_high',
    check: (f) => param(f, 'gloc_risk') > 0.7,
    event: 'G-LOC RISK HIGH',
    severity: 'HIGH',
  },
  {
    id: 'high_g_load',
    check: (f) => Math.abs(param(f, 'Gz', 1)) > 7,
    event: 'HIGH G-LOAD WARNING',
    severity: 'HIGH',
  },
  {
    id: 'stall_warn',
    check: (f) => param(f, 'warn_stall') === 1 || param(f, 'angle_of_attack') > 25,
    event: 'STALL WARNING',
    severity: 'HIGH',
  },
  {
    id: 'overspeed_warn',
    check: (f) => param(f, 'warn_overspeed') === 1,
    event: 'OVERSPEED WARNING',
    severity: 'HIGH',
  },
  {
    id: 'over_g_warn',
    check: (f) => param(f, 'warn_overG') === 1,
    event: 'OVER-G WARNING',
    severity: 'HIGH',
  },

  // -----------------------------------------------------------------------
  // FUEL
  // -----------------------------------------------------------------------
  {
    id: 'low_fuel_warn',
    check: (f) =>
      param(f, 'warn_low_fuel') === 1 || param(f, 'total_fuel_on_board', 9999) < 1000,
    event: 'LOW FUEL WARNING',
    severity: 'HIGH',
  },
  {
    id: 'fuel_pressure_low',
    check: (f) => param(f, 'fuel_pressure') < 20,
    event: 'FUEL PRESSURE LOW',
    severity: 'MEDIUM',
  },

  // -----------------------------------------------------------------------
  // HYDRAULICS & ELECTRICAL
  // -----------------------------------------------------------------------
  {
    id: 'hyd_a_low',
    check: (f) => param(f, 'warn_low_hyd') === 1 || param(f, 'hydraulic_pressure_a') < 1500,
    event: 'HYDRAULIC SYSTEM A PRESSURE LOW',
    severity: 'MEDIUM',
  },
  {
    id: 'hyd_b_low',
    check: (f) => param(f, 'hydraulic_pressure_b') < 1500,
    event: 'HYDRAULIC SYSTEM B PRESSURE LOW',
    severity: 'MEDIUM',
  },
  {
    id: 'battery_low',
    check: (f) => param(f, 'battery_voltage') < 24,
    event: 'BATTERY VOLTAGE LOW',
    severity: 'MEDIUM',
  },

  // -----------------------------------------------------------------------
  // ENVIRONMENTAL
  // -----------------------------------------------------------------------
  {
    id: 'ice_detected',
    check: (f) => param(f, 'ice_detection_status') === 1,
    event: 'ICE DETECTED',
    severity: 'MEDIUM',
  },
  {
    id: 'high_egt_warn',
    check: (f) => param(f, 'warn_high_egt') === 1,
    event: 'HIGH EGT WARNING',
    severity: 'MEDIUM',
  },

  // -----------------------------------------------------------------------
  // GEAR
  // -----------------------------------------------------------------------
  {
    id: 'gear_up',
    check: (f, prev) =>
      prev !== null &&
      param(prev, 'landing_gear_position') === 1 &&
      param(f, 'landing_gear_position') === 0,
    event: 'LANDING GEAR UP',
    severity: 'INFO',
    risingOnly: false,
  },
  {
    id: 'gear_down',
    check: (f, prev) =>
      prev !== null &&
      param(prev, 'landing_gear_position') === 0 &&
      param(f, 'landing_gear_position') === 1,
    event: 'LANDING GEAR DOWN',
    severity: 'INFO',
    risingOnly: false,
  },

  // -----------------------------------------------------------------------
  // MISSION / SYSTEMS
  // -----------------------------------------------------------------------
  {
    id: 'target_lock',
    check: (f) => param(f, 'target_lock_status') === 1,
    event: 'TARGET LOCK ACQUIRED',
    severity: 'INFO',
  },
  {
    id: 'target_lost',
    check: (f, prev) =>
      prev !== null &&
      param(prev, 'target_lock_status') === 1 &&
      param(f, 'target_lock_status') === 0,
    event: 'TARGET LOCK LOST',
    severity: 'INFO',
    risingOnly: false,
  },
  {
    id: 'master_warning',
    check: (f) => param(f, 'master_warning') === 1,
    event: 'MASTER WARNING',
    severity: 'HIGH',
  },
  {
    id: 'master_caution',
    check: (f) => param(f, 'master_caution') === 1,
    event: 'MASTER CAUTION',
    severity: 'MEDIUM',
  },
  {
    id: 'fault_detected',
    check: (f) => param(f, 'fault_code') !== 0,
    event: (f) => `FAULT DETECTED (code ${param(f, 'fault_code')})`,
    severity: 'HIGH',
  },
  {
    id: 'system_failure',
    check: (f) => param(f, 'system_failure_code') !== 0,
    event: (f) => `SYSTEM FAILURE (code ${param(f, 'system_failure_code')})`,
    severity: 'HIGH',
  },
  {
    id: 'gpws_warning',
    check: (f) => param(f, 'gpws_warning') === 1,
    event: 'GPWS — TERRAIN WARNING',
    severity: 'HIGH',
  },
  {
    id: 'tcas_advisory',
    check: (f) => param(f, 'tcas_advisory') === 1,
    event: 'TCAS ADVISORY',
    severity: 'MEDIUM',
  },
];

// ---------------------------------------------------------------------------
// Flight phase change detection (separate from rule engine)
// ---------------------------------------------------------------------------
function detectPhaseChanges(frames) {
  const events = [];
  let prevPhase = null;

  for (const frame of frames) {
    const phase = frame.parameters?.flight_phase;
    if (phase && phase !== prevPhase) {
      if (prevPhase !== null) {
        events.push({
          timestamp: frame.timestamp,
          event: `PHASE CHANGE: ${prevPhase.toUpperCase()} → ${phase.toUpperCase()}`,
          severity: 'INFO',
        });
      }
      prevPhase = phase;
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Main detector
// ---------------------------------------------------------------------------

/**
 * Scan a telemetry frame array and return a sorted list of flight events.
 *
 * @param {Object[]} frames  - array of telemetry frames (already built by frameBuilder)
 * @returns {Object[]}       - array of { timestamp, event, severity }
 */
function detectEvents(frames) {
  if (!frames || frames.length === 0) return [];

  const events = [];

  // State tracker: for each rule id, is the condition currently active?
  const activeState = {};
  for (const rule of RULES) {
    activeState[rule.id] = false;
  }

  let prevFrame = null;

  for (const frame of frames) {
    for (const rule of RULES) {
      const isActive = rule.check(frame, prevFrame);

      if (rule.risingOnly === false) {
        // Falling-edge / always-fire rules: fire whenever check returns true
        if (isActive) {
          const eventName =
            typeof rule.event === 'function' ? rule.event(frame) : rule.event;
          events.push({
            timestamp: frame.timestamp,
            event: eventName,
            severity: rule.severity,
          });
        }
      } else {
        // Rising-edge rules: fire only on the 0→1 transition
        const wasActive = activeState[rule.id];
        if (isActive && !wasActive) {
          const eventName =
            typeof rule.event === 'function' ? rule.event(frame) : rule.event;
          events.push({
            timestamp: frame.timestamp,
            event: eventName,
            severity: rule.severity,
          });
        }
        activeState[rule.id] = isActive;
      }
    }

    prevFrame = frame;
  }

  // Add phase-change events
  const phaseEvents = detectPhaseChanges(frames);
  events.push(...phaseEvents);

  // Sort by timestamp ascending
  events.sort((a, b) => a.timestamp - b.timestamp);

  return events;
}

module.exports = { detectEvents };