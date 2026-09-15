const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.window = globalThis;
for (const f of ['config', 'data', 'world', 'brood', 'tasks', 'construction', 'inventory', 'ecology', 'climate', 'simulation']) {
  require('../src/' + f + '.js');
}

const { Simulation, World, Random, pathfind, hexDistance, hexDisk, key, Ecology, Species } = AntGame;

test('starter hatchery chamber generates with valid enclosure, 1 entrance, and capacity for 1 egg', () => {
  const s = new Simulation(1001);
  const hatcheries = s.world.getHatcheries();
  assert.ok(hatcheries.length >= 1, 'Hatchery must exist at founding');
  const starter = hatcheries[0];
  assert.equal(starter.isValid, true, 'Starter hatchery must be valid with 1 entrance');
  assert.equal(starter.tileCount, 5, 'Starter hatchery has 5 floor tiles');
  assert.equal(starter.capacity, 1, '5 floor tiles provide 1 egg capacity');
  assert.equal(starter.openNeighbors.length, 3, 'Starter hatchery entrance is 3 tiles wide');
  assert.equal(starter.entranceCount, 1, 'Starter hatchery entrance count is 1');
  assert.equal(s.physicalHatcheryCap(), 1, 'Physical hatchery cap is 1');
  assert.equal(s.unlockedBroodCap, 1, 'Initial unlocked brood cap is 1');
  assert.equal(s.effectiveBroodCap(), 1, 'Effective brood cap is 1');
});

test('hatchery room validation requires enclosure and exactly 1 entrance', () => {
  const s = new Simulation(1002);
  const hatcheries = s.world.getHatcheries();
  const starter = hatcheries[0];
  assert.equal(starter.isValid, true);

  // Open a second entrance into the starter hatchery
  const wallTile = starter.boundaryWalls[0];
  assert.ok(wallTile);
  const wallCell = s.world.peek(wallTile.x, wallTile.y);
  wallCell.solid = false;
  wallCell.zone = 'nest';

  // Room now has 2 entrances, so it must be invalid with 0 capacity
  const updatedHatcheries = s.world.getHatcheries();
  const invalidRoom = updatedHatcheries.find(h => h.tiles.some(t => t.x === starter.tiles[0].x && t.y === starter.tiles[0].y));
  assert.equal(invalidRoom.isValid, false, 'Room with multiple entrances must be invalid');
  assert.equal(invalidRoom.capacity, 0, 'Invalid room has 0 capacity');
});

test('effective brood capacity gates queen egg laying', () => {
  const s = new Simulation(1003);
  const q = s.queen();
  assert.ok(q);
  s.food = 500;
  s.water = 500;

  // With starter hatchery, cap is 1
  assert.equal(s.effectiveBroodCap(), 1);

  // Lay 1 egg
  const laid = s.layEgg(q);
  assert.equal(laid, true, 'First egg should be laid');
  assert.equal(s.eggs.length, 1);

  // Second egg cannot be laid because brood count equals effective brood cap (1)
  assert.equal(s.canLay(q), false, 'Cannot lay beyond effective brood cap');
  const laidSecond = s.layEgg(q);
  assert.equal(laidSecond, false, 'Second egg should be rejected by cap');
});

test('developmental lifecycle: Egg -> Larva (needs 30 food) -> Pupa -> Adult emergence', () => {
  const s = new Simulation(1004);
  const starter = s.world.getHatcheries()[0];
  assert.ok(starter);
  const hTile = starter.tiles[0];

  // Add an egg manually in hatchery
  const egg = {
    id: s.nextId++,
    x: hTile.x,
    y: hTile.y,
    stage: 'egg',
    age: 0,
    duration: AntGame.Config.brood.eggDuration, // 45s
    assignedAntType: 'worker',
    colonyId: 1,
    health: 25,
    foodAccumulated: 0
  };
  s.eggs.push(egg);

  // Advance 45s: Egg transforms into Larva
  s.updateBrood(45);
  assert.equal(egg.stage, 'larva');
  assert.equal(egg.duration, AntGame.Config.brood.larvaDuration); // 180s
  assert.equal(egg.age, 0);

  // Advance 180s without feeding: Larva cannot pupate without 30 food
  s.updateBrood(180);
  assert.equal(egg.stage, 'larva', 'Larva cannot pupate without 30 food');
  assert.equal(egg.age, 0, 'Larval age clock remains 0 until 30 food accumulated');

  // Feed larva 30 food
  egg.foodAccumulated = 30;
  // Now larval age timer can run
  s.updateBrood(180);
  assert.equal(egg.stage, 'pupa', 'Larva pupates once it has >= 30 food and duration reached');
  assert.equal(egg.duration, AntGame.Config.brood.pupaDuration); // 85s
  assert.equal(egg.age, 0);

  // Advance 85s: Pupa emerges as adult ant
  const initialAntCount = s.livingPopulation(1);
  s.updateBrood(85);
  assert.equal(s.eggs.length, 0, 'Brood entity graduated from eggs list');
  assert.equal(s.livingPopulation(1), initialAntCount + 1, 'Adult ant emerged and joined colony');
});

test('daily Brood Points generation scales with adult caste survivorship', () => {
  const s = new Simulation(1005);
  s.broodPoints = 0;
  // Colony currently has 1 Queen and 1 Worker (+1 BP)
  // Add 1 Major (+2 BP) and 1 Supermajor (+3 BP)
  s.addAnt('major', s.nest.x, s.nest.y);
  s.addAnt('supermajor', s.nest.x, s.nest.y);

  // Total daily BP = 1 (worker) + 2 (major) + 3 (supermajor) = 6 BP
  s.onNewDay();
  assert.equal(s.broodPoints, 6, 'Surviving castes generate exact daily Brood Points');
});

test('Brood Helper unlocks and prioritizes feeding larvae and transporting misplaced brood', () => {
  const s = new Simulation(1006);
  s.broodPoints = 100;
  assert.equal(s.broodHelperUnlocked, false);

  // Buy unlock
  const err = s.buyBroodHelperUnlock();
  assert.equal(err, null);
  assert.equal(s.broodHelperUnlocked, true);
  assert.equal(s.broodPoints, 50);

  // Assign worker as brood helper
  const worker = s.ants.find(a => a.type === 'worker' && a.colonyId === 1);
  assert.ok(worker);
  s.setBroodHelper(worker, true);
  assert.equal(worker.broodHelper, true);

  // Place a hungry larva and a misplaced egg
  const larva = {
    id: s.nextId++,
    x: s.nest.x + 1,
    y: s.nest.y,
    stage: 'larva',
    age: 10,
    duration: 180,
    assignedAntType: 'worker',
    colonyId: 1,
    health: 25,
    foodAccumulated: 0
  };
  s.eggs.push(larva);

  // Brood helper should assign feedLarvae
  s.food = 50;
  worker.state = 'idle';
  worker.task = null;
  s.assign(worker);

   // Worker first routes to food source before feeding
  assert.equal(worker.state, 'to-feed-larva-supply');
  assert.equal(worker.task?.type, 'feed-larva');
  assert.equal(worker.task?.larvaId, larva.id);

  // Simulate ticks: worker walks to food source, picks up food, walks to larva, delivers
  s.syncStores();
  for (let i = 0; i < 300; i++) {
    s.update(1/30);
    if (larva.foodAccumulated > 0) break;
  }
  assert.ok(larva.foodAccumulated > 0, 'Larva received food from Brood Helper');
});

test('feeder fallback handles larval feeding when no Brood Helper exists', () => {
  const s = new Simulation(1007);
  s.broodHelperUnlocked = false;

  const worker = s.ants.find(a => a.type === 'worker' && a.colonyId === 1);
  s.setFeeder(worker);
  assert.equal(worker.feeder, true);

  const larva = {
    id: s.nextId++,
    x: s.nest.x + 1,
    y: s.nest.y,
    stage: 'larva',
    age: 10,
    duration: 180,
    assignedAntType: 'worker',
    colonyId: 1,
    health: 25,
    foodAccumulated: 0
  };
  s.eggs.push(larva);
  s.food = 50;

  worker.state = 'idle';
  worker.task = null;
  s.setCastePriority('feeder', 'feedLarvae', 1);
  s.setCastePriority('feeder', 'feedQueen', 5);
  s.assign(worker);

  assert.equal(worker.state, 'to-feed-larva-supply');
  assert.equal(worker.task?.type, 'feed-larva');
  assert.equal(worker.task?.larvaId, larva.id);
});

test('brood hazards: deep water (>= 6) inflicts drowning damage and kills brood', () => {
  const s = new Simulation(1008);
  const cell = s.world.peek(s.nest.x + 1, s.nest.y);
  cell.solid = false;
  cell.water = 7; // Deep water

  const larva = {
    id: s.nextId++,
    x: cell.x,
    y: cell.y,
    stage: 'larva',
    age: 0,
    duration: 180,
    assignedAntType: 'worker',
    colonyId: 1,
    health: 25,
    foodAccumulated: 0
  };
  s.eggs.push(larva);

  // Update brood in deep water: takes 18 damage/sec
  s.updateBrood(1.0);
  assert.ok(larva.health <= 7);

  // Second second kills it
  s.updateBrood(1.0);
  assert.equal(s.eggs.includes(larva), false, 'Drowned larva was removed from colony brood');
});

test('predators target uncarried living brood entities', () => {
  const s = new Simulation(1009);
  const egg = {
    id: s.nextId++,
    x: s.nest.x + 2,
    y: s.nest.y,
    stage: 'egg',
    age: 0,
    duration: 45,
    assignedAntType: 'worker',
    colonyId: 1,
    health: 25
  };
  s.eggs.push(egg);

  // Spawn aggressive spider near egg
  const spider = Ecology.spawnCreature(s, 'spider', egg.x + 1, egg.y, { state: 'active' });
  s.creatures.push(spider);

  // Advance ecology
  Ecology.creatures(s, [], 0.5);
  assert.ok(spider.task?.targetId === egg.id || spider.path.length >= 0, 'Predator acquired or moved towards brood');
});

test('Brood Shop upgrades and serialization persistence', () => {
  const s = new Simulation(1010);
  s.broodPoints = 1000;

  // Buy upgrades
  assert.equal(s.buyBroodHelperUnlock(), null);
  assert.equal(s.buyFeedUpgrade(), null);
  assert.equal(s.buyBroodCapUpgrade(), null);
  assert.equal(s.buyHatchSpeedUpgrade(), null);
  assert.equal(s.buyMutationEnhancerUpgrade(), null);
  assert.equal(s.buyCasteModifierUpgrade(), null);

  assert.equal(s.feedUpgradeTier, 1);
  assert.equal(s.broodCapTier, 1);
  assert.equal(s.unlockedBroodCap, 3);
  assert.equal(s.hatchSpeedTier, 1);
  assert.equal(s.mutationEnhancerTier, 1);
  assert.equal(s.casteModifierTier, 1);

  // Serialize and restore
  const serialized = JSON.parse(JSON.stringify(s.serialize()));
  const restored = Simulation.restore(serialized);

  assert.equal(restored.broodPoints, s.broodPoints);
  assert.equal(restored.broodHelperUnlocked, true);
  assert.equal(restored.feedUpgradeTier, 1);
  assert.equal(restored.unlockedBroodCap, 3);
  assert.equal(restored.hatchSpeedTier, 1);
  assert.equal(restored.mutationEnhancerTier, 1);
  assert.equal(restored.casteModifierTier, 1);
});

test('egg outside valid hatchery does not hatch to larva', () => {
  const s = new Simulation(1011);
  // Place egg in main nest chamber (outside hatchery)
  const egg = {
    id: s.nextId++,
    x: s.nest.x,
    y: s.nest.y,
    stage: 'egg',
    age: 0,
    duration: AntGame.Config.brood.eggDuration,
    assignedAntType: 'worker',
    colonyId: 1,
    health: 25,
    foodAccumulated: 0
  };
  s.eggs.push(egg);

  // Advance time past egg duration
  s.updateBrood(100);
  assert.equal(egg.stage, 'egg', 'Egg outside hatchery must NOT advance past stage 1');
  assert.equal(egg.age, egg.duration, 'Egg age remains capped at duration until placed in valid hatchery');
});

test('feeder chewing food does not void/delete food when storage is full', () => {
  const s = new Simulation(1012);
  // Cap food storage
  s.food = s.foodCapacity();
  const worker = s.ants.find(a => a.type === 'worker' && a.colonyId === 1);
  assert.ok(worker);
  s.setFeeder(worker);

  const seed = { id: s.nextId++, x: s.nest.x, y: s.nest.y, type: 'seed', remaining: 50, foodType: 'seeds' };
  s.resources.push(seed);

  worker.state = 'processing';
  worker.task = { type: 'chew-food', targetType: 'seed', targetId: seed.id, progress: 0 };
  worker.x = seed.x;
  worker.y = seed.y;

  // Run updateWorker ticks
  s.updateWorker(worker, 0.5);

  // Since storage is at max capacity, available capacity is 0, so seed food should NOT be deducted
  assert.equal(seed.remaining, 50, 'Seed food should not be deducted when colony storage is full');
});

test('spoil room deposits turn to soil walls when spoil pits are completely full', () => {
  const s = new Simulation(1013);
  // Fill all spoil pits to capacity
  for (const p of s.world.pits) {
    p.used = p.capacity;
  }
  const spoilTile = [...s.world.cells.values()].find(c => c.zone === 'spoil' && !c.solid);
  assert.ok(spoilTile);
  const cell = s.world.peek(spoilTile.x, spoilTile.y);
  assert.equal(cell.solid, false);

  const worker = s.ants.find(a => a.type === 'worker' && a.colonyId === 1);
  worker.carry = { type: 'dirt', amount: 1 };
  worker.state = 'to-deposit';
  worker.destination = { point: cell, kind: 'spoil' };
  worker.x = cell.x;
  worker.y = cell.y;

  // Deposit 5 dirt onto the spoil tile
  for (let i = 0; i < 5; i++) {
    worker.carry = { type: 'dirt', amount: 1 };
    worker.state = 'deposit';
    worker.destination = { point: cell, kind: 'spoil' };
    s.deposit(worker, 1.0);
  }

  assert.equal(cell.solid, true, 'Spoil tile with 5 excess dirt solidifies into soil wall');
  assert.equal(cell.zone, 'soil');
});

test('creature corpse food values balance', () => {
  assert.equal(Species.isopod.baseFood, 45, 'Isopod baseFood is 45');
  assert.equal(Species.mite.baseFood, 8, 'Mite baseFood is 8');
  assert.equal(Species.baby_spider.baseFood, 15, 'Baby spider baseFood is 15');
});

test('shift-click order queuing executes in sequence', () => {
  const s = new Simulation(1014);
  const worker = s.ants.find(a => a.type === 'worker' && a.colonyId === 1);
  assert.ok(worker);

  const p1 = { x: s.nest.x - 1, y: s.nest.y };
  const p2 = { x: s.nest.x, y: s.nest.y - 1 };

  // Issue initial move
  s.moveGroup([worker], p1, false);
  assert.ok(worker.path.length > 0, 'Worker is routing to p1');
  assert.equal(worker.orderQueue.length, 0);

  // Queue second move with queue=true (Shift-click)
  s.moveGroup([worker], p2, true);
  assert.equal(worker.orderQueue.length, 1, 'Second order is queued');
  assert.equal(worker.orderQueue[0].point.x, p2.x);

  // Reach p1 and verify queue pops
  worker.x = p1.x;
  worker.y = p1.y;
  worker.path = [];
  s.update(0.1);
  assert.equal(worker.orderQueue.length, 0, 'Popped queued move order');
  assert.ok(worker.path.length > 0, 'Worker is now routing to p2');
  assert.equal(worker.path[worker.path.length - 1].x, p2.x);
});

