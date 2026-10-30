const test = require('node:test');
const assert = require('node:assert/strict');
const { runBenchmark } = require('../scripts/run_update_benchmark.cjs');

test('Update Benchmark: 100-block open cavern with 70 ants delivers smooth framerate', () => {
  // Run 150 frames to verify sustained framerate in automated test run
  const res = runBenchmark({ frames: 150, seed: 123 });
  
  // Verify Test 1 (Underground 70 ants performance)
  assert.ok(res.test1.fps >= 30, `Underground framerate should be >= 30 FPS, got ${res.test1.fps.toFixed(1)} FPS`);
  assert.ok(res.test1.simFps >= 60, `Underground simulation throughput should be >= 60 FPS, got ${res.test1.simFps.toFixed(1)} FPS`);

  // Verify Test 2 (Surface Access 70 ants traversal)
  assert.ok(res.test2.fps >= 25, `Dual-layer framerate should remain smooth, got ${res.test2.fps.toFixed(1)} FPS`);
  assert.ok(res.test2.passedTraversal, 'Ants must actively traverse from underground to surface');
  assert.ok(res.test2.totalSurfaceAnts >= 5, `Expected multiple ants to visit surface, got ${res.test2.totalSurfaceAnts}`);
});
