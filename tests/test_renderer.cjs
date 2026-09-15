const assert = require('node:assert/strict');
globalThis.window = globalThis;
globalThis.devicePixelRatio = 1;

for (const f of ['config', 'data', 'world', 'climate', 'audio', 'ecology', 'brood', 'tasks', 'construction', 'inventory', 'simulation', 'creatures', 'renderer']) {
  require('../src/' + f + '.js');
}

const { Simulation, Renderer, Species } = AntGame;

// Mock 2D Canvas Context
function createMockContext() {
  const calls = [];
  const ctx = {
    canvas: { getBoundingClientRect: () => ({ width: 800, height: 600 }), width: 800, height: 600 },
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    translate(x, y) {
      assert(!isNaN(x) && !isNaN(y), `translate NaN: ${x}, ${y}`);
    },
    rotate(a) {
      assert(!isNaN(a), `rotate NaN: ${a}`);
    },
    scale(x, y) {
      assert(!isNaN(x) && !isNaN(y), `scale NaN: ${x}, ${y}`);
    },
    beginPath() {},
    closePath() {},
    moveTo(x, y) {
      assert(!isNaN(x) && !isNaN(y), `moveTo NaN: ${x}, ${y}`);
    },
    lineTo(x, y) {
      assert(!isNaN(x) && !isNaN(y), `lineTo NaN: ${x}, ${y}`);
    },
    quadraticCurveTo(cx, cy, x, y) {
      assert(!isNaN(cx) && !isNaN(cy) && !isNaN(x) && !isNaN(y), `quadraticCurveTo NaN: ${cx}, ${cy}, ${x}, ${y}`);
    },
    bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
      assert(!isNaN(c1x) && !isNaN(c1y) && !isNaN(c2x) && !isNaN(c2y) && !isNaN(x) && !isNaN(y), `bezierCurveTo NaN`);
    },
    arc(x, y, r, sa, ea) {
      assert(!isNaN(x) && !isNaN(y) && !isNaN(r) && !isNaN(sa) && !isNaN(ea), `arc NaN: ${x}, ${y}, ${r}`);
    },
    ellipse(x, y, rx, ry, rot, sa, ea) {
      assert(!isNaN(x) && !isNaN(y) && !isNaN(rx) && !isNaN(ry), `ellipse NaN: ${x}, ${y}, ${rx}, ${ry}`);
    },
    fill() {},
    stroke() {},
    fillRect(x, y, w, h) {
      assert(!isNaN(x) && !isNaN(y) && !isNaN(w) && !isNaN(h), `fillRect NaN: ${x}, ${y}, ${w}, ${h}`);
    },
    strokeRect(x, y, w, h) {
      assert(!isNaN(x) && !isNaN(y) && !isNaN(w) && !isNaN(h), `strokeRect NaN: ${x}, ${y}, ${w}, ${h}`);
    },
    createLinearGradient(x0, y0, x1, y1) {
      assert(!isNaN(x0) && !isNaN(y0) && !isNaN(x1) && !isNaN(y1), `createLinearGradient NaN`);
      return { addColorStop() {} };
    },
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      assert(!isNaN(x0) && !isNaN(y0) && !isNaN(r0) && !isNaN(x1) && !isNaN(y1) && !isNaN(r1), `createRadialGradient NaN`);
      return { addColorStop() {} };
    },
    setTransform() {},
    fillText() {}
  };
  return ctx;
}

const mockCanvas = {
  getBoundingClientRect: () => ({ width: 800, height: 600 }),
  getContext: () => createMockContext(),
  width: 800,
  height: 600
};

console.log('Testing Renderer initialization...');
const renderer = new Renderer(mockCanvas);
assert.ok(renderer);

console.log('Testing all ant castes with moving & carry variations...');
const castes = ['queen', 'worker', 'minor', 'media', 'soldier', 'major', 'supermajor', 'princess', 'drone'];
const carryTypes = [null, { type: 'water', amount: 1 }, { type: 'food', amount: 1 }, { type: 'soil', amount: 1 }];

for (const type of castes) {
  for (const carry of carryTypes) {
    const ant = {
      id: 42,
      type,
      x: 0,
      y: 0,
      angle: 0.5,
      shade: 1.05,
      alive: true,
      path: [{ x: 1, y: 1 }],
      isMoving: true,
      carry,
      colonyId: 1,
      foodNeed: 40,
      waterNeed: 40
    };
    // Should render without error
    renderer.ant(ant, { x: 100, y: 100 }, 2.4, 12.5);
    // Render dead ant
    ant.alive = false;
    renderer.ant(ant, { x: 100, y: 100 }, 2.4, 12.5);
  }
}
console.log('✔ All 9 castes x 4 carry states x alive/dead rendered cleanly!');

console.log('Testing all creature species...');
const speciesList = ['weevil', 'hercules', 'spider', 'baby_spider', 'isopod', 'root_aphid', 'mite', 'worm', 'grub'];

for (const species of speciesList) {
  const d = Species[species];
  assert.ok(d, `Species definition missing for ${species}`);
  const cr = {
    id: `test-${species}`,
    species,
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    angle: 0.78,
    size: 1.0,
    colorVariation: 1.05,
    alive: true,
    path: [{ x: 1, y: 0 }],
    bodyTrail: species === 'worm' || species === 'grub' ? [
      { x: 0, y: 0 }, { x: -1, y: 0 }, { x: -2, y: 0 }, { x: -3, y: 0 },
      { x: -4, y: 0 }, { x: -5, y: 0 }, { x: -6, y: 0 }, { x: -7, y: 0 }
    ] : []
  };

  renderer.time = 5.0;
  renderer.creature(cr, { x: 200, y: 200 }, 2.4, d);

  // Test moving=false
  cr.path = [];
  renderer.creature(cr, { x: 200, y: 200 }, 2.4, d);

  // Test dead
  cr.alive = false;
  renderer.creature(cr, { x: 200, y: 200 }, 2.4, d);
}
console.log('✔ All 9 species rendered cleanly in all movement and life states!');

console.log('Testing full Simulation draw cycle benchmark...');
const sim = new Simulation(42);
for (const species of speciesList) {
  sim.creatures.push({
    id: `bench-${species}`,
    species,
    x: sim.nest.x + Math.floor(Math.random() * 10 - 5),
    y: sim.nest.y + Math.floor(Math.random() * 10 - 5),
    prevX: sim.nest.x,
    prevY: sim.nest.y,
    angle: 0.2,
    size: 1.0,
    health: 50,
    maxHealth: 50,
    alive: true,
    path: [{ x: 1, y: 1 }],
    colorVariation: 1.0,
    bodyTrail: species === 'worm' || species === 'grub' ? [
      { x: 0, y: 0 }, { x: -1, y: 0 }, { x: -2, y: 0 }, { x: -3, y: 0 }
    ] : []
  });
}
for (const caste of castes) {
  sim.addAnt(caste, sim.nest.x, sim.nest.y);
}

// Warmup
renderer.draw(sim, null, 'dig');

// Benchmark 100 frames
const start = performance.now();
const frames = 100;
for (let f = 0; f < frames; f++) {
  sim.time += 1 / 30;
  renderer.draw(sim, null, 'dig');
}
const elapsed = performance.now() - start;
const msPerFrame = elapsed / frames;
console.log(`✔ Benchmark: ${frames} full frames rendered in ${elapsed.toFixed(1)}ms (${msPerFrame.toFixed(3)} ms/frame)`);
assert.ok(msPerFrame < 5.0, `Frame time ${msPerFrame} ms exceeds budget!`);
console.log('ALL RENDERER TESTS PASSED SUCCESSFULLY!');
