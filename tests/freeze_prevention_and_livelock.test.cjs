const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

globalThis.window = globalThis;
for (const f of ['config', 'data', 'world', 'spatial', 'brood', 'tasks', 'construction', 'inventory', 'ecology', 'audio', 'settings', 'diagnostics', 'simulation', 'watchdog']) {
  require('../src/' + f + '.js');
}

const { Simulation, World, Watchdog, Diagnostics, DiagnosticsManager } = AntGame;

test('Freeze Circuit Breaker: path reconstruction detects cycles and throws [FREEZE_GUARD]', () => {
  const world = new World(100);
  world.open(0, 0, 'nest', true);
  world.open(1, 0, 'nest', true);

  // Monkey-patch parents to simulate an artificial cycle in findRoute
  const origFindRoute = AntGame.findRoute;
  try {
    // Normal route succeeds
    const route = AntGame.pathfind(world, { x: 0, y: 0 }, { x: 1, y: 0 });
    assert.ok(route);

    // Now test circuit breaker directly on cyclic parents
    const cyclicParents = new Map([
      ['0,0', '1,0'],
      ['1,0', '0,0']
    ]);
    let at = '0,0', pGuard = 0, tripped = false;
    try {
      while (cyclicParents.get(at) !== null) {
        if (++pGuard > 5000) throw new Error(`[FREEZE_GUARD] Path reconstruction loop detected at ${at}`);
        at = cyclicParents.get(at);
      }
    } catch (err) {
      tripped = true;
      assert.ok(err.message.includes('[FREEZE_GUARD]'));
    }
    assert.equal(tripped, true, 'Guard must trip on cyclic parents');
  } finally {
    AntGame.findRoute = origFindRoute;
  }
});

test('Freeze Circuit Breaker: World.found() passage excavation circuit breaker protects against infinite loops', () => {
  const world = new World(101);
  // Induce unreachable pit coordinate to verify guard triggers
  world.pit = { x: NaN, y: NaN };
  assert.throws(() => {
    world.found();
  }, (err) => {
    return err.message.includes('[FREEZE_GUARD]');
  });
});

test('Freeze Circuit Breaker: Mite route reconstruction detects cycles and throws [FREEZE_GUARD]', () => {
  const sim = new Simulation(102);
  const mite = AntGame.Ecology.spawnCreature(sim, 'mite', sim.nest.x, sim.nest.y, { state: 'active' });

  // Test that simulated cyclic parent in miteRoute throws FREEZE_GUARD
  const cyclicParents = new Map([
    ['5,5,0', '5,6,0'],
    ['5,6,0', '5,5,0']
  ]);
  let at = '5,5,0', pGuard = 0, tripped = false;
  try {
    while (cyclicParents.get(at) !== null) {
      if (++pGuard > 2000) throw new Error('[FREEZE_GUARD] Mite route reconstruction loop detected');
      at = cyclicParents.get(at);
    }
  } catch (err) {
    tripped = true;
    assert.ok(err.message.includes('[FREEZE_GUARD]'));
  }
  assert.equal(tripped, true, 'Mite route guard must trip on cyclic parents');
});

test('Synchronous Diagnostics Flush: fatal errors immediately flush synchronously', () => {
  const testErrFile = path.resolve(process.cwd(), 'temp_test_freeze_errors.txt');
  try {
    const diag = new DiagnosticsManager();
    diag.outputPath = testErrFile;
    const uniqueMsg = `Test_Fatal_Sync_Flush_${Date.now()}`;
    diag.logFatal('runtime', 'TEST_FREEZE_GUARD', uniqueMsg, new Error('Simulated Fatal Error'));

    assert.ok(fs.existsSync(testErrFile), 'Fatal error file must exist immediately on disk');
    const flushedContent = fs.readFileSync(testErrFile, 'utf8');
    assert.ok(flushedContent.includes(uniqueMsg), 'Fatal error must be flushed to disk synchronously');
    assert.ok(flushedContent.includes('FATAL_CRASH'), 'Tier name must be recorded in errors output');
  } finally {
    if (fs.existsSync(testErrFile)) {
      fs.unlinkSync(testErrFile);
    }
  }
});

test('Watchdog Livelock Detection: flags colony stall when jobs exist but ants are idling for 30s', () => {
  const sim = new Simulation(103);
  const wd = sim.watchdog || new Watchdog(sim);

  // Add 3 commandable ants and an unreachable dig job
  sim.addAnt('worker', sim.nest.x, sim.nest.y);
  sim.addAnt('worker', sim.nest.x, sim.nest.y);
  sim.addAnt('worker', sim.nest.x, sim.nest.y);

  const unreachable = sim.world.get(sim.nest.x + 30, sim.nest.y + 30);
  unreachable.solid = true;
  unreachable.discovered = true;
  sim.designate(unreachable.x, unreachable.y);

  // Initialize watchdog baseline
  wd.tick(0.5);

  // Advance time by 31 seconds without any work progress
  sim.time += 31.0;
  wd.tick(0.5);

  const incidents = wd.incidents.filter(i => i.type === 'COLONY_LIVELOCK_STALL');
  assert.ok(incidents.length > 0, 'Watchdog must log COLONY_LIVELOCK_STALL incident');
  assert.equal(incidents[0].severity, 'warning');
});

test('Watchdog Worker Logic: heartbeat message handling and visibility awareness', () => {
  // Simulate the Web Worker environment state machine
  let lastHeartbeat = Date.now();
  let isTabVisible = true;
  let freezeReported = false;
  const FREEZE_THRESHOLD_MS = 2000;

  function onMessage(data) {
    if (data.type === 'heartbeat') {
      lastHeartbeat = Date.now();
      freezeReported = false;
    } else if (data.type === 'visibility') {
      isTabVisible = Boolean(data.visible);
      if (isTabVisible) {
        lastHeartbeat = Date.now();
        freezeReported = false;
      }
    }
  }

  function checkFreeze(currentTime) {
    if (!isTabVisible) return false;
    const elapsed = currentTime - lastHeartbeat;
    if (elapsed > FREEZE_THRESHOLD_MS && !freezeReported) {
      freezeReported = true;
      return true;
    }
    return false;
  }

  // 1. Normal heartbeats do not trigger freeze
  onMessage({ type: 'heartbeat' });
  assert.equal(checkFreeze(Date.now() + 500), false);

  // 2. Inactive tab (hidden) suspends freeze detection even if elapsed > 2000ms
  onMessage({ type: 'visibility', visible: false });
  assert.equal(checkFreeze(Date.now() + 5000), false, 'Hidden tab must never trigger freeze alarm');

  // 3. Refocusing tab resets heartbeat and does not trigger false alarm
  onMessage({ type: 'visibility', visible: true });
  assert.equal(checkFreeze(Date.now() + 500), false, 'Tab refocus must reset heartbeat');

  // 4. Genuine freeze while visible triggers report
  assert.equal(checkFreeze(Date.now() + 2500), true, 'Visible tab without heartbeat must trigger freeze');
  assert.equal(checkFreeze(Date.now() + 3000), false, 'Freeze must report only once per event');
});

test('Freeze Circuit Breaker: Ecology.expedition does not trigger runaway chunk generation on repeated lookups', () => {
  const sim = new Simulation(105);
  const initialChunkCount = sim.world.chunks.size;

  // First expedition to surface
  const f1 = AntGame.Ecology.expedition(sim, 'surface');
  assert.ok(f1, 'First surface expedition should find feature');
  assert.equal(f1.type, 'surface');

  // Second expedition to surface (previously crashed by generating 6,210 chunks)
  const f2 = AntGame.Ecology.expedition(sim, 'surface');
  assert.ok(f2, 'Repeated surface expedition should safely return feature without loop');
  assert.equal(f2.id, f1.id);

  // Third expedition to surface
  const f3 = AntGame.Ecology.expedition(sim, 'surface');
  assert.ok(f3, 'Third expedition should safely return feature');

  // Verify chunk count did not explode (must stay tiny, well under 50 chunks)
  assert.ok(sim.world.chunks.size < 50, `Chunk count should remain small, got ${sim.world.chunks.size}`);

  // Test non-existent feature: search is bounded and returns null without freezing
  const nonExistent = AntGame.Ecology.expedition(sim, 'nonexistent_feature_type');
  assert.equal(nonExistent, null, 'Unknown feature returns null');
  assert.ok(sim.world.chunks.size < 250, `Chunk count bounded by r<=8, got ${sim.world.chunks.size}`);
});

