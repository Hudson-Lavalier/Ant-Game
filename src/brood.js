/*
 * UNDERFOOT BROOD & HATCHERY SUBSYSTEM
 * Handles complete metamorphosis (Egg -> Larva -> Pupa -> Adult),
 * hatchery chamber enclosure geometry, brood transport, larval nutrition,
 * Brood Points economy, mutations, and Brood Shop upgrades.
 */
(()=>{
const { Config: C, key, hexDistance, rollCaste: defaultRollCaste } = AntGame;
const DIRS = AntGame.HEX_DIRS || [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];

class BroodSystem {
 static getHatcheries(world) {
  const floorCells = [];
  for (const c of world.cells.values()) {
   if (!c.solid && (c.zone === 'hatchery-floor' || c.structure === 'hatchery_floor')) {
    floorCells.push(c);
   }
  }
  const visited = new Set(), rooms = [];
  for (const cell of floorCells) {
   const k = key(cell.x, cell.y);
   if (visited.has(k)) continue;
   const component = [];
   const queue = [cell];
   visited.add(k);
   while (queue.length) {
    const curr = queue.shift();
    component.push(curr);
    for (const [dq, dr] of DIRS) {
     const nx = curr.x + dq, ny = curr.y + dr, nk = key(nx, ny);
     const neighbor = world.peek(nx, ny);
     if (neighbor && !neighbor.solid && (neighbor.zone === 'hatchery-floor' || neighbor.structure === 'hatchery_floor') && !visited.has(nk)) {
      visited.add(nk);
      queue.push(neighbor);
     }
    }
   }
   const compSet = new Set(component.map(c => key(c.x, c.y)));
   const boundaryCells = new Map();
   for (const c of component) {
    for (const [dq, dr] of DIRS) {
     const nx = c.x + dq, ny = c.y + dr, nk = key(nx, ny);
     if (!compSet.has(nk) && !boundaryCells.has(nk)) {
      boundaryCells.set(nk, world.get(nx, ny));
     }
    }
   }
   const openNeighbors = [...boundaryCells.values()].filter(c => !c.solid);
   let entranceCount = 0;
   if (openNeighbors.length === 1) {
    entranceCount = 1;
   } else if (openNeighbors.length > 1) {
    const openSet = new Set(openNeighbors.map(c => key(c.x, c.y)));
    const checkedOpen = new Set();
    for (const op of openNeighbors) {
     const opk = key(op.x, op.y);
     if (!checkedOpen.has(opk)) {
      entranceCount++;
      const q = [op];
      checkedOpen.add(opk);
      while (q.length) {
       const cur = q.shift();
       for (const [dq, dr] of DIRS) {
        const adjk = key(cur.x + dq, cur.y + dr);
        if (openSet.has(adjk) && !checkedOpen.has(adjk)) {
         checkedOpen.add(adjk);
         q.push(world.peek(cur.x + dq, cur.y + dr));
        }
       }
      }
     }
    }
   }
   const isValid = entranceCount === 1;
   const perEgg = AntGame.Config.brood?.hatcheryFloorPerEgg || 3;
   const capacity = isValid ? Math.floor(component.length / perEgg) : 0;
   rooms.push({
    tiles: component,
    tileCount: component.length,
    capacity,
    isValid,
    entranceCount,
    openNeighbors,
    boundaryWalls: [...boundaryCells.values()].filter(c => c.solid)
   });
  }
  return rooms;
 }

 static physicalHatcheryCap(world) {
  const rooms = this.getHatcheries(world);
  return rooms.reduce((sum, r) => sum + (r.isValid ? r.capacity : 0), 0);
 }

 static effectiveBroodCap(sim) {
  const physical = this.physicalHatcheryCap(sim.world);
  const unlocked = sim.unlockedBroodCap ?? 1;
  return Math.min(physical, unlocked);
 }

 static currentFeedBatchAmount(sim) {
  const batches = [5, 10, 15, 20, 25, 30];
  return batches[sim.feedUpgradeTier || 0] || 5;
 }

 static currentFeedMultiplier(sim) {
  const mults = [1.0, 1.2, 1.5, 2.0, 3.0, 5.0];
  return mults[sim.feedUpgradeTier || 0] || 1.0;
 }

 static rollCaste(sim, random) {
  if (!sim.customCasteChances) return defaultRollCaste(random);
  const chances = sim.customCasteChances;
  const roll = random.next();
  let cumulative = 0;
  for (const [caste, prob] of Object.entries(chances)) {
   cumulative += prob;
   if (roll < cumulative) return caste;
  }
  return 'worker';
 }

 static calculateDailyPoints(sim) {
  let points = 0;
  const rates = AntGame.Config.brood?.pointsPerDay || {
   worker: 1, minor: 1, media: 1, soldier: 1, drone: 1, princess: 1, major: 2, supermajor: 3
  };
  for (const a of sim.ants) {
   if (a.alive && a.colonyId === 1 && a.type !== 'queen') {
    points += (rates[a.type] || 1);
   }
  }
  return points;
 }

 static onNewDay(sim) {
  const earned = this.calculateDailyPoints(sim);
  sim.broodPoints = (sim.broodPoints || 0) + earned;
  if (earned > 0) sim.emit(`New Day: Earned +${earned} Brood Points from surviving ants! Total: ${sim.broodPoints} BP`);
 }

 static setBroodHelper(sim, a, state = true) {
  if (state && !sim.broodHelperUnlocked) return 'Brood Helper role is not yet unlocked. Purchase it in the Brood Shop.';
  if (state && (a.type !== 'worker' && a.type !== 'minor' && a.type !== 'media')) return 'Only worker-class ants can be assigned as Brood Helpers.';
  a.broodHelper = state;
  if (state) {
   a.feeder = false;
   a.roleName = 'Brood Helper';
   sim.emit(`Worker ${a.id} designated as Colony Brood Helper.`);
  } else {
   a.roleName = null;
   sim.emit(`Worker ${a.id} relieved of Brood Helper duty.`);
  }
  return null;
 }

 static buyBroodHelperUnlock(sim) {
  if (sim.broodHelperUnlocked) return 'Brood Helper role already unlocked.';
  const cost = AntGame.Config.brood?.costs?.broodHelperUnlock || 50;
  if (sim.broodPoints < cost) return `Not enough Brood Points (${cost} BP required).`;
  sim.broodPoints -= cost;
  sim.broodHelperUnlocked = true;
  sim.emit('Brood Helper role unlocked! You can now assign dedicated brood specialists.');
  return null;
 }

 static buyFeedUpgrade(sim) {
  const costs = [100, 150, 200, 300, 500];
  if (sim.feedUpgradeTier >= 5) return 'Maximum feed upgrade reached.';
  const cost = costs[sim.feedUpgradeTier];
  if (sim.broodPoints < cost) return `Not enough Brood Points (${cost} BP required).`;
  sim.broodPoints -= cost;
  sim.feedUpgradeTier++;
  sim.emit(`Feed batches upgraded to ${this.currentFeedBatchAmount(sim)} food (${this.currentFeedMultiplier(sim)}x mutation rate)!`);
  return null;
 }

 static buyBroodCapUpgrade(sim) {
  const cost = Math.floor(60 * (1.5 ** (sim.broodCapTier || 0)));
  if (sim.broodPoints < cost) return `Not enough Brood Points (${cost} BP required).`;
  sim.broodPoints -= cost;
  sim.broodCapTier = (sim.broodCapTier || 0) + 1;
  sim.unlockedBroodCap += 2;
  sim.emit(`Brood capacity upgraded to ${sim.unlockedBroodCap} eggs!`);
  return null;
 }

 static buyHatchSpeedUpgrade(sim) {
  if (sim.hatchSpeedTier >= 5) return 'Maximum hatch speed reached.';
  const cost = Math.floor(75 * (1.6 ** sim.hatchSpeedTier));
  if (sim.broodPoints < cost) return `Not enough Brood Points (${cost} BP required).`;
  sim.broodPoints -= cost;
  sim.hatchSpeedTier++;
  sim.emit(`Hatch speed upgraded! Development time reduced by ${sim.hatchSpeedTier * 10}%.`);
  return null;
 }

 static buyMutationEnhancerUpgrade(sim) {
  if (sim.mutationEnhancerTier >= 5) return 'Maximum mutation enhancer reached.';
  const cost = Math.floor(100 * (1.6 ** sim.mutationEnhancerTier));
  if (sim.broodPoints < cost) return `Not enough Brood Points (${cost} BP required).`;
  sim.broodPoints -= cost;
  sim.mutationEnhancerTier++;
  sim.emit(`Mutation Enhancer upgraded to Tier ${sim.mutationEnhancerTier}!`);
  return null;
 }

 static buyCasteModifierUpgrade(sim, caste = 'soldier') {
  if (sim.casteModifierTier >= 5) return 'Maximum caste modifier reached.';
  const cost = Math.floor(120 * (1.6 ** sim.casteModifierTier));
  if (sim.broodPoints < cost) return `Not enough Brood Points (${cost} BP required).`;
  sim.broodPoints -= cost;
  sim.casteModifierTier++;
  if (!sim.customCasteChances) sim.customCasteChances = { ...AntGame.Config.casteChances };
  if (sim.customCasteChances[caste] !== undefined) {
   sim.customCasteChances[caste] += 0.05;
   sim.customCasteChances.worker = Math.max(0.2, sim.customCasteChances.worker - 0.05);
  }
  sim.emit(`Caste lineage tuned: ${caste} probability increased!`);
  return null;
 }

 static findHungryLarva(sim, a) {
  const reqFood = AntGame.Config.brood?.larvaFoodRequired || 30;
  return sim.eggs.find(e => e.colonyId === a.colonyId && (e.health === undefined || e.health > 0) && e.stage === 'larva' && (e.foodAccumulated || 0) < reqFood && (!e.beingFedBy || e.beingFedBy === a.id));
 }

 static findMisplacedBrood(sim, a) {
  const hatcheries = this.getHatcheries(sim.world).filter(h => h.isValid);
  const hatcheryKeys = new Set();
  for (const h of hatcheries) for (const t of h.tiles) hatcheryKeys.add(key(t.x, t.y));
  return sim.eggs.find(e => e.colonyId === a.colonyId && (e.health === undefined || e.health > 0) && !e.carriedBy && (!e.beingTransportedBy || e.beingTransportedBy === a.id) && (!hatcheryKeys.has(key(Math.round(e.x), Math.round(e.y))) || (sim.world.peek(Math.round(e.x), Math.round(e.y))?.water || 0) >= 4));
 }

 static findFreeHatcheryTile(sim, a) {
  const hatcheries = this.getHatcheries(sim.world).filter(h => h.isValid);
  const occupiedKeys = new Set(sim.eggs.filter(e => !e.carriedBy).map(e => key(Math.round(e.x), Math.round(e.y))));
  for (const h of hatcheries) {
   for (const t of h.tiles) {
    const k = key(t.x, t.y);
    if (!occupiedKeys.has(k) && (t.water || 0) < 4 && AntGame.pathfind(sim.world, a, t) !== null) {
     return t;
    }
   }
  }
  return null;
 }

 static rollMutations(brood, mutationTier, random) {
  const mult = brood.mutationMultiplier || 1.0;
  const baseChance = (0.15 * mult) + (mutationTier * 0.10);
  const mutations = [];
  if (random.next() < Math.min(0.95, baseChance)) {
   const pool = [
    { name: 'Hardened Chitin', stat: 'maxHealth', bonus: 0.25 },
    { name: 'Swift Legs', stat: 'speed', bonus: 0.20 },
    { name: 'Mandible Serration', stat: 'attackDamage', bonus: 0.30 },
    { name: 'Excavation Jaws', stat: 'digRate', bonus: 0.25 },
    { name: 'Mason Glands', stat: 'constructRate', bonus: 0.25 },
    { name: 'Pack Thorax', stat: 'maxCarry', bonus: 2 },
    { name: 'Crop Expansion', stat: 'maxFoodNeed', bonus: 0.30 },
    { name: 'Internal Reservoir', stat: 'maxWaterNeed', bonus: 0.30 }
   ];
   const picked = pool[Math.floor(random.next() * pool.length)];
   mutations.push({ name: picked.name, stat: picked.stat, value: picked.bonus });
  }
  return mutations;
 }

 static updateBrood(sim, dt) {
  const speedMult = 1 / (1 + (sim.hatchSpeedTier || 0) * 0.10);
  for (let i = sim.eggs.length - 1; i >= 0; i--) {
   const e = sim.eggs[i];
   if (!e) continue;
   if (e.carriedBy) {
    const carrier = sim.ants.find(a => a.id === e.carriedBy);
    if (carrier && carrier.alive) {
     e.x = carrier.x; e.y = carrier.y;
    } else {
     e.carriedBy = null; e.x = Math.round(e.x); e.y = Math.round(e.y);
    }
   }
   const cell = sim.world.peek(Math.round(e.x), Math.round(e.y));
   if (cell && (cell.water || 0) >= 6) {
    e.health = (e.health ?? 25) - (C.drowningDamage || 18) * dt;
    if (e.health <= 0) {
     sim.eggs.splice(sim.eggs.indexOf(e), 1);
     if (e.carriedBy) {
      const carrier = sim.ants.find(a => a.id === e.carriedBy);
      if (carrier) { carrier.carry = null; carrier.task = null; carrier.state = 'idle'; }
     }
     if (e.colonyId === 1) sim.emit(`A ${e.stage || 'brood'} drowned in deep water.`);
     continue;
    }
   }

   // Legacy saves or tests without stage: hatch directly
   if ((!e.stage || e.colonyId !== 1)) {
    e.age = (e.age || 0) + dt;
    if (e.age >= e.duration) {
     const cap = e.colonyId === 1 ? sim.colonyCapacity() : (sim.colonies.find(c => c.id === e.colonyId)?.capacity || C.startingColonyCap);
     if (sim.livingPopulation(e.colonyId) < cap) sim.addAnt(e.assignedAntType, Math.round(e.x), Math.round(e.y), e.colonyId);
     sim.eggs.splice(sim.eggs.indexOf(e), 1);
     if (e.colonyId === 1) { sim.emit('An ant emerged.'); AntGame.AudioCoordinator?.play('eggHatch'); }
     continue;
    }
   }

   // 1. Egg Stage -> Larva (must be in a valid enclosed hatchery)
   if (e.stage === 'egg') {
    const hatcheries = this.getHatcheries(sim.world).filter(h => h.isValid);
    const inValidHatchery = hatcheries.some(h => h.tiles.some(t => t.x === Math.round(e.x) && t.y === Math.round(e.y)));
    if (!inValidHatchery && e.colonyId === 1) {
     // Eggs outside a valid hatchery do not advance past stage one
     if (e.age < e.duration * speedMult) {
      e.age = Math.min(e.duration * speedMult, (e.age || 0) + dt);
     }
     continue;
    }
    e.age = (e.age || 0) + dt;
    if (e.age >= (e.duration * speedMult)) {
     e.stage = 'larva';
     e.age = 0;
     e.duration = AntGame.Config.brood?.larvaDuration || 180;
     e.foodAccumulated = 0;
     e.mutationMultiplier = 1.0;
     e.health = 25;
     if (e.colonyId === 1) {
      sim.emit('An egg has hatched into a larva. Feed it to help it pupate!');
      AntGame.AudioCoordinator?.play('eggHatch');
     }
    }
   }
   // 2. Larval Stage -> Pupa (timer only begins after food requirement is met)
   else if (e.stage === 'larva') {
    const reqFood = AntGame.Config.brood?.larvaFoodRequired || 30;
    if ((e.foodAccumulated || 0) >= reqFood) {
     e.age = (e.age || 0) + dt;
     if (e.age >= (e.duration * speedMult)) {
      e.stage = 'pupa';
      e.age = 0;
      e.duration = AntGame.Config.brood?.pupaDuration || 85;
      e.health = 25;
      if (e.colonyId === 1) {
       sim.emit('A well-fed larva spun a cocoon and entered the pupal stage.');
      }
     }
    }
   }
   // 3. Pupal Stage -> Adult Emergence
   else if (e.stage === 'pupa') {
    e.age = (e.age || 0) + dt;
    if (e.age >= (e.duration * speedMult)) {
     const cap = e.colonyId === 1 ? sim.colonyCapacity() : (sim.colonies.find(c => c.id === e.colonyId)?.capacity || C.startingColonyCap);
     if (sim.livingPopulation(e.colonyId) < cap) {
      const caste = e.assignedAntType || 'worker';
      const ant = sim.addAnt(caste, Math.round(e.x), Math.round(e.y), e.colonyId);
      if (ant && e.colonyId === 1) {
       const muts = this.rollMutations(e, sim.mutationEnhancerTier || 0, sim.random);
       if (muts.length) {
        ant.mutations = muts;
        for (const m of muts) {
         if (m.stat === 'maxCarry') ant[m.stat] = (ant[m.stat] || 5) + m.value;
         else ant[m.stat] = (ant[m.stat] || 1) * (1 + m.value);
        }
        sim.emit(`Adult ${caste} emerged with mutation: ${muts.map(m => m.name).join(', ')}!`);
       } else {
        sim.emit(`A new adult ${caste} has emerged from its pupa!`);
       }
       AntGame.AudioCoordinator?.play('eggHatch');
      }
     }
     sim.eggs.splice(sim.eggs.indexOf(e), 1);
     if (e.carriedBy) {
      const carrier = sim.ants.find(a => a.id === e.carriedBy);
      if (carrier) { carrier.carry = null; carrier.task = null; carrier.state = 'idle'; }
     }
    }
   }
  }
 }
}

AntGame.Brood = BroodSystem;
})();
