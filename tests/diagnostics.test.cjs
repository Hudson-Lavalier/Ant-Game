const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

globalThis.window = globalThis;
const modules = [
 'config', 'data', 'world', 'surface_world', 'brood', 'tasks', 'construction',
 'inventory', 'ecology', 'climate', 'audio', 'telemetry', 'diagnostics',
 'watchdog', 'war_scenario', 'simulation'
];
for (const m of modules) {
 require('../src/' + m + '.js');
}

const { Simulation, DiagnosticsManager, TIERS, MATURITY } = AntGame;

test('diagnostics registers baseline subsystems and maturities', () => {
 const diag = new DiagnosticsManager();
 assert.equal(diag.getSubsystemMaturity('movement'), MATURITY.CORE_STABLE);
 assert.equal(diag.getSubsystemMaturity('surface_world'), MATURITY.IN_DEVELOPMENT);
 assert.equal(diag.getSubsystemMaturity('colony_memory'), MATURITY.EXPERIMENTAL);
 assert.equal(diag.getSubsystemMaturity('unknown_system'), MATURITY.BETA_POLISHED);
});

test('diagnostics demotes behavioral anomalies to tuning tier for in-development/experimental systems', () => {
 const diag = new DiagnosticsManager();

 // 1. Core stable system keeps BEHAVIOR tier
 const incStable = diag.log(TIERS.BEHAVIOR, 'movement', 'STUCK_IN_WALL', 'Ant is stuck in solid rock');
 assert.equal(incStable.tier, TIERS.BEHAVIOR);
 assert.equal(incStable.tierName, 'BEHAVIOR_ANOMALY');

 // 2. In-development system gets demoted from BEHAVIOR to TUNING
 const incInDev = diag.log(TIERS.BEHAVIOR, 'surface_world', 'POOR_FORAGING_PATH', 'Suboptimal surface path');
 assert.equal(incInDev.tier, TIERS.TUNING);
 assert.equal(incInDev.tierName, 'TUNING_WIP');

 // 3. Fatal crashes and invariant failures are NEVER demoted
 const incFatal = diag.log(TIERS.FATAL, 'surface_world', 'UNCAUGHT_CRASH', 'Fatal null deref');
 assert.equal(incFatal.tier, TIERS.FATAL);

 const incInv = diag.log(TIERS.INVARIANT, 'surface_world', 'NAN_COORDINATES', 'Position corrupted');
 assert.equal(incInv.tier, TIERS.INVARIANT);
});

test('diagnostics enforces rolling 500 error buffer capacity', () => {
 const diag = new DiagnosticsManager();
 diag.dedupWindow = 0; // Disable dedup for pure capacity test

 for (let i = 0; i < 550; i++) {
  diag.log(TIERS.TUNING, 'test', `CODE_${i}`, `Message ${i}`);
 }

 assert.equal(diag.incidents.length, 500);
 // First entry should be CODE_50, last should be CODE_549
 assert.equal(diag.incidents[0].code, 'CODE_50');
 assert.equal(diag.incidents[499].code, 'CODE_549');
});

test('diagnostics deduplicates repeated incidents within window and tracks occurrence count', () => {
 const diag = new DiagnosticsManager();
 diag.dedupWindow = 5.0;

 const ant = { id: 42, type: 'worker', x: 10, y: 15, layer: 0, health: 100, state: 'dig' };

 const inc1 = diag.log(TIERS.BEHAVIOR, 'movement', 'PING_PONG', 'Oscillating between two hexes', ant);
 assert.equal(inc1.occurrences, 1);
 assert.equal(diag.incidents.length, 1);

 // Repeated incident within dedup window
 const inc2 = diag.log(TIERS.BEHAVIOR, 'movement', 'PING_PONG', 'Oscillating between two hexes', ant);
 assert.equal(diag.incidents.length, 1);
 assert.equal(inc2.occurrences, 2);
});

test('ant breadcrumb recording retains rolling trail of last 5-10 distinct positions', () => {
 const diag = new DiagnosticsManager();
 const ant = { id: 7, alive: true, x: 0, y: 0, layer: 0, state: 'idle', age: 1.0 };

 diag.recordBreadcrumb(ant);
 assert.equal(ant._breadcrumbs.length, 1);
 assert.deepEqual(ant._breadcrumbs[0], { x: 0, y: 0, layer: 0, state: 'idle', t: 1.0 });

 // Same position does not create redundant breadcrumbs
 diag.recordBreadcrumb(ant);
 assert.equal(ant._breadcrumbs.length, 1);

 // Movement creates new breadcrumb
 ant.x = 1; ant.y = 2; ant.age = 2.0; ant.state = 'walk';
 diag.recordBreadcrumb(ant);
 assert.equal(ant._breadcrumbs.length, 2);
 assert.deepEqual(ant._breadcrumbs[1], { x: 1, y: 2, layer: 0, state: 'walk', t: 2.0 });
});

test('formatErrorsText produces clean header, breakdown, and flight recorder lines without emojis', () => {
 const diag = new DiagnosticsManager();
 const ant = {
  id: 12, type: 'soldier', x: 5.23, y: 9.87, layer: 1, health: 80, state: 'combat',
  _breadcrumbs: [{ x: 5, y: 9, layer: 1, state: 'walk', t: 10.5 }, { x: 5, y: 10, layer: 1, state: 'combat', t: 11.0 }]
 };

 diag.log(TIERS.FATAL, 'combat', 'STRAY_ATTACK', 'Invalid combat target', ant, { simTime: 45.5 });
 const text = diag.formatErrorsText();

 assert.match(text, /UNDERFOOT FLIGHT RECORDER & ERROR LOG \(errors.txt\)/);
 assert.match(text, /1 Fatal \| 0 Invariants \| 0 Behavioral \| 0 Tuning/);
 assert.match(text, /\[FATAL_CRASH\] \[combat\]/);
 assert.match(text, /Ant #12 \[soldier\] \(Layer: 1, Pos: 5.23, 9.87, HP: 80\)/);
 assert.match(text, /Breadcrumbs: \(5,9@L1:walk\) -> \(5,10@L1:combat\)/);
 // Strictly check for no emojis in output
 assert.equal(/[\u{1F300}-\u{1F9FF}]/u.test(text), false);
});

test('saveErrorsFile writes and overwrites errors.txt to disk', () => {
 const diag = new DiagnosticsManager();
 diag.log(TIERS.INVARIANT, 'storage', 'NEGATIVE_FOOD', 'Food dropped below zero');

 diag.saveErrorsFile();
 const errorsFilePath = path.resolve(process.cwd(), 'errors.txt');
 assert.equal(fs.existsSync(errorsFilePath), true);

 const content = fs.readFileSync(errorsFilePath, 'utf8');
 assert.match(content, /NEGATIVE_FOOD/);

 // Clear and verify overwrite
 diag.clear();
 const clearedContent = fs.readFileSync(errorsFilePath, 'utf8');
 assert.match(clearedContent, /NO INCIDENTS LOGGED/);
 assert.equal(clearedContent.includes('NEGATIVE_FOOD'), false);
});

test('watchdog automatically dispatches incidents to diagnostics', () => {
 const sim = new Simulation(4001);
 sim.watchdog = new AntGame.Watchdog(sim);
 const diag = AntGame.Diagnostics;
 diag.clear();

 const worker = sim.addAnt('worker', 10, 10, 1);
 // Trigger watchdog invariant violation
 sim.watchdog.logIncident('nan_coordinates', 'high', worker, { x: NaN, y: 10 });

 const logged = diag.incidents.find(i => i.code === 'nan_coordinates');
 assert.ok(logged, 'Watchdog incident should be logged into DiagnosticsManager');
 assert.equal(logged.tier, TIERS.INVARIANT);
 assert.equal(logged.subsystem, 'movement');
});
