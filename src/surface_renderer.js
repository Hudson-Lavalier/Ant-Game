/*
 * UNDERFOOT SURFACE RENDERER
 * Dedicated canvas renderer for the outdoor surface dimension:
 * - Lush green meadow grass with flora variation (clover, pebbles, wildflowers)
 * - Ponds with water shimmer and reflection
 * - Streams with banks and depth
 * - Raised cliffs with directional drop shadows
 * - Stumps: solid wood grain rings vs hollow logs with bark wall, doorway, and sheltered floor
 * - Berry bushes with ripe berries
 * - Symmetrical bi-directional rendering: looking down into the underground through entrance holes
 * - Independent Fog of War
 */
(()=>{
const {Config:C,hash,hexDistance,hexDisk,Species,FoodTypes}=AntGame;

class SurfaceRenderer {
 constructor(canvas, baseRenderer){
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d');
  this.base = baseRenderer;

  // Modular Screen-Space Weather Systems (RainSystem, LightningManager, WindSystem)
  if (typeof AntGame !== 'undefined' && !AntGame.RainSystem && typeof require === 'function') {
   try { require('./weather_effects.js'); } catch {}
  }
  this.rainSystem = AntGame.RainSystem ? new AntGame.RainSystem(300, 35) : null;
  this.lightningManager = AntGame.LightningManager ? new AntGame.LightningManager() : null;
  this.windSystem = AntGame.WindSystem ? new AntGame.WindSystem(35) : null;
 }

 draw(sim, camera, options = {}){
  const c = this.ctx;
  const z = camera.zoom || camera.z || 1;
  const s = camera.s || (C.cellSize * z);
  const width = this.canvas.width / this.base.dpr;
  const height = this.canvas.height / this.base.dpr;

  const isDay = sim.climate ? sim.climate.isDay : true;
  const dayProgress = sim.climate ? sim.climate.dayProgress : 0.5;

  const shake = sim.climate?.screenShake || 0;
  const shakeX = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0;
  const shakeY = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0;
  if(typeof c.save === 'function') c.save();
  if(typeof c.setTransform === 'function') {
   c.setTransform(this.base.dpr, 0, 0, this.base.dpr, shakeX * this.base.dpr, shakeY * this.base.dpr);
  }

  // 1. Fog of War Base Fill (pure black void for unrevealed terrain)
  c.fillStyle = '#060a07';
  c.fillRect(-10, -10, width + 20, height + 20);

  const sw = sim.surfaceWorld;
  if(!sw){ if(typeof c.restore === 'function') c.restore(); return; }

  const hasPerf = typeof performance !== 'undefined' && typeof performance.mark === 'function';
  if(hasPerf) performance.mark('underfoot:surface-terrain-start');

  const ox = this.base.originX !== undefined ? this.base.originX : (width - Math.min(277, width * 0.25)) / 2;
  const oy = this.base.originY !== undefined ? this.base.originY : (height / 2 - 10);
  const camX = camera.x, camY = camera.y;
  const strideX = 1.5 * s, strideY = Math.sqrt(3) * s, halfStrideY = strideY * 0.5;
  const bound = s * 2.5;
  const minX = -bound, minY = -bound, maxX = width + bound, maxY = height + bound;
  const inView = (px, py, rad = 40) => px >= -rad && py >= -rad && px <= width + rad && py <= height + rad;
  const tilePt = this._tilePoint || (this._tilePoint = { x: 0, y: 0 });

  // 2. Render Surface Cells
  for(const cell of sw.cells.values()){
   const qDiff = cell.x - camX;
   const px = ox + strideX * qDiff;
   if(px < minX || px > maxX) continue;
   const py = oy + strideY * (cell.y - camY) + halfStrideY * qDiff;
   if(py < minY || py > maxY) continue;
   tilePt.x = px; tilePt.y = py;
   const p = tilePt;

   const h = hash(sw.seed, cell.x, cell.y);

   // Fog of War: unrevealed cells blend into the black background
   if(!cell.discovered) continue;

    // A. Entrance Hole or Lightning Breach (Bridge to Underground)
    if(cell.terrain === 'entrance' || cell.structure === 'entrance_hole' || cell.isBreach || cell.structure === 'breach'){
     // Symmetrical Bi-Directional Projection:
     // Render the dark abyss of the hole with subterranean nest preview
     c.fillStyle = cell.isBreach ? '#070503' : '#0a0d0a';
     this.base.poly(p.x, p.y, s * 1.02);
     c.fill();

     // Mounded rim around the hole (charred soot for lightning breach, dirt for nest)
     c.strokeStyle = cell.isBreach ? '#1c1208' : '#5a422d';
     c.lineWidth = Math.max(1.2, s * 0.18);
     this.base.poly(p.x, p.y, s * 0.88);
     c.stroke();

     // Inner hole darkness
     const holeGrad = c.createRadialGradient(p.x, p.y, s * 0.1, p.x, p.y, s * 0.75);
     holeGrad.addColorStop(0, cell.isBreach ? 'rgba(2, 1, 1, 0.98)' : 'rgba(4, 6, 5, 0.95)');
     holeGrad.addColorStop(0.7, cell.isBreach ? 'rgba(10, 6, 4, 0.90)' : 'rgba(15, 18, 16, 0.85)');
     holeGrad.addColorStop(1, cell.isBreach ? 'rgba(35, 20, 10, 0.5)' : 'rgba(60, 45, 30, 0.4)');
     c.fillStyle = holeGrad;
     c.beginPath();
     c.arc(p.x, p.y, s * 0.75, 0, Math.PI * 2);
     c.fill();

     // Subtle subterranean tunnel glow
     const ugCell = sim.world.peek(cell.x, cell.y);
     if(ugCell && !ugCell.solid){
      c.fillStyle = cell.isBreach ? 'rgba(255, 180, 80, 0.22)' : 'rgba(72, 168, 207, 0.25)';
      c.beginPath();
      c.arc(p.x, p.y, s * 0.35, 0, Math.PI * 2);
      c.fill();
     }

     // Torrential Cascade into Entrance / Breach Hole
     const entrObj = sw.getEntrance(cell.x, cell.y);
     if((entrObj && entrObj._cascadeActive) || cell._cascadeActive){
      c.strokeStyle = 'rgba(110, 215, 255, 0.85)';
      c.lineWidth = Math.max(1.8, s * 0.16);
      c.beginPath();
      c.arc(p.x, p.y, s * 0.82, 0, Math.PI * 2);
      c.stroke();
     }
    } else if(cell.isBridge || cell.zone === 'causeway' || cell.structure === 'earthen_bridge'){
     // Earthen Causeway Bridge across Water
     c.fillStyle = '#4c3725';
     this.base.poly(p.x, p.y, s * 1.02);
     c.fill();
     c.strokeStyle = '#322316';
     c.lineWidth = Math.max(1.0, s * 0.1);
     this.base.poly(p.x, p.y, s * 0.94);
     c.stroke();
     if(z >= 1.2){
      c.strokeStyle = '#62493366';
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(p.x - s * 0.3, p.y); c.lineTo(p.x + s * 0.3, p.y);
      c.moveTo(p.x, p.y - s * 0.3); c.lineTo(p.x, p.y + s * 0.3);
      c.stroke();
     }
    } else if(cell.structure === 'compacted_dirt' || cell.zone === 'compacted-dirt'){
     // Compacted Dirt Berm / Wall (Protective barrier against water and wind)
     c.fillStyle = '#38281d';
     this.base.poly(p.x, p.y, s * 1.02);
     c.fill();
     c.strokeStyle = '#22160f';
     c.lineWidth = Math.max(1.4, s * 0.15);
     this.base.poly(p.x, p.y, s * 0.90);
     c.stroke();
    } else if(cell.structure === 'trench' || cell.zone === 'trench'){
     // Sunken Trench (Water retention ditch & defensive cover)
     c.fillStyle = '#141a16';
     this.base.poly(p.x, p.y, s * 1.02);
     c.fill();
     c.strokeStyle = '#253028';
     c.lineWidth = Math.max(1.2, s * 0.12);
     this.base.poly(p.x, p.y, s * 0.82);
     c.stroke();
     if(cell.water > 0){
      const tAlpha = Math.min(0.85, 0.25 + (cell.water / 7.0) * 0.6);
      c.fillStyle = `rgba(28, 82, 104, ${tAlpha})`;
      this.base.poly(p.x, p.y, s * 0.78);
      c.fill();
     }
    } else if(cell.scorch || cell.zone === 'crater'){
     // Scorched Earth / Crater Rim from Lightning Strike
     c.fillStyle = '#1c1611';
     this.base.poly(p.x, p.y, s * 1.02);
     c.fill();
     c.strokeStyle = '#0e0b08';
     c.lineWidth = 0.8;
     this.base.poly(p.x, p.y, s * 0.95);
     c.stroke();
     c.fillStyle = '#0a0806';
     c.fillRect(p.x - s * 0.2, p.y - s * 0.1, 2, 2);
     c.fillRect(p.x + s * 0.15, p.y + s * 0.2, 2, 2);
    } else if(cell.terrain === 'water'){
    // B. Water (Streams and Ponds)
    const isPond = cell.zone === 'pond';
    c.fillStyle = isPond ? '#1c5268' : '#1e6275';
    this.base.poly(p.x, p.y, s * 1.02);
    c.fill();

    // Water ripple/highlight
    if(z >= 1.2){
     c.strokeStyle = '#4db2c955';
     c.lineWidth = 0.8;
     c.beginPath();
     c.arc(p.x - s*0.2, p.y - s*0.15, s*0.35, 0.2, Math.PI*0.8);
     c.stroke();
    }
   } else if(cell.cliff || cell.terrain === 'cliff'){
    // C. Cliffs (Raised Elevation)
    c.fillStyle = '#3a443e';
    this.base.poly(p.x, p.y, s * 1.02);
    c.fill();
    // Shadow along south/east edge
    c.strokeStyle = '#1d2420';
    c.lineWidth = Math.max(1, s * 0.15);
    this.base.poly(p.x, p.y, s * 0.98);
    c.stroke();
   } else if(cell.structure === 'wood_stump'){
    // D. Stumps: Solid vs Hollow
    c.fillStyle = '#3d2b1f';
    this.base.poly(p.x, p.y, s * 1.02);
    c.fill();
    // Wood rings
    c.strokeStyle = '#5a3f2c';
    c.lineWidth = 0.8;
    c.beginPath();
    c.arc(p.x, p.y, s * 0.45, 0, Math.PI * 2);
    c.stroke();
   } else if(cell.structure === 'hollow_wall'){
    // Bark exterior wall
    c.fillStyle = '#2f2015';
    this.base.poly(p.x, p.y, s * 1.02);
    c.fill();
    c.strokeStyle = '#1c120a';
    c.lineWidth = 1.0;
    this.base.poly(p.x, p.y, s * 0.95);
    c.stroke();
   } else if(cell.structure === 'hollow_interior' || cell.structure === 'hollow_doorway'){
    // Sheltered smooth wood floor inside log
    c.fillStyle = '#423122';
    this.base.poly(p.x, p.y, s * 1.02);
    c.fill();
    if(cell.structure === 'hollow_doorway'){
     c.strokeStyle = '#7c5f4388';
     c.lineWidth = 1.2;
     c.stroke();
    }
   } else if(cell.zone === 'berry_bush'){
    // E. Berry Bushes
    c.fillStyle = '#1d3e18';
    this.base.poly(p.x, p.y, s * 1.02);
    c.fill();

    // Bush leaves
    c.fillStyle = '#2f5e27';
    c.beginPath();
    c.arc(p.x, p.y, s * 0.65, 0, Math.PI * 2);
    c.fill();

    // Berries if ripe
    if(cell.hasBerries){
     c.fillStyle = '#8b2252';
     const offsets = [[-0.25, -0.2], [0.25, -0.15], [0, 0.25], [-0.2, 0.2], [0.2, 0.2]];
     for(const off of offsets){
      c.beginPath();
      c.arc(p.x + off[0] * s, p.y + off[1] * s, Math.max(1.8, s * 0.12), 0, Math.PI * 2);
      c.fill();
     }
    }
   } else {
    // F. Open Meadow Grass
    const grassHue = 110 + (h % 15);
    const grassSat = 28 + (h % 12);
    const grassLight = 16 + (h % 8);
    c.fillStyle = `hsl(${grassHue}, ${grassSat}%, ${grassLight}%)`;
    this.base.poly(p.x, p.y, s * 1.02);
    c.fill();

    // Flora detail at higher zoom
    if(z >= 1.3){
     const flora = cell.flora || (h % 5);
     if(flora === 1){
      // Tall grass blades
      c.strokeStyle = '#4a7538';
      c.lineWidth = 0.7;
      c.beginPath();
      c.moveTo(p.x - s*0.2, p.y + s*0.25);
      c.lineTo(p.x - s*0.1, p.y - s*0.25);
      c.moveTo(p.x + s*0.1, p.y + s*0.25);
      c.lineTo(p.x + s*0.2, p.y - s*0.2);
      c.stroke();
     } else if(flora === 2){
      // Clover
      c.fillStyle = '#3a6629';
      c.beginPath();
      c.arc(p.x - s*0.1, p.y, s*0.1, 0, Math.PI*2);
      c.arc(p.x + s*0.1, p.y, s*0.1, 0, Math.PI*2);
      c.arc(p.x, p.y - s*0.1, s*0.1, 0, Math.PI*2);
      c.fill();
     } else if(flora === 3){
      // Wildflower dot
      c.fillStyle = '#d4c259';
      c.beginPath();
      c.arc(p.x, p.y, Math.max(1, s*0.08), 0, Math.PI*2);
      c.fill();
     }
    }

    // Flooded Bank (Swollen Streams & Ponds)
    if(cell.isFloodedBank && cell.water > 0){
     const floodAlpha = Math.min(0.85, 0.25 + (cell.water / 3.0) * 0.6);
     c.fillStyle = cell.bankZone === 'pond' ? `rgba(28, 82, 104, ${floodAlpha})` : `rgba(30, 98, 117, ${floodAlpha})`;
     this.base.poly(p.x, p.y, s * 1.02);
     c.fill();
     if(cell.water >= 1.5 && z >= 1.1){
      c.strokeStyle = '#4db2c966';
      c.lineWidth = 0.7;
      c.beginPath();
      c.arc(p.x, p.y, s * 0.4, 0.3, Math.PI * 0.9);
      c.stroke();
     }
    } else if(cell.water > 0.05){
     // Micro-Puddle Sheen on Open Meadow
     const puddleAlpha = Math.min(0.55, 0.15 + cell.water * 0.25);
     c.fillStyle = `rgba(45, 115, 145, ${puddleAlpha})`;
     c.beginPath();
     c.arc(p.x, p.y, s * 0.55, 0, Math.PI * 2);
     c.fill();
     if(sim.climate?.rainActive){
      c.strokeStyle = 'rgba(125, 205, 235, 0.45)';
      c.lineWidth = 0.7;
      c.beginPath();
      c.arc(p.x, p.y, s * 0.35, 0, Math.PI * 2);
      c.stroke();
     }
    }
   }

   // Overlay: Areas & Behavioral Zones
   if(this.base.colorMap && (!cell.solid || (this.base.overlayMode === 'zones' && cell.behaviorZone?.startsWith('excavation:')))){
    const mode = this.base.overlayMode || 'areas';
    if(mode === 'zones'){
     if(cell.behaviorZone){
      const bzc = this.base.behaviorZoneColor(cell);
      if(bzc){
       c.fillStyle = bzc;
       this.base.poly(p.x, p.y, s * 0.78, -0.08);
       c.fill();
      }
      const type = cell.behaviorZone.split(':')[0];
      c.strokeStyle = type === 'hunting' ? '#ff5555' : type === 'foraging' ? '#55dd55' : type === 'excavation' ? '#e6c229' : '#e6af2e';
      c.lineWidth = Math.max(1, s * 0.06);
      this.base.poly(p.x, p.y, s * 0.76, -0.08);
      c.stroke();
     }
    }else if(!cell.solid){
     const zc = this.base.zoneColor(cell);
     if(zc){
      c.fillStyle = zc;
      this.base.poly(p.x, p.y, s * 0.78, -0.08);
      c.fill();
     }
    }
   }
  }

  // 3. Render Resources on Surface
  for(const r of sim.resources){
   if(r.layer !== 1 || r.remaining <= 0) continue;
   const cell = sw.peek(r.x, r.y);
   if(!cell?.discovered) continue;
   const p = this.base.screen(r.x, r.y);
   if(!inView(p.x, p.y, s * 2)) continue;
   const d = FoodTypes[r.foodType] || {color: '#8b2252'};
   c.fillStyle = d.color;
   c.beginPath();
   c.ellipse(p.x, p.y, Math.max(2, s * 0.5), Math.max(1.5, s * 0.35), 0.2, 0, Math.PI * 2);
   c.fill();
  }

  // 4. Render Creatures on Surface
  for(const cr of sim.creatures){
   if(cr.layer !== 1 || !cr.alive) continue;
   const cell = sw.peek(cr.x, cr.y);
   if(!cell?.discovered) continue;
   const p = this.base.screen(cr.x, cr.y);
   if(!inView(p.x, p.y, 40 * z)) continue;
   const selCol = options.selection instanceof Map ? options.selection.get(cr.id) : (Array.isArray(options.selection) && options.selection.includes(cr.id) ? '#48a8cf' : null);
   if(selCol){
    c.strokeStyle = selCol;
    c.lineWidth = 1.6;
    c.beginPath();
    const selRad = Math.max(8, (AntGame.getEntityRadius?.(cr) || 0.3) * 32);
    c.arc(p.x, p.y, selRad * z, 0, Math.PI * 2);
    c.stroke();
   }
   this.base.creature(cr, p, z, Species[cr.species] || {});
  }

   // 5. Render Ants on Surface
   for(const a of sim.ants){
    if(a.layer !== 1 || !a.alive) continue;
    const cell = sw.peek(a.x, a.y);
    if(a.colonyId !== 1 && !cell?.discovered) continue;
    const p = this.base.screen(a.x, a.y);
    if(!inView(p.x, p.y, 35 * z)) continue;

    const selCol = options.selection instanceof Map ? options.selection.get(a.id) : (Array.isArray(options.selection) && options.selection.includes(a.id) ? '#48a8cf' : null);
    if(selCol){
     c.strokeStyle = selCol;
     c.lineWidth = 1.6;
     c.beginPath();
     c.arc(p.x, p.y, (a.type === 'queen' ? 14 : 9) * z, 0, Math.PI * 2);
     c.stroke();
    }
    this.base.ant(a, p, z, sim.time);
    this.base.hp(a, p, z, a.maxHealth || 100);
   }

   // 6. Drops on Surface
   for(const d of sim.drops || []){
    if((d.layer || d.load?.layer || 0) !== 1) continue;
    const cell = sw.peek(d.x, d.y);
    if(!cell?.discovered) continue;
    const p = this.base.screen(d.x, d.y);
    if(!inView(p.x, p.y, 20)) continue;
    c.fillStyle = d.load.type === 'food' ? '#a59750' : '#524335';
    c.beginPath();
    c.arc(p.x, p.y, 2.5 * z, 0, Math.PI * 2);
    c.fill();
   }

   // 7. Command Markers
   for(const m of sim.commandMarkers || []){
    if((m.layer || 0) !== 1) continue;
    const p = this.base.screen(m.x, m.y);
    if(!inView(p.x, p.y, 20)) continue;
    c.strokeStyle = m.color;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(p.x, p.y, 7 * z, 0, Math.PI * 2);
    c.moveTo(p.x - 9 * z, p.y);
    c.lineTo(p.x + 9 * z, p.y);
    c.moveTo(p.x, p.y - 9 * z);
    c.lineTo(p.x, p.y + 9 * z);
    c.stroke();
   }

   // 7. Hover & Inspected Cell & Selection Box
   if(this.base.inspectedCell){
    const p = this.base.screen(this.base.inspectedCell.x, this.base.inspectedCell.y);
    c.strokeStyle = '#48a8cf';
    c.lineWidth = 2;
    this.base.tile(p, s);
    c.stroke();
   }
   if(this.base.hover){
    for(const h of hexDisk(this.base.hover.x, this.base.hover.y, this.base.hoverRadius)){
     const p = this.base.screen(h.x, h.y);
     const color = options.mode === 'attack' ? '#d84f4f' : options.mode === 'harvest' ? '#73c887' : '#527888';
     c.fillStyle = color + '45';
     this.base.tile(p, s);
     c.fill();
     c.strokeStyle = color;
     c.lineWidth = 1.2;
     this.base.tile(p, s);
     c.stroke();
    }
   }
   if(this.base.selectionBox){
    const b = this.base.selectionBox;
    c.fillStyle = '#48a8cf20';
    c.strokeStyle = '#48a8cf';
    c.fillRect(b.x, b.y, b.w, b.h);
    c.strokeRect(b.x, b.y, b.w, b.h);
   }

   // 8. Screen-Space Atmospheric Weather Effects (Rain, Wind Swirls, Lightning)
   // Strict Layer Isolation: ONLY runs in SurfaceRenderer.draw() when viewing the Surface layer
   if(typeof c.save === 'function') c.save();
   if(typeof c.setTransform === 'function') {
    c.setTransform(this.base.dpr, 0, 0, this.base.dpr, 0, 0);
   }
   const dt = Math.min(0.1, Math.max(0.001, (sim.time || 0) - (this._lastTime || (sim.time || 0))));
   this._lastTime = sim.time;

   this.windSystem?.updateAndDraw(c, width, height, dt, sim.climate, sim.time || 0);
   this.rainSystem?.updateAndDraw(c, width, height, dt, sim.climate);
   this.lightningManager?.updateAndDraw(c, width, height, dt, sim.climate, this.base);

   if(typeof c.restore === 'function') c.restore();

   if(typeof c.restore === 'function') c.restore();
  }
}

AntGame.SurfaceRenderer = SurfaceRenderer;
})();
