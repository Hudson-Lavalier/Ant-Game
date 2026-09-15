/*
 * UNDERFOOT TASK SYSTEM & DECISION ENGINE
 * Handles autonomous ant task evaluation, caste priorities, candidate ranking,
 * execution dispatch, destination clustering, and corridor conflict swaps.
 */
(()=>{
const { Config: C, key, hexDistance, hexRound, pathfind, findRoute } = AntGame;
const dist = (a, b) => hexDistance(a, b);
const isWorkerMorph = type => ['worker', 'minor', 'media', 'major', 'supermajor'].includes(type);

class TaskEngine {
 static getCastePriority(sim, caste, task) {
  return sim.castePriorities?.[caste]?.[task] ?? AntGame.DefaultCastePriorities?.[caste]?.[task] ?? 5;
 }

 static setCastePriority(sim, caste, task, val) {
  if (!sim.castePriorities) sim.castePriorities = JSON.parse(JSON.stringify(AntGame.DefaultCastePriorities || {}));
  if (!sim.castePriorities[caste]) sim.castePriorities[caste] = { ...AntGame.DefaultCastePriorities[caste] };
  sim.castePriorities[caste][task] = Math.max(1, Math.min(10, Math.round(Number(val) || 5)));
 }

 static resetCastePriorities(sim, caste = null) {
  if (caste) {
   if (AntGame.DefaultCastePriorities?.[caste]) sim.castePriorities[caste] = { ...AntGame.DefaultCastePriorities[caste] };
  } else {
   sim.castePriorities = JSON.parse(JSON.stringify(AntGame.DefaultCastePriorities || {}));
  }
 }

 static distributeDestinations(world, count, center) {
  const results = [];
  const seen = new Set();
  const queue = [{ x: center.x, y: center.y }];
  seen.add(key(center.x, center.y));
  while (queue.length && results.length < count) {
   const p = queue.shift();
   const c = world.peek(p.x, p.y);
   if (c && c.discovered && !c.solid && !c.rock && c.zone !== 'rock' && !c.isWell && c.zone !== 'well' && (c.water || 0) < 6) {
    if (pathfind(world, center, p) !== null) {
     results.push({ x: p.x, y: p.y });
    }
   }
   for (const n of world.neighbors(p.x, p.y)) {
    const k = key(n.x, n.y);
    if (!seen.has(k)) {
     seen.add(k);
     queue.push({ x: n.x, y: n.y });
    }
   }
  }
  while (results.length < count) results.push({ x: center.x, y: center.y });
  return results;
 }

 static moveGroup(sim, units, target, queue = false) {
  if (!units || !units.length) return null;
  if (units.length === 1) {
   if (queue && (units[0].path?.length || units[0].task)) {
    units[0].orderQueue = units[0].orderQueue || [];
    units[0].orderQueue.push({ type: 'move', point: target });
    return null;
   }
   return sim.move(units[0], target);
  }
  const dests = this.distributeDestinations(sim.world, units.length, target);
  let ok = false, lastErr = null;
  for (let i = 0; i < units.length; i++) {
   const u = units[i];
   if (queue && (u.path?.length || u.task)) {
    u.orderQueue = u.orderQueue || [];
    u.orderQueue.push({ type: 'move', point: dests[i] });
    ok = true;
   } else {
    const err = sim.move(u, dests[i]);
    if (!err) ok = true; else lastErr = err;
   }
  }
  return ok ? null : lastErr;
 }

 static handleCorridorConflict(sim, a, dt, currHex, nextHex) {
  const occupant = sim.ants.find(b => b.alive && b.id !== a.id && b.type !== 'queen' && hexRound(b.x, b.y).x === nextHex.x && hexRound(b.x, b.y).y === nextHex.y);
  if (occupant) {
   const occNext = occupant.path && occupant.path[0];
   const isHeadOn = occNext && (occNext.x === currHex.x && occNext.y === currHex.y);
   if (isHeadOn) {
    a.swappingWith = occupant.id;
    occupant.swappingWith = a.id;
    a.waitTimer = 0;
   } else if (a.swappingWith === occupant.id) {
    // swap underway
   } else {
    const isCorridor = sim.world.neighbors(currHex.x, currHex.y).filter(n => !n.solid).length <= 2 || sim.world.neighbors(nextHex.x, nextHex.y).filter(n => !n.solid).length <= 2;
    const dToOcc = Math.hypot(occupant.x - a.x, occupant.y - a.y);
    if (isCorridor && dToOcc < 0.75) {
     a.waitTimer = (a.waitTimer || 0) + dt;
     if (a.waitTimer > 1.2) {
      const targetGoal = a.path[a.path.length - 1];
      const tempSolid = sim.world.peek(nextHex.x, nextHex.y);
      let altPath = null;
      if (tempSolid) {
       const oldSolid = tempSolid.solid;
       tempSolid.solid = true;
       altPath = pathfind(sim.world, currHex, targetGoal, a.clearanceNeeded || 1);
       tempSolid.solid = oldSolid;
      }
      if (altPath && altPath.length) {
       sim.setPath(a, altPath, a.state);
       a.waitTimer = 0;
      } else {
       a.waitTimer = 0.6;
      }
     }
     return true;
    }
   }
  } else {
   a.swappingWith = null;
   a.waitTimer = 0;
  }
  return false;
 }

 static executeChosenTask(sim, a, chosen) {
  if (chosen.type === 'selfFeed' || chosen.type === 'selfWater') {
   const needType = chosen.type === 'selfFeed' ? 'food' : 'water';
   a.task = { type: `need-${needType}`, source: 'needs', needSource: chosen.source };
   if (!sim.route(a, chosen.source.point, `need-${needType}`)) { a.task = null; a.timer = 1; a.state = 'idle'; }
   return;
  }
  if (chosen.type === 'combat') {
   a.task = { type: 'attack', targetId: chosen.enemy.id, source: 'auto-guard' };
   a.state = 'attack'; a.timer = 0;
   sim.route(a, { x: Math.round(chosen.enemy.x), y: Math.round(chosen.enemy.y) }, 'attack');
   return;
  }
   if (chosen.type === 'feedQueen' && chosen.source) {
    const p = chosen.source.point || { x: Math.round(chosen.source.x), y: Math.round(chosen.source.y) };
    a.task = { type: 'feed-food', targetId: chosen.source.id || key(chosen.source.x, chosen.source.y), sourceKind: chosen.source.feedKind, source: chosen.source };
    if (!sim.route(a, p, 'feeding-food')) {
     if (hexDistance(a, p) <= 1.2) {
      a.state = 'feeding-food';
      sim.pickupFeed(a);
     } else {
      a.state = 'idle'; a.task = null; a.timer = 0.5;
     }
    }
    return;
   }
   if (chosen.type === 'queenWater' && chosen.source) {
    const p = chosen.source.point || { x: Math.round(chosen.source.x), y: Math.round(chosen.source.y) };
    a.task = { type: 'feed-water', targetId: chosen.source.id || key(chosen.source.x, chosen.source.y), sourceKind: chosen.source.feedKind, source: chosen.source };
    if (!sim.route(a, p, 'feeding-water')) {
     if (hexDistance(a, p) <= 1.2) {
      a.state = 'feeding-water';
      sim.pickupFeed(a);
     } else {
      a.state = 'idle'; a.task = null; a.timer = 0.5;
     }
    }
    return;
   }
  if (chosen.type === 'chewFood' && chosen.processObj) {
   const targetObj = chosen.processObj;
   targetObj.processingFeederId = a.id;
   const distToObj = dist(a, targetObj);
   a.task = { type: 'process-food', targetId: targetObj.id, source: targetObj };
   if (distToObj > 1.2) {
    sim.route(a, { x: Math.round(targetObj.x), y: Math.round(targetObj.y) }, 'to-process');
   } else {
    a.state = 'processing'; a.timer = 0;
   }
   return;
  }
  if (chosen.type === 'carry' && chosen.target) {
   chosen.target.reservedFor = a.id;
   a.task = { type: 'carry', targetId: chosen.target.id, source: 'colony' };
   sim.route(a, { x: Math.round(chosen.target.x), y: Math.round(chosen.target.y) }, 'to-carry');
   return;
  }
  if (chosen.type === 'harvest' && chosen.target) {
   a.task = { type: 'harvest', targetId: chosen.target.id, source: 'colony' };
   sim.route(a, { x: Math.round(chosen.target.x), y: Math.round(chosen.target.y) }, 'harvest');
   return;
  }
  if (chosen.type === 'feedLarvae' && chosen.larva) {
   const foodSource = chosen.foodSource || AntGame.Inventory.getFoodSourceTile(sim, a);
   if (!foodSource) { a.state = 'idle'; a.task = null; return; }
   chosen.larva.beingFedBy = a.id;
   a.task = { type: 'feed-larva', larvaId: chosen.larva.id, foodTile: { x: foodSource.x, y: foodSource.y } };
   if (!sim.route(a, foodSource, 'to-feed-larva-supply')) {
    a.state = 'to-feed-larva-supply';
   }
   return;
  }
  if (chosen.type === 'transportBrood' && chosen.brood) {
   chosen.brood.beingTransportedBy = a.id;
   a.task = { type: 'pickup-brood', broodId: chosen.brood.id, targetTile: chosen.targetTile };
   sim.route(a, { x: Math.round(chosen.brood.x), y: Math.round(chosen.brood.y) }, 'to-pickup-brood');
   return;
  }
  if (chosen.type === 'build') {
   if (!sim.dispatchJob(a, chosen.jobs, 'build')) { a.timer = 1; a.state = 'idle'; }
   return;
  }
  if (chosen.type === 'dig') {
   if (!sim.dispatchJob(a, chosen.jobs, 'dig')) { a.timer = 1; a.state = 'idle'; }
   return;
  }
  if (chosen.type === 'haulSoil') {
   if (!sim.dispatchDrop(a, chosen.drops)) { a.timer = 1; a.state = 'idle'; }
   return;
  }
  a.timer = 1; a.state = 'idle';
 }

 static assign(sim, a) {
  if (!a.alive || a.held) return;
  if (a.preferred) {
   const prefJob = sim.jobs.find(j => j.id === a.preferred && j.status === 'available');
   if (prefJob) {
    if (prefJob.type === 'build') sim.dispatchJob(a, [prefJob], 'build');
    else sim.dispatchJob(a, [prefJob], 'dig');
    return;
   }
   a.preferred = null;
  }

  const candidates = [];

  // 1. Self Feed
  if ((a.actions?.selfFeed ?? a.actions?.gatherFood) !== false) {
   const fCap = a.maxFoodNeed || C.antFoodCapacity;
   if ((a.foodNeed ?? fCap) < fCap * sim.antFoodNeedRatio) {
    const src = sim.antNeedSource(a, 'food');
    if (src) candidates.push({ type: 'selfFeed', source: src });
   }
  }

  // 2. Self Water
  if ((a.actions?.selfWater ?? a.actions?.gatherWater) !== false) {
   const wCap = a.maxWaterNeed || C.antWaterCapacity;
   if ((a.waterNeed ?? wCap) < wCap * sim.antWaterNeedRatio) {
    const src = sim.antNeedSource(a, 'water');
    if (src) candidates.push({ type: 'selfWater', source: src });
   }
  }

  // 3. Combat
  if (a.actions?.combat !== false && ['soldier', 'major', 'supermajor'].includes(a.type)) {
   const enemy = sim.creatures.find(c => c.alive && (AntGame.Species[c.species]?.behavior === 'aggressive' || c.provoked) && hexDistance(a, c) <= 6);
   if (enemy && pathfind(sim.world, a, enemy, a.clearanceNeeded || 1) !== null) candidates.push({ type: 'combat', enemy });
  }

  // 4. Feed Queen
  if (a.feeder && a.actions?.feed !== false) {
   const q = sim.queen();
   const queenNeedsFood = q && (q.food ?? 200) < (q.maxFood || 200) * (C.feederNeedRatio || 0.9);
   const colonyNeedsFood = sim.food < sim.foodCapacity() * (C.feederNeedRatio || 0.9);
   if (queenNeedsFood || colonyNeedsFood) {
    const src = sim.feederSource(a, 'food');
    if (src) {
     const p = src.point || { x: Math.round(src.x), y: Math.round(src.y) };
     if (pathfind(sim.world, a, p) !== null) candidates.push({ type: 'feedQueen', source: src });
    }
   }
  }

  // 5. Queen Water
  if (a.feeder && a.actions?.feed !== false) {
   const q = sim.queen();
   const queenNeedsWater = q && (q.water ?? 100) < (q.maxWater || 100) * (C.feederNeedRatio || 0.9);
   const colonyNeedsWater = (sim.water < sim.queenWaterCapacity() * (C.feederNeedRatio || 0.9)) ||
    (sim.waterTarget === 'reservoir' && sim.reservoirWater() < sim.waterStore.tiles.length * C.waterStoragePerTile);
   if (queenNeedsWater || colonyNeedsWater) {
    const src = sim.feederSource(a, 'water');
    if (src) {
     const p = src.point || { x: Math.round(src.x), y: Math.round(src.y) };
     if (pathfind(sim.world, a, p) !== null) candidates.push({ type: 'queenWater', source: src });
    }
   }
  }

  // 6. Chew Food (Process Stored Whole Food)
  if (a.feeder && a.actions?.feed !== false) {
   const colId = a.colonyId || 1, colFood = colId === 1 ? sim.food : (sim.colonies.find(c => c.id === colId)?.food || 0), colCap = colId === 1 ? sim.foodCapacity() : 800;
   if (colFood < colCap) {
    const storedCorpse = sim.creatures.find(c => !c.alive && c.inStorage && c.storageColonyId === colId && c.food > 0 && (!c.processingFeederId || c.processingFeederId === a.id));
    const storedSeed = !storedCorpse ? sim.resources.find(r => r.inStorage && r.storageColonyId === colId && r.remaining > 0 && (!r.processingFeederId || r.processingFeederId === a.id)) : null;
    const processObj = storedCorpse || storedSeed;
    if (processObj) candidates.push({ type: 'chewFood', processObj });
   }
  }

  // Brood Operations (Brood Helper or Feeder fallback)
  const hasBroodHelper = sim.ants.some(b => b.alive && b.colonyId === a.colonyId && b.broodHelper);
  const canDoBrood = a.broodHelper || (a.feeder && !hasBroodHelper);

   if (canDoBrood && a.actions?.feedLarvae !== false && sim.food > 0) {
    const larva = sim.findHungryLarva(a);
    const foodSource = AntGame.Inventory?.getFoodSourceTile(sim, a);
    if (larva && foodSource && pathfind(sim.world, a, foodSource) !== null && pathfind(sim.world, foodSource, larva) !== null) {
     candidates.push({ type: 'feedLarvae', larva, foodSource });
    }
   }

  if (canDoBrood && a.actions?.transportBrood !== false) {
   const brood = sim.findMisplacedBrood(a);
   if (brood && pathfind(sim.world, a, brood) !== null) {
    const targetTile = sim.findFreeHatcheryTile(a);
    if (targetTile) candidates.push({ type: 'transportBrood', brood, targetTile });
   }
  }

  // 7. Carry
  if (a.actions?.carry !== false && isWorkerMorph(a.type)) {
   const target = sim.findAvailableCarryTarget(a);
   if (target) candidates.push({ type: 'carry', target });
  }

  // 8. Harvest
  if (a.actions?.harvest !== false && isWorkerMorph(a.type)) {
   const target = sim.findAvailableHarvestTarget(a);
   if (target) candidates.push({ type: 'harvest', target });
  }

  // 9. Build
  if (a.actions?.build !== false && a.canBuild !== false) {
   const builds = sim.findAvailableJobs(a, 'build');
   if (builds.length) {
    const goals = new Map();
    for (const j of builds) { const c = sim.world.peek(j.x, j.y); if (c && !c.solid) goals.set(key(c.x, c.y), { job: j, face: c }); }
    if (goals.size && findRoute(sim.world, a, goals, a.clearanceNeeded || 1)) candidates.push({ type: 'build', jobs: builds });
   }
  }

  // 10. Dig
  if (a.actions?.dig !== false && a.canMine !== false) {
   const digs = sim.findAvailableJobs(a, 'dig');
   if (digs.length) {
    const goals = new Map();
    for (const j of digs) {
     const c = sim.world.peek(j.x, j.y); if (!c) continue;
     if (j.buildId && !c.solid) { goals.set(key(c.x, c.y), { job: j, face: c }); continue; }
     if (c.solid) for (const face of sim.world.faces(c, a.colonyId === 1)) { const k = key(face.x, face.y); if (!goals.has(k)) goals.set(k, { job: j, face }); }
    }
    if (goals.size && findRoute(sim.world, a, goals, a.clearanceNeeded || 1)) candidates.push({ type: 'dig', jobs: digs });
   }
  }

  // 11. Haul Soil
  if (a.actions?.haulSoil !== false) {
   const drops = sim.drops.filter(d => !d.claimed);
   if (drops.length) {
    const goals = new Map();
    for (const drop of drops) { const c = sim.world.peek(drop.x, drop.y); if (c && !c.solid) goals.set(key(drop.x, drop.y), { drop }); }
    if (goals.size && findRoute(sim.world, a, goals, a.clearanceNeeded || 1)) candidates.push({ type: 'haulSoil', drops });
   }
  }

  if (!candidates.length) {
   a.timer = 0.5; a.state = 'idle'; return;
  }

  candidates.sort((t1, t2) => {
   const role = a.broodHelper ? 'brood_helper' : a.feeder ? 'feeder' : a.type;
   const q = sim.queen();
   if (a.feeder && q) {
    const qDehydrated = (q.water ?? 100) <= 20;
    const qStarving = (q.food ?? 200) <= 20;
    if (qDehydrated && t1.type === 'queenWater' && t2.type !== 'queenWater') return -1;
    if (qDehydrated && t2.type === 'queenWater' && t1.type !== 'queenWater') return 1;
    if (qStarving && t1.type === 'feedQueen' && t2.type !== 'feedQueen') return -1;
    if (qStarving && t2.type === 'feedQueen' && t1.type !== 'feedQueen') return 1;
   }
   const p1 = sim.getCastePriority(role, t1.type);
   const p2 = sim.getCastePriority(role, t2.type);
   if (p1 !== p2) return p1 - p2;
   const r1 = AntGame.TaskHierarchy.findIndex(th => th.id === t1.type);
   const r2 = AntGame.TaskHierarchy.findIndex(th => th.id === t2.type);
   return r1 - r2;
  });

  const chosen = candidates[0];
  sim.executeChosenTask(a, chosen);
 }
}

AntGame.TaskEngine = TaskEngine;
AntGame.isWorkerMorph = isWorkerMorph;
})();
