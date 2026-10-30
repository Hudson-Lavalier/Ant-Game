/*
 * WAR SCENARIO & DUEL ARENA GENERATOR
 * Generates balanced 2-colony territorial duel arenas with contested neutral
 * frontiers, symmetric forces, telemetry monitoring, and watchdog oversight.
 */
(()=>{
const { hexDisk, key, hexDistance } = AntGame;

class WarScenario {
 static createNormalWorld(seed = 42, options = {}) {
  const sim = new AntGame.Simulation(seed);
  sim.telemetry = new AntGame.TelemetryEngine(sim);
  sim.watchdog = new AntGame.Watchdog(sim, { policy: options.policy || 'recover' });
  sim.spectatorMode = options.spectatorMode !== undefined ? options.spectatorMode : true;

  // 1. Generate full 500+ hex procedural world (radius = 5 chunks * 48 = 240 hexes, diameter 500+ hexes)
  const chunkRadius = options.chunkRadius !== undefined ? options.chunkRadius : 5;
  for (let cx = -chunkRadius; cx <= chunkRadius; cx++) {
   for (let cy = -chunkRadius; cy <= chunkRadius; cy++) {
    sim.world.ensureChunk(cx, cy);
   }
  }
  AntGame.Ecology.sync(sim);

  // 2. Normal starting resources (strictly in-game default values)
  const startingFood = options.startingFood !== undefined ? options.startingFood : (AntGame.Config.startingFood || 300);
  const startingWater = options.startingWater !== undefined ? options.startingWater : (AntGame.Config.startingWater || 100);
  sim.food = startingFood;
  sim.water = startingWater;
  sim.customFoodCapacity = startingFood;
  sim.customWaterCapacity = startingWater;

  // 3. Locate or instantiate rival colony on procedural map at contesting distance
  const colDistance = options.colonyDistance !== undefined ? options.colonyDistance : 40;
  const c2X = colDistance ? (sim.nest.x + colDistance) : 144;
  const c2Y = sim.nest.y;

  let col2 = sim.colonies.find(c => c.id === 2 || c.featureId === 2);
  if (!col2) {
   const colFeature = { id: 2, type: 'colony', x: c2X, y: c2Y, r: 4, relation: 'hostile' };
   sim.world.features.push(colFeature);
   AntGame.Ecology.sync(sim);
   col2 = sim.colonies.find(c => c.id === 2 || c.featureId === 2);
  }
  if (col2) {
   col2.id = 2; // Normalize to colony 2 for telemetry
   col2.x = c2X;
   col2.y = c2Y;
   col2.state = 'active';
   col2.relation = 'hostile';
   col2.food = startingFood;
   col2.water = startingWater;
   col2.foodCapacity = startingFood;
   col2.waterCapacity = startingWater;
   col2.foodStore = { x: col2.x + 1, y: col2.y };
   col2.waterStore = { x: col2.x - 1, y: col2.y };

   // Clear starter nest disk for Colony 2 on procedural map
   for (const p of hexDisk(col2.x, col2.y, 4)) {
    const c = sim.world.get(p.x, p.y);
    c.solid = false;
    c.discovered = true;
   }

   // Starter food & water chambers for Colony 2 on procedural map (matching Colony 1 founding)
   const c2FoodX = col2.x + 17, c2FoodY = col2.y + 11;
   const c2WaterX = col2.x + 17, c2WaterY = col2.y - 16;
   if (!sim.world.features.some(f => f.id === 'food-start-c2')) {
    sim.world.features.push({ id: 'food-start-c2', type: 'food', x: c2FoodX, y: c2FoodY, r: 2, foodType: 'seeds' });
    for (const p of hexDisk(c2FoodX, c2FoodY, 3)) {
     const c = sim.world.get(p.x, p.y);
     c.solid = false;
    }
   }
   if (!sim.world.features.some(f => f.id === 'water-start-c2')) {
    sim.world.features.push({ id: 'water-start-c2', type: 'water', x: c2WaterX, y: c2WaterY, r: 3 });
    for (const p of hexDisk(c2WaterX, c2WaterY, 3)) {
     const c = sim.world.get(p.x, p.y);
     c.solid = false;
     c.water = 5.0;
     sim.world.activeWater.add(key(p.x, p.y));
    }
   }
   AntGame.Ecology.sync(sim);

   if (!sim.ants.some(a => a.colonyId === 2 && a.type === 'queen')) {
    const q2 = sim.addAnt('queen', col2.x, col2.y, 2);
    q2.fertile = true;
    col2.queenId = q2.id;
    for (let i = 0; i < (options.workers || 4); i++) sim.addAnt('worker', col2.x + i - 1, col2.y + 1, 2);
    if (options.soldiers) {
     for (let i = 0; i < options.soldiers; i++) sim.addAnt('soldier', col2.x, col2.y - 1 - i, 2);
    }
   }
  }

  // 4. Colony 1 starting forces (standard in-game founding)
  const existingC1Workers = sim.ants.filter(a => a.colonyId === 1 && a.type === 'worker').length;
  for (let i = existingC1Workers; i < (options.workers || 4); i++) {
   sim.addAnt('worker', sim.nest.x + i + 1, sim.nest.y, 1);
  }
  if (options.soldiers) {
   const existingC1Soldiers = sim.ants.filter(a => a.colonyId === 1 && a.type === 'soldier').length;
   for (let i = existingC1Soldiers; i < options.soldiers; i++) {
    sim.addAnt('soldier', sim.nest.x, sim.nest.y + 1 + i, 1);
   }
  }
  const c1Workers = sim.ants.filter(a => a.colonyId === 1 && a.type === 'worker');
  if (c1Workers.length > 0) sim.setFeeder(c1Workers[0]);
  if (c1Workers.length > 1) sim.setBroodHelper(c1Workers[1], true);

  // 5. Standard need thresholds
  sim.antFoodNeedRatio = AntGame.Config.antFoodNeedRatio;
  sim.antWaterNeedRatio = AntGame.Config.antWaterNeedRatio;

  // 6. Set starting stores in telemetry
  if (sim.telemetry) {
   sim.telemetry.setStartingStores(1, sim.food, sim.water);
   if (col2) sim.telemetry.setStartingStores(2, col2.food, col2.water);
  }

  return sim;
 }

 static createDuel(seed = 42, options = {}) {
  if (options.normalMap) {
   return WarScenario.createNormalWorld(seed, options);
  }
  const sim = new AntGame.Simulation(seed);

  // Initialize Telemetry and Watchdog
  sim.telemetry = new AntGame.TelemetryEngine(sim);
  sim.watchdog = new AntGame.Watchdog(sim, { policy: options.policy || 'recover' });
  sim.spectatorMode = options.spectatorMode !== undefined ? options.spectatorMode : true;

  const distance = options.distance || 40;
  const c1X = sim.nest.x;
  const c1Y = sim.nest.y;
  const c2X = c1X + distance;
  const c2Y = c1Y;

  // Clear and configure Colony 1 (Player Colony Nest)
  for (const p of hexDisk(c1X, c1Y, 5)) {
   const c = sim.world.get(p.x, p.y);
   c.solid = false;
   c.discovered = true;
  }
  sim.customFoodCapacity = options.startingFood || 1000;
  sim.customWaterCapacity = options.startingWater || 1000;
  sim.food = options.startingFood || 1000;
  sim.water = options.startingWater || 1000;

  // Clear and configure Colony 2 (Rival Colony Nest)
  for (const p of hexDisk(c2X, c2Y, 5)) {
   const c = sim.world.get(p.x, p.y);
   c.solid = false;
   c.discovered = true;
  }

  // Register Colony 2 feature
  const colFeature = { id: 2, type: 'colony', x: c2X, y: c2Y, relation: 'hostile' };
  sim.world.features.push(colFeature);
  AntGame.Ecology.sync(sim);

  const col2 = sim.colonies.find(c => c.id === 2);
  if (col2) {
   col2.state = 'active';
   col2.relation = 'hostile';
   col2.foodStore = { x: c2X + 1, y: c2Y };
   col2.waterStore = { x: c2X - 1, y: c2Y };
   col2.food = options.startingFood || 1000;
   col2.water = options.startingWater || 1000;
  }

  // Remove default starter ants
  sim.ants = [];

  // Spawn symmetric forces for Colony 1
  const q1 = sim.addAnt('queen', c1X, c1Y, 1);
  q1.fertile = true;
  for (let i = 0; i < (options.soldiers || 6); i++) sim.addAnt('soldier', c1X + 1, c1Y, 1);
  for (let i = 0; i < (options.workers || 10); i++) sim.addAnt('worker', c1X, c1Y + 1, 1);
  for (let i = 0; i < (options.majors || 2); i++) sim.addAnt('major', c1X + 2, c1Y, 1);

  // Spawn symmetric forces for Colony 2
  const q2 = sim.addAnt('queen', c2X, c2Y, 2);
  q2.fertile = true;
  for (let i = 0; i < (options.soldiers || 6); i++) sim.addAnt('soldier', c2X - 1, c2Y, 2);
  for (let i = 0; i < (options.workers || 10); i++) sim.addAnt('worker', c2X, c2Y + 1, 2);
  for (let i = 0; i < (options.majors || 2); i++) sim.addAnt('major', c2X - 2, c2Y, 2);

  // Assign Colony 1 autonomous labor roles (feeder and brood helper)
  const c1Workers = sim.ants.filter(a => a.colonyId === 1 && a.type === 'worker');
  if (c1Workers.length > 0) sim.setFeeder(c1Workers[0]);
  if (c1Workers.length > 1) sim.setBroodHelper(c1Workers[1], true);

  // Configure operational need thresholds and starting hunger/thirst
  sim.antFoodNeedRatio = options.antFoodNeedRatio !== undefined ? options.antFoodNeedRatio : 0.35;
  sim.antWaterNeedRatio = options.antWaterNeedRatio !== undefined ? options.antWaterNeedRatio : 0.35;
  const initFoodRatio = options.initialAntFoodRatio !== undefined ? options.initialAntFoodRatio : 0.85;
  const initWaterRatio = options.initialAntWaterRatio !== undefined ? options.initialAntWaterRatio : 0.85;
  for (const a of sim.ants) {
   if (a.foodNeed != null) a.foodNeed = Math.min(a.foodNeed, (a.maxFoodNeed || 50) * initFoodRatio);
   if (a.waterNeed != null) a.waterNeed = Math.min(a.waterNeed, (a.maxWaterNeed || 50) * initWaterRatio);
  }

  // Excavate contested subterranean frontier between nests
  const minX = Math.min(c1X, c2X);
  const maxX = Math.max(c1X, c2X);
  const corridorWidth = options.corridorWidth || 2;

  for (let x = minX; x <= maxX; x++) {
   for (let dy = -corridorWidth; dy <= corridorWidth; dy++) {
    const c = sim.world.get(x, c1Y + dy);
    c.solid = false;
    c.discovered = true;
   }
  }

   // Spawn contested neutral resources, seeds, and wildlife along frontier
   const interval = options.resourceInterval || (distance > 60 ? 35 : distance);
   const wildlifeSpecies = ['isopod', 'spider', 'baby_spider', 'mite'];
   let speciesIdx = 0;
   for (let sx = minX + interval; sx <= maxX - interval / 2; sx += interval) {
    // Neutral corpse
    const corpse = AntGame.Ecology.spawnCreature(sim, 'spider', sx, c1Y, { alive: false, food: 300 });
    sim.creatures.push(corpse);

    // Living wildlife for combat and hunting
    const sp = wildlifeSpecies[speciesIdx++ % wildlifeSpecies.length];
    const creature = AntGame.Ecology.spawnCreature(sim, sp, sx, c1Y - 1, { alive: true, state: 'active', devActivated: true });
    sim.creatures.push(creature);

    // Seed cluster resource
    sim.resources.push({
     id: sim.nextId++,
     x: sx,
     y: c1Y + 1,
     foodType: 'seeds',
     name: 'Seed Cluster',
     remaining: 150,
     total: 150,
     inStorage: false,
     carriedBy: null
    });

    // Shallow water oasis tile nearby
    const wc = sim.world.get(sx, c1Y + 2);
    if (wc) {
     wc.water = 3.0;
     sim.world.activeWater.add(key(sx, c1Y + 2));
    }
   }

  // Optional trench obstacle in neutral territory
  if (options.trenchBarrier) {
   for (let dy = -corridorWidth; dy <= corridorWidth; dy++) {
    if (dy !== 0) { // leave center passage open
     const tc = sim.world.get(midX, c1Y + dy);
     tc.zone = 'trench';
     tc.structure = 'trench';
    }
   }
  }

  if (sim.telemetry) {
   sim.telemetry.setStartingStores(1, sim.food, sim.water);
   sim.telemetry.setStartingStores(2, col2 ? col2.food : 0, col2 ? col2.water : 0);
  }

  return sim;
 }

 static runHeadless(sim, maxTicks = 2000, dt = 0.2, onTick = null) {
  let battleEndTick = null;

  for (let step = 1; step <= maxTicks; step++) {
   sim.update(dt);
   if (onTick) onTick(sim, step);

   const q1Alive = sim.queen ? sim.queen(1)?.alive : false;
   const q2Alive = sim.queen ? sim.queen(2)?.alive : false;

   if (!q1Alive || !q2Alive) {
    battleEndTick = step;
    break;
   }
  }

  const telemetryReport = sim.telemetry?.getReport() || {};
  const watchdogReport = sim.watchdog?.getReport() || {};

  return {
   totalTicksSimulated: battleEndTick || maxTicks,
   battleEnded: battleEndTick !== null,
   telemetry: telemetryReport,
   watchdog: watchdogReport
  };
 }
}

AntGame.WarScenario = WarScenario;
})();
