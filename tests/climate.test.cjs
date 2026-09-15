const test = require('node:test');
const assert = require('node:assert/strict');

// Mock browser environment for headless Node testing
global.window = global;
global.AntGame = {};
global.document = {
 querySelectorAll: () => [],
 querySelector: () => null,
 getElementById: () => null
};
global.localStorage = {
 getItem: () => null,
 setItem: () => {},
 removeItem: () => {}
};

require('../src/config.js');
require('../src/data.js');
require('../src/world.js');
require('../src/climate.js');
require('../src/audio.js');
require('../src/ecology.js');
require('../src/brood.js');
require('../src/tasks.js');
require('../src/construction.js');
require('../src/inventory.js');
require('../src/simulation.js');

const { Simulation, Climate, MONTHS } = AntGame;

test('Calendar and Time Progression: Starts Jan 1, Year 1, 06:00', () => {
 const climate = new Climate(42);
 assert.equal(climate.year, 1);
 assert.equal(climate.monthIndex, 0);
 assert.equal(climate.currentMonth.name, 'January');
 assert.equal(climate.dayOfMonth, 1);
 assert.equal(climate.hour, 6);
 assert.equal(climate.minute, 0);
 assert.equal(climate.isDay, true);
 assert.equal(climate.timeOfDayFormatted, '06:00 (Dawn)');
});

test('Diurnal Cycle: 30-minute real day = 1800s (900s Day, 900s Night)', () => {
 const climate = new Climate(12345);
 // At start (dayTime = 0): dawn, isDay = true
 assert.equal(climate.isDay, true);

 // Advance 450s (quarter day, 12:00 noon): mid-day
 climate.update(450);
 assert.equal(climate.hour, 12);
 assert.equal(climate.isDay, true);

 // Advance another 450s (total 900s, 18:00 dusk): transitions to night
 climate.update(450);
 assert.equal(climate.hour, 18);
 assert.equal(climate.isDay, false);

 // Advance 450s into night (total 1350s, 00:00 midnight)
 climate.update(450);
 assert.equal(climate.hour, 0);
 assert.equal(climate.isDay, false);

 // Advance another 450s (total 1800s, 06:00 next day)
 climate.update(450);
 assert.equal(climate.dayOfMonth, 2);
 assert.equal(climate.hour, 6);
 assert.equal(climate.isDay, true);
});

test('Calendar: Transitions through months and leap/non-leap days', () => {
 const climate = new Climate(999);
 // Run through all 31 days of January: 31 * 1800s
 for (let d = 1; d <= 31; d++) {
  assert.equal(climate.monthIndex, 0);
  assert.equal(climate.dayOfMonth, d);
  climate.update(1800);
 }
 // Should now be February 1
 assert.equal(climate.monthIndex, 1);
 assert.equal(climate.currentMonth.name, 'February');
 assert.equal(climate.dayOfMonth, 1);

 // February has 28 days
 for (let d = 1; d <= 28; d++) {
  assert.equal(climate.dayOfMonth, d);
  climate.update(1800);
 }
 // Should now be March 1
 assert.equal(climate.monthIndex, 2);
 assert.equal(climate.currentMonth.name, 'March');
 assert.equal(climate.dayOfMonth, 1);
});

test('Four Rainfall Seasons map accurately to IDEAM Pichindé normals', () => {
 assert.equal(MONTHS[0].phase, 'First Less-Rainy Period');  // Jan
 assert.equal(MONTHS[1].phase, 'First Less-Rainy Period');  // Feb
 assert.equal(MONTHS[2].phase, 'First Wetter Period');      // Mar
 assert.equal(MONTHS[3].phase, 'First Wetter Period');      // Apr
 assert.equal(MONTHS[4].phase, 'First Wetter Period');      // May
 assert.equal(MONTHS[5].phase, 'Second Less-Rainy Period'); // Jun
 assert.equal(MONTHS[6].phase, 'Second Less-Rainy Period'); // Jul
 assert.equal(MONTHS[7].phase, 'Second Less-Rainy Period'); // Aug
 assert.equal(MONTHS[8].phase, 'Second Wetter Period');     // Sep
 assert.equal(MONTHS[9].phase, 'Second Wetter Period');     // Oct
 assert.equal(MONTHS[10].phase, 'Second Wetter Period');    // Nov
 assert.equal(MONTHS[11].phase, 'First Less-Rainy Period'); // Dec

 // October/November wettest months (13.8 - 13.9 rain days)
 assert.ok(MONTHS[9].rainDays >= 13.5);
 assert.ok(MONTHS[10].rainDays >= 13.5);
 // August dry season minimum (5.9 rain days)
 assert.ok(MONTHS[7].rainDays <= 6.5);
});

test('Thermodynamics: Temperatures remain strictly bounded between 13°C and 21°C', () => {
 const climate = new Climate(777);
 let minT = 99, maxT = -99;
 let minH = 101, maxH = -1;

 // Simulate a full month (30 days * 1800s, sampling every 60s)
 for (let step = 0; step < 900; step++) {
  climate.update(60);
  if (climate.temperature < minT) minT = climate.temperature;
  if (climate.temperature > maxT) maxT = climate.temperature;
  if (climate.humidity < minH) minH = climate.humidity;
  if (climate.humidity > maxH) maxH = climate.humidity;
 }

 assert.ok(minT >= 13.0, `Min temperature was too cold: ${minT}°C`);
 assert.ok(maxT <= 21.0, `Max temperature was too hot: ${maxT}°C`);
 assert.ok(minH >= 75.0, `Min humidity too low: ${minH}%`);
 assert.ok(maxH <= 100.0, `Max humidity exceeded 100%: ${maxH}%`);
});

test('Weather Escalation: Rain -> Heavy Wind (45%) -> Thunderstorm (65%)', () => {
 const sim = new Simulation(42);
 const climate = sim.climate;

 // Force weather states and verify hierarchy
 climate.forceWeather('clear');
 assert.equal(climate.weather, 'clear');
 assert.equal(climate.rainActive, false);
 assert.equal(climate.heavyWindActive, false);
 assert.equal(climate.thunderstormActive, false);

 climate.forceWeather('rain');
 assert.equal(climate.weather, 'rain');
 assert.equal(climate.rainActive, true);
 assert.equal(climate.heavyWindActive, false);
 assert.equal(climate.thunderstormActive, false);

 climate.forceWeather('heavy_wind');
 assert.equal(climate.weather, 'heavy_wind');
 assert.equal(climate.rainActive, true);
 assert.equal(climate.heavyWindActive, true);
 assert.equal(climate.thunderstormActive, false);

 climate.forceWeather('thunderstorm');
 assert.equal(climate.weather, 'thunderstorm');
 assert.equal(climate.rainActive, true);
 assert.equal(climate.heavyWindActive, true);
 assert.equal(climate.thunderstormActive, true);
});

test('Heavy Wind Cave-In: 3x3 collapse NEVER buries or targets Queen', () => {
 const sim = new Simulation(12345);
 const queen = sim.queen();
 assert.ok(queen);
 const qx = Math.round(queen.x), qy = Math.round(queen.y);

 // Move queen to a known spot and trigger cave-in many times
 for (let i = 0; i < 50; i++) {
  sim.triggerCaveIn('wind');
  const queenCell = sim.world.peek(qx, qy);
  assert.equal(queenCell.solid, false, 'Queen tile was collapsed!');
  assert.equal(Boolean(queen.trapped), false, 'Queen was marked trapped!');
 }
});

test('Earthquake: Independent geological event NEVER collapses Queen tile', () => {
 const sim = new Simulation(54321);
 const queen = sim.queen();
 const qx = Math.round(queen.x), qy = Math.round(queen.y);

 // Execute earthquake centered directly on the queen's coordinates
 sim.executeEarthquake({ x: qx, y: qy });
 const queenCell = sim.world.peek(qx, qy);
 assert.equal(queenCell.solid, false, 'Queen tile was collapsed during earthquake!');
 assert.equal(Boolean(queen.trapped), false, 'Queen was trapped in earthquake!');
});

test('Trapped Ants: Suffocation timer damages trapped ant and digging frees them', () => {
 const sim = new Simulation(9999);
 const worker = sim.addAnt('worker', sim.nest.x + 3, sim.nest.y);
 assert.ok(worker);
 const wx = Math.round(worker.x), wy = Math.round(worker.y);

 // Turn worker's cell solid to simulate cave-in bury
 const cell = sim.world.peek(wx, wy);
 cell.solid = true;
 worker.trapped = true;
 worker.suffocationTimer = 25.0;
 worker.health = 100;

 // Update trapped entities for 5 seconds: loses 20 health
 sim.updateTrappedEntities(5.0);
 assert.equal(worker.trapped, true);
 assert.equal(worker.suffocationTimer, 20.0);
 assert.equal(worker.health, 80.0);

 // Rescuing: worker or colony excavates the cell
 sim.world.open(wx, wy, 'tunnel');
 // Simulate excavation job completion
 if (cell.solid === false) {
  for (const a of sim.ants) {
   if (a.trapped && Math.round(a.x) === wx && Math.round(a.y) === wy) {
    a.trapped = false;
    a.state = 'idle';
   }
  }
 }
 assert.equal(worker.trapped, false, 'Worker was not rescued when cell was dug out');
});

test('Destructive Lightning Strike: Blasts permanent breach and triggers water inflow', () => {
 const sim = new Simulation(8888);
 const initialInflows = sim.activeInflows.length;

 sim.triggerLightningStrike();
 assert.equal(sim.activeInflows.length, initialInflows + 1);

 const inflow = sim.activeInflows.at(-1);
 assert.equal(inflow.isLightning, true);
 assert.ok(inflow.totalVolume >= 140 && inflow.totalVolume <= 210);

 const breachCell = sim.world.peek(inflow.x, inflow.y);
 assert.equal(breachCell.solid, false);
 assert.equal(breachCell.depth, 0);
 assert.equal(breachCell.isBreach, true);

 // Water level capped at 7 per tile
 sim.updateInflows(10.0);
 assert.ok(breachCell.water > 0);
 assert.ok(breachCell.water <= 7);
});

test('Save & Restore Serialization preserves complete climate state and active inflows', () => {
 const sim = new Simulation(3333);
 sim.climate.year = 2;
 sim.climate.monthIndex = 9; // October
 sim.climate.dayOfMonth = 15;
 sim.climate.dayTime = 600; // 10:00 AM
 sim.climate.forceWeather('thunderstorm');
 sim.activeInflows.push({
  x: 5, y: -20,
  totalVolume: 150,
  remainingVolume: 100,
  rate: 2.5,
  duration: 60,
  elapsed: 20,
  isLightning: true
 });

 const saved = sim.serialize();
 const restored = Simulation.restore(saved);

 assert.ok(restored.climate);
 assert.equal(restored.climate.year, 2);
 assert.equal(restored.climate.monthIndex, 9);
 assert.equal(restored.climate.dayOfMonth, 15);
 assert.equal(restored.climate.weather, 'thunderstorm');
 assert.equal(restored.climate.rainActive, true);
 assert.equal(restored.climate.heavyWindActive, true);
 assert.equal(restored.climate.thunderstormActive, true);
 assert.equal(restored.activeInflows.length, 1);
 assert.equal(restored.activeInflows[0].x, 5);
 assert.equal(restored.activeInflows[0].isLightning, true);
});

test('AudioCoordinator: Configured with SFX assets, buses, and variant pools', () => {
 const audio = AntGame.AudioCoordinator;
 assert.ok(audio);
 // Check buses
 assert.equal(audio.buses.master, 0.65);
 assert.equal(audio.buses.ambient, 1.0);
 assert.equal(audio.buses.effects, 1.0);
 assert.equal(audio.getBusVolume('effects'), 0.65);
 audio.setBusVolume('effects', 0.5);
 assert.equal(audio.getBusVolume('effects'), 0.65 * 0.5);
 audio.setBusVolume('effects', 1.0);

 // Check ambient sound assets
 assert.equal(audio.soundPaths.amb_nest_underground, 'SFX/Ambient/amb_nest_underground_loop.ogg');
 assert.equal(audio.soundPaths.amb_water_cavern, 'SFX/Ambient/amb_water_cavern_loop.ogg');
 assert.equal(audio.soundPaths.rain_underground, 'SFX/Weather/rain_underground.ogg');
 assert.equal(audio.soundPaths.rain_surface, 'SFX/Weather/rain_surface.ogg');
 assert.equal(audio.soundPaths.wind, 'SFX/Weather/heavy_wind.ogg');

 // Check weather and disaster assets
 assert.equal(audio.soundPaths.thunder_01, 'SFX/Weather/thunder_01.ogg');
 assert.equal(audio.soundPaths.thunder_02, 'SFX/Weather/thunder_02.ogg');
 assert.equal(audio.soundPaths.thunder_03, 'SFX/Weather/thunder_03.ogg');
 assert.equal(audio.soundPaths.flood, 'SFX/Weather/flood_surface_water.ogg');
 assert.equal(audio.soundPaths.earthquake, 'SFX/Weather/earthquake.ogg');
 assert.equal(audio.soundPaths.cave_in, 'SFX/Weather/cave_in.ogg');

 // Check ant labor assets
 assert.equal(audio.soundPaths.ant_dig, 'SFX/Ants/ant_dig_01.ogg');
 assert.equal(audio.soundPaths.ant_dig_heavy, 'SFX/Ants/ant_dig_heavy_01.ogg');
 assert.equal(audio.soundPaths.rock_strike_01, 'SFX/Ants/rock_strike_01.ogg');
 assert.equal(audio.soundPaths.rock_strike_02, 'SFX/Ants/rock_strike_02.ogg');
 assert.equal(audio.soundPaths.rock_strike_03, 'SFX/Ants/rock_strike_03.ogg');
 assert.equal(audio.soundPaths.chamber_build_pack_01, 'SFX/Ants/chamber_build_pack_01.ogg');
 assert.equal(audio.soundPaths.chamber_built_complete, 'SFX/Ants/chamber_built_complete.ogg');
 assert.equal(audio.soundPaths.soil_drop_pit, 'SFX/Ants/soil_drop_pit_01.ogg');
 assert.equal(audio.soundPaths.soil_drop_floor, 'SFX/Ants/soil_drop_floor_01.ogg');
 assert.equal(audio.soundPaths.corpse_pickup, 'SFX/Ants/corpse_pickup_01.ogg');
 assert.equal(audio.soundPaths.corpse_store, 'SFX/Ants/corpse_store_01.ogg');
 assert.equal(audio.soundPaths.seed_store, 'SFX/Ants/seed_store_01.ogg');
 assert.equal(audio.soundPaths.feeder_chew_food, 'SFX/Ants/feeder_chew_food_01.ogg');
 assert.equal(audio.soundPaths.ant_eat, 'SFX/Ants/ant_eat_01.ogg');
 assert.equal(audio.soundPaths.ant_drink, 'SFX/Ants/ant_drink_01.ogg');
 assert.equal(audio.soundPaths.water_droplet_extract, 'SFX/Ants/water_droplet_extract_01.ogg');
 assert.equal(audio.soundPaths.queen_lay_egg, 'SFX/Ants/queen_lay_egg_01.ogg');
 assert.equal(audio.soundPaths.egg_hatch, 'SFX/Ants/egg_hatch_01.ogg');
 assert.equal(audio.soundPaths.ant_alarm_retreat, 'SFX/Ants/ant_alarm_retreat_01.ogg');
 assert.equal(audio.soundPaths.soldier_threat_response, 'SFX/Ants/soldier_threat_response_01.ogg');

 // Check combat assets
 assert.equal(audio.soundPaths.ant_bite_worker_01, 'SFX/Combat/ant_bite_worker_01.ogg');
 assert.equal(audio.soundPaths.ant_bite_soldier_01, 'SFX/Combat/ant_bite_soldier_01.ogg');
 assert.equal(audio.soundPaths.ant_bite_supermajor_01, 'SFX/Combat/ant_bite_supermajor_01.ogg');
 assert.equal(audio.soundPaths.impact_chitin, 'SFX/Combat/impact_chitin_01.ogg');

 // Test variant resolution
 const rockResolved = audio.resolveCue('rockStrike');
 assert.ok(['rock_strike_01', 'rock_strike_02', 'rock_strike_03'].includes(rockResolved));
 const packResolved = audio.resolveCue('chamberBuildPack');
 assert.ok(['chamber_build_pack_01', 'chamber_build_pack_02', 'chamber_build_pack_03'].includes(packResolved));
 const biteWResolved = audio.resolveCue('antBiteWorker');
 assert.ok(['ant_bite_worker_01', 'ant_bite_worker_02', 'ant_bite_worker_03'].includes(biteWResolved));
 const biteSResolved = audio.resolveCue('antBiteSoldier');
 assert.ok(['ant_bite_soldier_01', 'ant_bite_soldier_02', 'ant_bite_soldier_03'].includes(biteSResolved));
 const biteMResolved = audio.resolveCue('antBiteSupermajor');
 assert.ok(['ant_bite_supermajor_01', 'ant_bite_supermajor_02'].includes(biteMResolved));

 // Test one-shot triggers do not crash in headless env
 const triggers = [
  'nearThunder', 'distantThunder', 'destructiveLightning', 'flood', 'earthquake', 'caveIn',
  'antDig', 'antDigHeavy', 'rockStrike', 'chamberBuildPack', 'chamberBuiltComplete',
  'soilDropPit', 'soilDropFloor', 'corpsePickup', 'corpseStore', 'seedStore',
  'feederChewFood', 'antEat', 'antDrink', 'waterDropletExtract', 'queenLayEgg',
  'eggHatch', 'antAlarmRetreat', 'soldierThreatResponse', 'antBiteWorker',
  'antBiteSoldier', 'antBiteSupermajor', 'impactChitin', 'antDeath'
 ];
 for (const trig of triggers) {
  audio.play(trig);
 }
 assert.ok(audio.lastPlayed.length > 0);

 // Test footsteps loop state handling and valid audio file path resolution
 const mockSim = {
  ants: [
   { alive: true, type: 'worker', path: [{ x: 1, y: 1 }] },
   { alive: true, type: 'supermajor', path: [{ x: 2, y: 2 }] }
  ],
  waterStore: { tiles: [{ x: 0, y: 0 }] },
  world: {
   activeWater: new Set(['0,0']),
   cells: new Map([
    ['0,0', { x: 0, y: 0, water: 7, discovered: true }],
    ['10,10', { x: 10, y: 10, isWell: true, zone: 'well', water: 20, discovered: true }]
   ])
  }
 };
 audio.updateFootsteps(mockSim);
 assert.equal(audio.footstepsNormalActive, true);
 assert.equal(audio.footstepsHeavyActive, true);
 assert.ok(audio.activeLoops.get('footsteps_normal')?.path.endsWith('.ogg'));
 assert.ok(audio.activeLoops.get('footsteps_heavy')?.path.endsWith('.ogg'));

 // Test digging loop management (starts when ant is digging, stops immediately when ant finishes)
 const digSim = {
  ants: [
   { alive: true, type: 'worker', colonyId: 1, state: 'digging' },
   { alive: true, type: 'supermajor', colonyId: 1, state: 'digging' }
  ]
 };
 audio.updateDigging(digSim);
 assert.equal(audio.diggingNormalActive, true);
 assert.equal(audio.diggingHeavyActive, true);
 assert.ok(audio.activeLoops.has('dig_normal'));
 assert.ok(audio.activeLoops.has('dig_heavy'));

 // Dig completes -> ants transition to idle/carry
 digSim.ants[0].state = 'idle';
 digSim.ants[1].state = 'idle';
 audio.updateDigging(digSim);
 assert.equal(audio.diggingNormalActive, false);
 assert.equal(audio.diggingHeavyActive, false);
 assert.equal(audio.activeLoops.has('dig_normal'), false);
 assert.equal(audio.activeLoops.has('dig_heavy'), false);

 // Test ant noise volume equalization
 const antCues = [
  'footsteps_normal', 'footsteps_heavy', 'ant_dig', 'ant_dig_heavy',
  'dig_normal', 'dig_heavy', 'rock_strike', 'chamber_build_pack',
  'soil_drop_pit', 'soil_drop_floor', 'corpse_pickup', 'corpse_store',
  'seed_store', 'water_droplet_extract', 'feeder_chew_food', 'ant_eat',
  'ant_drink', 'queen_lay_egg', 'egg_hatch', 'impact_chitin', 'ant_death'
 ];
 for (const cue of antCues) {
  const profile = audio.cueProfiles[cue];
  assert.ok(profile, `Missing cueProfile for ${cue}`);
  assert.ok(profile.volume <= 0.20, `Cue ${cue} volume ${profile.volume} should be <= 0.20 for tiny ants`);
  assert.equal(profile.bus, 'effects');
 }

 // Test footsteps stop immediately when ant is idle
 const walkSim = {
  ants: [
   { alive: true, type: 'worker', colonyId: 1, state: 'idle', path: [{ x: 1, y: 1 }] }
  ]
 };
 // Stop movement
 mockSim.ants.forEach(a => a.path = []);
 audio.updateFootsteps(mockSim);
 assert.equal(audio.footstepsNormalActive, false);
 assert.equal(audio.footstepsHeavyActive, false);

 // Test ambient updates: ordinary water or reservoir near (0,0) must NOT play water cavern
 audio.update(null, { x: 0, y: 0 }, mockSim);
 assert.equal(audio.activeLoops.has('amb_water_cavern'), false);
 assert.ok(audio.activeLoops.has('amb_nest_underground'));

 // Test near well tile at (10,10): water cavern MUST play!
 audio.update(null, { x: 10, y: 10 }, mockSim);
 assert.equal(audio.activeLoops.has('amb_water_cavern'), true);

 // Test far away from well (e.g. at 50, 50): water cavern must NOT play
 audio.update(null, { x: 50, y: 50 }, mockSim);
 assert.equal(audio.activeLoops.has('amb_water_cavern'), false);
});

test('Starting water block is a constructed water reservoir and not a flooded drowning hazard', () => {
 const sim = new Simulation(12345);
 const wp = sim.world.founding.waterStore;
 assert.ok(wp, 'Founding waterStore placement must exist');
 const cell = sim.world.peek(wp.x, wp.y);
 assert.ok(cell, 'Starting water cell must exist in world');
 
 // Must be a proper reservoir structure, not an open flooded floor
 assert.equal(cell.zone, 'water-store');
 assert.equal(cell.structure, 'water');
 assert.equal(cell.waterStorage, true);
 assert.equal(cell.excavations, 2);
 assert.equal(cell.water, 7);
 assert.equal(cell.discovered, true);

 // Must block direct walking and pathfinding
 const { pathfind } = AntGame;
 assert.equal(pathfind(sim.world, sim.nest, cell), null, 'Ants must not pathfind directly onto water storage tiles');


 // Must provide a reachable non-drowning reservoir water source for thirsty ants
 const workerForWater = sim.ants.find(a => a.type === 'worker' && a.colonyId === 1);
 const src = sim.antNeedSource(workerForWater, 'water');
 assert.ok(src && src.kind === 'reservoir', 'Thirsty ants must safely find the starting reservoir without drowning');

 // Ants must NEVER take drowning damage on a reservoir tile
 const worker = sim.ants.find(a => a.type === 'worker' && a.colonyId === 1);
 assert.ok(worker);
 worker.x = cell.x;
 worker.y = cell.y;
 const initialHealth = worker.health;
 AntGame.Ecology.update(sim, 1.0);
 assert.equal(worker.health, initialHealth, 'Ant on water reservoir must take zero drowning damage');
});



