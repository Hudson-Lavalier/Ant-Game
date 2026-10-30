/*
 * UPDATE TEST & PERFORMANCE BENCHMARK HARNESS
 * Standard test environment for updates to evaluate performance and verify features.
 *
 * Test 1: 100-block open spawn with standard spawns + 70 ants (framerate & performance)
 * Test 2: Same 100-block setup with surface access + 70 ants (framerate + surface traversal verification)
 *
 * Zero edits to main game files (src/*).
 *
 * Usage:
 *   node scripts/run_update_benchmark.cjs [--frames 600] [--seed 42]
 */

globalThis.window = globalThis;
globalThis.devicePixelRatio = 1;

// Load all game modules
const modules = [
  'config', 'data', 'world', 'surface_world', 'brood', 'tasks',
  'construction', 'inventory', 'ecology', 'surface_ecology',
  'climate', 'audio', 'telemetry', 'watchdog', 'war_scenario',
  'simulation', 'creatures', 'weather_effects', 'surface_renderer', 'renderer', 'settings'
];

for (const m of modules) {
  require('../src/' + m + '.js');
}

const { Simulation, hexDisk, hexDistance, FoodTypes, Species } = AntGame;

// Mock Canvas 2D Context for real rendering measurement
const mockCtx = {
  canvas: { width: 1920, height: 1080 },
  fillStyle: '#000000',
  strokeStyle: '#000000',
  lineWidth: 1,
  font: '12px sans-serif',
  textAlign: 'center',
  fillRect(x, y, w, h) { if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(w) || Number.isNaN(h)) throw new Error(`fillRect NaN: ${x}, ${y}, ${w}, ${h}`); },
  strokeRect(x, y, w, h) { if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(w) || Number.isNaN(h)) throw new Error(`strokeRect NaN: ${x}, ${y}`); },
  clearRect() {},
  beginPath() {},
  closePath() {},
  moveTo(x, y) { if (Number.isNaN(x) || Number.isNaN(y)) throw new Error(`moveTo NaN: ${x}, ${y}`); },
  lineTo(x, y) { if (Number.isNaN(x) || Number.isNaN(y)) throw new Error(`lineTo NaN: ${x}, ${y}`); },
  quadraticCurveTo() {},
  bezierCurveTo() {},
  stroke() {},
  fill() {},
  arc(x, y, r) { if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(r)) throw new Error(`arc NaN: ${x}, ${y}, ${r}`); },
  ellipse() {},
  save() {},
  restore() {},
  setTransform() {},
  translate(x, y) { if (Number.isNaN(x) || Number.isNaN(y)) throw new Error(`translate NaN: ${x}, ${y}`); },
  scale() {},
  rotate() {},
  setLineDash() {},
  fillText() {},
  createRadialGradient: (x0, y0, r0, x1, y1, r1) => {
    if (Number.isNaN(x0) || Number.isNaN(y0) || Number.isNaN(x1) || Number.isNaN(y1)) throw new Error(`createRadialGradient NaN`);
    return { addColorStop() {} };
  },
  createLinearGradient: () => ({ addColorStop() {} })
};

const mockCanvas = {
  width: 1920,
  height: 1080,
  getContext: () => mockCtx,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 })
};

// Setup 100-block open environment
function setup100BlockCavern(sim, seed = 42) {
  const w = sim.world;
  const radius = 50; // 50 radius hex disk = 100 blocks across

  // Open 100-block hex disk
  for (const p of hexDisk(0, 0, radius)) {
    const c = w.get(p.x, p.y);
    c.solid = false;
    c.discovered = true;
    c.terrain = 'soil';
    c.water = 0;
    c.rock = false;
    c.isWell = false;
    c.zone = null;
  }

  // Enclose perimeter boundary so ants stay inside test arena
  for (const p of hexDisk(0, 0, radius + 2)) {
    if (hexDistance({ x: 0, y: 0 }, p) > radius) {
      const c = w.get(p.x, p.y);
      c.solid = true;
      c.rock = true;
      c.discovered = true;
    }
  }

  // Nest at center
  sim.nest = { x: 0, y: 0 };
  const nestCell = w.get(0, 0);
  nestCell.zone = 'nest';

  // Food store
  const fs = w.get(3, 0);
  fs.zone = 'food-store';
  sim.food = 1000;
  sim.foodStore = { x: 3, y: 0, hole: false, items: [] };

  // Water store / well / pool
  const ws = w.get(-3, 0);
  ws.zone = 'water-store';
  ws.water = 7;
  sim.water = 500;
  sim.waterStore = { x: -3, y: 0, used: 0, tiles: [{ x: -3, y: 0, water: 7, items: [] }] };

  // Spoil pit
  const pit = w.get(0, -3);
  pit.zone = 'pit';
  w.pit = { x: 0, y: -3, used: 0, capacity: 500, hole: false };

  // Add standard creatures
  const standardCreatures = [
    { species: 'grub', x: 10, y: 5, count: 4 },
    { species: 'worm', x: -10, y: 5, count: 4 },
    { species: 'root_aphid', x: 15, y: -10, count: 4 },
    { species: 'isopod', x: -15, y: -10, count: 4 },
    { species: 'weevil', x: 20, y: 0, count: 3 },
    { species: 'beetle', x: -20, y: 0, count: 2 },
    { species: 'spider', x: 0, y: -25, count: 2 },
    { species: 'hercules', x: 0, y: 25, count: 1 }
  ];

  for (const group of standardCreatures) {
    for (let i = 0; i < group.count; i++) {
      const offX = (i % 2) * 2, offY = Math.floor(i / 2) * 2;
      const cr = AntGame.Ecology.spawnCreature(sim, group.species, group.x + offX, group.y + offY, {
        state: 'active',
        layer: 0,
        devActivated: true
      });
      sim.creatures.push(cr);
    }
  }

  // Add standard loose resources (seeds, roots)
  for (let i = -2; i <= 2; i += 2) {
    sim.resources.push({
      id: `std-seeds-${i}`,
      foodType: 'seeds',
      x: 8 + i,
      y: -8,
      layer: 0,
      remaining: 20,
      initial: 20,
      decay: 0,
      state: 'active'
    });
  }

  // Clear existing ants and spawn 70 ants with realistic caste breakdown
  sim.ants = [];
  sim.nextId = 1;

  // 1 Queen
  const queen = sim.addAnt('queen', 0, 0);
  queen.layer = 0;

  // 40 Workers
  for (let i = 0; i < 40; i++) {
    const ang = (i / 40) * Math.PI * 2;
    const dist = 2 + (i % 5);
    const x = Math.round(Math.cos(ang) * dist);
    const y = Math.round(Math.sin(ang) * dist);
    const a = sim.addAnt('worker', x, y);
    a.layer = 0;
  }

  // 10 Soldiers
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2;
    const a = sim.addAnt('soldier', Math.round(Math.cos(ang) * 6), Math.round(Math.sin(ang) * 6));
    a.layer = 0;
  }

  // 8 Media
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const a = sim.addAnt('media', Math.round(Math.cos(ang) * 4), Math.round(Math.sin(ang) * 4));
    a.layer = 0;
  }

  // 5 Minors
  for (let i = 0; i < 5; i++) {
    const a = sim.addAnt('minor', 1 + i, 2);
    a.layer = 0;
  }

  // 4 Majors
  for (let i = 0; i < 4; i++) {
    const a = sim.addAnt('major', -2 - i, 2);
    a.layer = 0;
  }

  // 2 Supermajors
  const sm1 = sim.addAnt('supermajor', 0, 4);
  const sm2 = sim.addAnt('supermajor', 0, -4);
  sm1.layer = 0;
  sm2.layer = 0;

  return sim;
}

// Connect 100-block setup to surface
function addSurfaceAccess(sim) {
  // Ensure SurfaceWorld exists
  if (!sim.surfaceWorld) {
    sim.surfaceWorld = new AntGame.SurfaceWorld(sim.seed + 101);
  }
  const sw = sim.surfaceWorld;

  // Create entrance shafts at (0, 8) and (0, -8)
  const entrances = [
    { id: 'entrance-north', x: 0, y: 8, r: 2 },
    { id: 'entrance-south', x: 0, y: -8, r: 2 }
  ];

  sw.entrances = entrances;

  for (const ent of entrances) {
    // Open on underground
    for (const p of hexDisk(ent.x, ent.y, ent.r)) {
      const c = sim.world.get(p.x, p.y);
      c.solid = false;
      c.discovered = true;
      c.terrain = 'entrance';
      c.structure = 'entrance_hole';
      c.depth = 0;
    }

    // Open on surface
    for (const p of hexDisk(ent.x, ent.y, ent.r)) {
      const sc = sw.get(p.x, p.y);
      sc.solid = false;
      sc.discovered = true;
      sc.terrain = 'entrance';
      sc.structure = 'entrance_hole';
    }
  }

  // Place discoverable surface berry bushes and wind seeds near entrances
  const bushPositions = [
    { x: 5, y: 12 },
    { x: -5, y: 12 },
    { x: 8, y: -12 },
    { x: -8, y: -12 }
  ];

  for (const bp of bushPositions) {
    const bc = sw.get(bp.x, bp.y);
    bc.zone = 'berry_bush';
    bc.hasBerries = true;
    bc.solid = false;
    bc.discovered = true; // Discovered so ants with access recognize to forage
    sim.resources.push({
      id: `surface-berries-${bp.x},${bp.y}`,
      foodType: 'berries',
      x: bp.x,
      y: bp.y,
      layer: 1,
      remaining: 25,
      initial: 25,
      decay: 0,
      state: 'active'
    });
  }

  // Place some surface loose seeds
  for (let i = 0; i < 3; i++) {
    const sc = sw.get(i * 3, 10);
    sc.solid = false;
    sc.discovered = true;
    sim.resources.push({
      id: `surface-seed-bench-${i}`,
      foodType: 'seeds',
      x: i * 3,
      y: 10,
      layer: 1,
      remaining: 10,
      initial: 10,
      decay: 0,
      state: 'active'
    });
  }
}

// Run benchmark simulation loop
function runBenchmark(options = {}) {
  const frames = options.frames || 600;
  const seed = options.seed || 42;

  console.log('================================================================');
  console.log('  UNDERFOOT: UPDATE BENCHMARK & TEST ENVIRONMENT');
  console.log('================================================================');
  console.log(`  Configuration: 70 Ants | 100-Block Open Cavern | ${frames} Frames\n`);

  // -------------------------------------------------------------
  // TEST 1: Underground 100-Block Open Cavern (Standard Spawns, 70 Ants)
  // -------------------------------------------------------------
  console.log('--- TEST 1: Underground 100-Block Cavern (70 Ants, Framerate) ---');
  const sim1 = new Simulation(seed);
  setup100BlockCavern(sim1, seed);

  const renderer1 = new AntGame.Renderer(mockCanvas);
  renderer1.dpr = 1;
  renderer1.camera = { x: 0, y: 0, zoom: 1 };

  const simTimes1 = [];
  const renderTimes1 = [];
  const totalTimes1 = [];

  for (let f = 0; f < frames; f++) {
    // 1. Measure Simulation Tick
    const t0 = process.hrtime.bigint();
    sim1.update(1 / 30);
    const t1 = process.hrtime.bigint();

    // 2. Measure Renderer Draw
    renderer1.draw(sim1, { selection: [] }, 'none');
    const t2 = process.hrtime.bigint();

    const simMs = Number(t1 - t0) / 1e6;
    const renderMs = Number(t2 - t1) / 1e6;
    const totalMs = Number(t2 - t0) / 1e6;

    simTimes1.push(simMs);
    renderTimes1.push(renderMs);
    totalTimes1.push(totalMs);
  }

  const avgSim1 = simTimes1.reduce((a, b) => a + b, 0) / frames;
  const avgRender1 = renderTimes1.reduce((a, b) => a + b, 0) / frames;
  const avgTotal1 = totalTimes1.reduce((a, b) => a + b, 0) / frames;
  const maxTotal1 = Math.max(...totalTimes1);
  const minTotal1 = Math.min(...totalTimes1);
  const sortedTotal1 = [...totalTimes1].sort((a, b) => a - b);
  const p95Total1 = sortedTotal1[Math.floor(frames * 0.95)];
  const fps1 = 1000 / (avgTotal1 || 1);
  const simFps1 = 1000 / (avgSim1 || 1);

  console.log(`  Living Ants:          ${sim1.ants.filter(a => a.alive).length} / 70`);
  console.log(`  Average Sim Tick:     ${avgSim1.toFixed(3)} ms`);
  console.log(`  Average Render:       ${avgRender1.toFixed(3)} ms`);
  console.log(`  Average Total Frame:  ${avgTotal1.toFixed(3)} ms`);
  console.log(`  95th Percentile:      ${p95Total1.toFixed(3)} ms`);
  console.log(`  Max Frame Time:       ${maxTotal1.toFixed(3)} ms`);
  console.log(`  Simulation Max FPS:   ${simFps1.toFixed(1)} FPS`);
  console.log(`  Achievable Total FPS: ${fps1.toFixed(1)} FPS`);
  console.log(`  Result:               ${fps1 >= 30 ? 'PASS (Smooth Performance)' : 'WARN (Below 30 FPS)'}\n`);

  // -------------------------------------------------------------
  // TEST 2: Same Setup + Surface Access (70 Ants, Surface Traversal)
  // -------------------------------------------------------------
  console.log('--- TEST 2: 100-Block Setup With Surface Access (70 Ants, Surface Traversal) ---');
  const sim2 = new Simulation(seed);
  setup100BlockCavern(sim2, seed);
  addSurfaceAccess(sim2);

  const renderer2 = new AntGame.Renderer(mockCanvas);
  renderer2.dpr = 1;
  renderer2.camera = { x: 0, y: 0, zoom: 1 };
  const surfaceRenderer2 = new AntGame.SurfaceRenderer(mockCanvas, renderer2);

  const simTimes2 = [];
  const renderTimes2 = [];
  const totalTimes2 = [];
  let firstSurfaceFrame = null;
  let maxAntsOnSurface = 0;
  const surfaceAntIds = new Set();

  for (let f = 0; f < frames; f++) {
    // 1. Measure Simulation Tick
    const t0 = process.hrtime.bigint();
    sim2.update(1 / 30);
    const t1 = process.hrtime.bigint();

    // 2. Measure Render (alternating or active layer)
    if (sim2.activeLayer === 'surface') {
      surfaceRenderer2.draw(sim2, { selection: [] });
    } else {
      renderer2.draw(sim2, { selection: [] }, 'none');
    }
    const t2 = process.hrtime.bigint();

    const simMs = Number(t1 - t0) / 1e6;
    const renderMs = Number(t2 - t1) / 1e6;
    const totalMs = Number(t2 - t0) / 1e6;

    simTimes2.push(simMs);
    renderTimes2.push(renderMs);
    totalTimes2.push(totalMs);

    // Track Surface Traversal
    const surfaceAnts = sim2.ants.filter(a => a.alive && a.layer === 1);
    if (surfaceAnts.length > 0) {
      if (firstSurfaceFrame === null) firstSurfaceFrame = f;
      if (surfaceAnts.length > maxAntsOnSurface) maxAntsOnSurface = surfaceAnts.length;
      for (const sa of surfaceAnts) surfaceAntIds.add(sa.id);
    }
  }

  const avgSim2 = simTimes2.reduce((a, b) => a + b, 0) / frames;
  const avgRender2 = renderTimes2.reduce((a, b) => a + b, 0) / frames;
  const avgTotal2 = totalTimes2.reduce((a, b) => a + b, 0) / frames;
  const p95Total2 = [...totalTimes2].sort((a, b) => a - b)[Math.floor(frames * 0.95)];
  const fps2 = 1000 / (avgTotal2 || 1);
  const simFps2 = 1000 / (avgSim2 || 1);

  const totalSurfaceAnts = surfaceAntIds.size;
  const surfaceHarvestCount = sim2.foodHarvested || 0;

  console.log(`  Living Ants:          ${sim2.ants.filter(a => a.alive).length} / 70`);
  console.log(`  Average Sim Tick:     ${avgSim2.toFixed(3)} ms`);
  console.log(`  Average Render:       ${avgRender2.toFixed(3)} ms`);
  console.log(`  Average Total Frame:  ${avgTotal2.toFixed(3)} ms`);
  console.log(`  95th Percentile:      ${p95Total2.toFixed(3)} ms`);
  console.log(`  Achievable Total FPS: ${fps2.toFixed(1)} FPS`);
  console.log(`  First Surface Entry:  ${firstSurfaceFrame !== null ? `Frame ${firstSurfaceFrame} (${(firstSurfaceFrame / 30).toFixed(1)}s)` : 'None'}`);
  console.log(`  Unique Ants to Surf:  ${totalSurfaceAnts} ants`);
  console.log(`  Max Concurrent Surf:  ${maxAntsOnSurface} ants`);
  console.log(`  Surface Food Gained:  ${surfaceHarvestCount}`);

  const passedTraversal = totalSurfaceAnts > 0;
  console.log(`  Traversal Result:     ${passedTraversal ? 'PASS (Ants actively traverse to surface)' : 'FAIL (No ants visited surface)'}`);
  console.log(`  Framerate Result:     ${fps2 >= 30 ? 'PASS (Smooth Performance)' : 'WARN (Below 30 FPS)'}\n`);

  console.log('================================================================');
  console.log('  BENCHMARK SUMMARY & COMPARISON');
  console.log('================================================================');
  console.log(`  Underground-Only FPS:     ${fps1.toFixed(1)} FPS (Sim: ${simFps1.toFixed(1)} FPS)`);
  console.log(`  With Surface Access FPS:  ${fps2.toFixed(1)} FPS (Sim: ${simFps2.toFixed(1)} FPS)`);
  console.log(`  Performance Delta:        ${((fps2 - fps1) / fps1 * 100).toFixed(1)}%`);
  console.log(`  Surface Access Validated: ${passedTraversal ? 'YES' : 'NO'}`);
  console.log('================================================================\n');

  return {
    test1: { avgTotal: avgTotal1, fps: fps1, simFps: simFps1 },
    test2: { avgTotal: avgTotal2, fps: fps2, simFps: simFps2, totalSurfaceAnts, passedTraversal }
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let frames = 600;
  let seed = 42;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--frames' && args[i + 1]) frames = parseInt(args[i + 1], 10);
    if (args[i] === '--seed' && args[i + 1]) seed = parseInt(args[i + 1], 10);
  }
  runBenchmark({ frames, seed });
}

module.exports = { setup100BlockCavern, addSurfaceAccess, runBenchmark };
