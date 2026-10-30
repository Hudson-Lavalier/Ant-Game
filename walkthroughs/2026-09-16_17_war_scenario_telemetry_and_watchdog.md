# Walkthrough: War Scenario, Behavioral Telemetry & Glitch Detection Watchdog

This document details the implementation and verification of the **War Scenario Generator**, **Behavioral Telemetry Engine**, and **Glitch Detection Watchdog**, designed to simulate multi-colony conflicts headlessly or visually while actively catching behavioral anomalies, infinite loops, and glitches.

---

## 1. Key Accomplishments & Features

### A. Behavioral Telemetry & Key Event Tracking ([`src/telemetry.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/telemetry.js))
- **Kill Attribution & Cause of Death**:
  - Fatal blows record victim and killer IDs, castes, colony affiliations, and coordinates.
  - Causes of death tracked explicitly: `combat`, `starvation`, `dehydration`, and `drowning`.
- **Damage Accounting**:
  - Live tracking of cumulative damage dealt and received per colony.
- **Key Event Stream**:
  - Logs high-impact milestones: `queen_slain`, `brood_hatched`, `hostility_declared`, and `watchdog_incident`.
- **Structured Battle Reports**:
  - `telemetry.getReport()` generates a complete summary including total kills, remaining living populations, queens' health, win/loss result, and recent battle events.

### B. Glitch Detection & Loop Watchdog ([`src/watchdog.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/watchdog.js))
- **Task Thrashing Detection**:
  - Tracks state transition frequency (`_recentStates`).
  - Flags `TASK_THRASHING` if an ant flips between identical states 6 or more times within 3 seconds.
- **Pathing Ping-Pong / Oscillation Detection**:
  - Evaluates recent hex history (`_recentHexes`).
  - Flags `PATH_OSCILLATION` when an ant repeatedly steps back and forth between two hexes ($A \leftrightarrow B$) with zero net displacement.
- **State Deadlock & Stagnation**:
  - Monitors duration in active working states (`digging`, `to-carry`, `feeding-larva`, `building`, `processing`).
  - Flags `STATE_DEADLOCK` if an ant remains in a single non-idle state without progress for more than 25 seconds.
- **Orphaned Brood & Target Reservation Cleanup**:
  - Detects and clears dangling `egg.beingFedBy` or `egg.beingTransportedBy` locks if the assigned ant died or switched tasks.
  - Detects and clears dangling `creature.reservedFor`, `creature.processingFeederId`, or `resource.reservedFor` locks.
- **Numerical Anomaly Audit**:
  - Detects `NaN`, `null`, `undefined`, or `Infinity` in ant coordinates, health, or colony food/water values.
- **Automatic Recovery**:
  - Under the default `'recover'` policy, flagged ants are safely released back to `idle` with cleared paths and reset state buffers, preventing permanent simulation lockups.

### C. Balanced War Scenario Duel Generator ([`src/war_scenario.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/war_scenario.js))
- **Symmetric Duel Arenas**:
  - Generates two fortified colonies separated by a configurable distance (default 35–40 hexes).
  - Spawns matched forces: 1 Queen, 6 Soldiers, 10 Workers, 2 Majors per side.
  - Hollow nest chambers with initial 250–300 food and water reserves.
  - Middle no-man's-land cavern with contested neutral food resources (spider carcasses, seed clusters) and choke points.
- **Headless & Spectator Execution**:
  - `WarScenario.runHeadless(sim, maxTicks, dt, onTick)` executes hundreds or thousands of ticks in seconds without UI or canvas overhead.
  - Supports `sim.spectatorMode = true` for zero-player AI vs AI matches.

### D. Headless Runner Script ([`scripts/run_war_scenario.cjs`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/scripts/run_war_scenario.cjs))
- Run command:
  ```powershell
  & "C:\Users\hudso\AppData\Roaming\Antigravity\bin\agy-node.cmd" scripts/run_war_scenario.cjs [seed] [ticks] [distance]
  ```
- Streams real-time tick telemetry and outputs a complete post-battle postmortem with kill feeds, damage tallies, and watchdog anomaly audits.

### E. In-Game Dev UI Integration
- Added **Start War Duel** and **Watchdog Report** buttons to the in-game Developer Tools panel ([`index.html`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/index.html) and [`src/app.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/app.js)).

---

## 2. File Changes & Architecture

| File | Modifications |
|---|---|
| [`src/telemetry.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/telemetry.js) | Created TelemetryEngine: tracks kills, cause of death, damage dealt/received, event stream, and battle reports. |
| [`src/watchdog.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/watchdog.js) | Created Watchdog: detects task thrashing, 2-hex ping-pong oscillations, state deadlocks, orphaned locks, and NaN corruption with auto-recovery. |
| [`src/war_scenario.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/war_scenario.js) | Created WarScenario: creates balanced duel arenas, symmetric armies, contested frontier caverns, and headless battle runner. |
| [`scripts/run_war_scenario.cjs`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/scripts/run_war_scenario.cjs) | Created CLI runner script for automated headless war simulations with real-time logging and audit summaries. |
| [`src/simulation.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js) | Updated `Simulation.kill` with killer attribution, cause of death, orphan cleanup on ant death, and watchdog tick integration. |
| [`src/ecology.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/ecology.js) | Updated `Ecology.damage` to accept and record attacker entity and pass killer attribution on fatal blows. |
| [`src/brood.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/brood.js) | Integrated telemetry recording on adult ant emergence. |
| [`index.html`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/index.html) & [`src/app.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/app.js) | Loaded new script tags and wired Dev Tools buttons for launching war duels and viewing watchdog reports. |
| [`tests/watchdog_and_war.test.cjs`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/tests/watchdog_and_war.test.cjs) | 7 dedicated unit tests verifying kill attribution, orphan cleanup, task thrashing recovery, oscillation recovery, deadlock recovery, NaN detection, and full scenario execution. |

---

## 3. Automated Verification Results

### Dedicated Test Suite: `tests/watchdog_and_war.test.cjs`
```
✔ telemetry accurately records kill attribution, cause, and damage tracking (19.99ms)
✔ ant death cleans up dangling brood feed locks and target reservations (18.17ms)
✔ watchdog detects task thrashing loop and automatically recovers ant (10.01ms)
✔ watchdog detects path ping-pong oscillation loop and automatically recovers ant (7.92ms)
✔ watchdog detects state deadlock and stalls (4.71ms)
✔ watchdog detects numerical corruption anomalies (5.59ms)
✔ war scenario creates balanced duel arena and runs headlessly with full report (84.47ms)

ℹ tests 7
ℹ suites 0
ℹ pass 7
ℹ fail 0
```

### Full Test Suite Run
```
ℹ tests 164
ℹ suites 0
ℹ pass 164
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1625.1371
```

All 164 tests passed with 0 failures and 0 regressions.
