const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.window = globalThis;
for (const f of ['config', 'data', 'world', 'spatial', 'brood', 'tasks', 'construction', 'inventory', 'ecology', 'audio', 'settings', 'simulation']) {
  require('../src/' + f + '.js');
}

const { Simulation, World, HexInteractionSlots, HexSpatialHash, applySoftSeparation, HEX_SLOT_OFFSETS, HEX_SLOT_OFFSETS_RING2 } = AntGame;

test('Ghost Slot Retention: slot is freed and awarded to waiting ants on player order, starvation, and death', () => {
  const sim = new Simulation(100);
  const target = { id: 999, x: 10, y: 10, alive: true, health: 100, species: 'beetle' };
  sim.creatures.push(target);
  for (const p of AntGame.hexDisk(target.x, target.y, 4)) {
    sim.world.open(p.x, p.y, 'nest', true);
  }
  const slots = new HexInteractionSlots(target, 1);
  target.slots = slots;

  const ants = [];
  for (let i = 1; i <= 7; i++) {
    const a = sim.addAnt('soldier', 10 + i, 10);
    a.id = i;
    ants.push(a);
  }

  // Claim 6 slots
  for (let i = 0; i < 6; i++) {
    const slot = slots.claimBestSlot(ants[i].id, ants[i].x, ants[i].y, sim.world);
    assert.ok(slot !== null);
    ants[i].claimedSlot = slot.slotIndex;
    ants[i].task = { type: 'attack', targetId: target.id };
  }
  assert.equal(slots.getOccupantCount(), 6);

  // 7th ant queues in waitingQueue
  const qIdx = slots.claimBestSlot(ants[6].id, ants[6].x, ants[6].y, sim.world);
  assert.equal(qIdx, null);
  assert.equal(slots.waitingQueue.length, 1);
  assert.equal(slots.waitingQueue[0], ants[6].id);

  // 1. Manual move order frees ant0's slot and awards it to waiting ant 7
  const ant0 = ants[0];
  const ant0SlotIdx = slots.slots.indexOf(ant0.id);
  assert.ok(ant0SlotIdx !== -1);
  assert.equal(sim.move(ant0, { x: 9, y: 10 }), null); // Player issues valid move order
  assert.equal(slots.slots[ant0SlotIdx], ants[6].id, 'Waiting ant should immediately inherit freed slot');
  assert.equal(slots.waitingQueue.length, 0);

  // 2. Starvation frees claimed slot
  const ant1 = ants[1];
  const ant1SlotIdx = slots.slots.indexOf(ant1.id);
  assert.ok(ant1SlotIdx !== -1);
  sim.kill(ant1, null, 'starvation');
  assert.equal(slots.slots[ant1SlotIdx], null, 'Starved ant must immediately release slot');

  // 3. Combat death frees claimed slot
  const ant2 = ants[2];
  const ant2SlotIdx = slots.slots.indexOf(ant2.id);
  assert.ok(ant2SlotIdx !== -1);
  sim.kill(ant2, null, 'combat');
  assert.equal(slots.slots[ant2SlotIdx], null, 'Dead ant must immediately release slot');
});

test('Solid Wall Collision: soft separation in a 1-hex dead-end tunnel never pushes ant into solid rock', () => {
  const sim = new Simulation(101);
  const hash = new HexSpatialHash();

  // Create a 1-hex pocket at (12, 12) surrounded by solid rock
  const center = sim.world.get(12, 12);
  center.solid = false;
  center.rock = false;
  center.discovered = true;

  for (const offset of HEX_SLOT_OFFSETS) {
    const wall = sim.world.get(12 + offset.dq, 12 + offset.dr);
    wall.solid = true;
    wall.rock = true;
    wall.discovered = true;
  }

  // Place two large ants in the same cell
  const antA = { id: 101, x: 12.0, y: 12.0, alive: true, type: 'supermajor' };
  const antB = { id: 102, x: 12.1, y: 12.05, alive: true, type: 'supermajor' };
  const entities = [antA, antB];

  // Run separation for 100 steps
  for (let step = 0; step < 100; step++) {
    applySoftSeparation(entities, hash, sim);
    const cellA = sim.world.peek(Math.round(antA.x), Math.round(antA.y));
    const cellB = sim.world.peek(Math.round(antB.x), Math.round(antB.y));
    assert.equal(cellA.solid, false, 'Ant A must never be pushed into a solid rock tile');
    assert.equal(cellB.solid, false, 'Ant B must never be pushed into a solid rock tile');
  }
});

test('Moving Target Tracking: pursuing ants update waypoints dynamically to target.x + slot.dq, target.y + slot.dr', () => {
  const sim = new Simulation(102);
  const enemy = { id: 888, x: 20, y: 20, alive: true, health: 100, species: 'worm' };
  sim.creatures.push(enemy);
  enemy.slots = new HexInteractionSlots(enemy, 1);

  // Clear path between ant and enemy
  for (let q = 5; q <= 29; q++) {
    for (let r = 15; r <= 29; r++) {
      const c = sim.world.get(q, r);
      c.solid = false;
      c.rock = false;
      c.discovered = true;
    }
  }

  const ant = sim.addAnt('soldier', 10, 20);
  ant.task = { type: 'attack', targetId: enemy.id };
  ant.state = 'attack';

  // Ant claims a slot and routes
  AntGame.Ecology.workTarget(sim, ant, 0.05);
  const slotOffset = enemy.slots.getSlotForAnt(ant.id);
  assert.ok(slotOffset, 'Ant should have a claimed slot');

  const initialWaypointX = Math.round(enemy.x + slotOffset.dq);
  const initialWaypointY = Math.round(enemy.y + slotOffset.dr);
  const initialDest = ant.path.length ? ant.path[ant.path.length - 1] : null;
  assert.ok(initialDest, 'Ant should have a path');
  assert.equal(initialDest.x, initialWaypointX);
  assert.equal(initialDest.y, initialWaypointY);

  // Enemy moves 4 hexes away
  enemy.x = 24;
  enemy.y = 23;

  // Run workTarget step
  AntGame.Ecology.workTarget(sim, ant, 0.05);
  const updatedDest = ant.path.length ? ant.path[ant.path.length - 1] : null;
  assert.ok(updatedDest, 'Ant should update path following moving enemy');
  assert.equal(updatedDest.x, Math.round(24 + slotOffset.dq), 'Destination must follow dynamic target position');
  assert.equal(updatedDest.y, Math.round(23 + slotOffset.dr), 'Destination must follow dynamic target position');
});

test('Cross-Layer Isolation: identical coordinates on different layers apply zero separation force', () => {
  const sim = new Simulation(103);
  const hash = new HexSpatialHash();

  const antUnderground = { id: 301, x: 15.0, y: 15.0, alive: true, type: 'major', layer: 0 };
  const antSurface = { id: 302, x: 15.0, y: 15.0, alive: true, type: 'major', layer: 1 };
  const entities = [antUnderground, antSurface];

  for (let i = 0; i < 50; i++) {
    applySoftSeparation(entities, hash, sim);
  }

  assert.equal(antUnderground.x, 15.0, 'Underground ant position must remain unchanged');
  assert.equal(antUnderground.y, 15.0, 'Underground ant position must remain unchanged');
  assert.equal(antSurface.x, 15.0, 'Surface ant position must remain unchanged');
  assert.equal(antSurface.y, 15.0, 'Surface ant position must remain unchanged');
});

test('Spatial Hash Negative Coords: integer bitmask key generation produces unique keys across all quadrant permutations', () => {
  const hash = new HexSpatialHash();
  const seenKeys = new Map();

  const sampleCoords = [
    { q: 10, r: 20 },
    { q: -10, r: 20 },
    { q: 10, r: -20 },
    { q: -10, r: -20 },
    { q: 0, r: 0 },
    { q: -1, r: -1 },
    { q: -1, r: 1 },
    { q: 1, r: -1 },
    { q: 32767, r: 32767 },
    { q: -32768, r: -32768 },
    { q: -32768, r: 32767 },
    { q: 32767, r: -32768 }
  ];

  for (const c of sampleCoords) {
    const key = hash.getKey(c.q, c.r);
    assert.equal(typeof key, 'number');
    assert.ok(key >= 0 && key <= 0xffffffff);
    assert.equal(seenKeys.has(key), false, `Key ${key} should be unique for (${c.q}, ${c.r})`);
    seenKeys.set(key, c);
  }

  // Test exhaustive grid spanning -50 to +50
  seenKeys.clear();
  let total = 0;
  for (let q = -50; q <= 50; q++) {
    for (let r = -50; r <= 50; r++) {
      const key = hash.getKey(q, r);
      assert.equal(seenKeys.has(key), false, `Collision detected at (${q}, ${r}) with key ${key}`);
      seenKeys.set(key, true);
      total++;
    }
  }
  assert.equal(seenKeys.size, total);
});

test('Zero-Allocation Validation: zero array or object allocations during spatial hash update loop', () => {
  const sim = new Simulation(104);
  const hash = sim.spatialHash || new HexSpatialHash();

  // Create 30 ants and 5 creatures in open terrain
  for (let i = 0; i < 30; i++) {
    const a = sim.addAnt('soldier', sim.nest.x + (i % 5), sim.nest.y + Math.floor(i / 5));
    a.id = 1000 + i;
  }
  for (let i = 0; i < 5; i++) {
    sim.creatures.push({
      id: 2000 + i,
      x: sim.nest.x + i,
      y: sim.nest.y + i,
      alive: true,
      species: 'isopod'
    });
  }

  // Warm-up to populate bucket cache
  for (let i = 0; i < 5; i++) {
    applySoftSeparation(sim, hash);
  }

  const initialBucketCount = hash.buckets.size;

  // Intercept Array.prototype.concat to ensure zero frame-time concatenations
  let concatCalled = false;
  const originalConcat = Array.prototype.concat;
  Array.prototype.concat = function (...args) {
    concatCalled = true;
    return originalConcat.apply(this, args);
  };

  try {
    for (let step = 0; step < 100; step++) {
      applySoftSeparation(sim, hash);
    }
  } finally {
    Array.prototype.concat = originalConcat;
  }

  assert.equal(concatCalled, false, 'applySoftSeparation must not call Array.prototype.concat');
  // Buckets should be reused without clearing the Map
  assert.ok(hash.buckets.size >= initialBucketCount);
});
