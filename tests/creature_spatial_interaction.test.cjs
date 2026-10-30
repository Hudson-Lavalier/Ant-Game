const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.window = globalThis;
for (const f of ['config', 'data', 'world', 'surface_world', 'spatial', 'brood', 'tasks', 'construction', 'inventory', 'ecology', 'audio', 'settings', 'simulation']) {
  require('../src/' + f + '.js');
}

const { Simulation, World, HexInteractionSlots, HexSpatialHash, applySoftSeparation, HEX_SLOT_OFFSETS, getEntityRadius, Ecology } = AntGame;

test('Creature-Creature Anti-Stacking: two overlapping creatures are nudged apart by soft relaxation bubbles', () => {
  const sim = new Simulation(201);
  const hash = new HexSpatialHash();

  for (const p of AntGame.hexDisk(15, 15, 3)) {
    sim.world.open(p.x, p.y, 'nest', true);
  }

  const miteA = Ecology.spawnCreature(sim, 'mite', 15.0, 15.0, { state: 'active' });
  const miteB = Ecology.spawnCreature(sim, 'mite', 15.05, 15.02, { state: 'active' });
  sim.creatures.push(miteA, miteB);

  const initialDist = Math.hypot(miteA.x - miteB.x, miteA.y - miteB.y);
  assert.ok(initialDist < 0.1, 'Creatures start in extreme overlap');

  const radA = getEntityRadius(miteA);
  const radB = getEntityRadius(miteB);
  const minTargetDist = radA + radB;

  for (let i = 0; i < 60; i++) {
    applySoftSeparation([miteA, miteB], hash, sim);
  }

  const finalDist = Math.hypot(miteA.x - miteB.x, miteA.y - miteB.y);
  assert.ok(finalDist > initialDist, 'Separation force must push creatures apart');
  assert.ok(finalDist >= minTargetDist * 0.95, 'Creatures must reach their collision radius boundaries');
});

test('Creature-Ant Anti-Stacking: mixed collisions push ant and creature apart with zero-allocation UIDs', () => {
  const sim = new Simulation(202);
  const hash = new HexSpatialHash();

  for (const p of AntGame.hexDisk(20, 20, 3)) {
    sim.world.open(p.x, p.y, 'nest', true);
  }

  const ant = sim.addAnt('soldier', 20.0, 20.0);
  const spider = Ecology.spawnCreature(sim, 'spider', 20.08, 20.05, { state: 'active' });
  sim.creatures.push(spider);

  const initialDist = Math.hypot(ant.x - spider.x, ant.y - spider.y);
  const targetDist = getEntityRadius(ant) + getEntityRadius(spider);

  for (let i = 0; i < 60; i++) {
    applySoftSeparation(sim, hash);
  }

  const finalDist = Math.hypot(ant.x - spider.x, ant.y - spider.y);
  assert.ok(finalDist > initialDist, 'Ant and spider must push apart');
  assert.ok(finalDist >= targetDist * 0.95, 'Separation must reach radius sum');
});

test('Anchored Aphid Physical Immunity: anchored root aphids are immune to separation displacement', () => {
  const sim = new Simulation(203);
  const hash = new HexSpatialHash();

  for (const p of AntGame.hexDisk(10, 10, 3)) {
    sim.world.open(p.x, p.y, 'nest', true);
  }

  const aphid = Ecology.spawnCreature(sim, 'root_aphid', 10.0, 10.0, { state: 'active' });
  const ant = sim.addAnt('worker', 10.05, 10.02);
  sim.creatures.push(aphid);

  for (let i = 0; i < 50; i++) {
    applySoftSeparation(sim, hash);
  }

  assert.equal(aphid.x, 10.0, 'Anchored root aphid X must remain strictly fixed');
  assert.equal(aphid.y, 10.0, 'Anchored root aphid Y must remain strictly fixed');
  assert.ok(ant.x !== 10.05 || ant.y !== 10.02, 'Mobile ant must absorb the separation displacement');
});

test('Creature Solid Wall Collision: separation never pushes a creature into solid rock', () => {
  const sim = new Simulation(204);
  const hash = new HexSpatialHash();

  const center = sim.world.get(14, 14);
  center.solid = false;
  center.rock = false;
  center.discovered = true;

  for (const offset of HEX_SLOT_OFFSETS) {
    const wall = sim.world.get(14 + offset.dq, 14 + offset.dr);
    wall.solid = true;
    wall.rock = true;
    wall.discovered = true;
  }

  const miteA = Ecology.spawnCreature(sim, 'mite', 14.0, 14.0, { state: 'active' });
  const miteB = Ecology.spawnCreature(sim, 'mite', 14.1, 14.05, { state: 'active' });
  sim.creatures.push(miteA, miteB);

  for (let step = 0; step < 100; step++) {
    applySoftSeparation(sim, hash);
    const cellA = sim.world.peek(Math.round(miteA.x), Math.round(miteA.y));
    const cellB = sim.world.peek(Math.round(miteB.x), Math.round(miteB.y));
    assert.equal(cellA.solid, false, 'Mite A must never be pushed into solid rock');
    assert.equal(cellB.solid, false, 'Mite B must never be pushed into solid rock');
  }
});

test('Creature Cross-Layer Isolation: surface creature and underground ant apply zero separation force', () => {
  const sim = new Simulation(205);
  const hash = new HexSpatialHash();

  const antUnderground = sim.addAnt('worker', 16.0, 16.0);
  antUnderground.layer = 0;

  const spiderSurface = Ecology.spawnCreature(sim, 'night_spider', 16.0, 16.0, { state: 'active', layer: 1 });
  sim.creatures.push(spiderSurface);

  for (let i = 0; i < 50; i++) {
    applySoftSeparation(sim, hash);
  }

  assert.equal(antUnderground.x, 16.0, 'Underground ant X must remain unchanged');
  assert.equal(antUnderground.y, 16.0, 'Underground ant Y must remain unchanged');
  assert.equal(spiderSurface.x, 16.0, 'Surface spider X must remain unchanged');
  assert.equal(spiderSurface.y, 16.0, 'Surface spider Y must remain unchanged');
});

test('Creature 6-Way Perimeter Slot Claim & Moving Target Tracking: attacking mites claim distinct perimeter slots and track moving target', () => {
  const sim = new Simulation(206);
  sim.aiEnabled = true;

  for (const p of AntGame.hexDisk(20, 20, 6)) {
    sim.world.open(p.x, p.y, 'nest', true);
  }

  const soldier = sim.addAnt('soldier', 20, 20);

  const mites = [];
  for (let i = 0; i < 4; i++) {
    const m = Ecology.spawnCreature(sim, 'mite', 20 + (i + 1), 20, { state: 'active', devActivated: true });
    mites.push(m);
    sim.creatures.push(m);
  }

  // Run creature AI tick
  Ecology.creatures(sim, [soldier], 0.1);

  assert.ok(soldier.slots, 'Target ant should have interaction slots initialized');
  const claimedSlots = new Set();
  for (const m of mites) {
    const slot = soldier.slots.getSlot(m.id);
    assert.ok(slot !== null, `Mite ${m.id} should have claimed a perimeter slot`);
    assert.equal(claimedSlots.has(slot.slotIndex), false, `Slot ${slot.slotIndex} must not be double-claimed`);
    claimedSlots.add(slot.slotIndex);
  }
  assert.equal(claimedSlots.size, 4, 'All 4 mites must occupy distinct perimeter slots');

  // Move the soldier ant
  soldier.x = 22;
  soldier.y = 21;

  // Run creature AI tick to verify dynamic waypoint tracking
  Ecology.creatures(sim, [soldier], 0.1);

  for (const m of mites) {
    const slot = soldier.slots.getSlot(m.id);
    assert.ok(slot !== null);
    const expectedTargetX = Math.round(22 + slot.dq);
    const expectedTargetY = Math.round(21 + slot.dr);
    if (m.path && m.path.length) {
      const dest = m.path[m.path.length - 1];
      assert.equal(dest.x, expectedTargetX, 'Mite path destination must follow dynamic moving target slot X');
      assert.equal(dest.y, expectedTargetY, 'Mite path destination must follow dynamic moving target slot Y');
    }
  }
});

test('Creature Slot Cleanup on Death: when attacking creature dies, slot is freed for waiting attackers', () => {
  const sim = new Simulation(207);
  sim.aiEnabled = true;

  for (const p of AntGame.hexDisk(15, 15, 4)) {
    sim.world.open(p.x, p.y, 'nest', true);
  }

  const queen = sim.queen();
  queen.x = 15;
  queen.y = 15;

  const miteA = Ecology.spawnCreature(sim, 'mite', 16, 15, { state: 'active', devActivated: true });
  sim.creatures.push(miteA);

  Ecology.creatures(sim, [queen], 0.1);
  assert.ok(queen.slots);
  assert.ok(queen.slots.getSlot(miteA.id) !== null, 'Mite A must claim a slot');

  // Mite dies
  miteA.health = 0;
  miteA.alive = false;

  // Run creature tick
  Ecology.creatures(sim, [queen], 0.1);

  assert.equal(queen.slots.getSlot(miteA.id), null, 'Dead mite slot must be immediately freed');
});

test('Bull Weevil Anti-Stacking & Exact Overlap: two weevils at identical coordinates (15.0, 15.0) are ejected apart', () => {
  const sim = new Simulation(208);
  const hash = new HexSpatialHash();

  for (const p of AntGame.hexDisk(15, 15, 3)) {
    sim.world.open(p.x, p.y, 'nest', true);
  }

  // Spawn two weevils at the EXACT same float coordinates
  const weevilA = Ecology.spawnCreature(sim, 'weevil', 15.0, 15.0, { state: 'active' });
  const weevilB = Ecology.spawnCreature(sim, 'weevil', 15.0, 15.0, { state: 'active' });
  sim.creatures.push(weevilA, weevilB);

  assert.equal(weevilA.x, weevilB.x);
  assert.equal(weevilA.y, weevilB.y);

  // Single separation step must immediately break identical coordinates
  applySoftSeparation(sim, hash);

  const distStep1 = Math.hypot(weevilA.x - weevilB.x, weevilA.y - weevilB.y);
  assert.ok(distStep1 > 0.05, 'Exact overlapping weevils must be immediately ejected apart on step 1');

  // Over 40 steps, they should reach their collision radius sum
  const targetDist = getEntityRadius(weevilA) + getEntityRadius(weevilB);
  for (let i = 0; i < 40; i++) {
    applySoftSeparation(sim, hash);
  }

  const finalDist = Math.hypot(weevilA.x - weevilB.x, weevilA.y - weevilB.y);
  assert.ok(finalDist >= targetDist * 0.90, `Weevils must reach separation radius boundary (${finalDist} >= ${targetDist * 0.90})`);
  assert.equal(weevilA.prevX, weevilA.x, 'prevX must be kept in sync with x for smooth rendering');
  assert.equal(weevilB.prevX, weevilB.x, 'prevX must be kept in sync with x for smooth rendering');
});

test('Bull Weevil Wandering Separation: chooseOpen avoids tiles occupied or targeted by another weevil', () => {
  const sim = new Simulation(209);
  // Tunnel from (10,10) to (12,10)
  sim.world.open(10, 10, 'tunnel', true);
  sim.world.open(11, 10, 'tunnel', true);
  sim.world.open(12, 10, 'tunnel', true);

  const weevilA = Ecology.spawnCreature(sim, 'weevil', 10, 10, { state: 'active' });
  const weevilB = Ecology.spawnCreature(sim, 'weevil', 12, 10, { state: 'active' });
  sim.creatures.push(weevilA, weevilB);

  // Weevil B targets the middle tile (11, 10)
  weevilB.path = [{ x: 11, y: 10 }];

  // Weevil A calls chooseOpen: tile (11, 10) is targeted by B, so A should not choose (11, 10) if another option exists
  // Open another tile (10, 9) for A
  sim.world.open(10, 9, 'tunnel', true);

  Ecology.chooseOpen(sim, weevilA, AntGame.Species.weevil);

  assert.ok(weevilA.path.length > 0);
  assert.equal(weevilA.path[0].x, 10, 'Weevil A should pick the unoccupied tile (10,9) rather than competing for (11,10)');
  assert.equal(weevilA.path[0].y, 9, 'Weevil A should pick the unoccupied tile (10,9) rather than competing for (11,10)');
});
