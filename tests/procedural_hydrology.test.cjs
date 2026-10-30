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

test('Hydrology: hexLine creates strictly contiguous hex-edge connected steps', (t) => {
 const p1 = { x: 0, y: 0 };
 const p2 = { x: 5, y: 12 };
 const line = AntGame.hexLine(p1, p2);
 assert.ok(line.length > 0, 'Line must contain points');
 assert.strictEqual(line[0].x, p1.x);
 assert.strictEqual(line[0].y, p1.y);
 assert.strictEqual(line[line.length - 1].x, p2.x);
 assert.strictEqual(line[line.length - 1].y, p2.y);

 for (let i = 0; i < line.length - 1; i++) {
  const d = AntGame.hexDistance(line[i], line[i + 1]);
  assert.strictEqual(d, 1, `Consecutive hexes at index ${i} must share an edge (hexDistance === 1), got ${d}`);
 }
});

test('Hydrology: Stream is continuous, hex edge-connected across multiple chunks with zero diagonal leaks', (t) => {
 const sw = new AntGame.SurfaceWorld(12345, null);
 
 // Generate stream spine across 10 chunks (-150 to +150)
 sw._ensureStreamSpine(-150, 150);
 const streamCells = [...sw._streamSpine.values()];
 assert.ok(streamCells.length >= 300, 'Stream must span hundreds of tiles');

 // Sort spine by x coordinate
 streamCells.sort((a, b) => a.x - b.x || a.y - b.y);

 // Verify that every stream cell connects to adjacent stream cells with hexDistance === 1
 let isolatedOrDiagonal = 0;
 for (const cell of streamCells) {
  let edgeNeighbors = 0;
  for (const dir of AntGame.HEX_DIRS) {
   if (sw.isStreamHex(cell.x + dir[0], cell.y + dir[1])) {
    edgeNeighbors++;
   }
  }
  // At the extreme endpoints (minX/maxX), it may have 1 neighbor; interior must have >= 2
  if (cell.x > -140 && cell.x < 140) {
   if (edgeNeighbors < 2) isolatedOrDiagonal++;
  }
 }
 assert.strictEqual(isolatedOrDiagonal, 0, 'No stream cell in interior range should have fewer than 2 edge neighbors');
});

test('Hydrology: Stream respects entrance clearance and never cuts within 15 hexes of entrance (0, -25)', (t) => {
 const seeds = [1, 42, 999, 1337, 77777, 999999];
 for (const seed of seeds) {
  const sw = new AntGame.SurfaceWorld(seed, null);
  sw._ensureStreamSpine(-80, 80);
  for (const cell of sw._streamSpine.values()) {
   const dist = AntGame.hexDistance(cell, { x: 0, y: -25 });
   assert.ok(dist >= 15, `Stream tile at (${cell.x}, ${cell.y}) under seed ${seed} is too close to entrance: dist = ${dist}`);
  }
 }
});

test('Hydrology: Active stream hexes are impassable by pathfinding (water >= 6)', (t) => {
 const sw = new AntGame.SurfaceWorld(54321, null);
 sw._ensureStreamSpine(10, 30);
 const streamTile = [...sw._streamSpine.values()].find(c => c.x >= 15 && c.x <= 25);
 assert.ok(streamTile, 'Stream tile must exist');

 const streamCell = sw.get(streamTile.x, streamTile.y);
 assert.strictEqual(streamCell.terrain, 'water');
 assert.strictEqual(streamCell.zone, 'stream');
 assert.strictEqual(streamCell.water, 10);

 const bank1 = { x: streamTile.x + 1, y: streamTile.y };
 const bank2 = { x: streamTile.x - 1, y: streamTile.y };
 sw.get(bank1.x, bank1.y);
 sw.get(bank2.x, bank2.y);

 const path = AntGame.pathfind(sw, bank1, streamTile);
 assert.strictEqual(path, null, 'Ant cannot pathfind directly onto deep stream water');
});

test('Hydrology: Shore-adjacent dirt filling converts stream hex into walkable soil', (t) => {
 const sim = new AntGame.Simulation(808);
 const sw = sim.surfaceWorld;
 sw._ensureStreamSpine(20, 40);
 const streamTile = [...sw._streamSpine.values()].find(c => c.x >= 25 && c.x <= 30);
 assert.ok(streamTile, 'Stream tile found');

 const waterCell = sw.get(streamTile.x, streamTile.y);
 waterCell.discovered = true;
 assert.strictEqual(waterCell.terrain, 'water');
 assert.strictEqual(waterCell.water, 10);

 // Find an adjacent bank cell
 const bank = sw.faces(waterCell, false)[0];
 assert.ok(bank, 'Passable bank cell must exist adjacent to stream hex');
 bank.discovered = true;
 bank.solid = false;

 // Designate dirt build on the stream tile
 sim.activeLayer = 'surface';
 const designated = AntGame.Construction.designateBuild(sim, waterCell.x, waterCell.y, null, 'dirt');
 assert.strictEqual(designated, true, 'Designating dirt on water hex must succeed');

 const job = sim.jobs.find(j => j.x === waterCell.x && j.y === waterCell.y && j.structure === 'dirt');
 assert.ok(job, 'Build job must be created');
 assert.strictEqual(job.layer, 1, 'Job must be on layer 1 (surface)');

 // Add worker ant on the bank with dirt
 const worker = sim.addAnt('worker', bank.x, bank.y);
 worker.layer = 1;
 worker.task = { ...job };
 worker.state = 'building';
 worker.timer = 0;

 // Step building to completion
 const completed = AntGame.Construction.stepBuilding(sim, worker, 3.5);
 assert.strictEqual(completed, true, 'Building must complete');

 // Verify water cell converted to walkable soil
 assert.strictEqual(waterCell.terrain, 'soil', 'Water tile must convert to terrain: soil');
 assert.strictEqual(waterCell.water, 0, 'Water level must be reduced to 0');
 assert.strictEqual(waterCell.solid, false, 'Causeway/bridge tile must be passable (solid === false)');

 // Verify ant can now pathfind onto and across the filled stream tile
 const path = AntGame.pathfind(sw, bank, waterCell);
 assert.ok(path !== null, 'Ant must now be able to pathfind onto the filled stream tile');
});

test('Hydrology: Underground water aquifers and surface puddles are organic and non-symmetrical', (t) => {
 const sim = new AntGame.Simulation(999);
 
 // Check multiple procedural underground water features
 const waterFeatures = [];
 for (let cy = -5; cy <= 5; cy++) {
  for (let cx = -5; cx <= 5; cx++) {
   const defs = sim.world.featureDefinitions(cx, cy);
   for (const f of defs) {
    if (f.type === 'water' && f.id !== 'water-start') {
     waterFeatures.push(f);
    }
   }
  }
 }
 assert.ok(waterFeatures.length >= 2, 'Procedural water features must exist');

 for (const f of waterFeatures) {
  // Sample radii in 6 directions from the center
  const radii = [];
  for (const dir of AntGame.HEX_DIRS) {
   let step = 0;
   for (let dist = 1; dist <= 8; dist++) {
    const c = sim.world.generateCell(f.x + dir[0] * dist, f.y + dir[1] * dist);
    if (c.zone === 'water') step = dist;
    else break;
   }
   radii.push(step);
  }
  // In an organic non-symmetrical cavern, radii vary across directions.
  const minR = Math.min(...radii);
  const maxR = Math.max(...radii);
  assert.notStrictEqual(minR, maxR, `Underground water cavern at (${f.x}, ${f.y}) should be non-symmetrical (minR=${minR}, maxR=${maxR})`);
 }
});
