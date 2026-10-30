/*
 * UNDERFOOT SURFACE WORLD GENERATOR
 * Generates the procedural open-air surface dimension: open lush grass fields,
 * ponds, streams, elevation plateaus, berry bushes, solid wood stumps, and hollow logs.
 * Surface coordinates (x, y) map 1-to-1 to underground coordinates.
 */
(()=>{
const {Config:C,hash,hexDistance,hexDisk,hexRound,hexLine}=AntGame;
const key=(q,r)=>`${q},${r}`;
const DIRS=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];

class SurfaceWorld {
 constructor(seed, undergroundWorld){
  this.seed = (seed + 99991) >>> 0;
  this.undergroundWorld = undergroundWorld;
  this.isSurface = true;
  this.cells = new Map();
  this.chunks = new Map();
  this.entrances = []; // 1-to-1 aligned with underground breaches
  this.berryBushes = [];
  this.stumps = [];
  this.revision = 0;
  this.activeSurfaceWater = new Set();
  this._streamSpine = new Map();
  this.syncEntrances();
  this.ensureChunk(0, 0);
  this.ensureChunk(0, -1);
  const streamY0 = this.getRawStreamCenterY(0);
  this.ensureChunk(0, Math.round(streamY0 / C.chunkStride));
 }

 ensureChunk(cx, cy){
  const id = key(cx, cy);
  if(this.chunks.has(id)) return;
  this._ensureChunkStreamSpine(cx);
  const oq = cx * C.chunkStride, or = cy * C.chunkStride, h = hash(this.seed, cx, cy);
  this.chunks.set(id, {id, cx, cy, x: oq, y: or, seed: h});
  for(const p of hexDisk(oq, or, C.chunkRadius)){
   const k = key(p.x, p.y);
   if(!this.cells.has(k)) this.cells.set(k, this.generateCell(p.x, p.y));
  }
 }

 neighbors(x, y){
  return DIRS.map(([dq, dr]) => this.peek(x + dq, y + dr)).filter(Boolean);
 }

 faces(c, known = true){
  return this.neighbors(c.x, c.y).filter(n => !n.solid && !n.isHole && n.terrain !== 'entrance' && n.structure !== 'entrance_hole' && (n.water || 0) < 6 && (!known || n.discovered));
 }

  syncEntrances(){
   this.entrances = [];
   const entranceKeys = new Set();
   if(this.undergroundWorld?.features){
    for(const f of this.undergroundWorld.features){
     if(f.type==='surface'){
      const k=key(f.x,f.y);
      if(!entranceKeys.has(k)){
       entranceKeys.add(k);
       this.entrances.push({id:f.id,x:f.x,y:f.y,r:f.entranceRadius!==undefined?f.entranceRadius:0});
      }
     }
    }
   }
   if(!this.entrances.some(e=>e.x===0&&e.y===-25)){
    this.entrances.push({id:'surface-start',x:0,y:-25,r:0});
   }
   this._streamSpine = new Map();
   this._streamSpineChunks = new Set();
  }

 getRawStreamCenterY(x, seed = this.seed){
  const wave1 = Math.sin(x * 0.035 + (seed % 100)) * 14.0;
  const wave2 = Math.sin(x * 0.095 + ((seed >>> 4) % 100)) * 5.5;
  const wave3 = Math.cos(x * 0.21 + ((seed >>> 8) % 100)) * 2.2;
  let centerY = 28 + ((seed >>> 12) % 25) + wave1 + wave2 + wave3;
  const entrances = (this.entrances && this.entrances.length) ? this.entrances : [{ x: 0, y: -25 }];
  for(const entr of entrances){
   const dist = Math.hypot(x - entr.x, centerY - entr.y);
   if(dist < 16){
    const push = 16 - dist;
    centerY += (centerY >= entr.y ? push : -push);
   }
  }
  return centerY;
 }

 _ensureChunkStreamSpine(cx){
  if(!this._streamSpineChunks) this._streamSpineChunks = new Set();
  if(!this._streamSpineChunkOrder) this._streamSpineChunkOrder = [];
  if(this._streamSpineChunks.has(cx)) return;

  // Cap cache to 150 chunks to prevent unbounded memory growth
  if(this._streamSpineChunks.size >= 150){
   const oldestCx = this._streamSpineChunkOrder.shift();
   this._streamSpineChunks.delete(oldestCx);
   const oMinX = oldestCx * C.chunkStride - C.chunkRadius - 2;
   const oMaxX = oldestCx * C.chunkStride + C.chunkRadius + 2;
   for(let x = oMinX; x <= oMaxX; x++){
    const h = hexRound(x, this.getRawStreamCenterY(x));
    this._streamSpine?.delete(key(h.x, h.y));
   }
  }

  this._streamSpineChunks.add(cx);
  this._streamSpineChunkOrder.push(cx);
  if(!this._streamSpine) this._streamSpine = new Map();

  const minX = cx * C.chunkStride - C.chunkRadius - 2;
  const maxX = cx * C.chunkStride + C.chunkRadius + 2;

  let prevHex = hexRound(minX, this.getRawStreamCenterY(minX));
  this._streamSpine.set(key(prevHex.x, prevHex.y), prevHex);
  for(let x = minX + 1; x <= maxX; x++){
   const currHex = hexRound(x, this.getRawStreamCenterY(x));
   const line = hexLine(prevHex, currHex);
   for(const h of line){
    this._streamSpine.set(key(h.x, h.y), h);
   }
   prevHex = currHex;
  }
 }

 _ensureStreamSpine(minX, maxX){
  const minCx = Math.floor(minX / C.chunkStride) - 1;
  const maxCx = Math.ceil(maxX / C.chunkStride) + 1;
  for(let cx = minCx; cx <= maxCx; cx++){
   this._ensureChunkStreamSpine(cx);
  }
 }

 isStreamHex(x, y){
  const rx = Math.round(x), ry = Math.round(y);
  this._ensureChunkStreamSpine(Math.round(rx / C.chunkStride));
  return this._streamSpine ? this._streamSpine.has(key(rx, ry)) : false;
 }

  isEntrance(x,y){
   return this.entrances.some(e=>hexDistance({x,y},e)<=(e.r||0));
  }

 isAdjacentToEntrance(x, y){
  if(this.isEntrance(x, y)) return false;
  for(const dir of DIRS){
   if(this.isEntrance(x + dir[0], y + dir[1])) return true;
  }
  return false;
 }

 getEntrance(x,y){
  return this.entrances.find(e=>hexDistance({x,y},e)<=(e.r||0));
 }

 getConnectedEntranceCells(startX, startY){
   if(this._lastEntrancesRef !== this.entrances){
    this._lastEntrancesRef = this.entrances;
    this._connectedCache = new Map();
    this._rimCandidatesCache = new Map();
   }
   const sx = Math.round(startX), sy = Math.round(startY);
   const k = key(sx, sy);
   if(!this._connectedCache) this._connectedCache = new Map();
   if(this._connectedCache.has(k)) return this._connectedCache.get(k);

   const start = this.get(sx, sy);
   if(!start || !this.isEntrance(sx, sy)){
    this._connectedCache.set(k, []);
    return [];
   }
   const connected = [], queue = [start], visited = new Set();
   visited.add(k);
   while(queue.length > 0){
    const curr = queue.shift();
    connected.push(curr);
    for(const dir of DIRS){
     const nx = curr.x + dir[0], ny = curr.y + dir[1];
     const nk = key(nx, ny);
     if(!visited.has(nk) && this.isEntrance(nx, ny)){
      visited.add(nk);
      queue.push(this.get(nx, ny));
     }
    }
   }
   for(const c of connected){
    this._connectedCache.set(key(c.x, c.y), connected);
   }
   return connected;
  }

  getPassableRimCandidates(entrX, entrY){
   if(this._lastEntrancesRef !== this.entrances){
    this._lastEntrancesRef = this.entrances;
    this._connectedCache = new Map();
    this._rimCandidatesCache = new Map();
   }
   const sx = Math.round(entrX), sy = Math.round(entrY);
   const k = key(sx, sy);
   if(!this._rimCandidatesCache) this._rimCandidatesCache = new Map();
   if(this._rimCandidatesCache.has(k)) return this._rimCandidatesCache.get(k);

   const connected = this.getConnectedEntranceCells(entrX, entrY);
   const entranceKeys = new Set(connected.map(c => key(c.x, c.y)));
   if(connected.length === 0){
    entranceKeys.add(key(sx, sy));
   }
   const candidates = [];
   const seen = new Set();
   const toScan = connected.length > 0 ? connected : [{ x: sx, y: sy }];

   for(const c of toScan){
    for(const dir of DIRS){
     const nx = c.x + dir[0], ny = c.y + dir[1];
     const nk = key(nx, ny);
     if(entranceKeys.has(nk) || seen.has(nk)) continue;
     seen.add(nk);
     const cell = this.get(nx, ny);
     if(!cell.solid && !cell.isHole && cell.terrain !== 'entrance' && cell.structure !== 'entrance_hole' && cell.terrain !== 'water' && (cell.water || 0) < 6 && !cell.cliff){
      candidates.push({ x: nx, y: ny });
     }
    }
   }
   for(const c of toScan){
    this._rimCandidatesCache.set(key(c.x, c.y), candidates);
   }
   return candidates;
  }

  getAdjacentPassableSurfaceHex(entrX, entrY, preferencePos = null){
   const candidates = this.getPassableRimCandidates(entrX, entrY);
   if(candidates.length === 0) return { x: Math.round(entrX) + 1, y: Math.round(entrY) };
   if(!preferencePos) return candidates[0];
   let best = candidates[0], bestDist = hexDistance(candidates[0], preferencePos);
   for(let i = 1; i < candidates.length; i++){
    const d = hexDistance(candidates[i], preferencePos);
    if(d < bestDist){
     bestDist = d;
     best = candidates[i];
    }
   }
   return best;
  }

  revealConnectedEntrance(entrX, entrY, r = C.surfaceRevealRadius || 25){
    const closestEntr = this.getClosestEntrance({ x: entrX, y: entrY });
    const ex = closestEntr ? closestEntr.x : entrX;
    const ey = closestEntr ? closestEntr.y : entrY;
    const connected = this.getConnectedEntranceCells(ex, ey);
    const toReveal = connected.length > 0 ? connected : [this.get(ex, ey)];
    if(toReveal[0] && toReveal[0]._surfaceRevealed) return;
    for(const c of toReveal){
     c._surfaceRevealed = true;
     c.discovered = true;
    }
    this.senseAt(ex, ey, r);
  }

 getClosestEntrance(pos){
  if(!this.entrances || !this.entrances.length) return { x: 0, y: -25, r: 2 };
  let best = this.entrances[0], bestDist = Infinity;
  for(const e of this.entrances){
   const d = hexDistance(pos, e);
   if(d < bestDist){
    bestDist = d;
    best = e;
   }
  }
  return best;
 }

 generateCell(x,y){
  if(this.isEntrance(x,y)){
   return {
    x, y, layer: 1, solid: false, terrain: 'entrance',
    zone: 'entrance', structure: 'entrance_hole',
    isHole: true,
    discovered: false, elevation: 0, water: 0, hardness: 1
   };
  }

  const h = hash(this.seed, x, y);
  const cx = Math.round(x / C.chunkStride), cy = Math.round(y / C.chunkStride);
  const ch = hash(this.seed + 1337, cx, cy);

  const nearEntrance = this.entrances && this.entrances.some(e => hexDistance({ x, y }, e) <= (e.r || 0) + 2);
  const streamY = this.getRawStreamCenterY(x);
  const nearStreamY = Math.abs(y - streamY) <= 4;

  if(!nearEntrance){
   if(nearStreamY && this.isStreamHex(x, y)){
    return {
     x, y, layer: 1, solid: false, terrain: 'water',
     zone: 'stream', water: 10, baselineWater: 10, discovered: false, elevation: 0, hardness: 1
    };
   }

   const pondCenterX = cx * C.chunkStride + ((ch % 17) - 8);
   const pondCenterY = cy * C.chunkStride + (((ch >>> 8) % 17) - 8);
   const hasPond = ((ch >>> 3) % 5) === 0;
   if(hasPond){
    const baseRadius = 1 + ((ch >>> 6) % 3);
    const maxR = baseRadius + 2;
    if(Math.abs(x - pondCenterX) <= maxR && Math.abs(y - pondCenterY) <= maxR){
     const d = hexDistance({x, y}, {x: pondCenterX, y: pondCenterY});
     if(d <= maxR){
      const angle = Math.atan2(y - pondCenterY, x - pondCenterX);
      const pondSeed = (ch >>> 9) % 100;
      const radMod = 0.7 * Math.sin(2 * angle + pondSeed) + 0.4 * Math.cos(3 * angle + pondSeed * 1.5);
      const effectiveRadius = Math.max(1, baseRadius + radMod);
      if(d <= effectiveRadius){
       const isPuddle = baseRadius === 1;
       return {
        x, y, layer: 1, solid: false, terrain: 'water',
        zone: isPuddle ? 'puddle' : 'pond',
        water: isPuddle ? 4 : 8, baselineWater: isPuddle ? 4 : 8,
        discovered: false, elevation: 0, hardness: 1
       };
      }
     }
    }
   }
  }

   const stumpCenterX = cx * C.chunkStride + (((ch >>> 5) % 21) - 10);
   const stumpCenterY = cy * C.chunkStride + (((ch >>> 11) % 21) - 10);
   const stumpDist = hexDistance({x,y}, {x:stumpCenterX, y:stumpCenterY});
   const hasStump = ((ch >>> 17) % 3) === 0;

   if(hasStump && stumpDist <= 4){
   const isHollow = ((ch >>> 2) % 2) === 0;
   if(!isHollow){
    return {
     x, y, layer: 1, solid: true, terrain: 'wood',
     zone: 'wood_stump', structure: 'wood_stump',
     discovered: false, elevation: 1, water: 0, hardness: 5, opaque: true
    };
   } else {
    if(stumpDist === 4 || stumpDist === 3){
     const isDoorway = (y === stumpCenterY && x > stumpCenterX);
     if(isDoorway){
      return {
       x, y, layer: 1, solid: false, terrain: 'wood_floor',
       zone: 'hollow_doorway', structure: 'hollow_doorway',
       discovered: false, elevation: 0, water: 0, hardness: 1, opaque: false
      };
     }
     return {
      x, y, layer: 1, solid: true, terrain: 'wood',
      zone: 'hollow_wall', structure: 'hollow_wall',
      discovered: false, elevation: 1, water: 0, hardness: 5, opaque: true
     };
    } else {
     return {
      x, y, layer: 1, solid: false, terrain: 'wood_floor',
      zone: 'hollow_interior', structure: 'hollow_interior',
      discovered: false, elevation: 0, water: 0, hardness: 1, opaque: false, sheltered: true
     };
    }
   }
  }

  const plateauCenterX = cx * C.chunkStride + (((ch >>> 7) % 25) - 12);
  const plateauCenterY = cy * C.chunkStride + (((ch >>> 13) % 25) - 12);
  if(((ch >>> 9) % 4) === 0 && hexDistance({x,y}, {x:plateauCenterX, y:plateauCenterY}) <= 5){
   return {
    x, y, layer: 1, solid: true, terrain: 'cliff',
    zone: 'cliff', structure: 'cliff',
    discovered: false, elevation: 2, water: 0, hardness: 10, opaque: true, cliff: true
   };
  }

  if((h % 140) === 0){
   return {
    x, y, layer: 1, solid: false, terrain: 'grass',
    zone: 'berry_bush', structure: 'berry_bush',
    hasBerries: true, berryReplenishTimer: 0,
    discovered: false, elevation: 0, water: 0, hardness: 1, opaque: false
   };
  }

  const isStreamBank = nearStreamY && !nearEntrance && DIRS.some(d => this.isStreamHex(x + d[0], y + d[1]));
  if(isStreamBank){
   return {
    x, y, layer: 1, solid: false, terrain: 'soil',
    zone: 'stream_bank',
    discovered: false, elevation: 0, water: 0, hardness: 1, opaque: false
   };
  }

  const floraVariant = (h % 5);
  return {
   x, y, layer: 1, solid: false, terrain: 'grass',
   flora: floraVariant, zone: 'grass',
   discovered: false, elevation: 0, water: 0, hardness: 1, opaque: false
  };
 }

 get(x, y){
  x = Math.round(x); y = Math.round(y);
  const k = key(x, y);
  if(!this.cells.has(k)){
   this.ensureChunk(Math.round(x / C.chunkStride), Math.round(y / C.chunkStride));
   if(!this.cells.has(k)) this.cells.set(k, this.generateCell(x, y));
  }
  return this.cells.get(k);
 }

 peek(x, y){
  return this.cells.get(key(Math.round(x), Math.round(y)));
 }

  senseAt(x, y, r = C.surfaceRevealRadius || 25){
   const cx = Math.round(x), cy = Math.round(y);
   const centerCell = this.get(cx, cy);
   centerCell.discovered = true;
   if(r <= 0) return;

   // Perimeter raymarching: 6*r rays cover all interior hexes with shadow-casting
   let hx = cx - r, hy = cy + r;
   const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
   const sQ = cx, sR = cy, sS = -sQ - sR;

   for(let d = 0; d < 6; d++){
    const dir = DIRS[d];
    for(let step = 0; step < r; step++){
     const tQ = hx, tR = hy, tS = -tQ - tR;
     const dist = hexDistance({ x: cx, y: cy }, { x: hx, y: hy });

     for(let i = 1; i <= dist; i++){
      const t = i / dist;
      const q = sQ + (tQ - sQ) * t;
      const r_coord = sR + (tR - sR) * t;
      const s = sS + (tS - sS) * t;

      let rq = Math.round(q), rr = Math.round(r_coord), rs = Math.round(s);
      const qDiff = Math.abs(rq - q), rDiff = Math.abs(rr - r_coord), sDiff = Math.abs(rs - s);
      if(qDiff > rDiff && qDiff > sDiff) rq = -rr - rs;
      else if(rDiff > sDiff) rr = -rq - rs;

      const cell = this.get(rq, rr);
      cell.discovered = true;

      if(cell.opaque || cell.solid || cell.cliff){
       break;
      }
     }

     hx += dir[0];
     hy += dir[1];
    }
   }
  }

 hasLineOfSight(start, target){
  const dist = hexDistance(start, target);
  if(dist <= 1) return true;

  const sQ = start.x, sR = start.y, sS = -sQ - sR;
  const tQ = target.x, tR = target.y, tS = -tQ - tR;

  for(let i = 1; i < dist; i++){
   const t = i / dist;
   const q = sQ + (tQ - sQ) * t;
   const r = sR + (tR - sR) * t;
   const s = sS + (tS - sS) * t;

   let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
   const qDiff = Math.abs(rq - q), rDiff = Math.abs(rr - r), sDiff = Math.abs(rs - s);
   if(qDiff > rDiff && qDiff > sDiff) rq = -rr - rs;
   else if(rDiff > sDiff) rr = -rq - rs;

   const cell = this.peek(rq, rr);
   if(cell && (cell.opaque || cell.solid || cell.cliff)){
    return false;
   }
  }
  return true;
 }

   updateHydrology(sim, dt){
    const isRaining = Boolean(sim.climate?.rainActive);
    const rainIntensity = isRaining ? (sim.climate.rainIntensity || 1.0) : 0;
    const isStorm = Boolean(sim.climate?.thunderstormActive);
    const riseRate = (isStorm ? 0.12 : 0.06) * rainIntensity * dt;
    const fallRate = 0.06 * dt;

    if(!this.activeSurfaceWater) this.activeSurfaceWater = new Set();

    // 1. Puddle Accumulation & Drying on Open Meadow
    if(isRaining){
     for(const cell of this.cells.values()){
      if(cell.solid || cell.cliff || cell.structure === 'compacted_dirt' || cell.zone === 'compacted-dirt') continue;
      if(cell.isBridge || cell.zone === 'causeway' || cell.structure === 'earthen_bridge') continue; // Bridge crowns shed water
      if(cell.isHole || cell.structure === 'entrance_hole' || cell.terrain === 'entrance' || cell.isBreach) continue; // Direct hole

      if(cell.structure === 'trench' || cell.zone === 'trench'){
      // Trench acts as water retention ditch (holds up to 7.0)
      cell.water = Math.min(7.0, (cell.water || 0) + riseRate * 1.5);
      this.activeSurfaceWater.add(key(cell.x, cell.y));
     } else if(cell.zone === 'grass' && !cell.isFloodedBank){
      if(cell.isDepression === undefined){
       cell.isDepression = (hash(this.seed, cell.x, cell.y) % 7 === 0);
      }
      if(cell.isDepression){
       cell.water = Math.min(1.5, (cell.water || 0) + 0.05 * rainIntensity * dt);
       this.activeSurfaceWater.add(key(cell.x, cell.y));
      }
     }
    }
   }

   // 2. Stream & Pond Swelling into Adjacent Banks (respecting bridges and berms)
   if(isRaining){
    const swollenBanks = new Set();
    for(const cell of this.cells.values()){
     if(cell.terrain === 'water'){
      const base = cell.baselineWater || (cell.baselineWater = cell.water || 8);
      cell.water = Math.min(base + 4.0, cell.water + riseRate);
      this.activeSurfaceWater.add(key(cell.x, cell.y));

      // Swell into neighboring shoreline bank hexes
      for(const n of this.neighbors(cell.x, cell.y)){
       // Edge Case 1 & Berm check: bridges and compacted dirt never become flooded banks
       if(n.isBridge || n.zone === 'causeway' || n.structure === 'earthen_bridge') continue;
       if(n.solid || n.cliff || n.structure === 'compacted_dirt' || n.zone === 'compacted-dirt') continue;
       if(n.structure === 'trench' || n.zone === 'trench'){
        n.water = Math.min(7.0, (n.water || 0) + riseRate);
        this.activeSurfaceWater.add(key(n.x, n.y));
        continue;
       }

       if(n.terrain !== 'entrance' && n.structure !== 'entrance_hole' && !n.isHole && !n.isBreach && n.terrain !== 'water'){
        const nk = key(n.x, n.y);
        if(!swollenBanks.has(nk)){
         swollenBanks.add(nk);
         n.isFloodedBank = true;
         n.bankZone = cell.zone;
         n.water = Math.min(3.0, (n.water || 0) + riseRate);
         this.activeSurfaceWater.add(nk);
        }
       }
      }
     }
    }
   }

   // 3. Entrance & Breach Cascading Water Drainage
   const allEntrances = [...(this.entrances || [])];
   for(const cell of this.cells.values()){
    if(cell.isBreach || (cell.isHole && !allEntrances.some(e => e.x === cell.x && e.y === cell.y))){
     allEntrances.push(cell);
    }
   }

   for(const entr of allEntrances){
    const ugCell = sim.world?.peek(entr.x, entr.y);
    if(!ugCell || ugCell.solid) continue;

    // Direct gentle rainfall down the open shaft
    if(isRaining){
     const directInflow = (isStorm ? 0.14 : 0.07) * rainIntensity * dt;
     ugCell.water = Math.min(5.0, (ugCell.water || 0) + directInflow);
     sim.world.activeWater.add(key(ugCell.x, ugCell.y));
     if(ugCell.water > 1.0) ugCell.isSpreading = true;
    }

    // Runoff and swollen stream/pond torrent cascading into the entrance hole
    let cascadedThisFrame = false;
    for(const n of this.neighbors(entr.x, entr.y)){
     if(n.solid || n.cliff || n.structure === 'compacted_dirt' || n.zone === 'compacted-dirt') continue;
     if((n.terrain === 'water' || n.isFloodedBank) && (n.water || 0) > 0.2){
      const spill = 0.55 * (isRaining ? Math.max(0.8, rainIntensity) : 0.8) * dt;
      n.water = Math.max(0.1, n.water - 0.25 * dt);
      ugCell.water = Math.min(5.0, (ugCell.water || 0) + spill);
      sim.world.activeWater.add(key(ugCell.x, ugCell.y));
      if(ugCell.water > 1.0) ugCell.isSpreading = true;
      cascadedThisFrame = true;
     } else if((n.water || 0) > 0.1){
      const spill = Math.min(n.water, 0.40 * dt);
      n.water -= spill;
      ugCell.water = Math.min(5.0, (ugCell.water || 0) + spill);
      sim.world.activeWater.add(key(ugCell.x, ugCell.y));
      if(ugCell.water > 1.0) ugCell.isSpreading = true;
      cascadedThisFrame = true;
     }
    }

    if(cascadedThisFrame){
     entr._cascadeActive = true;
     entr._cascadeTimer = 1.0;
     if(!sim._lastCascadeSound || sim.time - sim._lastCascadeSound > 6.0){
      sim._lastCascadeSound = sim.time;
      AntGame.AudioCoordinator?.play('flood');
     }
    } else if(entr._cascadeTimer > 0){
     entr._cascadeTimer -= dt;
     if(entr._cascadeTimer <= 0) entr._cascadeActive = false;
    }
   }

    // 4. Symmetrical Dissipation when Rain is Inactive
    if(!isRaining && this.activeSurfaceWater.size > 0){
     const toRemove = [];
     for(const k of this.activeSurfaceWater){
      const cell = this.cells.get(k);
      if(!cell){ toRemove.push(k); continue; }

      if(cell.terrain === 'water'){
       const base = cell.baselineWater || (cell.baselineWater = 8);
       if(cell.water > base){
        cell.water = Math.max(base, cell.water - fallRate);
       }
      } else if(cell.isFloodedBank){
       cell.water = Math.max(0, (cell.water || 0) - fallRate);
       if(cell.water <= 0.001){
        cell.water = 0;
        cell.isFloodedBank = false;
        cell.bankZone = null;
        toRemove.push(k);
       }
      } else if(cell.structure === 'trench' || cell.zone === 'trench'){
       // Trenches retain water longer (slow infiltration)
       cell.water = Math.max(0, (cell.water || 0) - 0.02 * dt);
       if(cell.water <= 0.001){
        cell.water = 0;
        toRemove.push(k);
       }
      } else if(cell.isDepression){
       cell.water = Math.max(0, (cell.water || 0) - 0.05 * dt);
       if(cell.water <= 0.001){
        cell.water = 0;
        toRemove.push(k);
       }
      } else if(cell.water > 0){
       cell.water = Math.max(0, cell.water - fallRate);
       if(cell.water <= 0.001){
        cell.water = 0;
        toRemove.push(k);
       }
      }
     }
     for(const k of toRemove) this.activeSurfaceWater.delete(k);
    }
   }

  serialize(){
   return {
    seed: this.seed,
    cells: [...this.cells],
    entrances: this.entrances,
    revision: this.revision
   };
  }

  static restore(data, undergroundWorld){
   const sw = Object.create(SurfaceWorld.prototype);
   sw.seed = data.seed;
   sw.undergroundWorld = undergroundWorld;
   sw.cells = new Map(data.cells);
   sw.chunks = new Map();
   sw.entrances = data.entrances || [];
   sw.revision = data.revision || 0;
   sw.activeSurfaceWater = new Set();
   for(const [k, c] of sw.cells){
    if(c.water > 0 || c.isFloodedBank) sw.activeSurfaceWater.add(k);
   }
   sw.berryBushes = [];
   sw.stumps = [];
   sw.ensureChunk(0, 0);
   sw.ensureChunk(0, -1);
   return sw;
  }
}

AntGame.SurfaceWorld = SurfaceWorld;
})();
