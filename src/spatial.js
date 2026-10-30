/*
 * UNDERFOOT SPATIAL INTERACTION & SOFT RELAXATION ENGINE
 * Provides 6-way hex perimeter interaction slots (combat, harvesting, interaction)
 * and zero-allocation soft circle relaxation to prevent entity stacking without jitter.
 */
(()=>{
const { Config: C } = AntGame;

// 6 Axial direction offsets for Ring 1 (60-degree increments)
const HEX_SLOT_OFFSETS = [
  { dq:  0, dr:  1, angle:  60 }, // Slot 0: Top-Right
  { dq:  1, dr:  0, angle:   0 }, // Slot 1: Right
  { dq:  1, dr: -1, angle: 300 }, // Slot 2: Bottom-Right
  { dq:  0, dr: -1, angle: 240 }, // Slot 3: Bottom-Left
  { dq: -1, dr:  0, angle: 180 }, // Slot 4: Left
  { dq: -1, dr:  1, angle: 120 }, // Slot 5: Top-Left
];

// 12 Axial direction offsets for Ring 2 (distance 2, 18 total perimeter slots)
const HEX_SLOT_OFFSETS_RING2 = [
  // 6 Primary cardinal extensions
  { dq:  0, dr:  2, angle:  60 },
  { dq:  2, dr:  0, angle:   0 },
  { dq:  2, dr: -2, angle: 300 },
  { dq:  0, dr: -2, angle: 240 },
  { dq: -2, dr:  0, angle: 180 },
  { dq: -2, dr:  2, angle: 120 },
  // 6 Intermediate diagonals
  { dq:  1, dr:  1, angle:  30 },
  { dq:  2, dr: -1, angle: 330 },
  { dq:  1, dr: -2, angle: 270 },
  { dq: -1, dr: -1, angle: 210 },
  { dq: -2, dr:  1, angle: 150 },
  { dq: -1, dr:  2, angle:  90 }
];

class HexInteractionSlots {
  constructor(targetEntity, rings = 1) {
    this.target = targetEntity;
    this.rings = rings;
    const totalSlots = rings > 1 ? (HEX_SLOT_OFFSETS.length + HEX_SLOT_OFFSETS_RING2.length) : HEX_SLOT_OFFSETS.length;
    this.slots = new Array(totalSlots).fill(null);
    this.waitingQueue = [];
  }

  getOffset(slotIndex) {
    if (slotIndex === null || slotIndex === undefined || typeof slotIndex !== 'number' || slotIndex < 0) {
      return { dq: 0, dr: 0, angle: 0 };
    }
    if (slotIndex < HEX_SLOT_OFFSETS.length) {
      return HEX_SLOT_OFFSETS[slotIndex] || { dq: 0, dr: 0, angle: 0 };
    }
    return HEX_SLOT_OFFSETS_RING2[slotIndex - HEX_SLOT_OFFSETS.length] || { dq: 0, dr: 0, angle: 0 };
  }

  isPassableSlot(world, slotQ, slotR) {
    if (!world || typeof world.peek !== 'function') return true;
    const cell = world.peek(slotQ, slotR);
    if (!cell) return false;
    if (cell.solid || cell.rock || cell.zone === 'rock') return false;
    if (cell.isWell || cell.zone === 'well') return false;
    if ((cell.water || 0) >= 6) return false;
    if (cell.cliff) return false;
    return true;
  }

  claimBestSlot(antOrId, arg2, arg3, arg4) {
    let antId, antX, antY, world;
    if (typeof antOrId === 'object' && antOrId !== null) {
      antId = antOrId.id;
      antX = antOrId.x;
      antY = antOrId.y;
      world = arg2;
    } else {
      antId = antOrId;
      antX = arg2;
      antY = arg3;
      world = arg4;
    }
    let bestSlot = -1;
    let minDistance = Infinity;
    const tq = Math.round(this.target.x);
    const tr = Math.round(this.target.y);

    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i] !== null && this.slots[i] !== antId) continue;

      const offset = this.getOffset(i);
      const slotQ = tq + offset.dq;
      const slotR = tr + offset.dr;

      if (!this.isPassableSlot(world, slotQ, slotR)) continue;

      const dist = Math.hypot(antX - slotQ, antY - slotR);
      if (dist < minDistance) {
        minDistance = dist;
        bestSlot = i;
      }
    }

    if (bestSlot !== -1) {
      this.slots[bestSlot] = antId;
      const offset = this.getOffset(bestSlot);
      return {
        slotIndex: bestSlot,
        targetQ: tq + offset.dq,
        targetR: tr + offset.dr,
        x: tq + offset.dq,
        y: tr + offset.dr,
        dq: offset.dq,
        dr: offset.dr,
        angle: offset.angle,
        [Symbol.toPrimitive](hint) {
          return bestSlot;
        }
      };
    }

    if (!this.waitingQueue.includes(antId)) {
      this.waitingQueue.push(antId);
    }
    return null;
  }

  releaseSlot(antId) {
    let releasedIndex = -1;
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i] === antId) {
        this.slots[i] = null;
        releasedIndex = i;
        break;
      }
    }
    const qIdx = this.waitingQueue ? this.waitingQueue.indexOf(antId) : -1;
    if (qIdx !== -1) {
      this.waitingQueue.splice(qIdx, 1);
    }
    if (releasedIndex !== -1 && this.waitingQueue && this.waitingQueue.length > 0) {
      const nextAntId = this.waitingQueue.shift();
      this.slots[releasedIndex] = nextAntId;
    }
    return releasedIndex !== -1;
  }

  releaseAllSlots() {
    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i] = null;
    }
    if (this.waitingQueue) this.waitingQueue.length = 0;
  }

  releaseAll() {
    this.releaseAllSlots();
  }

  getSlot(entityId) {
    return this.getSlotForAnt(entityId);
  }

  getSlotForAnt(antId) {
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i] === antId) {
        const offset = this.getOffset(i);
        const tq = Math.round(this.target.x);
        const tr = Math.round(this.target.y);
        return {
          slotIndex: i,
          targetQ: tq + offset.dq,
          targetR: tr + offset.dr,
          x: tq + offset.dq,
          y: tr + offset.dr,
          dq: offset.dq,
          dr: offset.dr,
          angle: offset.angle
        };
      }
    }
    return null;
  }

  getOccupantCount() {
    let count = 0;
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i] !== null) count++;
    }
    return count;
  }

  isFull(world) {
    const tq = Math.round(this.target.x);
    const tr = Math.round(this.target.y);
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i] === null) {
        const offset = this.getOffset(i);
        if (this.isPassableSlot(world, tq + offset.dq, tr + offset.dr)) {
          return false;
        }
      }
    }
    return true;
  }
}

class HexSpatialHash {
  constructor() {
    this.buckets = new Map();
    this.activeBuckets = [];
  }

  clear() {
    for (let i = 0; i < this.activeBuckets.length; i++) {
      this.activeBuckets[i].length = 0;
    }
    this.activeBuckets.length = 0;
  }

  getKey(q, r) {
    // 32-bit integer bitmask mapping axial coordinates (-32768 to 32767) to unsigned 32-bit key
    return ((((q + 32768) & 0xffff) << 16) | ((r + 32768) & 0xffff)) >>> 0;
  }

  insert(entity) {
    const key = this.getKey(Math.round(entity.x), Math.round(entity.y));
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = [];
      this.buckets.set(key, bucket);
    }
    if (bucket.length === 0) {
      this.activeBuckets.push(bucket);
    }
    bucket.push(entity);
  }
}

function getEntityRadius(e) {
  if (e.radius) return e.radius;
  if (e.type === 'queen') return 0.44;
  if (e.type === 'supermajor') return 0.38;
  if (e.type === 'major' || e.type === 'soldier') return 0.34;
  if (e.type === 'minor') return 0.22;
  if (e.species) {
    if (e.species === 'hercules') return 0.95;
    if (e.species === 'spider' || e.species === 'night_spider') return 0.68;
    if (e.species === 'worm') return 0.56;
    if (e.species === 'grub') return 0.55;
    if (e.species === 'weevil') return 0.52;
    if (e.species === 'isopod') return 0.48;
    if (e.species === 'baby_spider') return 0.36;
    if (e.species === 'mite') return 0.28;
    if (e.species === 'root_aphid') return 0.32;
    return (e.size || 1) * 0.45;
  }
  return 0.28;
}

function getEntityUid(e) {
  if (e._uid !== undefined) return e._uid;
  if (typeof e.id === 'number') {
    e._uid = e.id;
    return e._uid;
  }
  const parsed = parseInt(String(e.id).replace(/\D/g, ''), 10) || 0;
  e._uid = 10000000 + parsed;
  return e._uid;
}

function isEntityAnchored(e) {
  if (!e) return false;
  if (e.behavior === 'anchored' || e.speed === 0) return true;
  if (e.species) {
    if (e.species === 'root_aphid') return true;
    const sp = AntGame.Species?.[e.species];
    if (sp && (sp.behavior === 'anchored' || sp.speed === 0)) return true;
  }
  return false;
}

function isCellSolid(world, q, r) {
  if (!world || typeof world.peek !== 'function') return false;
  // Axial round to cube then back
  const x = q, z = r, y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;

  const c1 = world.peek(rx, rz);
  if (!c1 || c1.solid || c1.rock || c1.zone === 'rock' || c1.cliff) return true;

  const mq = Math.round(q), mr = Math.round(r);
  if (mq !== rx || mr !== rz) {
    const c2 = world.peek(mq, mr);
    if (!c2 || c2.solid || c2.rock || c2.zone === 'rock' || c2.cliff) return true;
  }
  return false;
}

function applySoftSeparation(entitiesOrSim, spatialHash, maybeSim) {
  let sim = maybeSim;
  let listA = null;
  let listB = null;

  if (Array.isArray(entitiesOrSim)) {
    listA = entitiesOrSim;
    if (!spatialHash && sim && sim.spatialHash) spatialHash = sim.spatialHash;
  } else if (entitiesOrSim && entitiesOrSim.ants) {
    sim = entitiesOrSim;
    listA = sim.ants;
    listB = sim.creatures;
    if (!spatialHash) spatialHash = sim.spatialHash;
  }

  if (!listA || !spatialHash) return;

  spatialHash.clear();
  for (let i = 0; i < listA.length; i++) {
    const e = listA[i];
    if (e && e.alive) {
      spatialHash.insert(e);
    }
  }
  if (listB) {
    for (let i = 0; i < listB.length; i++) {
      const e = listB[i];
      if (e && e.alive) {
        spatialHash.insert(e);
      }
    }
  }

  const SEPARATION_FACTOR = 0.28; // 28% soft spring per tick (firm, responsive separation without jitter)
  const defaultWorld = sim ? sim.world : null;
  const surfaceWorld = sim ? sim.surfaceWorld : null;

  for (let pass = 0; pass < 2; pass++) {
    const list = pass === 0 ? listA : listB;
    if (!list) continue;

    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a || !a.alive) continue;

      const aUid = getEntityUid(a);
      const roundQ = Math.round(a.x);
      const roundR = Math.round(a.y);
      const aLayer = a.layer || 0;
      const aWorld = (aLayer === 1 && surfaceWorld) ? surfaceWorld : defaultWorld;

      for (let n = -1; n < 6; n++) {
        const dq = n === -1 ? 0 : HEX_SLOT_OFFSETS[n].dq;
        const dr = n === -1 ? 0 : HEX_SLOT_OFFSETS[n].dr;
        const key = spatialHash.getKey(roundQ + dq, roundR + dr);
        const bucket = spatialHash.buckets.get(key);
        if (!bucket || !bucket.length) continue;

        for (let j = 0; j < bucket.length; j++) {
          const b = bucket[j];
          if (!b || !b.alive) continue;
          const bUid = getEntityUid(b);
          if (aUid >= bUid) continue;
          if ((a.layer || 0) !== (b.layer || 0)) continue; // Cross-layer isolation

          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distSq = dx * dx + dy * dy;
          const radA = getEntityRadius(a);
          const radB = getEntityRadius(b);
          const targetDist = radA + radB;

          if (distSq < targetDist * targetDist) {
            let dist, nx, ny;
            if (distSq <= 0.000001) {
              // Exact overlap / stacked: eject along deterministic angle based on UIDs
              const angle = (((aUid * 2654435761 ^ bUid * 2246822519) >>> 0) % 6283) / 1000;
              nx = Math.cos(angle);
              ny = Math.sin(angle);
              dist = 0;
            } else {
              dist = Math.sqrt(distSq);
              nx = dx / dist;
              ny = dy / dist;
            }

            const factor = distSq <= 0.000001 ? 0.40 : SEPARATION_FACTOR;
            const totalOverlap = (targetDist - dist) * factor;

            const isAnchoredA = isEntityAnchored(a);
            const isAnchoredB = isEntityAnchored(b);
            if (isAnchoredA && isAnchoredB) continue;

            let factorA = 0.5, factorB = 0.5;
            if (isAnchoredA) {
              factorA = 0;
              factorB = 1.0;
            } else if (isAnchoredB) {
              factorA = 1.0;
              factorB = 0;
            }

            const nextAx = a.x + nx * totalOverlap * factorA;
            const nextAy = a.y + ny * totalOverlap * factorA;
            const nextBx = b.x - nx * totalOverlap * factorB;
            const nextBy = b.y - ny * totalOverlap * factorB;

            const bWorld = ((b.layer || 0) === 1 && surfaceWorld) ? surfaceWorld : defaultWorld;

            // Wall Guard: prevent nudging into solid rock or cliffs
            if (factorA > 0 && !isCellSolid(aWorld, nextAx, nextAy)) {
              const dAx = nextAx - a.x;
              const dAy = nextAy - a.y;
              a.x = nextAx;
              a.y = nextAy;
              if (a.prevX !== undefined) a.prevX += dAx;
              if (a.prevY !== undefined) a.prevY += dAy;
            }
            if (factorB > 0 && !isCellSolid(bWorld, nextBx, nextBy)) {
              const dBx = nextBx - b.x;
              const dBy = nextBy - b.y;
              b.x = nextBx;
              b.y = nextBy;
              if (b.prevX !== undefined) b.prevX += dBx;
              if (b.prevY !== undefined) b.prevY += dBy;
            }
          }
        }
      }
    }
  }
}

AntGame.HEX_SLOT_OFFSETS = HEX_SLOT_OFFSETS;
AntGame.HEX_SLOT_OFFSETS_RING2 = HEX_SLOT_OFFSETS_RING2;
AntGame.HexInteractionSlots = HexInteractionSlots;
AntGame.HexSpatialHash = HexSpatialHash;
AntGame.applySoftSeparation = applySoftSeparation;
AntGame.getEntityRadius = getEntityRadius;
AntGame.getEntityUid = getEntityUid;
})();
