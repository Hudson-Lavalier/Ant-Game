# Walkthrough: Freeze Prevention, Watchdog Hardening & Livelock Detection

## Overview
This update addresses the fundamental single-threaded JavaScript event loop starvation limitation. In browser and Node runtimes, an infinite loop or heavy synchronous freeze monopolizes the main call stack, blocking setTimeout, asynchronous I/O (fs.appendFile), and requestAnimationFrame. Consequently, traditional in-thread error handling cannot record a freeze to errors.txt.

This architecture introduces four defensive layers:
1. Synchronous loop circuit breakers ([FREEZE_GUARD]) on dynamic while loops.
2. Glenn Fiedler's accumulator clamp to eliminate the fixed-timestep spiral of death.
3. An out-of-thread Web Worker watchdog (watchdog-worker.js) monitoring main thread heartbeats and reporting freezes to /api/log-errors via HTTP fetch without calling localStorage.
4. Tab visibility synchronization to eliminate false freeze alarms when the browser backgrounds the tab.
5. Watchdog livelock stall detection and immediate synchronous crash flushing.

---

## Technical Details

### 1. Loop Circuit Breakers ([FREEZE_GUARD])
All unbounded loops on path reconstruction, cave founding, and mite routing were bounded with deterministic guard counters:
- World.found(): Added guard > 500 limit on passage excavation.
- findRoute(): Added pGuard > 5000 iteration limit on parent-link backtracking in src/world.js. If a cycle is detected, an explicit [FREEZE_GUARD] error is thrown and reported.
- Ecology.miteRoute(): Added pGuard > 2000 iteration limit on parent link tracing.
- Feature carving in src/ecology.js: Added carveGuard > 2000 limit on cavern excavation iterations.

### 2. Accumulator Clamping (src/app.js)
In the main game loop:
`javascript
acc = Math.min(acc, C.step * 5);
`
Prevents accumulation of unbounded frame steps during heavy system lag or tab focus shifts, preventing the simulation loop from running indefinitely.

### 3. Out-of-Thread Web Worker Watchdog (src/watchdog-worker.js)
- Dedicated worker running in parallel with the main thread.
- Listens for heartbeat messages sent by frame(now) on the main thread.
- If no heartbeat is received within 2000ms, the worker detects a main thread freeze.
- Posts a structured incident payload to /api/log-errors using fetch():
  - Avoids localStorage to prevent ReferenceError: localStorage is not defined inside DedicatedWorkerGlobalScope.
- Synchronizes with document.visibilitychange:
  - When the user switches tabs, visibility event with visible: false pauses freeze detection.
  - When returning to the tab, freeze detection resets its timer cleanly.

### 4. Server Endpoint Logging (server.cjs)
- Updated /api/log-errors to parse incoming worker JSON payloads and append an incident block to errors.txt:
  `
  ================================================================================
  [MAIN THREAD FREEZE DETECTED BY WATCHDOG WORKER]
  Timestamp: ...
  Elapsed Since Last Heartbeat: ... ms
  Threshold: 2000 ms
  ================================================================================
  `
- Keeps backward compatibility with plain text flight recorder uploads from DiagnosticsManager.

### 5. Colony Livelock Detection (src/watchdog.js)
- checkLivelock() runs during Watchdog.tick():
  - Inspects whether unfulfilled digging/construction jobs exist while living commandable ants are present.
  - If no colony progress (digging, mining, movement) occurs over a 30-second sliding window, emits a COLONY_LIVELOCK_STALL warning incident.

### 6. Diagnostics Synchronous Flush (src/diagnostics.js)
- Added flush(targetPath = null) method.
- Calls fs.writeFileSync immediately in Node.js when a tier 1 fatal error occurs, bypassing debounce timers.
- Added this.outputPath override for isolated unit testing.

---

## Verification & Test Results

### 1. Unit & Integration Tests
Run via:
`ash
node --test --test-timeout=10000 tests/*.test.cjs
`
- Total Tests: 213 passed, 0 failed.
- New Test Suite: tests/freeze_prevention_and_livelock.test.cjs (6 passing tests).
  - Path reconstruction cycle detection tripping [FREEZE_GUARD].
  - Founding excavation guard tripping on simulated deadlocks.
  - Mite route reconstruction guard.
  - Synchronous diagnostics flush on fatal errors.
  - Colony livelock stall detection.
  - Watchdog worker state machine and visibility handling.

### 2. Dual-Layer Renderer Tests
Run via:
`ash
node tests/test_renderer.cjs
`
- 9 ant castes x 4 carry states: verified.
- 9 creature species: verified.
- Dual-layer frame benchmark: passed (1.895 ms/frame underground, 0.782 ms/frame surface).
