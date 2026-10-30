/*
 * UNDERFOOT DIAGNOSTICS & FLIGHT RECORDER SUBSYSTEM
 * Captures fatal runtime crashes, structural invariant violations, behavioral anomalies,
 * and tuning heuristics without false-flagging in-development systems.
 *
 * Automatically manages a rolling buffer of the last 500 errors/incidents and
 * persists/exports them to errors.txt.
 */
(()=>{
const AntGame = globalThis.AntGame = globalThis.AntGame || {};
const hasNodeFs = typeof process !== 'undefined' && process.versions && process.versions.node && typeof require !== 'undefined';
let nodeFs = null, nodePath = null;
if (hasNodeFs) {
  try {
    nodeFs = require('node:fs');
    nodePath = require('node:path');
  } catch(e) {}
}

const TIERS = {
  FATAL: 1,      // P0: Uncaught JS exceptions, undefined access, crashes
  INVARIANT: 2,  // P1: Physical/mathematical impossibilities (NaN, negative inventory, ghost layer jump)
  BEHAVIOR: 3,   // P2: Confirmed gameplay rule breaks in stable systems (starvation next to full food)
  TUNING: 4      // P3: Suboptimal heuristics, experimental mechanics, work-in-progress telemetry
};

const TIER_NAMES = {
  1: 'FATAL_CRASH',
  2: 'INVARIANT_FAIL',
  3: 'BEHAVIOR_ANOMALY',
  4: 'TUNING_WIP'
};

const MATURITY = {
  CORE_STABLE: 'CORE_STABLE',       // Strict assertions; T1, T2, T3 active
  BETA_POLISHED: 'BETA_POLISHED',   // T1, T2 active; T3 logged as warnings
  IN_DEVELOPMENT: 'IN_DEVELOPMENT', // T1, T2 active; T3 demoted to T4
  EXPERIMENTAL: 'EXPERIMENTAL'      // T1 active; all others logged as T4 telemetry
};

class DiagnosticsManager {
  constructor() {
    this.maxIncidents = 500;
    this.incidents = [];
    this.subsystems = new Map();
    this.dedupWindow = 5.0; // Suppress identical errors within 5 seconds
    this.recentFingerprints = new Map();
    this.sessionStartTime = new Date();
    this.errorFilePending = false;
    this.saveDebounceTimer = null;

    // Register baseline subsystems
    this.registerSubsystem('movement', MATURITY.CORE_STABLE);
    this.registerSubsystem('excavation', MATURITY.CORE_STABLE);
    this.registerSubsystem('storage', MATURITY.CORE_STABLE);
    this.registerSubsystem('queen_lifecycle', MATURITY.CORE_STABLE);
    this.registerSubsystem('pathfinding', MATURITY.CORE_STABLE);
    this.registerSubsystem('combat', MATURITY.BETA_POLISHED);
    this.registerSubsystem('squads_zones', MATURITY.BETA_POLISHED);
    this.registerSubsystem('weather_climate', MATURITY.BETA_POLISHED);
    this.registerSubsystem('surface_world', MATURITY.IN_DEVELOPMENT);
    this.registerSubsystem('colony_memory', MATURITY.EXPERIMENTAL);
  }

  registerSubsystem(name, maturity = MATURITY.BETA_POLISHED) {
    this.subsystems.set(name, maturity);
  }

  getSubsystemMaturity(name) {
    return this.subsystems.get(name) || MATURITY.BETA_POLISHED;
  }

  // Generate unique fingerprint for deduplication
  fingerprint(tier, subsystem, code, entityId) {
    return `${tier}:${subsystem}:${code}:${entityId || 'none'}`;
  }

  log(tier, subsystem, code, message, entity = null, context = {}) {
    const maturity = this.getSubsystemMaturity(subsystem);

    // If subsystem is experimental or in development, demote behavioral flags to Tier 4
    let effectiveTier = tier;
    if (tier === TIERS.BEHAVIOR && (maturity === MATURITY.IN_DEVELOPMENT || maturity === MATURITY.EXPERIMENTAL)) {
      effectiveTier = TIERS.TUNING;
    }

    const nowSec = Date.now() / 1000;
    const fp = this.fingerprint(effectiveTier, subsystem, code, entity?.id);
    const lastSeen = this.recentFingerprints.get(fp);

    if (lastSeen && (nowSec - lastSeen) < this.dedupWindow) {
      // Find existing incident and bump occurrence count
      const existing = this.incidents.slice().reverse().find(i => i.fingerprint === fp);
      if (existing) {
        existing.occurrences = (existing.occurrences || 1) + 1;
        existing.lastOccurred = new Date().toISOString();
        this.scheduleAutoSave();
        return existing;
      }
    }

    this.recentFingerprints.set(fp, nowSec);

    // Clean up old fingerprints
    if (this.recentFingerprints.size > 200) {
      for (const [k, t] of this.recentFingerprints.entries()) {
        if (nowSec - t > 10.0) this.recentFingerprints.delete(k);
      }
    }

    // Build Flight Recorder Snapshot
    const incident = {
      id: this.incidents.length + 1,
      timestamp: new Date().toISOString(),
      gameTime: context.simTime !== undefined ? Number(context.simTime.toFixed(2)) : null,
      tier: effectiveTier,
      tierName: TIER_NAMES[effectiveTier] || 'UNKNOWN',
      subsystem,
      subsystemMaturity: maturity,
      code,
      message,
      occurrences: 1,
      fingerprint: fp,
      entity: entity ? {
        id: entity.id,
        caste: entity.type || entity.species || 'unknown',
        layer: entity.layer !== undefined ? entity.layer : 0,
        x: Number((entity.x || 0).toFixed(2)),
        y: Number((entity.y || 0).toFixed(2)),
        health: entity.health,
        state: entity.state || null,
        task: entity.task ? { type: entity.task.type, targetId: entity.task.targetId } : null,
        carry: entity.carry ? { type: entity.carry.type, amount: entity.carry.amount, foodType: entity.carry.foodType } : null,
        breadcrumbs: entity._breadcrumbs ? [...entity._breadcrumbs].slice(-5) : []
      } : null,
      context: {
        ...context,
        stack: context.stack || (effectiveTier === TIERS.FATAL ? new Error().stack : null)
      }
    };

    this.incidents.push(incident);
    if (this.incidents.length > this.maxIncidents) {
      this.incidents.shift();
    }

    // Console output formatted with clear tier
    const prefix = `[Underfoot ${incident.tierName}][${subsystem}]`;
    if (effectiveTier === TIERS.FATAL) {
      console.error(prefix, message, incident);
    } else if (effectiveTier === TIERS.INVARIANT) {
      console.warn(prefix, message, incident);
    } else if (effectiveTier === TIERS.BEHAVIOR) {
      console.info(prefix, message, incident);
    } else {
      // Tier 4: tuning
      console.debug(prefix, message, incident);
    }

    if (effectiveTier === TIERS.FATAL) {
      this.flush();
    } else {
      this.scheduleAutoSave();
    }
    this.dispatchLiveUpdate(incident);
    return incident;
  }

  // Convenience logging helpers
  logFatal(subsystem, code, message, error = null, entity = null, context = {}) {
    return this.log(TIERS.FATAL, subsystem, code, message, entity, {
      ...context,
      errorName: error?.name,
      errorMessage: error?.message,
      stack: error?.stack || new Error().stack
    });
  }

  logInvariant(subsystem, code, message, entity = null, context = {}) {
    return this.log(TIERS.INVARIANT, subsystem, code, message, entity, context);
  }

  logBehavior(subsystem, code, message, entity = null, context = {}) {
    return this.log(TIERS.BEHAVIOR, subsystem, code, message, entity, context);
  }

  logTuning(subsystem, code, message, details = {}) {
    return this.log(TIERS.TUNING, subsystem, code, message, null, details);
  }

  // Attach breadcrumb tracking to an ant
  recordBreadcrumb(ant) {
    if (!ant || !ant.alive) return;
    ant._breadcrumbs = ant._breadcrumbs || [];
    const last = ant._breadcrumbs[ant._breadcrumbs.length - 1];
    const rx = Math.round(ant.x), ry = Math.round(ant.y);
    const layer = ant.layer || 0;
    const state = ant.state || 'idle';

    if (!last || last.x !== rx || last.y !== ry || last.layer !== layer || last.state !== state) {
      ant._breadcrumbs.push({ x: rx, y: ry, layer, state, t: Number((ant.age || 0).toFixed(1)) });
      if (ant._breadcrumbs.length > 10) ant._breadcrumbs.shift();
    }
  }

  // Generate clean, formatted errors.txt content
  formatErrorsText() {
    const lines = [];
    const countFatal = this.incidents.filter(i => i.tier === TIERS.FATAL).length;
    const countInv = this.incidents.filter(i => i.tier === TIERS.INVARIANT).length;
    const countBeh = this.incidents.filter(i => i.tier === TIERS.BEHAVIOR).length;
    const countTune = this.incidents.filter(i => i.tier === TIERS.TUNING).length;

    lines.push('================================================================================');
    lines.push('  UNDERFOOT FLIGHT RECORDER & ERROR LOG (errors.txt)');
    lines.push('================================================================================');
    lines.push(`Session Started:     ${this.sessionStartTime.toISOString()}`);
    lines.push(`Report Generated:    ${new Date().toISOString()}`);
    lines.push(`Total Incidents:     ${this.incidents.length} / ${this.maxIncidents} (Max Capacity)`);
    lines.push(`Summary:             ${countFatal} Fatal | ${countInv} Invariants | ${countBeh} Behavioral | ${countTune} Tuning`);
    lines.push('================================================================================\n');

    if (this.incidents.length === 0) {
      lines.push('  [NO INCIDENTS LOGGED - Simulation running cleanly with zero anomalies]\n');
    } else {
      for (let idx = 0; idx < this.incidents.length; idx++) {
        const inc = this.incidents[idx];
        const occStr = inc.occurrences > 1 ? ` (x${inc.occurrences})` : '';
        lines.push(`[#${String(idx + 1).padStart(3, '0')}] ${inc.timestamp} [${inc.tierName}] [${inc.subsystem}]${occStr}`);
        lines.push(`  Message:     ${inc.message} (${inc.code})`);
        lines.push(`  Maturity:    ${inc.subsystemMaturity}`);
        if (inc.gameTime !== null) lines.push(`  Sim Time:    ${inc.gameTime}s`);
        if (inc.entity) {
          const e = inc.entity;
          lines.push(`  Entity:      Ant #${e.id} [${e.caste}] (Layer: ${e.layer}, Pos: ${e.x}, ${e.y}, HP: ${e.health})`);
          lines.push(`  State:       ${e.state || 'none'} | Task: ${e.task ? e.task.type : 'none'} | Carry: ${e.carry ? `${e.carry.type} (${e.carry.amount})` : 'none'}`);
          if (e.breadcrumbs && e.breadcrumbs.length > 0) {
            const crumbs = e.breadcrumbs.map(b => `(${b.x},${b.y}@L${b.layer}:${b.state})`).join(' -> ');
            lines.push(`  Breadcrumbs: ${crumbs}`);
          }
        }
        if (inc.context && Object.keys(inc.context).length > 0) {
          const ctxClean = { ...inc.context };
          delete ctxClean.stack;
          if (Object.keys(ctxClean).length > 0) {
            lines.push(`  Context:     ${JSON.stringify(ctxClean)}`);
          }
        }
        if (inc.context?.stack) {
          const stackShort = inc.context.stack.split('\n').slice(0, 4).map(s => '    ' + s.trim()).join('\n');
          lines.push(`  Stack Trace:\n${stackShort}`);
        }
        lines.push('--------------------------------------------------------------------------------');
      }
    }

    return lines.join('\n');
  }

  // Synchronously flush all incidents to errors.txt immediately
  flush() {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    this.saveErrorsFile();
  }

  // Debounced auto-save to errors.txt
  scheduleAutoSave() {
    if (this.saveDebounceTimer) return;
    this.saveDebounceTimer = setTimeout(() => {
      this.saveDebounceTimer = null;
      this.saveErrorsFile();
    }, 1000);
  }

  flush(targetPath = null) {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    this.saveErrorsFile(targetPath);
  }

  saveErrorsFile(targetPath = null) {
    const text = this.formatErrorsText();

    // 1. If in Node environment, write directly to errors.txt (overwrites file)
    if (nodeFs && nodePath) {
      try {
        const outPath = targetPath || this.outputPath || nodePath.resolve(process.cwd(), 'errors.txt');
        nodeFs.writeFileSync(outPath, text, 'utf8');
      } catch (e) {
        // Suppress fs errors in restricted environments
      }
    }

    // 2. If in Browser environment
    if (typeof window !== 'undefined') {
      // Store in localStorage
      try {
        window.localStorage?.setItem('underfoot_errors_txt', text);
      } catch (e) {}

      // Dispatch to local development server if running via npm start
      try {
        if (window.fetch) {
          window.fetch('/api/log-errors', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: text
          }).catch(() => {});
        }
      } catch (e) {}
    }
  }

  // Download errors.txt directly in the browser
  downloadErrorsTxt() {
    const text = this.formatErrorsText();
    if (typeof window !== 'undefined' && window.document) {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = 'errors.txt';
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  // Copy errors text to clipboard
  copyErrorsTxt() {
    const text = this.formatErrorsText();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      return navigator.clipboard.writeText(text);
    }
    return Promise.reject(new Error('Clipboard API unavailable'));
  }

  // Notify active listeners (e.g. F2 Diagnostics Modal)
  dispatchLiveUpdate(incident) {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
      const evt = new CustomEvent('underfoot:diagnostic', { detail: { incident, manager: this } });
      window.dispatchEvent(evt);
    }
  }

  clear() {
    this.incidents = [];
    this.recentFingerprints.clear();
    this.saveErrorsFile();
    this.dispatchLiveUpdate(null);
  }
}

// Instantiate singleton
AntGame.TIERS = TIERS;
AntGame.TIER_NAMES = TIER_NAMES;
AntGame.MATURITY = MATURITY;
AntGame.Diagnostics = new DiagnosticsManager();
AntGame.DiagnosticsManager = DiagnosticsManager;

})();
