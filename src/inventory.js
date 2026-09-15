/*
 * UNDERFOOT INVENTORY & RESOURCE LOGISTICS SUBSYSTEM
 * Handles discrete item slot allocations (food and water rations),
 * storage capacity scaling (via evolutions), store synchronization,
 * resource addition/consumption, water reservoir droplet transfers,
 * and subterranean mass dirt conservation verification.
 */
(()=>{
const { Config: C, pathfind } = AntGame;
const isWorkerMorph = AntGame.isWorkerMorph || (type => ['worker','minor','media','major','supermajor'].includes(type));

class Inventory {
 static makeItems(sim, prefix, type, value, typeKey='type') {
  const items = [];
  let remaining = Math.max(0, value), index = 0;
  while (remaining > .0001) {
   const amount = Math.min(1, remaining), item = { id: `${prefix}-${sim.nextId++}`, amount };
   item[typeKey] = type;
   items.push(item);
   remaining -= amount;
   index++;
  }
  return items;
 }

 static makeFoodItems(sim, value, foodType='ration', prefix='food') {
  const start = sim.foodStore?.items?.length || 0;
  return this.makeItems(sim, prefix, foodType, value, 'foodType').map((item, index) => ({
   ...item,
   storageTile: Math.floor((start + index) / C.foodStoragePerTile),
   storageSlot: (start + index) % C.foodStoragePerTile
  }));
 }

 static itemTotal(items=[]) {
  return items.reduce((total, item) => total + (item.amount || 0), 0);
 }

 static foodCapacity(sim) {
  return sim.foodStore.tiles * C.foodStoragePerTile * sim.effect('foodCap');
 }

 static queenWaterCapacity(sim) {
  return C.startingWaterCapacity * sim.effect('waterCap');
 }

 static waterCapacity(sim) {
  return (C.startingWaterCapacity + sim.waterStore.tiles.length * C.waterStoragePerTile) * sim.effect('waterCap');
 }

 static colonyCapacity(sim) {
  return Math.floor(C.startingColonyCap * sim.effect('colonyCap'));
 }

 static feederCapacity(sim) {
  return Math.floor(1 * sim.effect('feederCap'));
 }

 static syncStores(sim) {
  sim.food = Math.max(0, Math.min(sim.food, sim.foodCapacity()));
  sim.water = Math.max(0, Math.min(sim.water, sim.queenWaterCapacity()));
  sim.foodStore.items = sim.foodStore.items || [];
  sim.waterStore.items = sim.waterStore.items || [];
  sim.foodStore.items.forEach((item, index) => {
   item.storageTile ??= Math.floor(index / C.foodStoragePerTile);
   item.storageSlot ??= index % C.foodStoragePerTile;
  });
  const foodDelta = sim.food - this.itemTotal(sim.foodStore.items);
  const waterDelta = sim.water - this.itemTotal(sim.waterStore.items);
  if (foodDelta > .0001) sim.foodStore.items.push(...this.makeFoodItems(sim, foodDelta, 'ration', 'restored-ration'));
  else if (foodDelta < -.0001) this.takeItems(sim.foodStore.items, -foodDelta);
  if (waterDelta > .0001) sim.waterStore.items.push(...this.makeItems(sim, 'restored-water', 'water', waterDelta));
  else if (waterDelta < -.0001) this.takeItems(sim.waterStore.items, -waterDelta);
  sim.foodStore.used = this.itemTotal(sim.foodStore.items);
  sim.foodStore.capacity = sim.foodCapacity();
  sim.waterStore.used = this.reservoirWater(sim);
  sim.waterStore.capacity = sim.waterStore.tiles.length * C.waterStoragePerTile * sim.effect('waterCap');
  this.syncFoodTiles(sim);
 }

 static getFoodTiles(sim) {
  if (!sim.world?.cells) return [];
  const tiles = [];
  for (const c of sim.world.cells.values()) {
   if (c.zone === 'food-store' && !c.solid && c.discovered) {
    tiles.push(c);
   }
  }
  return tiles;
 }

 static syncFoodTiles(sim) {
  const tiles = this.getFoodTiles(sim);
  if (!tiles.length) return;
  const tileCap = C.foodStoragePerTile * (sim.effect?.('foodCap') || 1);
  let unallocated = Math.max(0, sim.food);
  for (const tile of tiles) {
   const put = Math.min(tileCap, unallocated);
   tile.food = put;
   unallocated -= put;
  }
  if (unallocated > 0.001) {
   tiles[tiles.length - 1].food = (tiles[tiles.length - 1].food || 0) + unallocated;
  }
 }

 static getFoodSourceTile(sim, a) {
  if (!sim || sim.food <= 0.001) return null;
  const reachable = target => target && pathfind(sim.world, a, target) !== null;
  const candidates = [];
  for (const c of sim.world.cells.values()) {
   if (c.zone === 'food-store' && !c.solid && c.discovered && (c.food || 0) > 0.001 && reachable(c)) {
    candidates.push(c);
   }
  }
  if (candidates.length > 0) {
   candidates.sort((x, y) => AntGame.hexDistance(a, x) - AntGame.hexDistance(a, y));
   return candidates[0];
  }
  this.syncFoodTiles(sim);
  for (const c of sim.world.cells.values()) {
   if (c.zone === 'food-store' && !c.solid && c.discovered && (c.food || 0) > 0.001 && reachable(c)) {
    candidates.push(c);
   }
  }
  if (candidates.length > 0) {
   candidates.sort((x, y) => AntGame.hexDistance(a, x) - AntGame.hexDistance(a, y));
   return candidates[0];
  }
  if (sim.world.founding?.foodStore && reachable(sim.world.founding.foodStore)) {
   return sim.world.founding.foodStore;
  }
  if (reachable(sim.nest)) {
   return sim.nest;
  }
  return null;
 }

 static takeItems(items, value) {
  let left = Math.max(0, value);
  for (const item of items) {
   const taken = Math.min(left, item.amount);
   item.amount -= taken;
   left -= taken;
   if (left <= .0001) break;
  }
  for (let i = items.length - 1; i >= 0; i--) {
   if (items[i].amount <= .0001) items.splice(i, 1);
  }
  return value - left;
 }

 static addFood(sim, value, foodType='ration') {
  const accepted = Math.max(0, Math.min(value, sim.foodCapacity() - sim.food));
  if (!accepted) return 0;
  sim.food += accepted;
  sim.foodStore.items.push(...this.makeFoodItems(sim, accepted, foodType));
  sim.foodHarvested += accepted;
  this.syncStores(sim);
  return accepted;
 }

 static spendFood(sim, value) {
  const previous = sim.food;
  sim.food = Math.max(0, sim.food - value);
  const spent = previous - sim.food;
  this.takeItems(sim.foodStore.items, value);
  sim.foodConsumed += spent;
  this.syncStores(sim);
  return spent;
 }

 static addWater(sim, value) {
  const accepted = Math.max(0, Math.min(value, sim.queenWaterCapacity() - sim.water));
  if (!accepted) return 0;
  sim.water += accepted;
  sim.waterStore.items.push(...this.makeItems(sim, 'water', 'water', accepted));
  this.syncStores(sim);
  return accepted;
 }

 static spendWater(sim, value) {
  const previous = sim.water;
  sim.water = Math.max(0, sim.water - value);
  const spent = previous - sim.water;
  this.takeItems(sim.waterStore.items, value);
  this.syncStores(sim);
  return spent;
 }

 static reservoirDestination(sim, a) {
  for (const tile of sim.waterStore.tiles) {
   if ((tile.water || 0) >= C.waterStoragePerTile) continue;
   const cell = sim.world.peek(tile.x, tile.y);
   const face = sim.world.faces(cell).find(n => pathfind(sim.world, a, n) !== null);
   if (face) return { kind: 'reservoir', tile, point: face };
  }
  return null;
 }

 static reservoirWater(sim) {
  return sim.waterStore.tiles.reduce((sum, tile) => sum + (tile.water || 0), 0);
 }

 static reservoirSource(sim, a) {
  for (const tile of sim.waterStore.tiles) {
   if ((tile.water || 0) <= 0) continue;
   const cell = sim.world.peek(tile.x, tile.y);
   const face = sim.world.faces(cell).find(n => pathfind(sim.world, a, n) !== null);
   if (face) return { tile, point: face };
  }
  return null;
 }

 static requestReservoirWithdrawal(sim) {
  const worker = sim.ants.find(a => a.alive && a.colonyId === 1 && isWorkerMorph(a.type) && !a.feeder && !a.held && a.state === 'idle');
  if (!worker) return 'No idle worker is available to collect stored water.';
  const source = this.reservoirSource(sim, worker);
  if (!source) return 'No reachable stored water is available.';
  worker.task = { type: 'withdraw-water', tile: source.tile };
  sim.route(worker, source.point, 'withdraw-water');
  sim.emit(`Worker ${worker.id} is retrieving reservoir water.`);
  return null;
 }

 static pickupReservoir(sim, a) {
  const tile = a.task?.tile;
  if (!tile || tile.water <= 0) {
   a.state = 'idle';
   return;
  }
  const take = Math.min(C.waterDropValue, tile.water);
  tile.water -= take;
  this.takeItems(tile.items || [], take);
  a.carry = { type: 'water', amount: take };
  a.destination = { point: sim.nest, kind: 'queen' };
  sim.route(a, sim.nest, 'carrying');
 }

 static conservation(sim) {
  return sim.world.removed === sim.world.pits.reduce((n, p) => n + p.used, 0) +
   sim.surfaceDump +
   sim.colonies.reduce((n, c) => n + c.pit.used, 0) +
   sim.spoilItems.reduce((n, item) => n + (item.amount || 0), 0) +
   [...sim.world.cells.values()].reduce((n, c) => n + (c.builtDirt || 0) + (c.relocatedDirt || 0), 0) +
   sim.ants.reduce((n, a) => n + (a.carry?.type === 'soil' ? a.carry.amount : a.carry?.type === 'construction' ? a.carry.dirt : 0), 0) +
   sim.drops.reduce((n, d) => n + (d.load.type === 'soil' ? d.load.amount : d.load.type === 'construction' ? d.load.dirt : 0), 0);
 }
}

AntGame.Inventory = Inventory;
})();
