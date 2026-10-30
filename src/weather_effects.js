/*
 * UNDERFOOT WEATHER EFFECTS SYSTEM
 * High-performance viewport screen-space weather rendering:
 * - RainSystem: Float32Array object pool (300 drops) with batched single-pass stroke()
 * - WindSystem: Screen-space curved wind swirls and fluttering leaves driven by wind velocity
 * - LightningManager: Screen flash overlay and procedural jagged branching lightning bolt
 *   using recursive midpoint displacement striking from top of screen to ground.
 *
 * Strict Layer Isolation:
 * These systems only update and render when viewing the outdoor surface dimension.
 */
(()=>{
class RainSystem {
 constructor(maxDrops = 300, maxSplashes = 35) {
  this.maxDrops = maxDrops;
  this.maxSplashes = maxSplashes;

  // Flat Float32Array: 5 floats per drop [x, y, speed, len, alpha]
  this.dropData = new Float32Array(maxDrops * 5);
  // Flat Float32Array: 5 floats per splash [x, y, maxRadius, life, maxLife]
  this.splashData = new Float32Array(maxSplashes * 5);

  this.initialized = false;
 }

 init(width, height) {
  for (let i = 0; i < this.maxDrops; i++) {
   const idx = i * 5;
   this.dropData[idx + 0] = Math.random() * width; // x
   this.dropData[idx + 1] = Math.random() * height; // y
   this.dropData[idx + 2] = 720 + Math.random() * 280; // speed (px/sec)
   this.dropData[idx + 3] = 14 + Math.random() * 12; // len
   this.dropData[idx + 4] = 0.35 + Math.random() * 0.35; // alpha
  }

  for (let i = 0; i < this.maxSplashes; i++) {
   const sIdx = i * 5;
   this.splashData[sIdx + 0] = 0;
   this.splashData[sIdx + 1] = 0;
   this.splashData[sIdx + 2] = 2.5 + Math.random() * 4.0;
   this.splashData[sIdx + 3] = 1.0; // finished
   this.splashData[sIdx + 4] = 0.25;
  }
  this.initialized = true;
 }

 triggerSplash(x, y) {
  for (let i = 0; i < this.maxSplashes; i++) {
   const sIdx = i * 5;
   if (this.splashData[sIdx + 3] >= this.splashData[sIdx + 4]) {
    this.splashData[sIdx + 0] = x;
    this.splashData[sIdx + 1] = y;
    this.splashData[sIdx + 2] = 3.0 + Math.random() * 4.0;
    this.splashData[sIdx + 3] = 0.0; // reset life
    this.splashData[sIdx + 4] = 0.20 + Math.random() * 0.15;
    break;
   }
  }
 }

 updateAndDraw(ctx, width, height, dt, climate) {
  if (!this.initialized) this.init(width, height);

  if (!climate || !climate.rainActive) return;

  const rainIntensity = climate.rainIntensity || 1.0;
  const isStorm = Boolean(climate.thunderstormActive);
  const activeCount = Math.min(
   this.maxDrops,
   Math.floor((isStorm ? 300 : 180) * Math.min(1.0, Math.max(0.3, rainIntensity)))
  );

  const windSlant = (climate.heavyWindActive ? 0.42 : 0.18) + (climate.windSpeed ? climate.windSpeed * 0.05 : 0);

  // 1. Update drop positions
  for (let i = 0; i < activeCount; i++) {
   const idx = i * 5;
   const speed = this.dropData[idx + 2];
   this.dropData[idx + 1] += speed * dt;
   this.dropData[idx + 0] += speed * windSlant * dt;

   if (this.dropData[idx + 1] > height) {
    this.dropData[idx + 1] -= height;
    const oldX = this.dropData[idx + 0];
    this.dropData[idx + 0] = Math.random() * width;
    if (Math.random() < 0.25) {
     this.triggerSplash(oldX, height - 5 - Math.random() * 35);
    }
   }
   if (this.dropData[idx + 0] > width) {
    this.dropData[idx + 0] -= width;
   } else if (this.dropData[idx + 0] < 0) {
    this.dropData[idx + 0] += width;
   }
  }

  // 2. Single-pass batched draw call for all raindrops
  if (typeof ctx.save === 'function') ctx.save();
  ctx.strokeStyle = isStorm ? 'rgba(195, 230, 255, 0.55)' : 'rgba(180, 220, 255, 0.40)';
  ctx.lineWidth = isStorm ? 1.4 : 1.0;
  ctx.beginPath();
  for (let i = 0; i < activeCount; i++) {
   const idx = i * 5;
   const x = this.dropData[idx + 0];
   const y = this.dropData[idx + 1];
   const len = this.dropData[idx + 3];
   ctx.moveTo(x, y);
   ctx.lineTo(x - windSlant * len, y - len);
  }
  ctx.stroke();

  // 3. Batched ground splash ripples
  ctx.strokeStyle = 'rgba(195, 235, 255, 0.32)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let i = 0; i < this.maxSplashes; i++) {
   const sIdx = i * 5;
   const maxLife = this.splashData[sIdx + 4];
   if (this.splashData[sIdx + 3] < maxLife) {
    this.splashData[sIdx + 3] += dt;
    const progress = this.splashData[sIdx + 3] / maxLife;
    const r = this.splashData[sIdx + 2] * progress;
    const sx = this.splashData[sIdx + 0];
    const sy = this.splashData[sIdx + 1];
    if (r > 0.4) {
     ctx.moveTo(sx + r * 1.5, sy);
     if (typeof ctx.ellipse === 'function') {
      ctx.ellipse(sx, sy, r * 1.5, r * 0.75, 0, 0, Math.PI * 2);
     } else {
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
     }
    }
   }
  }
  ctx.stroke();
  if (typeof ctx.restore === 'function') ctx.restore();
 }
}

class LightningManager {
 constructor() {
  this.flashAlpha = 0;
  this.boltSegments = [];
  this.boltAlpha = 0;
  this.lastProcessedFlash = 0;
  this.lastStrikeKey = null;
 }

 triggerFlash(intensity = 0.85) {
  this.flashAlpha = Math.max(this.flashAlpha, intensity);
 }

 generateBolt(startX, startY, endX, endY) {
  const segments = [];
  function displaceSegment(x1, y1, x2, y2, displace, depth, maxDepth) {
   const dx = x2 - x1;
   const dy = y2 - y1;
   const dist = Math.hypot(dx, dy);
   if (dist < 18 || depth >= maxDepth) {
    segments.push({ x1, y1, x2, y2, depth });
    return;
   }
   const mx = (x1 + x2) * 0.5;
   const my = (y1 + y2) * 0.5;
   const nx = -dy / dist;
   const ny = dx / dist;
   const jitter = (Math.random() - 0.5) * displace * dist * 0.45;
   const jx = mx + nx * jitter;
   const jy = my + ny * jitter;

   displaceSegment(x1, y1, jx, jy, displace * 0.65, depth + 1, maxDepth);
   displaceSegment(jx, jy, x2, y2, displace * 0.65, depth + 1, maxDepth);

   // Branching: 25-30% chance at shallower depths
   if (depth <= 3 && Math.random() < 0.28) {
    const branchAngle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.1;
    const branchLen = dist * (0.32 + Math.random() * 0.26);
    const bx = jx + Math.cos(branchAngle) * branchLen;
    const by = jy + Math.sin(branchAngle) * branchLen;
    displaceSegment(jx, jy, bx, by, displace * 0.6, depth + 1, maxDepth);
   }
  }

  displaceSegment(startX, startY, endX, endY, 1.0, 0, 5);
  return segments;
 }

 triggerBolt(startX, startY, endX, endY) {
  this.boltSegments = this.generateBolt(startX, startY, endX, endY);
  this.boltAlpha = 1.0;
  this.flashAlpha = Math.max(this.flashAlpha, 0.95);
 }

 updateAndDraw(ctx, width, height, dt, climate, renderer = null) {
  if (climate) {
   // Check for ambient thunder flash or destructive lightning strike
   if (climate.lightningFlash > 0 && climate.lightningFlash > this.lastProcessedFlash) {
    this.flashAlpha = Math.max(this.flashAlpha, climate.lightningFlash);

    // When lightning flash occurs, spawn procedural bolt
    let startX = Math.random() * width;
    let endX = startX + (Math.random() - 0.5) * (width * 0.4);
    let endY = height * 0.72 + Math.random() * (height * 0.25);

    if (climate.lastStrikeCell && renderer && typeof renderer.screen === 'function') {
     const sp = renderer.screen(climate.lastStrikeCell.x, climate.lastStrikeCell.y);
     if (sp && sp.x >= -100 && sp.x <= width + 100 && sp.y >= -100 && sp.y <= height + 100) {
      endX = Math.max(20, Math.min(width - 20, sp.x));
      endY = Math.max(20, Math.min(height - 20, sp.y));
      startX = endX + (Math.random() - 0.5) * 200;
     }
    }
    this.triggerBolt(startX, 0, endX, endY);
   }
   this.lastProcessedFlash = climate.lightningFlash;
  }

  // Smooth decay
  const decayFactor = Math.pow(0.86, dt * 60);
  this.flashAlpha *= decayFactor;
  if (this.flashAlpha < 0.01) this.flashAlpha = 0;

  const boltDecay = Math.pow(0.72, dt * 60);
  this.boltAlpha *= boltDecay;
  if (this.boltAlpha < 0.02) {
   this.boltAlpha = 0;
   this.boltSegments.length = 0;
  }

  // Draw procedural jagged branching bolt
  if (this.boltAlpha > 0 && this.boltSegments.length > 0) {
   if (typeof ctx.save === 'function') ctx.save();

   // Pass 1: Outer cyan glow
   ctx.strokeStyle = `rgba(130, 220, 255, ${this.boltAlpha * 0.75})`;
   ctx.lineWidth = 3.5;
   ctx.shadowColor = '#7edbff';
   ctx.shadowBlur = 12;
   ctx.beginPath();
   for (let i = 0; i < this.boltSegments.length; i++) {
    const seg = this.boltSegments[i];
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(seg.x2, seg.y2);
   }
   ctx.stroke();

   // Pass 2: White hot core
   ctx.strokeStyle = `rgba(255, 255, 255, ${this.boltAlpha})`;
   ctx.lineWidth = 1.4;
   ctx.shadowBlur = 0;
   ctx.beginPath();
   for (let i = 0; i < this.boltSegments.length; i++) {
    const seg = this.boltSegments[i];
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(seg.x2, seg.y2);
   }
   ctx.stroke();

   if (typeof ctx.restore === 'function') ctx.restore();
  }

  // Draw screen-wide flash overlay
  if (this.flashAlpha > 0) {
   if (typeof ctx.save === 'function') ctx.save();
   ctx.fillStyle = `rgba(240, 248, 255, ${Math.min(0.85, this.flashAlpha)})`;
   ctx.fillRect(0, 0, width, height);
   if (typeof ctx.restore === 'function') ctx.restore();
  }
 }
}

class WindSystem {
 constructor(maxParticles = 35) {
  this.maxParticles = maxParticles;
  this.particles = [];
  for (let i = 0; i < maxParticles; i++) {
   this.particles.push({
    x: Math.random(),
    y: Math.random(),
    len: 18 + Math.random() * 26,
    speed: 260 + Math.random() * 260,
    size: 1.3 + Math.random() * 1.7,
    isLeaf: (i % 3 === 0),
    isGreenLeaf: (i % 2 === 0),
    phase: Math.random() * Math.PI * 2,
    angle: Math.random() * Math.PI * 2
   });
  }
 }

 updateAndDraw(ctx, width, height, dt, climate, simTime = 0) {
  const windActive = Boolean(climate?.heavyWindActive);
  const breezeActive = windActive || (climate?.rainActive && (climate.rainIntensity || 0) > 0.4);
  if (!breezeActive) return;

  const count = windActive ? this.maxParticles : Math.floor(this.maxParticles * 0.5);
  const speedMult = windActive ? 1.4 : 0.8;

  if (typeof ctx.save === 'function') ctx.save();

  // 1. Update & draw curved wind swirls
  ctx.strokeStyle = `rgba(230, 248, 242, ${windActive ? 0.32 : 0.18})`;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
   const wp = this.particles[i];
   wp.x += (wp.speed * speedMult * dt) / width;
   if (wp.x > 1.0) {
    wp.x -= 1.0;
    wp.y = Math.random();
   }
   if (!wp.isLeaf) {
    const wx = wp.x * width;
    const wy = (wp.y * height) + Math.sin(simTime * 4 + wp.phase) * 12;
    ctx.moveTo(wx - wp.len, wy);
    ctx.quadraticCurveTo(wx - wp.len * 0.5, wy + Math.sin(simTime * 5 + wp.phase) * 5, wx, wy);
   }
  }
  ctx.stroke();

  // 2. Draw fluttering leaves
  for (let i = 0; i < count; i++) {
   const wp = this.particles[i];
   if (wp.isLeaf) {
    wp.angle += dt * 5;
    const wx = wp.x * width;
    const wy = (wp.y * height) + Math.sin(simTime * 4 + wp.phase) * 14;
    ctx.fillStyle = wp.isGreenLeaf ? 'rgba(88, 132, 65, 0.85)' : 'rgba(138, 96, 48, 0.85)';
    ctx.beginPath();
    if (typeof ctx.ellipse === 'function') {
     ctx.ellipse(wx, wy, wp.size * 2.0, wp.size * 0.95, wp.angle, 0, Math.PI * 2);
    } else {
     ctx.arc(wx, wy, wp.size * 1.4, 0, Math.PI * 2);
    }
    ctx.fill();
   }
  }

  if (typeof ctx.restore === 'function') ctx.restore();
 }
}

if (typeof AntGame !== 'undefined') {
 AntGame.RainSystem = RainSystem;
 AntGame.LightningManager = LightningManager;
 AntGame.WindSystem = WindSystem;
}
})();
