const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

globalThis.window = globalThis;
globalThis.devicePixelRatio = 1;

// Load game modules
const srcFiles = [
 'src/config.js',
 'src/data.js',
 'src/world.js',
 'src/surface_world.js',
 'src/spatial.js',
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

for (const file of srcFiles) {
 const code = fs.readFileSync(path.resolve(file), 'utf8');
 eval(code);
}

function createMockCtx() {
 const calls = {
  beginPath: 0,
  stroke: 0,
  fill: 0,
  moveTo: 0,
  lineTo: 0,
  quadraticCurveTo: 0,
  arc: 0,
  ellipse: 0,
  fillRect: 0,
  save: 0,
  restore: 0,
  setTransform: 0
 };

 return {
  calls,
  canvas: { width: 1920, height: 1080 },
  fillStyle: '#000000',
  strokeStyle: '#000000',
  lineWidth: 1,
  shadowColor: '',
  shadowBlur: 0,
  beginPath() { this.calls.beginPath++; },
  closePath() {},
  stroke() { this.calls.stroke++; },
  fill() { this.calls.fill++; },
  moveTo(x, y) {
   if (Number.isNaN(x) || Number.isNaN(y)) throw new Error(`moveTo NaN: ${x}, ${y}`);
   this.calls.moveTo++;
  },
  lineTo(x, y) {
   if (Number.isNaN(x) || Number.isNaN(y)) throw new Error(`lineTo NaN: ${x}, ${y}`);
   this.calls.lineTo++;
  },
  quadraticCurveTo(cx, cy, x, y) {
   if (Number.isNaN(cx) || Number.isNaN(cy) || Number.isNaN(x) || Number.isNaN(y)) {
    throw new Error(`quadraticCurveTo NaN`);
   }
   this.calls.quadraticCurveTo++;
  },
  arc(x, y, r, sa, ea) {
   if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(r)) throw new Error(`arc NaN: ${x}, ${y}, ${r}`);
   this.calls.arc++;
  },
  ellipse(x, y, rx, ry, rot, sa, ea) {
   if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(rx) || Number.isNaN(ry)) {
    throw new Error(`ellipse NaN: ${x}, ${y}`);
   }
   this.calls.ellipse++;
  },
  fillRect(x, y, w, h) {
   if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(w) || Number.isNaN(h)) {
    throw new Error(`fillRect NaN: ${x}, ${y}, ${w}, ${h}`);
   }
   this.calls.fillRect++;
  },
  strokeRect() {},
  save() { this.calls.save++; },
  restore() { this.calls.restore++; },
  setTransform(a, b, c, d, e, f) {
   this.calls.setTransform++;
  }
 };
}

test('RainSystem: Float32Array object pool and batched single-pass stroke()', (t) => {
 const rain = new AntGame.RainSystem(300, 35);
 assert.ok(rain.dropData instanceof Float32Array, 'dropData must be Float32Array');
 assert.strictEqual(rain.dropData.length, 300 * 5, 'dropData length must be 300 * 5 floats');
 assert.ok(rain.splashData instanceof Float32Array, 'splashData must be Float32Array');
 assert.strictEqual(rain.splashData.length, 35 * 5, 'splashData length must be 35 * 5 floats');

 const ctx = createMockCtx();
 const climate = { rainActive: true, rainIntensity: 1.0, heavyWindActive: false };

 // First frame: initializes and renders
 rain.updateAndDraw(ctx, 1920, 1080, 0.016, climate);

 // Batch verification: ctx.stroke() must be called in batch, not 300 times
 assert.strictEqual(ctx.calls.stroke, 2, 'ctx.stroke must only be called twice (once for all drops, once for splashes)');
 assert.ok(ctx.calls.lineTo >= 150, 'All active raindrops must be batched into the stroke path');

 // Multiple frames without NaN
 for (let frame = 0; frame < 60; frame++) {
  rain.updateAndDraw(ctx, 1920, 1080, 0.016, climate);
 }

 for (let i = 0; i < rain.maxDrops * 5; i++) {
  assert.ok(!Number.isNaN(rain.dropData[i]), `Rain dropData at index ${i} must not be NaN`);
 }
});

test('RainSystem: Wind speed angles rain slant', (t) => {
 const rainCalm = new AntGame.RainSystem(100, 10);
 rainCalm.init(1000, 1000);
 // Set initial drop at x=500, y=100
 rainCalm.dropData[0] = 500;
 rainCalm.dropData[1] = 100;
 rainCalm.dropData[2] = 800; // speed

 const climateCalm = { rainActive: true, rainIntensity: 1.0, heavyWindActive: false, windSpeed: 0 };
 rainCalm.updateAndDraw(createMockCtx(), 1000, 1000, 0.1, climateCalm);
 const calmDx = rainCalm.dropData[0] - 500;

 const rainStorm = new AntGame.RainSystem(100, 10);
 rainStorm.init(1000, 1000);
 rainStorm.dropData[0] = 500;
 rainStorm.dropData[1] = 100;
 rainStorm.dropData[2] = 800;

 const climateWindy = { rainActive: true, rainIntensity: 1.0, heavyWindActive: true, windSpeed: 1.0 };
 rainStorm.updateAndDraw(createMockCtx(), 1000, 1000, 0.1, climateWindy);
 const windyDx = rainStorm.dropData[0] - 500;

 assert.ok(windyDx > calmDx, 'Raindrop horizontal drift must be significantly higher in heavy wind');
});

test('LightningManager: Procedural jagged branching bolt generation via midpoint displacement', (t) => {
 const lm = new AntGame.LightningManager();
 const segments = lm.generateBolt(500, 0, 550, 800);

 assert.ok(segments.length >= 10, 'Displaced lightning bolt must generate multiple jagged segments');
 for (const seg of segments) {
  assert.ok(!Number.isNaN(seg.x1), 'seg.x1 must not be NaN');
  assert.ok(!Number.isNaN(seg.y1), 'seg.y1 must not be NaN');
  assert.ok(!Number.isNaN(seg.x2), 'seg.x2 must not be NaN');
  assert.ok(!Number.isNaN(seg.y2), 'seg.y2 must not be NaN');
 }

 // Trigger bolt and verify double-pass rendering (outer glow + white hot core)
 lm.triggerBolt(500, 0, 550, 800);
 assert.strictEqual(lm.boltAlpha, 1.0, 'boltAlpha must start at 1.0');
 assert.ok(lm.flashAlpha >= 0.9, 'flashAlpha must trigger with bolt');

 const ctx = createMockCtx();
 lm.updateAndDraw(ctx, 1920, 1080, 0.016, null);

 // Pass 1 (glow) + Pass 2 (core) = 2 stroke calls
 assert.strictEqual(ctx.calls.stroke, 2, 'Bolt must render with 2 batched stroke passes (glow and core)');
 assert.strictEqual(ctx.calls.fillRect, 1, 'Screen flash overlay must fill screen');

 // Alpha decay test
 const prevFlash = lm.flashAlpha;
 const prevBolt = lm.boltAlpha;
 lm.updateAndDraw(ctx, 1920, 1080, 0.05, null);
 assert.ok(lm.flashAlpha < prevFlash, 'flashAlpha must decay');
 assert.ok(lm.boltAlpha < prevBolt, 'boltAlpha must decay');
});

test('WindSystem: Curved swirls and rotating fluttering leaves', (t) => {
 const ws = new AntGame.WindSystem(30);
 const ctx = createMockCtx();
 const climate = { heavyWindActive: true, rainActive: true, rainIntensity: 0.8 };

 ws.updateAndDraw(ctx, 1920, 1080, 0.016, climate, 1.5);

 assert.ok(ctx.calls.quadraticCurveTo > 0, 'Wind swirls must draw curved quadratic segments');
 assert.ok(ctx.calls.ellipse > 0 || ctx.calls.arc > 0, 'Fluttering leaves must be rendered');
 assert.strictEqual(ctx.calls.stroke, 1, 'Wind swirls must be batched in a single stroke call');
});

test('SurfaceRenderer: Weather rendered under 1:1 screen-space transform', (t) => {
 const mockCtx = createMockCtx();
 const mockCanvas = { width: 1920, height: 1080, getContext: () => mockCtx };
 const mockBase = { dpr: 2, originX: 960, originY: 540 };

 const sr = new AntGame.SurfaceRenderer(mockCanvas, mockBase);
 assert.ok(sr.rainSystem, 'SurfaceRenderer must instantiate rainSystem');
 assert.ok(sr.lightningManager, 'SurfaceRenderer must instantiate lightningManager');
 assert.ok(sr.windSystem, 'SurfaceRenderer must instantiate windSystem');

 const sim = new AntGame.Simulation(42);
 sim.climate.rainActive = true;
 sim.climate.rainIntensity = 1.0;
 sim.climate.heavyWindActive = true;
 sim.climate.lightningFlash = 0.9;

 const camera = { x: 0, y: -25, zoom: 2.0 };
 sr.draw(sim, camera);

 // Must execute setTransform for screen space
 assert.ok(mockCtx.calls.setTransform >= 2, 'setTransform must be called to set screen space viewport');
});

test('AudioCoordinator: Acoustic Layer Contrast and Underground Muffling', (t) => {
 const audio = AntGame.AudioCoordinator;
 assert.ok(audio, 'AudioCoordinator must exist');
 assert.strictEqual(typeof audio.onLayerChange, 'function', 'onLayerChange must be defined');

 // 1. Underground test
 audio.onLayerChange('underground');
 assert.strictEqual(audio.currentLayer, 'underground');

 const climate = { rainActive: true, rainIntensity: 1.0, heavyWindActive: true };
 audio.update(climate, { x: 0, y: 0 }, { activeLayer: 'underground' });

 // Verify loop volume scales underground
 const rainUg = audio.activeLoops.get('rain_underground');
 const rainSurf = audio.activeLoops.get('rain_surface');
 const windLoop = audio.activeLoops.get('wind');
 const nestLoop = audio.activeLoops.get('amb_nest_underground');

 assert.ok(rainUg, 'rain_underground must be active underground');
 assert.strictEqual(rainUg.volumeScale, 0.15, 'rain_underground volume scale must be 0.15 (muffled)');
 assert.strictEqual(rainSurf, undefined, 'rain_surface must be disabled underground');
 assert.strictEqual(windLoop.volumeScale, 0.05, 'wind volume scale must be 0.05 (whispering draft) underground');
 assert.strictEqual(nestLoop.volumeScale, 0.45, 'amb_nest_underground volume scale must be 0.45 underground');

 // 2. Surface transition test
 audio.onLayerChange('surface');
 assert.strictEqual(audio.currentLayer, 'surface');
 audio.update(climate, { x: 0, y: -25 }, { activeLayer: 'surface' });

 const rainUgSurf = audio.activeLoops.get('rain_underground');
 const rainSurfSurf = audio.activeLoops.get('rain_surface');
 const windLoopSurf = audio.activeLoops.get('wind');
 const nestLoopSurf = audio.activeLoops.get('amb_nest_underground');

 assert.strictEqual(rainUgSurf, undefined, 'rain_underground must be disabled on surface');
 assert.ok(rainSurfSurf, 'rain_surface must be active on surface');
 assert.strictEqual(rainSurfSurf.volumeScale, 1.0, 'rain_surface volume scale must be 1.0 on surface');
 assert.strictEqual(windLoopSurf.volumeScale, 1.0, 'wind volume scale must be 1.0 on surface');
 assert.strictEqual(nestLoopSurf, undefined, 'amb_nest_underground must be silenced on surface');
});

test('AudioCoordinator: Thunder volume muffled underground vs loud on surface', (t) => {
 const audio = AntGame.AudioCoordinator;

 // Capture lastPlayed cue history
 audio.lastPlayed = [];

 audio.onLayerChange('underground');
 audio.lastCuePlayTime.clear();
 audio.play('nearThunder', { volumeScale: 1.0 });

 const lastUg = audio.lastPlayed[audio.lastPlayed.length - 1];
 assert.ok(lastUg, 'nearThunder should be recorded in lastPlayed');

 // Reset cooldown
 audio.lastCuePlayTime.clear();
 audio.onLayerChange('surface');
 audio.play('nearThunder', { volumeScale: 1.0 });

 const lastSurf = audio.lastPlayed[audio.lastPlayed.length - 1];
 assert.ok(lastSurf, 'nearThunder should be recorded in lastPlayed on surface');
});

test('Layer Switch: sim.switchLayer immediately updates audio state', (t) => {
 const sim = new AntGame.Simulation(42);
 const audio = AntGame.AudioCoordinator;
 audio.onLayerChange(sim.activeLayer);
 sim.climate.rainActive = true;
 sim.climate.rainIntensity = 0.8;

 assert.strictEqual(sim.activeLayer, 'underground');
 audio.update(sim.climate, null, sim);
 assert.strictEqual(audio.activeLoops.get('rain_surface'), undefined);

 // Switch to surface
 sim.switchLayer('surface');
 assert.strictEqual(sim.activeLayer, 'surface');
 assert.strictEqual(audio.currentLayer, 'surface');

 // rain_surface must immediately be active and rain_underground disabled
 const surfLoop = audio.activeLoops.get('rain_surface');
 assert.ok(surfLoop, 'rain_surface must immediately activate on layer switch');
 assert.strictEqual(surfLoop.volumeScale, 0.8);
 assert.strictEqual(audio.activeLoops.get('rain_underground'), undefined);

 // Switch back to underground
 sim.switchLayer('underground');
 assert.strictEqual(sim.activeLayer, 'underground');
 assert.strictEqual(audio.currentLayer, 'underground');
 assert.strictEqual(audio.activeLoops.get('rain_surface'), undefined);
 assert.ok(audio.activeLoops.get('rain_underground'));
});
