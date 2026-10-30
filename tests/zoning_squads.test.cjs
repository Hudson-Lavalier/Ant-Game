const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.window = globalThis;
globalThis.devicePixelRatio = 1;
for (const f of ['config', 'data', 'world', 'brood', 'tasks', 'construction', 'inventory', 'ecology', 'audio', 'settings', 'simulation', 'renderer']) {
 require('../src/' + f + '.js');
}

const { Simulation, World, Random, pathfind, hexDistance, hexDisk, TaskEngine, Renderer } = AntGame;

test('Area planning and Behavioral Zoning remain strictly separated and coexist', () => {
 const s = new Simulation(2001);
 const c = s.world.peek(s.nest.x + 1, s.nest.y);
 c.solid = false;
 c.discovered = true;
 c.zone = 'spoil';

 // 1. Create and paint an Architectural Area blueprint
 const areaId = s.createArea('Main Spoil Hall', 'spoil');
 assert.equal(s.paintArea(c.x, c.y, areaId), true);
 assert.ok(c.area);
 assert.equal(c.area.name, 'Main Spoil Hall');
 assert.equal(c.area.type, 'spoil');

 // 2. Create and paint a Behavioral Zone on the exact same tile
 const zoneId = s.createZone('Meat Depot', 'stockpile', { priority: 3 });
 const paintRes = s.paintZone(c.x, c.y, zoneId);
 assert.equal(paintRes.ok, true);
 assert.equal(c.behaviorZone, zoneId);

 // 3. Both metadata objects coexist independently without overwriting each other
 assert.equal(c.area.name, 'Main Spoil Hall');
 assert.equal(c.behaviorZone, zoneId);

 // 4. Erasing the behavioral zone does NOT destroy the area blueprint
 assert.equal(s.eraseZone(zoneId), true);
 assert.equal(c.behaviorZone, undefined);
 assert.equal(c.area.name, 'Main Spoil Hall');

 // 5. Repaint zone and erase area: zone remains intact
 s.paintZone(c.x, c.y, zoneId);
 assert.equal(c.behaviorZone, zoneId);
 assert.equal(s.eraseArea(areaId), true);
 assert.equal(c.area, undefined);
 assert.equal(c.behaviorZone, zoneId);
});

test('Stockpile zones are strictly locked to excavated spoil tiles', () => {
 const s = new Simulation(2002);
 const soilCell = s.world.peek(s.nest.x + 1, s.nest.y);
 soilCell.solid = false; soilCell.discovered = true; soilCell.zone = 'soil';

 const rockCell = s.world.peek(s.nest.x + 2, s.nest.y);
 rockCell.solid = false; rockCell.discovered = true; rockCell.zone = 'rock';

 const spoilCell = s.world.peek(s.nest.x + 3, s.nest.y);
 spoilCell.solid = false; spoilCell.discovered = true; spoilCell.zone = 'spoil';

 const solidSpoilCell = s.world.peek(s.nest.x + 4, s.nest.y);
 solidSpoilCell.solid = true; solidSpoilCell.discovered = true; solidSpoilCell.zone = 'spoil';

 const zId = s.createZone('Colony Stockpile', 'stockpile');

 // Painting on plain soil must be rejected
 const soilRes = s.paintZone(soilCell.x, soilCell.y, zId);
 assert.equal(soilRes.ok, false);
 assert.ok(soilRes.error.includes('spoil tiles'));
 assert.equal(soilCell.behaviorZone, undefined);

 // Painting on rock must be rejected
 const rockRes = s.paintZone(rockCell.x, rockCell.y, zId);
 assert.equal(rockRes.ok, false);
 assert.equal(rockCell.behaviorZone, undefined);

 // Painting on solid unexcavated spoil must be rejected
 const solidRes = s.paintZone(solidSpoilCell.x, solidSpoilCell.y, zId);
 assert.equal(solidRes.ok, false);
 assert.equal(solidSpoilCell.behaviorZone, undefined);

 // Painting on excavated spoil tile MUST SUCCEED
 const spoilRes = s.paintZone(spoilCell.x, spoilCell.y, zId);
 assert.equal(spoilRes.ok, true);
 assert.equal(spoilCell.behaviorZone, zId);
 assert.ok(s.isHexInZone(spoilCell.x, spoilCell.y, zId));
});

test('Stockpile prioritization routes items to higher priority and category-matching spoil stockpiles', () => {
 const s = new Simulation(2003);
 const worker = s.addAnt('worker', s.nest.x, s.nest.y);

 // Setup two spoil chambers
 const cLow = s.world.peek(s.nest.x + 2, s.nest.y);
 cLow.solid = false; cLow.discovered = true; cLow.zone = 'spoil';

 const cHigh = s.world.peek(s.nest.x + 4, s.nest.y);
 cHigh.solid = false; cHigh.discovered = true; cHigh.zone = 'spoil';

 // Stockpile 1: Normal (Priority 2), allows Seeds only
 const zSeeds = s.createZone('Seed Depot', 'stockpile', {
  priority: 2,
  filters: { corpses: false, seeds: true, soil: false }
 });
 s.paintZone(cLow.x, cLow.y, zSeeds);

 // Stockpile 2: Critical (Priority 4), allows Corpses only
 const zCorpses = s.createZone('Meat Vault', 'stockpile', {
  priority: 4,
  filters: { corpses: true, seeds: false, soil: false }
 });
 s.paintZone(cHigh.x, cHigh.y, zCorpses);

 // Worker carries a corpse -> should route to Critical corpse stockpile (Meat Vault)
 worker.carry = { type: 'corpse', amount: 50 };
 const destCorpse = s.storage(worker);
 assert.equal(destCorpse.kind, 'stockpile');
 assert.equal(destCorpse.zoneId, zCorpses);
 assert.equal(destCorpse.point.x, cHigh.x);
 assert.equal(destCorpse.point.y, cHigh.y);

 // Worker carries a seed -> should route to Seed Depot
 worker.carry = { type: 'seed', amount: 20 };
 const destSeed = s.storage(worker);
 assert.equal(destSeed.kind, 'stockpile');
 assert.equal(destSeed.zoneId, zSeeds);
 assert.equal(destSeed.point.x, cLow.x);
 assert.equal(destSeed.point.y, cLow.y);

 // Worker carries soil -> both stockpiles disallow soil -> falls back to pits or spoil
 worker.carry = { type: 'soil', amount: 1 };
 const destSoil = s.storage(worker);
 assert.notEqual(destSoil.zoneId, zSeeds);
 assert.notEqual(destSoil.zoneId, zCorpses);
});

test('Squad roles and zone priority overrides cleanly supersede caste priorities', () => {
 const s = new Simulation(2004);
 const w1 = s.addAnt('worker', s.nest.x, s.nest.y);
 const w2 = s.addAnt('worker', s.nest.x, s.nest.y);

 // Baseline: Worker default caste priority for harvest is 4, dig is 5
 assert.equal(s.getCastePriority('worker', 'harvest'), 4);
 assert.equal(s.getCastePriority('worker', 'dig'), 5);
 assert.equal(TaskEngine.getEffectivePriority(s, w1, 'harvest'), 4);

 // Assign w1 to Squad 1 with role 'forager'
 s.groups[1] = [w1.id];
 s.assignSquadToZone(1, null, false, 'forager');

 // Effective harvest priority for forager squad becomes 1!
 assert.equal(TaskEngine.getEffectivePriority(s, w1, 'harvest'), 1);
 // And dig priority is deprioritized to 9
 assert.equal(TaskEngine.getEffectivePriority(s, w1, 'dig'), 9);

 // Create a zone with custom priority overrides (e.g. Urgent Quarry setting dig to 1)
 const quarryZone = s.createZone('Urgent Quarry', 'foraging', {
  priorityOverrides: { dig: 1, build: 2 }
 });
 // Assign w2 to Squad 2 and bind to the quarry zone
 s.groups[2] = [w2.id];
 s.assignSquadToZone(2, quarryZone, false, 'auto');

 assert.equal(TaskEngine.getEffectivePriority(s, w2, 'dig'), 1);
 assert.equal(TaskEngine.getEffectivePriority(s, w2, 'build'), 2);
});

test('Strict vs biased squad zone bounds enforce labor boundaries', () => {
 const s = new Simulation(2005);
 const w = s.addAnt('worker', s.nest.x, s.nest.y);

 // Create Foraging Zone around (nest.x + 5, nest.y)
 const fzId = s.createZone('North Foraging', 'foraging');
 for (let dx = 4; dx <= 6; dx++) {
  const c = s.world.peek(s.nest.x + dx, s.nest.y);
  c.solid = false; c.discovered = true;
  s.paintZone(c.x, c.y, fzId);
 }

 // Spawn resource INSIDE the zone
 const inResource = {
  id: 'in-zone-seed',
  foodType: 'seeds',
  x: s.nest.x + 5,
  y: s.nest.y,
  remaining: 25,
  state: 'active'
 };
 s.resources.push(inResource);

 // Spawn resource OUTSIDE the zone (closer to worker, at nest.x + 1)
 const outResource = {
  id: 'out-zone-seed',
  foodType: 'seeds',
  x: s.nest.x + 1,
  y: s.nest.y,
  remaining: 25,
  state: 'active'
 };
 s.resources.push(outResource);

 // Case 1: Unassigned worker picks closest resource (outResource)
 const targetUnassigned = s.findAvailableHarvestTarget(w);
 assert.equal(targetUnassigned.id, outResource.id);

 // Case 2: Assign worker to Squad 1 with North Foraging zone (Biased mode: strictBounds = false)
 s.groups[1] = [w.id];
 s.assignSquadToZone(1, fzId, false, 'forager');
 const targetBiased = s.findAvailableHarvestTarget(w);
 // Zone candidate takes precedence over closer out-of-zone candidate!
 assert.equal(targetBiased.id, inResource.id);

 // Case 3: Set strictBounds = true
 s.assignSquadToZone(1, fzId, true, 'forager');
 const targetStrict = s.findAvailableHarvestTarget(w);
 assert.equal(targetStrict.id, inResource.id);

 // When in-zone resource is consumed, strict worker MUST NOT touch outside resource
 inResource.remaining = 0;
 const targetStrictEmpty = s.findAvailableHarvestTarget(w);
 assert.equal(targetStrictEmpty, null);

 // But if strictBounds is toggled off, worker falls back to outside resource
 s.assignSquadToZone(1, fzId, false, 'forager');
 const targetFallback = s.findAvailableHarvestTarget(w);
 assert.equal(targetFallback.id, outResource.id);
});

test('Cooperative multi-ant hauling allows teams to transport heavy prey', () => {
 const s = new Simulation(2006);
 const w1 = s.addAnt('worker', s.nest.x, s.nest.y);
 const w2 = s.addAnt('worker', s.nest.x, s.nest.y);
 const w3 = s.addAnt('worker', s.nest.x, s.nest.y);
 const mj = s.addAnt('major', s.nest.x, s.nest.y);

 const spiderCorpse = {
  id: 'heavy-spider-corpse',
  species: 'spider',
  size: 1.0,
  alive: false,
  food: 1000,
  state: 'dead'
 };

 // Spider weight is 5.0
 assert.equal(AntGame.getCreatureWeight(spiderCorpse), 5.0);

 // Solo checks: no single ant can carry spider
 assert.equal(AntGame.canCarry(w1, spiderCorpse), false);
 assert.equal(AntGame.canCarry(mj, spiderCorpse), false);

 // Single worker haul power is 1.0; major is 2.0
 assert.equal(AntGame.canCoopCarry([w1], spiderCorpse), false);
 assert.equal(AntGame.canCoopCarry([w1, w2], spiderCorpse), false); // 2.0 < 5.0
 assert.equal(AntGame.canCoopCarry([w1, w2, mj], spiderCorpse), false); // 4.0 < 5.0

 // 3 workers (1.0 each) + 1 major (2.0) = 5.0 power!
 const haulTeam = [w1, w2, w3, mj];
 assert.equal(AntGame.canCoopCarry(haulTeam, spiderCorpse), true);
});

test('Serialization preserves behavioral zones, tile bindings, and squad configurations', () => {
 const s = new Simulation(2007);
 const w = s.addAnt('worker', s.nest.x, s.nest.y);
 const cell = s.world.peek(s.nest.x + 2, s.nest.y);
 cell.solid = false; cell.discovered = true; cell.zone = 'spoil';

 const zId = s.createZone('Main Granary', 'stockpile', {
  priority: 3,
  filters: { corpses: false, seeds: true, soil: false }
 });
 s.paintZone(cell.x, cell.y, zId);

 s.groups[3] = [w.id];
 s.assignSquadToZone(3, zId, true, 'hauler');

 // Serialize simulation
 const data = JSON.parse(JSON.stringify(s.serialize()));
 assert.ok(data.zones);
 assert.ok(data.zones[zId]);
 assert.ok(data.squads);

 // Restore simulation
 const restored = Simulation.restore(data);
 assert.ok(restored.zones[zId]);
 assert.equal(restored.zones[zId].name, 'Main Granary');
 assert.equal(restored.zones[zId].type, 'stockpile');
 assert.equal(restored.zones[zId].priority, 3);
 assert.equal(restored.zones[zId].filters.corpses, false);
 assert.equal(restored.zones[zId].filters.seeds, true);

 // Restored cell has behaviorZone
 const restoredCell = restored.world.peek(cell.x, cell.y);
 assert.equal(restoredCell.behaviorZone, zId);
 assert.ok(restored.isHexInZone(cell.x, cell.y, zId));

 // Restored squad has correct mapping, role, and strict bounds
 const restoredSquad = restored.squads[3];
 assert.equal(restoredSquad.zoneId, zId);
 assert.equal(restoredSquad.strictBounds, true);
 assert.equal(restoredSquad.role, 'hauler');
});

test('Task prioritization hierarchy strictly follows: Squad Overrides > Squad Roles > Zone Overrides > Caste Baseline', () => {
  const s = new Simulation(2008);
  const w = s.addAnt('worker', s.nest.x, s.nest.y);

  // LEVEL 4: CASTE BASELINE
  // Worker baseline priorities: harvest=4, dig=5, carry=4, combat=8, build=5
  assert.equal(TaskEngine.getEffectivePriority(s, w, 'harvest'), 4);
  assert.equal(TaskEngine.getEffectivePriority(s, w, 'dig'), 5);
  assert.equal(TaskEngine.getEffectivePriority(s, w, 'carry'), 4);
  assert.equal(TaskEngine.getEffectivePriority(s, w, 'build'), 5);

  // LEVEL 3: ZONE PRIORITY OVERRIDES
  // Create a zone with custom overrides: harvest=2, dig=9, combat=2
  const zId = s.createZone('Priority Test Zone', 'foraging', {
    priorityOverrides: { harvest: 2, dig: 9, combat: 2 }
  });

  // Assign w to Squad 1 and bind Squad 1 to the zone (with role 'auto' = no role overrides)
  s.groups[1] = [w.id];
  s.assignSquadToZone(1, zId, false, 'auto');

  // Zone overrides supersede caste baseline:
  assert.equal(TaskEngine.getEffectivePriority(s, w, 'harvest'), 2); // 2 (zone) beats 4 (caste)
  assert.equal(TaskEngine.getEffectivePriority(s, w, 'dig'), 9);     // 9 (zone) beats 5 (caste)
  assert.equal(TaskEngine.getEffectivePriority(s, w, 'combat'), 2);  // 2 (zone) beats 8 (caste)
  assert.equal(TaskEngine.getEffectivePriority(s, w, 'carry'), 4);   // falls through to caste baseline (4)

  // LEVEL 2: SQUAD ROLE PRIORITIES
  // Assign role 'hauler' to Squad 1. Hauler role defines: carry=1, harvest=6, dig=8
  s.assignSquadToZone(1, zId, false, 'hauler');

  // Role priorities supersede zone overrides:
  assert.equal(TaskEngine.getEffectivePriority(s, w, 'harvest'), 6); // 6 (role) beats 2 (zone)
  assert.equal(TaskEngine.getEffectivePriority(s, w, 'dig'), 8);     // 8 (role) beats 9 (zone)
  assert.equal(TaskEngine.getEffectivePriority(s, w, 'carry'), 1);   // 1 (role) beats 4 (caste)
  // But for a task NOT defined by the hauler role (like combat), it falls through to Level 3 (zone override):
  assert.equal(TaskEngine.getEffectivePriority(s, w, 'combat'), 2);  // 2 (zone) beats 8 (caste)

  // LEVEL 1: SQUAD DIRECT PRIORITY OVERRIDES (Explicit player tuning on squad)
  // Set explicit override on Squad 1 for harvest=1, carry=10
  s.setSquadPriorityOverride(1, 'harvest', 1);
  s.setSquadPriorityOverride(1, 'carry', 10);

  // Explicit squad overrides supersede squad role, zone overrides, and caste baseline:
  assert.equal(TaskEngine.getEffectivePriority(s, w, 'harvest'), 1); // 1 (squad override) beats 6 (role) and 2 (zone)
  assert.equal(TaskEngine.getEffectivePriority(s, w, 'carry'), 10);  // 10 (squad override) beats 1 (role) and 4 (caste)
  // For dig, since there is no explicit squad override, it still falls through to Level 2 (role):
  assert.equal(TaskEngine.getEffectivePriority(s, w, 'dig'), 8);     // 8 (role) beats 9 (zone)
  // For combat, neither squad override nor role defines it, falls through to Level 3 (zone):
  assert.equal(TaskEngine.getEffectivePriority(s, w, 'combat'), 2);  // 2 (zone)

  // DYNAMIC REMOVAL / FALLBACK
  // Clear explicit squad override for harvest
  s.setSquadPriorityOverride(1, 'harvest', null);
  // Reverts to Level 2 (role: 6)
  assert.equal(TaskEngine.getEffectivePriority(s, w, 'harvest'), 6);

  // Change role back to 'auto' (clears Level 2)
  s.assignSquadToZone(1, zId, false, 'auto');
  // Reverts to Level 3 (zone override: 2)
  assert.equal(TaskEngine.getEffectivePriority(s, w, 'harvest'), 2);

  // Unbind squad from zone (clears Level 3)
  s.assignSquadToZone(1, null, false, 'auto');
  // Reverts to Level 4 (caste baseline: 4)
  assert.equal(TaskEngine.getEffectivePriority(s, w, 'harvest'), 4);

  // STANDING HEX ZONE OVERRIDE FOR UNASSIGNED ANTS
  // If an unassigned ant steps onto a hex painted with a zone that has priorityOverrides:
  const freeWorker = s.addAnt('worker', s.nest.x + 3, s.nest.y);
  assert.equal(TaskEngine.getEffectivePriority(s, freeWorker, 'combat'), 8); // outside zone: caste baseline (8)
  s.paintZone(freeWorker.x, freeWorker.y, zId);
  assert.equal(TaskEngine.getEffectivePriority(s, freeWorker, 'combat'), 2); // standing on zone: zone override (2)
});

test('Live task candidate sorting strictly follows the effective priority hierarchy', () => {
  const s = new Simulation(2009);
  const w = s.addAnt('worker', s.nest.x, s.nest.y);

  // Setup candidate tasks: dig job vs harvest job
  const candDig = { type: 'dig', point: { x: s.nest.x + 1, y: s.nest.y } };
  const candHarvest = { type: 'harvest', point: { x: s.nest.x - 1, y: s.nest.y } };

  // Helper to sort candidates using getEffectivePriority
  const sortCands = (cands) => {
    return [...cands].sort((t1, t2) => {
      const p1 = TaskEngine.getEffectivePriority(s, w, t1.type);
      const p2 = TaskEngine.getEffectivePriority(s, w, t2.type);
      return p1 - p2;
    });
  };

  // Baseline: Worker harvest=4, dig=5 -> harvest (4) has higher priority than dig (5)
  let sorted = sortCands([candDig, candHarvest]);
  assert.equal(sorted[0].type, 'harvest');

  // Add Zone override making dig=1 (higher priority) and harvest=8
  const quarryZone = s.createZone('Quarry', 'foraging', {
    priorityOverrides: { dig: 1, harvest: 8 }
  });
  s.groups[2] = [w.id];
  s.assignSquadToZone(2, quarryZone, false, 'auto');

  // Zone override flips the decision: dig (1) now beats harvest (8)
  sorted = sortCands([candDig, candHarvest]);
  assert.equal(sorted[0].type, 'dig');

  // Squad role 'forager' defines harvest=1, dig=9 -> role supersedes zone override!
  s.assignSquadToZone(2, quarryZone, false, 'forager');
  sorted = sortCands([candDig, candHarvest]);
  assert.equal(sorted[0].type, 'harvest');

  // Explicit squad priority override setting dig=1 and harvest=10 -> explicit override supersedes role!
  s.setSquadPriorityOverride(2, 'dig', 1);
  s.setSquadPriorityOverride(2, 'harvest', 10);
  sorted = sortCands([candDig, candHarvest]);
  assert.equal(sorted[0].type, 'dig');
});

test('Renderer overlay modes for Areas and Zones are mutually exclusive on overlapping tiles', () => {
  const s = new Simulation(2010);
  const cell = s.world.peek(s.nest.x + 1, s.nest.y);
  cell.solid = false; cell.discovered = true; cell.zone = 'passage';

  // Tile has BOTH an Area and a Behavioral Zone
  const aId = s.createArea('Main Walkway', 'passage');
  s.paintArea(cell.x, cell.y, aId);

  const zId = s.createZone('North Foraging', 'foraging');
  s.paintZone(cell.x, cell.y, zId);

  // Both coexist independently on the cell
  assert.equal(cell.area.id, aId);
  assert.equal(cell.behaviorZone, zId);

  // Mock renderer instance
  const r = new Renderer({ getBoundingClientRect: () => ({ width: 800, height: 600 }), getContext: () => ({}) });

  // Area overlay mode: zoneColor returns area/passage color; behaviorZone is not used
  const areaColor = r.zoneColor(cell);
  assert.ok(areaColor);
  assert.equal(areaColor, '#62734a88'); // passage area color

  // Zone overlay mode: behaviorZoneColor returns foraging zone color; area is not used
  const zoneColor = r.behaviorZoneColor(cell);
  assert.ok(zoneColor);
  assert.equal(zoneColor, '#3d7a3a88'); // foraging behavioral zone color

  // When a cell has no behaviorZone, behaviorZoneColor returns null
  const plainCell = s.world.peek(s.nest.x - 1, s.nest.y);
  assert.equal(r.behaviorZoneColor(plainCell), null);
});

test('Excavation Zone automatically designates dirt, rejects rock/holes/wells, and safeguards against infinite mining loops', () => {
  const s = new Simulation(2011);
  const w = s.addAnt('worker', s.nest.x, s.nest.y);

  // Setup neighboring cells
  // cell1: solid normal dirt, discovered
  const dirt1 = s.world.peek(s.nest.x + 1, s.nest.y);
  dirt1.solid = true; dirt1.discovered = true; dirt1.rock = false; dirt1.zone = 'rough-dirt';

  // cell2: solid rock, discovered
  const rockCell = s.world.peek(s.nest.x + 2, s.nest.y);
  rockCell.solid = true; rockCell.discovered = true; rockCell.rock = true; rockCell.zone = 'rock';

  // cell3: well block, discovered
  const wellCell = s.world.peek(s.nest.x - 1, s.nest.y);
  wellCell.solid = false; wellCell.discovered = true; wellCell.isWell = true; wellCell.zone = 'well';

  // cell4: hole block, discovered
  const holeCell = s.world.peek(s.nest.x - 2, s.nest.y);
  holeCell.solid = false; holeCell.discovered = true; holeCell.hole = true; holeCell.zone = 'hole';

  // 1. Create Excavation Zone
  const zId = s.createZone('Mine Sector 1', 'excavation');
  assert.ok(zId.startsWith('excavation:'));
  assert.equal(s.zones[zId].type, 'excavation');
  assert.equal(s.zones[zId].priorityOverrides.dig, 1);

  // 2. Painting on solid dirt succeeds and automatically creates dig job
  const paintDirtRes = s.paintZone(dirt1.x, dirt1.y, zId);
  assert.equal(paintDirtRes.ok, true);
  assert.equal(dirt1.behaviorZone, zId);
  const dirtJob = s.jobs.find(j => j.id === `1:dig:${dirt1.x},${dirt1.y}`);
  assert.ok(dirtJob, 'Solid dirt tile was automatically designated for excavation');

  // 3. Painting on rock, well, or hole is rejected by constraint
  const paintRockRes = s.paintZone(rockCell.x, rockCell.y, zId);
  assert.equal(paintRockRes.ok, false);
  assert.ok(paintRockRes.error.includes('unbreakable'));
  assert.equal(rockCell.behaviorZone, undefined);

  const paintWellRes = s.paintZone(wellCell.x, wellCell.y, zId);
  assert.equal(paintWellRes.ok, false);

  const paintHoleRes = s.paintZone(holeCell.x, holeCell.y, zId);
  assert.equal(paintHoleRes.ok, false);

  // 4. designate directly rejects rock, well, hole
  assert.equal(s.designate(rockCell.x, rockCell.y), false);
  assert.equal(s.designate(wellCell.x, wellCell.y), false);
  assert.equal(s.designate(holeCell.x, holeCell.y), false);

  // 5. Worker assigned to excavation zone prioritizes and mines the dirt
  s.groups[1] = [w.id];
  s.assignSquadToZone(1, zId, true, 'digger');

  // Available jobs for worker includes dirtJob, but excludes any hypothetical unbreakable job
  const avail = s.findAvailableJobs(w, 'dig');
  assert.ok(avail.some(j => j.id === dirtJob.id));

  // If an ant somehow had a job on an unbreakable block, stepping dig state purges it and does not loop
  const fakeRockJob = { id: `1:dig:${rockCell.x},${rockCell.y}`, type: 'dig', x: rockCell.x, y: rockCell.y, colonyId: 1, priority: 1, status: 'available' };
  s.jobs.push(fakeRockJob);
  // findAvailableJobs must filter it out
  const availAfterFake = s.findAvailableJobs(w, 'dig');
  assert.ok(!availAfterFake.some(j => j.id === fakeRockJob.id));

  // If worker is forced into digging state on rock:
  w.state = 'digging';
  w.task = fakeRockJob;
  s.updateWorker(w, 0.1);
  assert.equal(w.state, 'idle', 'Worker aborted mining unbreakable block without getting stuck');
  assert.equal(w.task, null);
  assert.ok(!s.jobs.some(j => j.id === fakeRockJob.id), 'Unbreakable job was purged from jobs list');

  // 6. Test syncExcavationZones: newly revealed solid dirt inside excavation zone gets designated
  const dirt2 = s.world.peek(s.nest.x, s.nest.y + 1);
  dirt2.solid = true; dirt2.discovered = true; dirt2.rock = false;
  s.paintZone(dirt2.x, dirt2.y, zId);
  // Remove job manually to simulate a newly discovered tile in existing zone
  s.jobs = s.jobs.filter(j => j.id !== `1:dig:${dirt2.x},${dirt2.y}`);
  assert.ok(!s.jobs.some(j => j.id === `1:dig:${dirt2.x},${dirt2.y}`));
  s.syncExcavationZones();
  assert.ok(s.jobs.some(j => j.id === `1:dig:${dirt2.x},${dirt2.y}`), 'syncExcavationZones re-designated solid dirt');

  // 7. Erasing excavation zone cleans up all pending excavation dig jobs
  s.eraseZone(zId);
  assert.equal(s.zones[zId], undefined);
  assert.equal(dirt1.behaviorZone, undefined);
  assert.ok(!s.jobs.some(j => j.id === `1:dig:${dirt1.x},${dirt1.y}`), 'Pending dig jobs were purged on zone erase');
  assert.ok(!s.jobs.some(j => j.id === `1:dig:${dirt2.x},${dirt2.y}`));
});

test('Areas and zones paint with brush radius (1 hex, 7 hexes, 19 hexes)', () => {
  const s = new Simulation(2012);
  const center = { x: s.nest.x + 5, y: s.nest.y + 5 };

  // Reveal a 19-hex region
  for (const p of AntGame.hexDisk(center.x, center.y, 2)) {
    const c = s.world.get(p.x, p.y);
    c.discovered = true;
    c.solid = false;
  }

  // 1. Paint Area with radius = 1 (7 hexes)
  const aId = s.createArea('Brush Test Area', 'passage');
  const paintedArea = s.paintArea(center.x, center.y, aId, 'passage', 1);
  assert.equal(paintedArea, true);

  const disk1 = AntGame.hexDisk(center.x, center.y, 1);
  assert.equal(disk1.length, 7);
  for (const p of disk1) {
    const cell = s.world.peek(p.x, p.y);
    assert.equal(cell.area?.id, aId, `Hex ${p.x},${p.y} has area`);
  }
  // Hexes at radius 2 should NOT have the area yet
  const ring2 = AntGame.hexDisk(center.x, center.y, 2).filter(p => AntGame.hexDistance(center, p) === 2);
  assert.equal(ring2.length, 12);
  for (const p of ring2) {
    const cell = s.world.peek(p.x, p.y);
    assert.equal(cell.area, undefined);
  }

  // 2. Paint Area with radius = 2 (19 hexes)
  s.paintArea(center.x, center.y, aId, 'passage', 2);
  for (const p of ring2) {
    const cell = s.world.peek(p.x, p.y);
    assert.equal(cell.area?.id, aId);
  }

  // 3. Paint Behavioral Zone with radius = 1 (7 hexes)
  const zId = s.createZone('Brush Test Zone', 'foraging');
  const zoneRes = s.paintZone(center.x, center.y, zId, 'foraging', {}, 1);
  assert.equal(zoneRes.ok, true);
  assert.equal(zoneRes.count, 7);
  for (const p of disk1) {
    assert.equal(s.isHexInZone(p.x, p.y, zId), true);
  }
  for (const p of ring2) {
    assert.equal(s.isHexInZone(p.x, p.y, zId), false);
  }

  // 4. Paint Excavation Zone with radius = 1 on solid dirt
  const exCenter = { x: s.nest.x - 6, y: s.nest.y - 6 };
  for (const p of AntGame.hexDisk(exCenter.x, exCenter.y, 1)) {
    const c = s.world.get(p.x, p.y);
    c.discovered = true;
    c.solid = true;
    c.rock = false;
  }
  const exId = s.createZone('Quarry Sector', 'excavation');
  const exRes = s.paintZone(exCenter.x, exCenter.y, exId, 'excavation', {}, 1);
  assert.equal(exRes.ok, true);
  assert.equal(exRes.count, 7);
  for (const p of AntGame.hexDisk(exCenter.x, exCenter.y, 1)) {
    assert.equal(s.isHexInZone(p.x, p.y, exId), true);
    assert.ok(s.jobs.some(j => j.id === `1:dig:${p.x},${p.y}`), 'Solid dirt in brush radius auto-designated for dig');
  }
});

test('Group tool drag box selects all living colony ants in the dragged area', () => {
  const s = new Simulation(2013);
  const r = new Renderer({ getBoundingClientRect: () => ({ width: 800, height: 600 }), getContext: () => ({}) });

  // Add 3 colony ants at distinct positions away from the nest
  const cx = s.nest.x + 20, cy = s.nest.y + 20;
  const w1 = s.addAnt('worker', cx + 1, cy);
  const w2 = s.addAnt('soldier', cx + 2, cy + 1);
  const w3 = s.addAnt('major', cx + 1, cy + 2);
  // Add 1 distant ant outside the area
  const wOut = s.addAnt('worker', cx + 15, cy + 15);
  // Add 1 enemy ant in the area
  const enemy = s.addAnt('worker', cx + 2, cy);
  enemy.colonyId = 2;

  // Calculate screen positions of the 3 cluster ants
  const p1 = r.screen(w1.x, w1.y);
  const p2 = r.screen(w2.x, w2.y);
  const p3 = r.screen(w3.x, w3.y);

  // Form a bounding box encompassing p1, p2, p3 with margin
  const minX = Math.min(p1.x, p2.x, p3.x) - 10;
  const maxX = Math.max(p1.x, p2.x, p3.x) + 10;
  const minY = Math.min(p1.y, p2.y, p3.y) - 10;
  const maxY = Math.max(p1.y, p2.y, p3.y) + 10;
  const b = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };

  // Check selection filter logic:
  const z = r.camera.zoom || 1;
  const cellSize = AntGame.Config.cellSize * z;
  const selected = s.ants.filter(a => a.alive && a.colonyId === 1).filter(a => {
    const rad = Math.max(10, (a.type === 'queen' ? 18 : a.type === 'supermajor' ? 14 : a.type === 'major' ? 12 : 9) * (z / 2.4));
    const q = r.screen(a.x, a.y);
    if (q.x + rad >= b.x && q.x - rad <= b.x + b.w && q.y + rad >= b.y && q.y - rad <= b.y + b.h) return true;
    const hPos = r.screen(Math.round(a.x), Math.round(a.y));
    if (hPos.x + cellSize >= b.x && hPos.x - cellSize <= b.x + b.w && hPos.y + cellSize >= b.y && hPos.y - cellSize <= b.y + b.h) return true;
    return false;
  });

  const selectedIds = selected.map(a => a.id);
  assert.ok(selectedIds.includes(w1.id), 'w1 is selected');
  assert.ok(selectedIds.includes(w2.id), 'w2 is selected');
  assert.ok(selectedIds.includes(w3.id), 'w3 is selected');
  assert.ok(!selectedIds.includes(wOut.id), 'distant wOut is NOT selected');
  assert.ok(!selectedIds.includes(enemy.id), 'enemy ant is NOT selected');
  assert.equal(selected.length, 3);
});


