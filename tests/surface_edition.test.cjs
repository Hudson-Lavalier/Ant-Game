const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Setup headless DOM and AntGame environment
globalThis.window = {
 addEventListener: () => {},
 removeEventListener: () => {}
};
globalThis.document = {
 getElementById: () => null,
 querySelector: () => null,
 querySelectorAll: () => [],
 activeElement: null
};

// Load codebase in runtime order
const srcFiles = [
 'src/config.js',
 'src/data.js',
 'src/world.js',
 'src/surface_world.js',
 'src/brood.js',
 'src/tasks.js',
 'src/construction.js',
 'src/inventory.js',
 'src/ecology.js',
 'src/surface_ecology.js',
 'src/climate.js',
 'src/audio.js',
 'src/telemetry.js',
 'src/watchdog.js',
 'src/war_scenario.js',
 'src/simulation.js',
 'src/creatures.js',
 'src/weather_effects.js',
 'src/surface_renderer.js',
 'src/renderer.js'
];

for(const file of srcFiles){
 const code = fs.readFileSync(path.resolve(file), 'utf8');
 eval(code);
}

test('Surface Edition: SurfaceWorld generates procedural open meadow, water, and entrance holes', (t) => {
 const sim = new AntGame.Simulation(42);
 assert.ok(sim.surfaceWorld, 'sim.surfaceWorld must exist');
 assert.strictEqual(sim.activeLayer, 'underground', 'default start layer must be underground');

 // Test entrance hole mapping: breach at [0, -25]
 const entranceCell = sim.surfaceWorld.get(0, -25);
 assert.strictEqual(entranceCell.terrain, 'entrance', 'Surface breach at [0, -25] should be entrance terrain');
 assert.strictEqual(entranceCell.structure, 'entrance_hole', 'Entrance structure must be entrance_hole');
 assert.strictEqual(sim.surfaceWorld.isEntrance(0, -25), true, 'isEntrance should return true for [0, -25]');

 // Test open grass generation
 const grassCell = sim.surfaceWorld.get(10, 10);
 assert.ok(grassCell.terrain, 'Grass cell should have terrain defined');
 assert.strictEqual(grassCell.layer, 1, 'Surface cell must have layer = 1');
});

test('Surface Edition: 10-block 3D distance metric across layers', (t) => {
 const antUnderground = { x: 0, y: 0, layer: 0 };
 const antSurface = { x: 0, y: 0, layer: 1 };
 const distVertical = AntGame.hexDistance3D(antUnderground, antSurface);
 assert.strictEqual(distVertical, 10, 'Entities at same (x,y) but different layers must have distance 10');

 const antSurfaceFar = { x: 15, y: 0, layer: 1 };
 const dist3D = AntGame.hexDistance3D(antUnderground, antSurfaceFar);
 assert.strictEqual(dist3D, 25, 'Distance should be horizontal 15 + vertical 10 = 25');
});

test('Surface Edition: Ants above ground have 20-30 block vision with LOS', (t) => {
 const sim = new AntGame.Simulation(99);
 const worker = sim.addAnt('worker', 0, 0);
 worker.layer = 1; // On surface

 // Update ecology vision
 AntGame.Ecology.update(sim, 0.5);

 // Worker should reveal cells out to 25 hexes on surface if unobstructed
 const farSurfaceCell = sim.surfaceWorld.get(20, 0);
 assert.strictEqual(farSurfaceCell.discovered, true, 'Surface cell 20 hexes away should be revealed by surface worker');

 // Verify Line-of-Sight blocking with wall
 const blocker = sim.surfaceWorld.get(5, 5);
 blocker.solid = true;
 blocker.opaque = true;
 blocker.cliff = true;
 const hasLOS = sim.surfaceWorld.hasLineOfSight({ x: 0, y: 0 }, { x: 10, y: 10 });
 assert.strictEqual(hasLOS, false, 'Line of sight should be blocked by obstacle between (0,0) and (10,10)');
});

test('Surface Edition: Hollow stumps provide tactical hiding from predator aggro', (t) => {
 const sim = new AntGame.Simulation(101);
 const ant = sim.addAnt('worker', 10, 10);
 ant.layer = 1;

 const spider = AntGame.Ecology.spawnCreature(sim, 'night_spider', 15, 10, { layer: 1, state: 'active' });
 sim.creatures.push(spider);

 // Clear line of sight: spider should see ant
 assert.strictEqual(sim.surfaceWorld.hasLineOfSight(spider, ant), true);

 // Block sight with hollow stump wall
 const wall = sim.surfaceWorld.get(12, 10);
 wall.solid = true;
 wall.opaque = true;
 assert.strictEqual(sim.surfaceWorld.hasLineOfSight(spider, ant), false, 'Hollow stump wall blocks predator LOS');
});

test('Surface Edition: Dynamic Ecology replenishes berries every 7 minutes and spawns night spiders', (t) => {
 const sim = new AntGame.Simulation(555);
 const sw = sim.surfaceWorld;

 // Create depleted berry bush
 const bush = sw.get(2, 2);
 bush.zone = 'berry_bush';
 bush.hasBerries = false;
 bush.berryReplenishTimer = 0;

 // Advance 420 seconds (7 minutes)
 AntGame.SurfaceEcology.update(sim, 420);
 assert.strictEqual(bush.hasBerries, true, 'Berry bush should replenish after 420 seconds (7 mins)');
 assert.ok(sim.resources.some(r => r.layer === 1 && r.foodType === 'berries'), 'Harvestable berries resource should be added');

 // Test night spiders spawning at night
 if(sim.climate) sim.climate.isDay = false;
 sim.nightSpiderTimer = 60;
 AntGame.SurfaceEcology.update(sim, 1);
 assert.ok(sim.creatures.some(c => c.species === 'night_spider'), 'Night spiders should spawn at night');

 // Test dawn retreat
 if(sim.climate) sim.climate.isDay = true;
 AntGame.SurfaceEcology.update(sim, 1);
 const spider = sim.creatures.find(c => c.species === 'night_spider');
 assert.strictEqual(spider.retreating, true, 'Night spiders must enter retreat state at dawn');
});

test('Surface Edition: Surface building whitelist permits dirt/trenches but rejects hatcheries', (t) => {
 const sim = new AntGame.Simulation(777);
 sim.activeLayer = 'surface';
 const target = sim.surfaceWorld.get(0, -20);
 target.discovered = true;
 target.solid = false;

 // Try to build hatchery on surface
 const allowedHatchery = AntGame.Construction.designateBuild(sim, 0, -20, null, 'hatchery_floor');
 assert.strictEqual(allowedHatchery, false, 'Hatchery floor must not be allowed on the surface');

 // Try to build plain dirt on surface
 const allowedDirt = AntGame.Construction.designateBuild(sim, 0, -20, null, 'dirt');
 assert.strictEqual(allowedDirt, true, 'Plain dirt must be permitted on the surface');
});

test('Surface Edition: Serialization preserves dual-layer state and surface world', (t) => {
 const sim = new AntGame.Simulation(12345);
 sim.switchLayer('surface');
 const serialized = sim.serialize();
 assert.strictEqual(serialized.activeLayer, 'surface', 'Serialized save must retain activeLayer = surface');
 assert.ok(serialized.surfaceWorld, 'Serialized save must include surfaceWorld data');

 const restored = AntGame.Simulation.restore(serialized);
 assert.strictEqual(restored.activeLayer, 'surface', 'Restored sim must maintain surface activeLayer');
 assert.ok(restored.surfaceWorld, 'Restored sim must restore surfaceWorld instance');
});

test('Surface Edition: Pre-populated chunks exist immediately in SurfaceWorld', (t) => {
 const sim = new AntGame.Simulation(888);
 assert.ok(sim.surfaceWorld.cells.size > 3000, 'SurfaceWorld should have starting chunks pre-populated (over 3000 cells)');
 assert.ok(sim.surfaceWorld.peek(0, 0), 'Cell (0,0) must exist in surface cells map');
 assert.ok(sim.surfaceWorld.peek(0, -25), 'Entrance hole cell (0,-25) must exist in surface cells map');
});

test('Surface Edition: Ant at underground breach senses out and reveals surface meadow', (t) => {
 const sim = new AntGame.Simulation(999);
 const worker = sim.addAnt('worker', 0, -25);
 worker.layer = 0; // Underground

 // Verify surface cell above and 15 hexes away is undiscovered initially
 const surfaceCell = sim.surfaceWorld.get(0, -15);
 surfaceCell.discovered = false;

 // Update ecology
 AntGame.Ecology.update(sim, 0.5);

 // Worker at breach should have revealed surface entrance and meadow above
 assert.strictEqual(sim.surfaceWorld.get(0, -25).discovered, true, 'Surface entrance cell must be discovered by underground ant at breach');
 assert.strictEqual(surfaceCell.discovered, true, 'Surface meadow within 25 hexes must be discovered by seeing out');
});

test('Surface Edition: Cross-layer routing navigates underground ant to surface target via entrance hole', (t) => {
 const sim = new AntGame.Simulation(1122);
 // Connect passage to entrance [0, -25] underground
 for(let y = 0; y >= -25; y--){
  const c = sim.world.get(0, y);
  c.solid = false;
  c.discovered = true;
 }
 const worker = sim.addAnt('worker', 0, -20);
 worker.layer = 0;

 // Discover destination on surface [0, -30]
 const surfaceDest = sim.surfaceWorld.get(0, -30);
 surfaceDest.discovered = true;
 surfaceDest.solid = false;

 // Order worker to move to surface destination
 const err = sim.move(worker, { x: 0, y: -30, layer: 1 });
 assert.strictEqual(err, null, 'Cross-layer move order should succeed');
 assert.ok(worker.pendingCrossLayerTarget, 'Ant should have pendingCrossLayerTarget');
 assert.strictEqual(worker.pendingCrossLayerTarget.layer, 1);

 // Advance simulation until ant traverses to surface
 for(let i = 0; i < 300; i++){
  sim.update(1/30);
  if(worker.layer === 1) break;
 }

 assert.strictEqual(worker.layer, 1, 'Ant must have transitioned to surface layer = 1');

 // Continue advancing until ant reaches destination
 for(let i = 0; i < 300; i++){
  sim.update(1/30);
  if(AntGame.hexDistance(worker, surfaceDest) <= 0.5) break;
 }

 assert.ok(AntGame.hexDistance(worker, surfaceDest) <= 0.5, 'Ant should have reached surface target');
});

test('Surface Edition: Cross-layer routing navigates surface ant to underground target', (t) => {
 const sim = new AntGame.Simulation(3344);
 const worker = sim.addAnt('worker', 0, -30);
 worker.layer = 1;

 // Connect underground passage from [0, -25] to nest [-9, 0]
 for(let y = 0; y >= -25; y--){
  const c = sim.world.get(0, y);
  c.solid = false;
  c.discovered = true;
 }

 const ugDest = sim.world.peek(sim.nest.x, sim.nest.y);
 ugDest.discovered = true;
 ugDest.solid = false;

 // Order surface worker to underground nest
 const err = sim.move(worker, { x: ugDest.x, y: ugDest.y, layer: 0 });
 assert.strictEqual(err, null, 'Surface to underground move order should succeed');

 // Advance simulation until ant transitions to underground
 for(let i = 0; i < 300; i++){
  sim.update(1/30);
  if(worker.layer === 0) break;
 }

 assert.strictEqual(worker.layer, 0, 'Ant must transition down to underground layer = 0');
});

test('Surface Edition: Independent area painting on surface modifies surfaceWorld without touching underground world', (t) => {
 const sim = new AntGame.Simulation(401);
 sim.switchLayer('surface');

 const surfCell = sim.surfaceWorld.get(5, -20);
 surfCell.discovered = true;
 surfCell.solid = false;

 const ugCell = sim.world.get(5, -20);
 ugCell.discovered = true;
 ugCell.solid = false;
 delete ugCell.area;

 // Paint area on surface
 const ok = sim.paintArea(5, -20, 'Meadow Outpost', 'territory');
 assert.strictEqual(ok, true, 'Surface area painting should succeed');
 assert.strictEqual(surfCell.area?.name, 'Meadow Outpost', 'Surface cell must have painted area');
 assert.strictEqual(ugCell.area, undefined, 'Underground cell at same coordinates must remain unaffected');

 // Rename area
 const nextId = sim.renameArea(surfCell.area.id, 'Highlands');
 assert.ok(nextId, 'Rename should return new id');
 assert.strictEqual(surfCell.area?.name, 'Highlands', 'Surface cell area name should update');
 assert.strictEqual(ugCell.area, undefined, 'Underground cell remains unaffected after rename');

 // Erase area
 const erased = sim.eraseArea(nextId);
 assert.strictEqual(erased, true, 'Erase should succeed');
 assert.strictEqual(surfCell.area, undefined, 'Surface cell area must be deleted');
});

test('Surface Edition: Independent behavioral zone painting and querying on surface', (t) => {
 const sim = new AntGame.Simulation(402);
 sim.switchLayer('surface');

 const surfCell = sim.surfaceWorld.get(10, -22);
 surfCell.discovered = true;
 surfCell.solid = false;

 const ugCell = sim.world.get(10, -22);
 ugCell.discovered = true;
 ugCell.solid = false;
 delete ugCell.behaviorZone;

 // Paint foraging zone on surface
 const res = sim.paintZone(10, -22, 'Clover Field', 'foraging');
 assert.strictEqual(res.ok, true, 'Surface foraging zone painting should succeed');
 assert.strictEqual(surfCell.behaviorZone, res.id, 'Surface cell must have behaviorZone');
 assert.strictEqual(ugCell.behaviorZone, undefined, 'Underground cell at same coordinates must not have behaviorZone');

 // Query zone
 assert.strictEqual(sim.isHexInZone(10, -22, res.id), true, 'isHexInZone without explicit layer should find surface zone');
 assert.strictEqual(sim.isHexInZone(10, -22, res.id, 1), true, 'isHexInZone with layer 1 should return true');
 assert.strictEqual(sim.isHexInZone(10, -22, res.id, 0), false, 'isHexInZone with layer 0 should return false');
});

test('Surface Edition: Surface renderer displays area and behavioral zone overlays', (t) => {
 const sim = new AntGame.Simulation(403);
 const swCell = sim.surfaceWorld.get(0, -25);
 swCell.discovered = true;
 swCell.solid = false;
 swCell.behaviorZone = 'foraging:Meadow';

 const dummyCanvas = {
  width: 800,
  height: 600,
  getContext: () => ({
   fillStyle: '',
   strokeStyle: '',
   lineWidth: 1,
   save: () => {},
   restore: () => {},
   fillRect: () => {},
   beginPath: () => {},
   arc: () => {},
   fill: () => {},
   stroke: () => {},
   createRadialGradient: () => ({ addColorStop: () => {} }),
   ellipse: () => {}
  })
 };

 const baseRenderer = {
  dpr: 1,
  colorMap: true,
  overlayMode: 'zones',
  screen: (x, y) => ({ x: 400 + x * 20, y: 300 + y * 20 }),
  poly: () => {},
  behaviorZoneColor: (c) => '#55dd5588',
  zoneColor: (c) => '#7b64a888'
 };

 const sr = new AntGame.SurfaceRenderer(dummyCanvas, baseRenderer);
 let polyCalled = 0;
 baseRenderer.poly = () => { polyCalled++; };

 sr.draw(sim, { x: 0, y: -25, zoom: 1, s: 20 });
 assert.ok(polyCalled > 0, 'SurfaceRenderer must call poly to draw zone overlays');
});

test('Surface Edition: Autonomous foraging dispatches underground worker to surface berry bush, harvests, and stores food underground', (t) => {
 const sim = new AntGame.Simulation(404);

 // Connect passage from nest [-9, 0] to entrance [0, -25]
 for(let y = 0; y >= -25; y--){
  const c = sim.world.get(0, y);
  c.solid = false;
  c.discovered = true;
 }
 for(let x = -9; x <= 0; x++){
  const c = sim.world.get(x, 0);
  c.solid = false;
  c.discovered = true;
 }
 sim.world.get(sim.foodStore.x, sim.foodStore.y).discovered = true;
 sim.world.get(sim.foodStore.x, sim.foodStore.y).solid = false;

 const worker = sim.addAnt('worker', sim.nest.x, sim.nest.y);
 worker.layer = 0;
 worker.foodNeed = 100;
 worker.waterNeed = 100;

 // Discover entrance hole on surface and create ripe berry bush at [0, -28]
 const entranceCell = sim.surfaceWorld.get(0, -25);
 entranceCell.discovered = true;
 entranceCell.solid = false;

 const bushCell = sim.surfaceWorld.get(0, -28);
 bushCell.discovered = true;
 bushCell.solid = false;
 bushCell.zone = 'berry_bush';
 bushCell.structure = 'berry_bush';
 bushCell.hasBerries = true;

 // Test available harvest target detection
 const target = sim.findAvailableHarvestTarget(worker);
 assert.ok(target, 'Worker must recognize ripe surface berry bush as available harvest target');
 assert.strictEqual(target.layer, 1, 'Target must be on surface layer');
 assert.strictEqual(target.foodType, 'berries');

 // Assign task to worker
 AntGame.TaskEngine.assign(sim, worker);
 assert.strictEqual(worker.task?.type, 'harvest', 'Worker should be assigned harvest task');
 assert.strictEqual(worker.state, 'harvest', 'Worker state should be harvest');

 // Simulate worker movement: should navigate through entrance to surface
 let reachedSurface = false;
 for(let i = 0; i < 600; i++){
  sim.update(1/30);
  if(worker.layer === 1){
   reachedSurface = true;
   break;
  }
 }
 assert.strictEqual(reachedSurface, true, 'Worker should transition to surface layer 1');

 // Worker continues to bush, harvests, and transitions to carrying
 let harvested = false;
 for(let i = 0; i < 400; i++){
  sim.update(1/30);
  if(worker.carry && worker.carry.type === 'food'){
   harvested = true;
   break;
  }
 }
 assert.strictEqual(harvested, true, 'Worker must harvest berries into carry load');
 assert.strictEqual(worker.state, 'carrying', 'Worker should be carrying food to storage');

 // Worker returns through entrance back to underground food store
 let returnedUnderground = false;
 for(let i = 0; i < 600; i++){
  sim.update(1/30);
  if(worker.layer === 0){
   returnedUnderground = true;
   break;
  }
 }
 assert.strictEqual(returnedUnderground, true, 'Worker carrying berries must return through entrance to underground layer 0');
});

test('Surface Edition: Autonomous hauling dispatches underground worker to surface corpse, carries through entrance, and stores food underground', (t) => {
 const sim = new AntGame.Simulation(405);

 // Connect passage to entrance [0, -25]
 for(let y = 0; y >= -25; y--){
  const c = sim.world.get(0, y);
  c.solid = false;
  c.discovered = true;
 }
 for(let x = -9; x <= 0; x++){
  const c = sim.world.get(x, 0);
  c.solid = false;
  c.discovered = true;
 }

 const worker = sim.addAnt('worker', sim.nest.x, sim.nest.y);
 worker.layer = 0;
 worker.foodNeed = 100;
 worker.waterNeed = 100;

 const entranceCell = sim.surfaceWorld.get(0, -25);
 entranceCell.discovered = true;
 entranceCell.solid = false;

 const corpseCell = sim.surfaceWorld.get(0, -27);
 corpseCell.discovered = true;
 corpseCell.solid = false;

 const corpse = AntGame.Ecology.spawnCreature(sim, 'isopod', 0, -27, {
  alive: false,
  layer: 1,
  food: 30,
  inStorage: false,
  state: 'dead'
 });
 sim.creatures.push(corpse);

 // Target detection
 const carryTarget = sim.findAvailableCarryTarget(worker);
 assert.ok(carryTarget, 'Worker must recognize surface corpse as carry target');
 assert.strictEqual(carryTarget.id, corpse.id);

 // Assign
 AntGame.TaskEngine.assign(sim, worker);
 assert.strictEqual(worker.task?.type, 'carry', 'Worker must be assigned carry task');

 // Move to surface
 for(let i = 0; i < 600; i++){
  sim.update(1/30);
  if(worker.layer === 1) break;
 }
 assert.strictEqual(worker.layer, 1, 'Worker must transition to surface to reach corpse');

 // Pick up corpse
 for(let i = 0; i < 300; i++){
  sim.update(1/30);
  if(worker.carry?.type === 'corpse') break;
 }
 assert.strictEqual(worker.carry?.type, 'corpse', 'Worker must pick up corpse');

 // Return underground
 for(let i = 0; i < 600; i++){
  sim.update(1/30);
  if(worker.layer === 0) break;
 }
 assert.strictEqual(worker.layer, 0, 'Worker must carry corpse back underground');
});

test('Surface Edition: Surface brush commands target surface entities and not underground entities', (t) => {
 const sim = new AntGame.Simulation(406);
 sim.switchLayer('surface');

 // Underground resource at (0, -28)
 sim.resources.push({
  id: 'ug-seed-1',
  foodType: 'seeds',
  x: 0,
  y: -28,
  layer: 0,
  remaining: 10,
  inStorage: false
 });

 // Surface resource at (0, -28)
 const surfSeed = {
  id: 'surf-seed-1',
  foodType: 'seeds',
  x: 0,
  y: -28,
  layer: 1,
  remaining: 10,
  inStorage: false
 };
 sim.resources.push(surfSeed);

 const surfaceWorker = sim.addAnt('worker', 0, -26);
 surfaceWorker.layer = 1;
 sim.surfaceWorld.get(0, -28).discovered = true;
 sim.surfaceWorld.get(0, -28).solid = false;
 sim.surfaceWorld.get(0, -26).discovered = true;
 sim.surfaceWorld.get(0, -26).solid = false;

 const count = sim.brush(0, -28, 0, 'carry', [surfaceWorker]);
 assert.strictEqual(count, 1, 'Brush order on surface should target 1 entity');
 assert.strictEqual(surfaceWorker.task?.targetId, 'surf-seed-1', 'Surface brush must order surface resource, not underground');
});

test('Surface Edition: Surface berries and resources are isolated from underground queries and rendering', (t) => {
 const sim = new AntGame.Simulation(999);
 const bush = sim.surfaceWorld.get(0, 0);
 bush.zone = 'berry_bush';
 bush.hasBerries = true;
 AntGame.SurfaceEcology.update(sim, 0);

 const berry = sim.resources.find(r => r.layer === 1 && r.foodType === 'berries');
 assert.ok(berry, 'Surface berry resource should exist');
 assert.strictEqual(berry.layer, 1, 'Berry should have layer 1');

 const ugCell = sim.world.get(0, 0);
 ugCell.discovered = true;
 ugCell.solid = false;

 const worker = sim.ants.find(a => a.type === 'worker' && a.colonyId === 1) || sim.addAnt('worker', 0, 0);
 worker.layer = 0;
 worker.x = 0;
 worker.y = 0;

 const feederSrc = sim.feederSource(worker, 'food');
 assert.notStrictEqual(feederSrc?.id, berry.id, 'Underground worker must not target surface berry as loose food');

 worker.foodNeed = 1;
 const needSrc = sim.antNeedSource(worker, 'food');
 assert.notStrictEqual(needSrc?.resource?.id, berry.id, 'Underground ant need source must not select surface berry');
});

test('Surface Edition: Depositing harvested food when stockpile zone exists does not crash', (t) => {
 const sim = new AntGame.Simulation(888);
 const spoilCell = sim.world.get(1, 1);
 spoilCell.zone = 'spoil';
 spoilCell.solid = false;
 spoilCell.discovered = true;
 sim.createZone('TestStockpile', 'stockpile', { layer: 0 });
 sim.zones['stockpile:TestStockpile'].tiles = ['1,1'];

 const worker = sim.addAnt('worker', 0, 0);
 worker.layer = 0;
 worker.carry = { type: 'food', amount: 15, foodType: 'berries' };

 sim.toStore(worker);
 assert.ok(worker.destination, 'Worker should get a destination');
 assert.notStrictEqual(worker.destination.kind, 'stockpile', 'Food should route to queen or food-store, not spoil stockpile');

 worker.destination = { point: spoilCell, kind: 'stockpile', zoneId: 'stockpile:TestStockpile', layer: 0 };
 worker.timer = 0;
 assert.doesNotThrow(() => {
  sim.deposit(worker, 0.1);
 }, 'deposit to stockpile must never crash on pit.used');
});

test('Surface Edition: Strict physical contact discovery, surface hole impassability, rim emergence, and looking down from rim', (t) => {
 const sim = new AntGame.Simulation(888);

 // 1. Underground ant adjacent to entrance (0, -24) does NOT reveal surface
 const worker = sim.addAnt('worker', 0, -24);
 worker.layer = 0;
 sim.world.get(0, -24).solid = false;
 sim.world.get(0, -24).discovered = true;
 sim.world.get(0, -25).solid = false;
 sim.world.get(0, -25).discovered = true;

 // Run ecology senses
 AntGame.Ecology.update(sim, 1/30);
 assert.strictEqual(sim.surfaceWorld.get(0, -25).discovered, false, 'Adjacent underground ant (dist 1) must NOT reveal surface entrance');

 // 2. Underground ant touching entrance (0, -25) discovers surface opening and 25-block radius
 worker.x = 0;
 worker.y = -25;
 AntGame.Ecology.update(sim, 1/30);
 assert.strictEqual(sim.surfaceWorld.get(0, -25).discovered, true, 'Ant physically on entrance cell must discover surface entrance');
 assert.strictEqual(sim.surfaceWorld.get(0, -26).discovered, true, 'Surrounding surface cells within 25 blocks must be revealed');

 // 3. Surface hole is impassable on layer 1
 const surfaceWorker = sim.addAnt('worker', 0, -26);
 surfaceWorker.layer = 1;
 const directHoleRoute = AntGame.pathfind(sim.surfaceWorld, surfaceWorker, { x: 0, y: -25 });
 assert.strictEqual(directHoleRoute, null, 'Surface ant cannot pathfind onto hole tile');
 const moveResult = sim.move(surfaceWorker, { x: 0, y: -25 });
 assert.strictEqual(moveResult, 'Cannot move onto surface holes into the abyss.', 'Move command to hole tile must be rejected');

 // 4. Looking down from rim: surface ant at (0, -26) reveals underground up to 5 blocks
 for(let dy = -25; dy >= -30; dy--){
  sim.world.get(0, dy).discovered = false;
 }
 AntGame.Ecology.update(sim, 1/30);
 assert.strictEqual(sim.world.get(0, -25).discovered, true, 'Rim ant on surface must reveal underground shaft floor');
 assert.strictEqual(sim.world.get(0, -28).discovered, true, 'Rim ant on surface must reveal underground cells up to 5 blocks away');

 // 5. Ascending ant emerges on adjacent rim hex, not on the gaping hole
 const ascendingAnt = sim.addAnt('worker', 0, -25);
 ascendingAnt.layer = 0;
 const targetOnSurface = { x: 0, y: -28, layer: 1 };
 sim.route(ascendingAnt, targetOnSurface, 'foraging');
 assert.strictEqual(ascendingAnt.layer, 1, 'Ant must have ascended to surface layer 1');
 assert.strictEqual(sim.surfaceWorld.isEntrance(ascendingAnt.x, ascendingAnt.y), false, 'Ant must NOT be standing on the hole');
 assert.strictEqual(AntGame.hexDistance(ascendingAnt, { x: 0, y: -25 }), 1, 'Ant must emerge on an adjacent rim hex');
});
