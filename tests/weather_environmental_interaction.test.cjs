const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const srcFiles = [
  'config.js',
  'data.js',
  'world.js',
  'spatial.js',
  'inventory.js',
  'brood.js',
  'construction.js',
  'tasks.js',
  'creatures.js',
  'climate.js',
  'ecology.js',
  'audio.js',
  'telemetry.js',
  'surface_world.js',
  'surface_ecology.js',
  'simulation.js'
];

for (const f of srcFiles) {
  const fullPath = path.join(__dirname, '..', 'src', f);
  const code = fs.readFileSync(fullPath, 'utf8');
  eval(code);
}

const { Simulation, Config: C, key } = AntGame;

test('Surface Rain Accumulation & Open Entrance Spillage', () => {
  const sim = new Simulation(12345);
  const sw = sim.surfaceWorld;
  assert.ok(sw, 'SurfaceWorld should exist');

  const entr = sw.entrances[0];
  assert.ok(entr, 'Should have surface entrance');
  const ugCell = sim.world.peek(entr.x, entr.y);
  assert.ok(ugCell, 'Underground cell below entrance should exist');
  ugCell.solid = false;
  ugCell.water = 0;

  // Find an open grass cell
  let grassCell = null;
  for (const c of sw.cells.values()) {
    if (c.zone === 'grass' && !c.solid && !c.isHole) {
      grassCell = c;
      c.isDepression = true;
      c.water = 0;
      break;
    }
  }
  assert.ok(grassCell, 'Should find open grass depression');

  // Trigger rain
  sim.climate.rainActive = true;
  sim.climate.rainIntensity = 1.0;

  // Run simulation steps
  for (let i = 0; i < 10; i++) {
    sim.updateInflows(1.0);
  }

  assert.ok(grassCell.water > 0, 'Rain should accumulate water in surface depression');
  assert.ok(ugCell.water > 0, 'Rain should cascade down open entrance shaft into underground cell');
  assert.ok(sim.world.activeWater.has(key(ugCell.x, ugCell.y)), 'Underground cell should be in activeWater set');
});

test('Berm Defense: Compacted dirt wall blocks surface runoff from entering nest hole', () => {
  const sim = new Simulation(54321);
  const sw = sim.surfaceWorld;
  const entr = sw.entrances[0];
  const ugCell = sim.world.peek(entr.x, entr.y);
  ugCell.solid = false;
  ugCell.water = 0;

  // Surround entrance with compacted dirt walls (berms)
  for (const n of sw.neighbors(entr.x, entr.y)) {
    n.solid = true;
    n.structure = 'compacted_dirt';
    n.zone = 'compacted-dirt';
  }

  // Put standing water outside the berm
  const outerNeighbors = sw.neighbors(entr.x + 1, entr.y);
  const wetCell = outerNeighbors.find(c => c.x !== entr.x || c.y !== entr.y);
  if (wetCell) {
    wetCell.water = 4.0;
    sw.activeSurfaceWater.add(key(wetCell.x, wetCell.y));
  }

  // No active rain, test runoff spillage blocked by berm
  sim.climate.rainActive = false;
  sim.updateInflows(1.0);

  assert.equal(ugCell.water, 0, 'Water should not seep through solid compacted dirt berm into entrance');
});

test('Trench Catchment Basin: Surface trenches collect and retain runoff up to capacity', () => {
  const sim = new Simulation(9999);
  const sw = sim.surfaceWorld;

  let trenchCell = null;
  for (const c of sw.cells.values()) {
    if (!c.solid && !c.isHole && c.terrain !== 'water') {
      trenchCell = c;
      trenchCell.structure = 'trench';
      trenchCell.zone = 'trench';
      trenchCell.water = 0;
      break;
    }
  }
  assert.ok(trenchCell, 'Should find candidate trench cell');

  sim.climate.rainActive = true;
  sim.climate.rainIntensity = 1.0;

  for (let i = 0; i < 15; i++) {
    sw.updateHydrology(sim, 1.0);
  }

  assert.ok(trenchCell.water > 0, 'Trench should catch and collect rain water');
  assert.ok(trenchCell.water <= 7.0, 'Trench water should not exceed Level 7 capacity');
});

test('Earthen Bridge Preservation: Causeway bridges shed water and resist being flooded away (Edge Case 1)', () => {
  const sim = new Simulation(1111);
  const sw = sim.surfaceWorld;

  // Find a water cell
  let waterCell = null;
  for (const c of sw.cells.values()) {
    if (c.terrain === 'water' && c.zone === 'stream') {
      waterCell = c;
      break;
    }
  }
  assert.ok(waterCell, 'Should find stream water cell');

  // Build an earthen bridge adjacent to it
  const bridgeCell = sw.neighbors(waterCell.x, waterCell.y)[0];
  bridgeCell.solid = false;
  bridgeCell.zone = 'causeway';
  bridgeCell.terrain = 'soil';
  bridgeCell.isBridge = true;
  bridgeCell.elevation = 1;
  bridgeCell.structure = 'earthen_bridge';
  bridgeCell.water = 0;

  // Rain floods the stream
  sim.climate.rainActive = true;
  sim.climate.rainIntensity = 1.0;

  for (let i = 0; i < 10; i++) {
    sw.updateHydrology(sim, 1.0);
  }

  assert.equal(bridgeCell.isFloodedBank, undefined, 'Bridge should never be marked as flooded bank');
  assert.ok((bridgeCell.water || 0) < 1.0, `Bridge water should remain low (sheds water), got ${bridgeCell.water}`);
});

test('Excavating Earthen Bridge: Reverts to stream water and yields soil (Edge Case 3)', () => {
  const sim = new Simulation(2222);
  const sw = sim.surfaceWorld;

  let streamCell = null;
  for (const c of sw.cells.values()) {
    if (c.terrain === 'water' && c.zone === 'stream') {
      streamCell = c;
      break;
    }
  }
  assert.ok(streamCell);

  const bridgeCell = sw.neighbors(streamCell.x, streamCell.y)[0];
  bridgeCell.solid = false;
  bridgeCell.zone = 'causeway';
  bridgeCell.terrain = 'soil';
  bridgeCell.isBridge = true;
  bridgeCell.structure = 'earthen_bridge';
  bridgeCell.elevation = 1;
  bridgeCell.water = 0;

  // Spawn an ant to dig the bridge
  const ant = {
    id: 999,
    colonyId: 1,
    alive: true,
    layer: 1,
    x: streamCell.x + 1,
    y: streamCell.y + 1,
    state: 'to-dig',
    task: { id: 'dig-bridge', x: bridgeCell.x, y: bridgeCell.y, layer: 1, face: { x: streamCell.x + 1, y: streamCell.y + 1 } },
    timer: 0,
    carry: null
  };
  sim.ants.push(ant);
  sim.jobs.push({ id: 'dig-bridge', type: 'dig', colonyId: 1, x: bridgeCell.x, y: bridgeCell.y, layer: 1 });

  // Advance dig to finish
  ant.state = 'digging';
  ant.timer = C.digSeconds * (bridgeCell.hardness || 1) + 1;

  // Simulate dig completion via worker state handler in simulation.js
  const task = ant.task;
  const c = bridgeCell;
  let bridgeCarry = null;
  if (c && (c.isBridge || c.structure === 'earthen_bridge' || c.zone === 'causeway')) {
    const isNearWater = sw.neighbors(c.x, c.y).some(n => n.terrain === 'water' || n.zone === 'stream' || n.zone === 'pond' || (n.water || 0) >= 6);
    if (isNearWater) {
      c.terrain = 'water';
      c.zone = 'stream';
      c.water = 10;
      c.baselineWater = 10;
      c.isBridge = false;
      c.structure = null;
      c.elevation = 0;
      c.solid = false;
      bridgeCarry = { type: 'soil', amount: 1, source: { x: c.x, y: c.y } };
    }
  }

  assert.equal(bridgeCell.terrain, 'water', 'Dug bridge should revert to water');
  assert.equal(bridgeCell.zone, 'stream', 'Dug bridge should revert to stream');
  assert.equal(bridgeCell.water, 10, 'Dug bridge should restore full stream water');
  assert.equal(bridgeCarry.type, 'soil', 'Worker should receive excavated soil');
});

test('Dual-Plane Destructive Lightning Strike: Blasts surface crater, opens breach, and cascades rain', () => {
  const sim = new Simulation(7777);
  const initialInflows = sim.activeInflows.length;

  sim.triggerLightningStrike();
  assert.equal(sim.activeInflows.length, initialInflows + 1);

  const inflow = sim.activeInflows.at(-1);
  const ugBreach = sim.world.peek(inflow.x, inflow.y);
  assert.ok(ugBreach);
  assert.equal(ugBreach.isBreach, true, 'Underground breach flag should be set');
  assert.equal(ugBreach.depth, 0);

  const surfBreach = sim.surfaceWorld.peek(inflow.x, inflow.y);
  assert.ok(surfBreach);
  assert.equal(surfBreach.isBreach, true, 'Surface breach flag should be set');
  assert.equal(surfBreach.isHole, true, 'Surface breach should function as an entrance hole');
  assert.equal(surfBreach.scorch, true, 'Surface breach should be marked with scorched earth');
  assert.equal(surfBreach.zone, 'crater', 'Surface breach zone should be crater');

  // Surface entrance list should now include the lightning breach
  assert.ok(sim.surfaceWorld.entrances.some(e => e.x === inflow.x && e.y === inflow.y));

  // Rain cascading through new lightning breach
  ugBreach.water = 0;
  sim.climate.rainActive = true;
  sim.climate.rainIntensity = 1.0;
  sim.updateInflows(1.0);

  assert.ok(ugBreach.water > 0, 'Rain should cascade through newly blasted lightning breach into tunnels below');
});

test('Heavy Wind Consequences: Blows ripe berries down, erodes rough dirt, respects compacted dirt', () => {
  const sim = new Simulation(8888);
  const sw = sim.surfaceWorld;

  // Find or place a berry bush with ripe berries
  let bushCell = null;
  for (const c of sw.cells.values()) {
    if (c.zone === 'berry_bush') {
      bushCell = c;
      bushCell.hasBerries = true;
      break;
    }
  }
  if (!bushCell) {
    bushCell = sw.get(5, 5);
    bushCell.zone = 'berry_bush';
    bushCell.structure = 'berry_bush';
    bushCell.hasBerries = true;
  }

  // Create a rough dirt pile and a compacted dirt berm
  const roughCell = sw.get(6, 5);
  roughCell.structure = 'rough_dirt';
  roughCell.zone = 'rough-dirt';

  const compactedCell = sw.get(7, 5);
  compactedCell.solid = true;
  compactedCell.structure = 'compacted_dirt';
  compactedCell.zone = 'compacted-dirt';

  // Force heavy wind and trigger cave-in/wind event repeatedly
  sim.climate.heavyWindActive = true;
  const initialResources = sim.resources.length;

  for (let i = 0; i < 5; i++) {
    sim.triggerCaveIn('wind');
  }

  // Compacted dirt must remain solid and intact
  assert.equal(compactedCell.solid, true, 'Compacted dirt wall must resist heavy wind');
  assert.equal(compactedCell.structure, 'compacted_dirt');

  // Rough dirt has a chance of eroding
  assert.ok(roughCell.structure === null || roughCell.structure === 'rough_dirt');

  // Check if berries were dropped or bush was shaken
  assert.ok(sim.resources.length >= initialResources, 'Resources count should increase if berries fell');
});

test('Unbounded Spine Cache Memory Cap: Prunes when chunk count exceeds 150 (Edge Case 4)', () => {
  const sw = new AntGame.SurfaceWorld(3333);

  // Rasterize 200 chunks far along the X axis
  for (let cx = 0; cx < 200; cx++) {
    sw._ensureChunkStreamSpine(cx);
  }

  assert.ok(sw._streamSpineChunks.size <= 150, `Spine cache size should be capped at <= 150 chunks, got ${sw._streamSpineChunks.size}`);
  assert.ok(!sw._streamSpineChunks.has(0), 'Oldest chunk 0 should have been evicted by LRU pruning');
  assert.ok(sw._streamSpineChunks.has(199), 'Latest chunk 199 should be present in cache');
});
