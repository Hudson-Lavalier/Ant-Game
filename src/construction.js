/*
 * UNDERFOOT CONSTRUCTION SUBSYSTEM
 * Handles chamber designations (food store, water reservoir, spoil room,
 * hatchery floor & wall), excavation multi-stage prerequisites, job state
 * pathing refresh, construction resource staging & execution, and cancellations.
 */
(()=>{
const { Config: C, key, pathfind } = AntGame;
const isWorkerMorph = AntGame.isWorkerMorph || (type => ['worker','minor','media','major','supermajor'].includes(type));

class Construction {
 static isHole(sim, c, x, y) {
  if (!c) return false;
  if (c.zone === 'pit' || c.hole || c.isHole) return true;
  if (sim.world.pits && sim.world.pits.some(p => p.x === x && p.y === y && !p.filled)) return true;
  if (sim.world.pit && sim.world.pit.x === x && sim.world.pit.y === y && !sim.world.pit.filled) return true;
  return false;
 }

 static designateBuild(sim, x, y, ant=null, structure='food') {
  const activeWorld = sim.getActiveWorld ? sim.getActiveWorld() : sim.world;
  const c = activeWorld.peek(x, y);
  if (!c?.discovered) return false;
  if (c.rock || c.zone === 'rock') {
   AntGame.AudioCoordinator?.play('rockStrike');
   return false;
  }
  if (this.isHole(sim, c, x, y)) return false;

  const isSurface = (sim.activeLayer === 'surface') || (c.layer === 1);
  if (isSurface) {
   const surfaceAllowed = ['dirt', 'compacted_dirt', 'trench', 'rough_dirt', 'smooth_floor'];
   if (!surfaceAllowed.includes(structure)) {
    sim.emit(`Brood and deep colony chambers (${structure}) can only be constructed underground.`);
    return false;
   }
  }

  const def = AntGame.BuildTypes ? AntGame.BuildTypes[structure] : null;
  if (def?.unlockTrait) {
   const hasTrait = (sim.traits && sim.traits.includes(def.unlockTrait)) || (sim.traitLevels && sim.traitLevels[def.unlockTrait] > 0);
   if (!hasTrait) {
    sim.emit(`Cannot build ${def.name}: unlock ${def.unlockTrait} evolution first.`);
    return false;
   }
  }
  if (!isSurface && c.zone !== 'stream' && c.zone !== 'pond' && c.zone !== 'puddle' && structure === 'dirt' && (c.water || 0) >= 1.0) {
   sim.emit('Cannot place dirt in standing water (water level must be below 1).');
   return false;
  }
  if (structure === 'compacted_dirt' && (c.zone === 'trench' || c.structure === 'trench')) {
   sim.emit('Cannot build compacted dirt directly on a trench.');
   return false;
  }

  const id = `1:build:${structure}:${key(x, y)}`;
  const jobLayer = isSurface ? 1 : 0;
  if (!sim.jobs.some(j => j.id === id)) {
   const excNeeded = def ? def.excavations : (structure === 'water' ? 2 : structure === 'trench' ? 1 : 0);
   const bFood = def ? def.food : (structure === 'food' ? 3 : structure === 'water' ? 5 : 0);
   const bDirt = def ? def.dirt : (structure === 'dirt' ? 1 : structure === 'compacted_dirt' ? 5 : structure === 'trench' ? 0 : 1);
   let status = 'blocked';
   if (c.solid || (c.excavations || 0) < excNeeded) {
    status = 'undug';
   } else {
    const isWater = (c.water || 0) >= 6 || c.terrain === 'water' || c.zone === 'stream' || c.zone === 'pond';
    let reachable = false;
    if (isWater) {
     const faces = activeWorld.faces(c, true);
     reachable = faces.some(f => pathfind(activeWorld, sim.nest, f) !== null);
    } else {
     reachable = pathfind(activeWorld, sim.nest, c) !== null;
    }
    status = reachable ? (sim.food >= bFood && sim.world.pit.used >= bDirt ? 'available' : 'resources') : 'blocked';
   }
   sim.jobs.push({ id, type: 'build', structure, x, y, layer: jobLayer, colonyId: 1, priority: 2, status, food: bFood, dirt: bDirt, excavations: excNeeded });
  }
  const build = sim.jobs.find(j => j.id === id);
  if (c.solid) {
   sim.designate(x, y, ant);
   const excavation = sim.jobs.find(j => j.type === 'dig' && j.x === c.x && j.y === c.y);
   if (excavation) excavation.buildId = id;
  } else if (build.excavations > (c.excavations || 0)) {
   this.ensureExcavationJob(sim, build, c);
  }
  if (ant && isWorkerMorph(ant.type) && ant.canBuild !== false && ant.alive) {
   ant.preferred = id;
   ant.held = false;
   ant.manualOrder = true;
   ant.idleReleaseTimer = 0;
  }
  return true;
 }

 static ensureExcavationJob(sim, build, c) {
  if ((c.excavations || 0) >= build.excavations) return;
  const excJobId = `${build.id}:excavate:${(c.excavations || 0) + 1}`;
  if (!sim.jobs.some(j => j.id === excJobId)) {
   const faces = sim.world.faces(c, true);
   const status = faces.some(f => pathfind(sim.world, sim.nest, f) !== null) ? 'available' : 'blocked';
   sim.jobs.push({ id: excJobId, type: 'dig', buildId: build.id, x: c.x, y: c.y, colonyId: build.colonyId, priority: build.priority, status });
  }
 }

 static refreshJobStates(sim) {
  for (const j of [...sim.jobs]) {
   const targetLayer = j.layer !== undefined ? j.layer : (j.id?.startsWith('surface:') ? 1 : 0);
   const targetWorld = targetLayer === 1 ? (sim.surfaceWorld || sim.world) : sim.world;
   const c = targetWorld.peek(j.x, j.y);
   const nestPos = j.colonyId === 1 ? sim.nest : (sim.colonies.find(cl => cl.id === j.colonyId)?.pit || { x: j.x, y: j.y });
   if (!c || (!c.discovered && j.colonyId === 1)) { j.status = 'unknown'; continue; }
   if (c.rock || c.zone === 'rock') { sim.jobs = sim.jobs.filter(job => job !== j); continue; }
   if (j.type === 'build' && this.isHole(sim, c, j.x, j.y)) { sim.jobs = sim.jobs.filter(job => job !== j); continue; }
   if (j.type === 'dig' && !c.solid && !j.buildId) { sim.jobs = sim.jobs.filter(job => job !== j); continue; }
   if (j.type === 'build') {
    if (c.solid || (c.excavations || 0) < j.excavations) {
     j.status = 'undug';
     if (!c.solid) this.ensureExcavationJob(sim, j, c);
     continue;
    }
    const isWater = (c.water || 0) >= 6 || c.terrain === 'water' || c.zone === 'stream' || c.zone === 'pond';
    let reachable = false;
    if (isWater) {
     const faces = targetWorld.faces(c, j.colonyId === 1);
     reachable = faces.some(f => pathfind(targetWorld, nestPos, f) !== null);
    } else {
     reachable = pathfind(targetWorld, nestPos, c) !== null;
    }
    j.status = reachable ? (sim.food >= j.food && sim.world.pit.used >= j.dirt ? 'available' : 'resources') : 'blocked';
    continue;
   }
   const faces = targetWorld.faces(c, j.colonyId === 1);
   j.status = faces.some(f => pathfind(targetWorld, nestPos, f) !== null) ? 'available' : 'blocked';
  }
 }

 static routeToBuildSupply(sim, a) {
  if (!a.task) { a.state = 'idle'; return; }
  const job = sim.jobs.find(j => j.id === a.task.id);
  if (!job) { a.state = 'idle'; a.task = null; return; }

  const foodNeeded = Math.max(0, (job.food || 0) - (job.deliveredFood || 0));
  const dirtNeeded = Math.max(0, (job.dirt || 0) - (job.deliveredDirt || 0));

  if (foodNeeded <= 0 && dirtNeeded <= 0) {
   a.state = 'building';
   a.timer = 0;
   a.packSoundTimer = 0;
   this.routeToBuild(sim, a);
   return;
  }

  if (foodNeeded > 0) {
   if (sim.food <= 0.001) {
    a.state = 'build-no-resources';
    a.timer = 2;
    return;
   }
   const foodSource = AntGame.Inventory.getFoodSourceTile(sim, a);
   if (!foodSource) {
    a.state = 'build-no-resources';
    a.timer = 2;
    return;
   }
   a.state = 'to-build-supply';
   a.task.fetchType = 'food';
   a.task.foodTile = { x: foodSource.x, y: foodSource.y };
   if (!sim.route(a, foodSource, 'to-build-supply')) {
    a.state = 'blocked';
    a.timer = 1;
   }
   return;
  }

  if (dirtNeeded > 0) {
   if (sim.world.pit.used <= 0.001) {
    a.state = 'build-no-resources';
    a.timer = 2;
    return;
   }
   const pit = sim.world.pit;
   a.state = 'to-build-supply';
   a.task.fetchType = 'dirt';
   a.task.pit = { x: pit.x, y: pit.y };
   if (!sim.route(a, pit, 'to-build-supply')) {
    a.state = 'blocked';
    a.timer = 1;
   }
   return;
  }

  this.routeToBuild(sim, a);
 }

 static routeToBuild(sim, a) {
  if (!a.task) {
   a.state = 'idle';
   a.path = [];
   return;
  }
  const targetLayer = a.task.layer !== undefined ? a.task.layer : (a.layer || 0);
  const targetWorld = targetLayer === 1 ? (sim.surfaceWorld || sim.world) : sim.world;
  const target = { x: a.task.x, y: a.task.y, layer: targetLayer };
  const cell = targetWorld.get(target.x, target.y);
  const isSolid = a.task.structure === 'hatchery_wall' || a.task.structure === 'compacted_dirt' || (a.task.structure === 'dirt' && cell.zone !== 'trench' && cell.structure !== 'trench' && !((cell.water || 0) >= 1.0 || cell.terrain === 'water'));
  const isWater = (cell.water || 0) >= 6 || cell.terrain === 'water' || cell.zone === 'stream' || cell.zone === 'pond';
  let dest = target;
  if (isSolid || isWater) {
   const faces = targetWorld.faces(cell);
   const openFace = faces.find(f => !f.solid && (f.water || 0) < 6 && sim.canReach(a, f, targetLayer));
   if (openFace) dest = { x: openFace.x, y: openFace.y, layer: targetLayer };
  }
  if (!sim.route(a, dest, a.state || 'delivering-build-material')) {
   a.state = 'build-blocked';
   a.timer = 2;
  }
 }

 static stepBuilding(sim, a, dt) {
  if (a.state === 'to-build-supply') {
   if (!a.task) { a.state = 'idle'; a.path = []; return true; }
   const job = sim.jobs.find(j => j.id === a.task.id);
   if (!job) { a.state = 'idle'; a.task = null; a.path = []; return true; }

   const targetPos = a.task.fetchType === 'food' ? (a.task.foodTile || sim.nest) : (a.task.pit || sim.world.pit);
   const d = AntGame.hexDistance(a, targetPos);
   if (d > 1.2 && a.path && a.path.length > 0) {
    return true;
   }

   const maxCap = a.maxCarry || C.carryCapacity;

   if (a.task.fetchType === 'food') {
    const foodNeeded = Math.max(0, (job.food || 0) - (job.deliveredFood || 0));
    const tileCell = a.task.foodTile ? sim.world.peek(a.task.foodTile.x, a.task.foodTile.y) : null;
    const tileFood = (tileCell && tileCell.food !== undefined) ? tileCell.food : sim.food;
    const take = Math.min(tileFood, sim.food, maxCap, foodNeeded);

    if (take <= 0.001) {
     const nextTile = AntGame.Inventory.getFoodSourceTile(sim, a);
     if (nextTile && (nextTile.x !== a.task.foodTile?.x || nextTile.y !== a.task.foodTile?.y)) {
      a.task.foodTile = { x: nextTile.x, y: nextTile.y };
      sim.route(a, nextTile, 'to-build-supply');
      return true;
     }
     a.state = 'build-no-resources';
     a.timer = 1;
     return true;
    }

    if (tileCell && tileCell.food !== undefined) tileCell.food -= take;
    sim.spendFood(take);
    a.carry = { type: 'construction', material: 'food', foodType: 'processed', food: take, dirt: 0, buildId: job.id };
    a.state = 'delivering-build-material';
    this.routeToBuild(sim, a);
    return true;
   }

   if (a.task.fetchType === 'dirt') {
    const dirtNeeded = Math.max(0, (job.dirt || 0) - (job.deliveredDirt || 0));
    const take = Math.min(sim.world.pit.used, maxCap, dirtNeeded);

    if (take <= 0.001) {
     a.state = 'build-no-resources';
     a.timer = 1;
     return true;
    }

    sim.world.pit.used -= take;
    sim.syncStores();
    a.carry = { type: 'construction', material: 'dirt', dirt: take, food: 0, buildId: job.id };
    a.state = 'delivering-build-material';
    this.routeToBuild(sim, a);
    return true;
   }

   return true;
  }

  if (a.state === 'delivering-build-material') {
   if (!a.task) {
    if (a.carry?.food) sim.addFood(a.carry.food);
    if (a.carry?.dirt) sim.world.pit.used += a.carry.dirt;
    a.carry = null;
    a.state = 'idle';
    return true;
   }
   const d = AntGame.hexDistance(a, a.task);
   if (d > 1.2 && a.path && a.path.length > 0) {
    return true;
   }

   const job = sim.jobs.find(j => j.id === a.task.id);
   if (job) {
    if (a.carry?.food) {
     job.deliveredFood = (job.deliveredFood || 0) + a.carry.food;
    }
    if (a.carry?.dirt) {
     job.deliveredDirt = (job.deliveredDirt || 0) + a.carry.dirt;
    }
    if (a.colonyId === 1) AntGame.AudioCoordinator?.play('soilDropFloor');
   } else {
    if (a.carry?.food) sim.addFood(a.carry.food);
    if (a.carry?.dirt) sim.world.pit.used += a.carry.dirt;
   }
   a.carry = null;

   if (job) {
    const foodNeeded = Math.max(0, (job.food || 0) - (job.deliveredFood || 0));
    const dirtNeeded = Math.max(0, (job.dirt || 0) - (job.deliveredDirt || 0));
    if (foodNeeded <= 0 && dirtNeeded <= 0) {
     a.state = 'building';
     a.timer = 0;
     a.packSoundTimer = 0;
     return true;
    }
    this.routeToBuildSupply(sim, a);
    return true;
   }

   a.state = 'idle';
   a.task = null;
   return true;
  }

  if (a.state === 'building') {
   if (!a.task) { a.state = 'idle'; a.path = []; return true; }
   a.timer += dt;
   a.packSoundTimer = (a.packSoundTimer || 0) + dt;
   if (a.packSoundTimer >= 0.8) {
    if (a.colonyId === 1) AntGame.AudioCoordinator?.play('chamberBuildPack');
    a.packSoundTimer = 0;
   }
   if (a.timer >= C.buildSeconds) {
    const targetLayer = a.task.layer !== undefined ? a.task.layer : (a.layer || 0);
    const targetWorld = targetLayer === 1 ? (sim.surfaceWorld || sim.world) : sim.world;
    const c = targetWorld.get(a.task.x, a.task.y), kind = a.task.structure || 'food';
    c.structure = kind;
    c.builtDirt = a.task.deliveredDirt || a.task.dirt || 0;
    c.discovered = true;
    if (kind === 'water') {
     c.zone = 'water-store';
     c.waterStorage = true;
     c.water = 0;
     c.excavations = 2;
     sim.waterStore.tiles.push({ x: c.x, y: c.y, water: 0, items: [] });
    } else if (kind === 'spoil') {
     c.zone = 'spoil';
    } else if (kind === 'food') {
     c.zone = 'food-store';
     sim.foodStore.tiles++;
    } else if (kind === 'hatchery_wall') {
     c.zone = 'hatchery-wall';
     const openNeighbor = targetWorld.neighbors(c.x, c.y).find(n => !n.solid);
     for (const ant of sim.ants) {
      if (ant.alive && Math.round(ant.x) === c.x && Math.round(ant.y) === c.y) {
       if (openNeighbor) {
        ant.x = openNeighbor.x; ant.y = openNeighbor.y;
        ant.prevX = openNeighbor.x; ant.prevY = openNeighbor.y;
       }
      }
     }
     for (const egg of sim.eggs) {
      if (Math.round(egg.x) === c.x && Math.round(egg.y) === c.y) {
       if (openNeighbor) {
        egg.x = openNeighbor.x; egg.y = openNeighbor.y;
       }
      }
     }
     c.solid = true;
    } else if (kind === 'hatchery_floor') {
     c.zone = 'hatchery-floor';
     c.solid = false;
    } else if (kind === 'dirt') {
     if (c.zone === 'trench' || c.structure === 'trench') {
      c.solid = false;
      c.zone = 'soil';
      c.structure = null;
      c.water = 0;
      c.excavations = 0;
     } else if (c.terrain === 'water' || c.zone === 'stream' || c.zone === 'pond' || (c.water || 0) > 0) {
      c.solid = false;
      c.zone = 'causeway';
      c.terrain = 'soil';
      c.isBridge = true;
      c.elevation = 1;
      c.structure = 'earthen_bridge';
      c.water = 0;
      c.baselineWater = 0;
      c.excavations = 0;
      if (sim.surfaceWorld?.activeSurfaceWater) {
       sim.surfaceWorld.activeSurfaceWater.delete(key(c.x, c.y));
      }
     } else {
      c.solid = true;
      c.zone = 'soil';
      c.terrain = 'soil';
      c.hardness = 0.85;
      c.structure = null;
      c.excavations = 0;
      const openNeighbor = targetWorld.neighbors(c.x, c.y).find(n => !n.solid);
      for (const ant of sim.ants) {
       if (ant.alive && Math.round(ant.x) === c.x && Math.round(ant.y) === c.y) {
        if (openNeighbor) { ant.x = openNeighbor.x; ant.y = openNeighbor.y; ant.prevX = openNeighbor.x; ant.prevY = openNeighbor.y; }
       }
      }
     }
    } else if (kind === 'rough_dirt') {
     c.solid = false;
     c.zone = 'rough-dirt';
     c.structure = 'rough_dirt';
    } else if (kind === 'compacted_dirt') {
     c.solid = true;
     c.zone = 'compacted-dirt';
     c.structure = 'compacted_dirt';
     c.hardness = 3.5;
     const openNeighbor = sim.world.neighbors(c.x, c.y).find(n => !n.solid);
     for (const ant of sim.ants) {
      if (ant.alive && Math.round(ant.x) === c.x && Math.round(ant.y) === c.y) {
       if (openNeighbor) { ant.x = openNeighbor.x; ant.y = openNeighbor.y; ant.prevX = openNeighbor.x; ant.prevY = openNeighbor.y; }
      }
     }
    } else if (kind === 'trench') {
     c.solid = false;
     c.zone = 'trench';
     c.structure = 'trench';
     c.water = Math.min(3, c.water || 0);
    } else if (kind === 'smooth_floor') {
     c.solid = false;
     c.zone = 'smooth-floor';
     c.structure = 'smooth_floor';
    }
    sim.jobs = sim.jobs.filter(j => j.id !== a.task.id);
    sim.world.revision++;
    if (targetWorld !== sim.world) targetWorld.revision++;
    sim.emit(`A ${kind.replace('_', ' ')} tile was built.`);
    if (a.colonyId === 1) AntGame.AudioCoordinator?.play('chamberBuiltComplete');
    a.task = null;
    a.state = 'idle';
    a.timer = 0;
    a.packSoundTimer = 0;
    sim.syncStores();
   }
   return true;
  }
  return false;
 }

 static cancel(sim, x, y) {
  const cancelledJobIds = new Set();
  sim.jobs = sim.jobs.filter(j => {
   if (j.colonyId === 1 && j.x === x && j.y === y) {
    cancelledJobIds.add(j.id);
    if (j.deliveredFood > 0) sim.addFood(j.deliveredFood);
    if (j.deliveredDirt > 0) sim.world.pit.used += j.deliveredDirt;
    return false;
   }
   return true;
  });
  if (cancelledJobIds.size) {
   sim.jobs = sim.jobs.filter(j => {
    if (j.buildId && cancelledJobIds.has(j.buildId)) {
     if (j.deliveredFood > 0) sim.addFood(j.deliveredFood);
     if (j.deliveredDirt > 0) sim.world.pit.used += j.deliveredDirt;
     return false;
    }
    return true;
   });
  }
  for (const a of sim.ants) {
   if (a.colonyId === 1) {
    const taskMatches = a.task && (
     (a.task.x === x && a.task.y === y) ||
     (a.task.id && cancelledJobIds.has(a.task.id)) ||
     (a.task.buildId && cancelledJobIds.has(a.task.buildId))
    );
    if (taskMatches || (a.carry?.buildId && cancelledJobIds.has(a.carry.buildId))) {
     if (a.carry?.type === 'construction' || a.carry?.food || a.carry?.dirt) {
      if (a.carry.food) sim.addFood(a.carry.food);
      if (a.carry.dirt) sim.world.pit.used += a.carry.dirt;
      a.carry = null;
     }
     a.task = null;
     a.preferred = null;
     a.path = [];
     a.state = 'idle';
     a.timer = 0;
    }
    if (a.pendingTask && (
     (a.pendingTask.x === x && a.pendingTask.y === y) ||
     (a.pendingTask.id && cancelledJobIds.has(a.pendingTask.id)) ||
     (a.pendingTask.buildId && cancelledJobIds.has(a.pendingTask.buildId))
    )) {
     a.pendingTask = null;
    }
   }
  }
  sim.syncStores();
 }
}

AntGame.Construction = Construction;
})();
