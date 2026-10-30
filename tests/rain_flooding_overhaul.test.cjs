const test = require('node:test');
const assert = require('node:assert/strict');

// Load all modules
globalThis.window = globalThis;
globalThis.devicePixelRatio = 1;

const modules = [
  'config', 'data', 'world', 'surface_world', 'brood', 'tasks',
  'construction', 'inventory', 'ecology', 'surface_ecology',
  'climate', 'audio', 'telemetry', 'watchdog', 'war_scenario',
  'simulation', 'creatures', 'surface_renderer', 'renderer', 'settings'
];

for (const m of modules) {
  require('../src/' + m + '.js');
}

const { Simulation, hexDistance, hexDisk } = AntGame;

test('Rain & Flooding: Entrance shafts never generate on streams, ponds, or within 2-hex buffer', () => {
  const sim = new Simulation(12345);
  const sw = sim.surfaceWorld;
  assert.ok(sw, 'SurfaceWorld should be initialized');

  for (const entr of sw.entrances) {
    const entrCell = sw.get(entr.x, entr.y);
    assert.equal(entrCell.terrain, 'entrance');
    assert.equal(entrCell.structure, 'entrance_hole');

    // Check surrounding 2-hex buffer
    for (const p of hexDisk(entr.x, entr.y, (entr.r || 0) + 2)) {
      const c = sw.get(p.x, p.y);
      assert.notEqual(c.terrain, 'water', `Hex (${p.x}, ${p.y}) near entrance must not be water terrain`);
      assert.notEqual(c.zone, 'stream', `Hex (${p.x}, ${p.y}) near entrance must not be stream`);
      assert.notEqual(c.zone, 'pond', `Hex (${p.x}, ${p.y}) near entrance must not be pond`);
    }
  }
});

test('Rain & Flooding: Rain steadily infiltrates through underground entrance shafts and ceases when dry', () => {
  const sim = new Simulation(42);
  const sw = sim.surfaceWorld;
  const entr = sw.entrances[0];
  const ugCell = sim.world.peek(entr.x, entr.y);
  assert.ok(ugCell);
  ugCell.solid = false;
  ugCell.water = 0;

  // 1. Without rain, water remains 0
  sim.climate.rainActive = false;
  for (let i = 0; i < 30; i++) sim.update(1 / 30);
  assert.equal(ugCell.water, 0, 'No water should seep into shaft when not raining');

  // 2. Turn on rain
  sim.climate.rainActive = true;
  sim.climate.rainIntensity = 1.0;
  for (let i = 0; i < 60; i++) sim.update(1 / 30);
  assert.ok(ugCell.water > 0, `Underground shaft should take in rain seepage, got ${ugCell.water}`);

  // 3. Turn off rain
  sim.climate.rainActive = false;
  sim.climate.rainIntensity = 0;
  const waterBeforeStop = ugCell.water;
  sim.updateInflows(1 / 30);
  assert.equal(ugCell.water, waterBeforeStop, 'Seepage must immediately cease when rain stops');
});

test('Rain & Flooding: Underground water infiltrating shaft floor spreads via cellular fluid dynamics', () => {
  const sim = new Simulation(99);
  const entr = sim.surfaceWorld.entrances[0];
  const ugCell = sim.world.peek(entr.x, entr.y);
  ugCell.solid = false;
  ugCell.water = 0;

  // Open neighbor tunnel
  const neighbors = sim.world.neighbors(entr.x, entr.y);
  const openN = neighbors[0];
  openN.solid = false;
  openN.water = 0;

  // Simulate rain infiltration filling shaft floor above 1.0
  sim.climate.rainActive = true;
  sim.climate.rainIntensity = 1.0;
  ugCell.water = 2.5;
  ugCell.isSpreading = true;
  sim.world.activeWater.add(`${ugCell.x},${ugCell.y}`);

  // Run ecology fluid step
  AntGame.Ecology.water(sim, 0.5);

  assert.ok(openN.water > 0, `Water should spread into open neighbor tunnel, got ${openN.water}`);
  assert.ok(ugCell.water < 2.5, 'Shaft floor should equalize and decrease as water flows out');
});

test('Rain & Flooding: Surface meadow micro-puddles accumulate during rain and evaporate back to dry', () => {
  const sim = new Simulation(777);
  const sw = sim.surfaceWorld;

  let depression = null;
  for (const c of sw.cells.values()) {
    if (c.zone === 'grass' && !c.solid && !c.isHole) {
      if ((AntGame.hash(sw.seed, c.x, c.y) % 7) === 0) {
        depression = c;
        break;
      }
    }
  }
  assert.ok(depression, 'Should locate a meadow depression cell');
  depression.water = 0;

  // 1. Rain accumulates water in depression
  sim.climate.rainActive = true;
  sim.climate.rainIntensity = 1.0;
  for (let i = 0; i < 10; i++) sw.updateHydrology(sim, 1.0);
  assert.ok(depression.water > 0, `Puddle should accumulate water during rain, got ${depression.water}`);
  assert.ok(depression.water <= 1.5, 'Puddle depth should cap at 1.5');

  // 2. Stopping rain causes evaporation
  sim.climate.rainActive = false;
  for (let i = 0; i < 30; i++) sw.updateHydrology(sim, 1.0);
  assert.equal(depression.water, 0, 'Puddle should completely evaporate back to dry');
});

test('Rain & Flooding: Streams and ponds swell into adjacent banks during rain, and dissipate at the exact same rate', () => {
  const sim = new Simulation(42);
  const sw = sim.surfaceWorld;

  let waterCell = null;
  let bankCell = null;
  for (const c of sw.cells.values()) {
    if (c.terrain === 'water') {
      const neighbors = sw.neighbors(c.x, c.y);
      const bank = neighbors.find(n => !n.solid && n.terrain !== 'water' && !n.isHole);
      if (bank) {
        waterCell = c;
        bankCell = bank;
        break;
      }
    }
  }
  assert.ok(waterCell, 'Should find water cell');
  assert.ok(bankCell, 'Should find adjacent bank cell');

  const baseWater = waterCell.water;
  assert.equal(bankCell.water || 0, 0, 'Bank should start dry');
  assert.ok(!bankCell.isFloodedBank, 'Bank should start unflooded');

  // 1. Rain causes water cell to swell and flood bank
  sim.climate.rainActive = true;
  sim.climate.rainIntensity = 1.0;
  const rainSeconds = 10;
  for (let i = 0; i < rainSeconds; i++) sw.updateHydrology(sim, 1.0);

  assert.ok(waterCell.water > baseWater, 'Water cell should swell above baseline');
  assert.ok(bankCell.isFloodedBank, 'Bank should be marked as flooded bank');
  assert.ok(bankCell.water > 0, `Bank should have water depth from flood, got ${bankCell.water}`);
  const peakBankWater = bankCell.water;

  // 2. Stop rain: dissipate at the exact same rate
  sim.climate.rainActive = false;
  sim.climate.rainIntensity = 0;

  for (let i = 0; i < rainSeconds / 2; i++) sw.updateHydrology(sim, 1.0);
  assert.ok(bankCell.water < peakBankWater, 'Bank water should decrease during dry period');
  assert.ok(bankCell.water > 0, 'Bank water should not be completely gone yet');

  for (let i = 0; i < (rainSeconds / 2) + 2; i++) sw.updateHydrology(sim, 1.0);
  assert.equal(bankCell.water, 0, 'Bank water should fully dissipate');
  assert.equal(bankCell.isFloodedBank, false, 'Bank should no longer be marked flooded');
  assert.equal(waterCell.water, baseWater, 'Water cell should return to baseline level');
});

test('Rain & Flooding: Swollen stream/pond expanding onto entrance hole rim cascades water underground', () => {
  const sim = new Simulation(42);
  const sw = sim.surfaceWorld;
  const entr = sw.entrances[0];
  const ugCell = sim.world.peek(entr.x, entr.y);
  assert.ok(ugCell);
  ugCell.solid = false;
  ugCell.water = 0;

  const rimNeighbors = sw.neighbors(entr.x, entr.y);
  const rimBank = rimNeighbors[0];
  assert.ok(rimBank);

  // 1. Normal rain without bank overflow seeps gently
  sim.climate.rainActive = true;
  sim.climate.rainIntensity = 1.0;
  rimBank.isFloodedBank = false;
  rimBank.water = 0;

  sim.updateInflows(1.0);
  const gentleSeep = ugCell.water;
  assert.ok(gentleSeep > 0 && gentleSeep < 0.1, `Gentle seepage expected ~0.07, got ${gentleSeep}`);

  // 2. Swollen stream bank expands onto rim
  ugCell.water = 0;
  rimBank.isFloodedBank = true;
  rimBank.bankZone = 'stream';
  rimBank.water = 1.5;

  sim.updateInflows(1.0);
  const cascadeInflow = ugCell.water;
  assert.ok(cascadeInflow > 0.4, `Torrential cascade should pour into hole (~0.55/s), got ${cascadeInflow}`);
  assert.ok(rimBank.water < 1.5, 'Hole should drain overflowing bank water');
  assert.ok(entr._cascadeActive, 'Entrance should register cascade as active');

  // 3. Bank recedes below threshold
  rimBank.isFloodedBank = false;
  rimBank.water = 0;
  ugCell.water = 0;
  sim.updateInflows(1.0);
  assert.ok(ugCell.water < 0.1, 'Inflow should return to gentle rain seepage when stream recedes');
  assert.equal(entr._cascadeActive, false, 'Cascade should be deactivated');
});
