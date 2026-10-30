const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.window = globalThis;
for (const f of ['config', 'data', 'world', 'brood', 'tasks', 'construction', 'inventory', 'ecology', 'climate', 'simulation']) {
  require('../src/' + f + '.js');
}

const { Simulation, World, Random, pathfind, hexDistance, hexDisk, key, Ecology, Species, isAcrossOneTileTrench, Construction } = AntGame;

test('isAcrossOneTileTrench detects valid 1-tile trench gap between non-solid hexes', () => {
  const s = new Simulation(2001);
  const c0 = s.world.get(10, 10); c0.solid = false; c0.zone = 'nest';
  const cMid = s.world.get(10, 11); cMid.solid = false; cMid.zone = 'trench'; cMid.structure = 'trench';
  const c2 = s.world.get(10, 12); c2.solid = false; c2.zone = 'tunnel';

  assert.equal(hexDistance(c0, c2), 2);
  assert.equal(isAcrossOneTileTrench(s.world, c0, c2), true, 'Hexes across single trench must return true');
  assert.equal(isAcrossOneTileTrench(s.world, c2, c0), true, 'Check must be symmetric');

  // If intermediate is normal dirt or solid, should be false
  cMid.zone = 'nest'; cMid.structure = null;
  assert.equal(isAcrossOneTileTrench(s.world, c0, c2), false);

  // If one side is solid, should be false
  cMid.zone = 'trench'; cMid.structure = 'trench';
  c2.solid = true;
  assert.equal(isAcrossOneTileTrench(s.world, c0, c2), false);
});

test('combat across trenches: ants execute melee strikes across a 1-tile trench without crossing', () => {
  const s = new Simulation(2002);
  const aPos = { x: 30, y: 30 };
  const trenchPos = { x: 30, y: 31 };
  const enemyPos = { x: 30, y: 32 };

  const cA = s.world.get(aPos.x, aPos.y); cA.solid = false; cA.zone = 'nest'; cA.discovered = true;
  const cT = s.world.get(trenchPos.x, trenchPos.y); cT.solid = false; cT.zone = 'trench'; cT.structure = 'trench'; cT.discovered = true;
  const cE = s.world.get(enemyPos.x, enemyPos.y); cE.solid = false; cE.zone = 'tunnel'; cE.discovered = true;

  const ant = s.addAnt('soldier', aPos.x, aPos.y, 1);
  const enemy = Ecology.spawnCreature(s, 'mite', enemyPos.x, enemyPos.y, { alive: true, health: 30 });
  s.creatures.push(enemy);

  // Direct clearance-1 pathfinding across trench should fail (ants cannot enter trench)
  const path = pathfind(s.world, ant, enemy, 1);
  assert.equal(path, null, 'Ant cannot step onto trench');

  // Ordering attack across 1-tile trench succeeds
  const err = s.orderTarget('attack', enemy.id, [ant]);
  assert.equal(err, null, 'Order target across trench must succeed');
  assert.equal(ant.state, 'attack');

  // Ant should be able to strike enemy across the trench in workTarget
  const enemyHpBefore = enemy.health;
  ant.timer = 0;
  Ecology.workTarget(s, ant, 0.1);

  assert.ok(enemy.health < enemyHpBefore, 'Enemy must take melee damage across trench');
  assert.equal(ant.path.length, 0, 'Ant must not pathfind into trench');
});

test('combat across trenches: aggressive creatures attack ants across a 1-tile trench', () => {
  const s = new Simulation(2003);
  const aPos = { x: 40, y: 40 };
  const trenchPos = { x: 40, y: 41 };
  const creaturePos = { x: 40, y: 42 };

  const cA = s.world.get(aPos.x, aPos.y); cA.solid = false; cA.zone = 'nest'; cA.discovered = true;
  const cT = s.world.get(trenchPos.x, trenchPos.y); cT.solid = false; cT.zone = 'trench'; cT.structure = 'trench'; cT.discovered = true;
  const cC = s.world.get(creaturePos.x, creaturePos.y); cC.solid = false; cC.zone = 'tunnel'; cC.discovered = true;

  const ant = s.addAnt('worker', aPos.x, aPos.y, 1);
  ant.health = 100;
  const creature = Ecology.spawnCreature(s, 'spider', creaturePos.x, creaturePos.y, { alive: true, state: 'active' });
  s.creatures.push(creature);

  assert.equal(isAcrossOneTileTrench(s.world, creature, ant), true);

  // Run creature AI update with ant across trench
  creature.timer = 0;
  Ecology.creatures(s, [ant], 0.1);

  assert.ok(ant.health < 100, 'Ant should take damage from creature across 1-tile trench');
});

test('food distinction: construction food uses processed colony stores and tags foodType processed', () => {
  const s = new Simulation(2004);
  s.food = 50;
  s.traits.push('smooth_floor');

  const p = { x: s.world.founding.foodStore.x + 1, y: s.world.founding.foodStore.y };
  const c = s.world.get(p.x, p.y);
  c.solid = false; c.discovered = true; c.zone = 'tunnel';

  // Designate smooth floor: requires 4 dirt + 1 food
  Construction.designateBuild(s, p.x, p.y, null, 'smooth_floor');
  const job = s.jobs.find(j => j.type === 'build' && j.x === p.x && j.y === p.y);
  assert.ok(job);
  assert.equal(job.food, 1);
  assert.equal(job.dirt, 4);

  // Assign worker to deliver food
  const worker = s.addAnt('worker', s.nest.x, s.nest.y, 1);
  worker.task = { id: job.id, type: 'build', structure: 'smooth_floor', x: p.x, y: p.y, fetchType: 'food', foodTile: s.world.founding.foodStore };
  worker.state = 'to-build-supply';
  worker.x = s.world.founding.foodStore.x;
  worker.y = s.world.founding.foodStore.y;

  Construction.stepBuilding(s, worker, 0.1);

  assert.ok(worker.carry, 'Worker should pick up construction material');
  assert.equal(worker.carry.type, 'construction');
  assert.equal(worker.carry.material, 'food');
  assert.equal(worker.carry.foodType, 'processed', 'Construction food must be tagged as processed');
  assert.equal(worker.carry.food, 1);

  // Deliver to blueprint
  worker.x = p.x; worker.y = p.y;
  worker.path = [];
  worker.state = 'delivering-build-material';
  Construction.stepBuilding(s, worker, 0.1);
  assert.equal(job.deliveredFood, 1);

  // Cancel build: verify delivered food refunded to processed stores
  const foodBeforeCancel = s.food;
  Construction.cancel(s, p.x, p.y);
  assert.equal(s.food, foodBeforeCancel + 1, 'Delivered food refunded to processed colony food');
});

test('ai colony parity: rival colony brood goes through full egg -> larva -> pupa -> adult lifecycle', () => {
  const s = new Simulation(2005);
  const f = { id: 3, type: 'colony', x: s.nest.x + 100, y: s.nest.y, relation: 'neutral' };
  s.world.features.push(f);
  Ecology.sync(s);
  const col = s.colonies[0];
  assert.ok(col);
  col.state = 'active';

  for (const p of hexDisk(col.x, col.y, 5)) {
    const c = s.world.get(p.x, p.y);
    c.solid = false;
    c.discovered = true;
  }
  col.foodStore = { x: col.x + 1, y: col.y };

  const queen = s.addAnt('queen', col.x, col.y, col.id);
  queen.fertile = true;
  col.food = 100;
  col.water = 100;

  // Lay egg
  queen.layTimer = 0;
  s.updateQueen(0.1);
  const egg = s.eggs.find(e => e.colonyId === col.id);
  assert.ok(egg, 'Rival queen lays brood egg');
  assert.equal(egg.stage, 'egg');

  // Egg reaches duration -> becomes larva
  egg.age = egg.duration;
  s.updateBrood(0.1);
  assert.equal(egg.stage, 'larva', 'AI egg matures into larva');
  assert.equal(egg.foodAccumulated, 0);

  // Spawn an AI worker and verify it feeds the larva
  const aiWorker = s.addAnt('worker', col.x + 1, col.y, col.id);
  col.food = 100;
  col.water = 100;

  // Trigger larva feeding in ecology with player ant in range
  const playerAnt = s.ants.find(a => a.colonyId === 1);
  playerAnt.x = col.x - 20; playerAnt.y = col.y;
  Ecology.colonies(s, [playerAnt], 0.1);
  assert.ok(aiWorker.task, 'AI worker should take on task');
  assert.equal(aiWorker.task?.type, 'feed-larva');
  assert.equal(egg.beingFedBy, aiWorker.id);

  // Feed larva until required food is met
  egg.foodAccumulated = 30;
  egg.age = egg.duration;
  s.updateBrood(0.1);
  assert.equal(egg.stage, 'pupa', 'Well-fed AI larva spins cocoon and enters pupa stage');

  // Pupa reaches duration -> hatches adult ant
  const popBefore = s.livingPopulation(col.id);
  egg.age = egg.duration;
  s.updateBrood(0.1);
  assert.equal(s.livingPopulation(col.id), popBefore + 1, 'Adult ant emerges for rival colony');
});

test('ai colony parity: rollCasteForColony provides diverse caste distribution', () => {
  const s = new Simulation(2006);
  const castes = new Set();
  for (let i = 0; i < 200; i++) {
    const rolled = s.rollCasteForColony(2);
    castes.add(rolled);
  }

  // Must include combat and specialized morphs
  assert.ok(castes.has('worker'), 'Must include workers');
  assert.ok(castes.has('minor'), 'Must include minors');
  assert.ok(castes.has('media'), 'Must include medias');
  assert.ok(castes.has('soldier'), 'Must include soldiers');
  assert.ok(castes.has('major'), 'Must include majors');
});
