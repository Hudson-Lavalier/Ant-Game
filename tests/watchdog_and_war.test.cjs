const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.window = globalThis;
const modules = [
 'config', 'data', 'world', 'brood', 'tasks', 'construction',
 'inventory', 'ecology', 'climate', 'audio', 'telemetry',
 'watchdog', 'war_scenario', 'simulation'
];
for (const m of modules) {
 require('../src/' + m + '.js');
}

const { Simulation, Ecology, TelemetryEngine, Watchdog, WarScenario } = AntGame;

test('telemetry accurately records kill attribution, cause, and damage tracking', () => {
 const sim = new Simulation(3001);
 sim.telemetry = new TelemetryEngine(sim);

 const soldier1 = sim.addAnt('soldier', 10, 10, 1);
 const enemyWorker = sim.addAnt('worker', 10, 11, 2);
 enemyWorker.health = 15;

 // Record damage
 sim.telemetry.recordDamage(soldier1, enemyWorker, 15);
 assert.equal(sim.telemetry.getColonyStats(1).damageDealt, 15);
 assert.equal(sim.telemetry.getColonyStats(2).damageReceived, 15);

 // Kill attribution
 enemyWorker.lastAttackerEntity = soldier1;
 sim.kill(enemyWorker, soldier1, 'combat');

 assert.equal(sim.telemetry.kills.length, 1);
 const record = sim.telemetry.kills[0];
 assert.equal(record.killerId, soldier1.id);
 assert.equal(record.killerColony, 1);
 assert.equal(record.victimId, enemyWorker.id);
 assert.equal(record.victimColony, 2);
 assert.equal(record.cause, 'combat');
 assert.equal(sim.telemetry.getColonyStats(1).kills, 1);
 assert.equal(sim.telemetry.getColonyStats(2).losses, 1);
});

test('ant death cleans up dangling brood feed locks and target reservations', () => {
 const sim = new Simulation(3002);
 const worker = sim.addAnt('worker', 12, 12, 1);

 // Create an egg locked by this worker
 const egg = { id: 999, x: 12, y: 13, stage: 'larva', beingFedBy: worker.id, beingTransportedBy: worker.id, colonyId: 1 };
 sim.eggs.push(egg);

 // Create a creature reserved by this worker
 const spider = Ecology.spawnCreature(sim, 'spider', 14, 14, { alive: false, food: 200 });
 spider.reservedFor = worker.id;
 spider.processingFeederId = worker.id;
 sim.creatures.push(spider);

 // Worker dies
 sim.kill(worker, null, 'starvation');

 // Assert all dangling references were cleanly purged
 assert.equal(egg.beingFedBy, null, 'Dangling egg beingFedBy must be cleared upon worker death');
 assert.equal(egg.beingTransportedBy, null, 'Dangling egg beingTransportedBy must be cleared upon worker death');
 assert.equal(spider.reservedFor, null, 'Dangling creature reservedFor must be cleared upon worker death');
 assert.equal(spider.processingFeederId, null, 'Dangling creature processingFeederId must be cleared upon worker death');
});

test('watchdog detects task thrashing loop and automatically recovers ant', () => {
 const sim = new Simulation(3003);
 sim.watchdog = new Watchdog(sim, { policy: 'recover' });
 const worker = sim.addAnt('worker', 15, 15, 1);

 // Simulate rapid state thrashing: digging <-> to-carry 6 times in 1 second
 for (let i = 0; i < 6; i++) {
  worker.state = i % 2 === 0 ? 'digging' : 'to-carry';
  sim.time += 0.2;
  worker._recentStates = worker._recentStates || [];
  worker._recentStates.push({ state: worker.state, time: sim.time });
 }

 sim.watchdog.checkAnts(0.5);

 const thrashIncident = sim.watchdog.incidents.find(inc => inc.type === 'TASK_THRASHING');
 assert.ok(thrashIncident, 'Watchdog must flag TASK_THRASHING incident');
 assert.equal(thrashIncident.entityId, worker.id);
 assert.equal(thrashIncident.recovered, true, 'Ant must be recovered to idle');
 assert.equal(worker.state, 'idle', 'Worker state must be reset to idle');
});

test('watchdog detects path ping-pong oscillation loop and automatically recovers ant', () => {
 const sim = new Simulation(3004);
 sim.watchdog = new Watchdog(sim, { policy: 'recover' });
 const worker = sim.addAnt('worker', 20, 20, 1);

 // Simulate 2-hex oscillation: '20,20' <-> '21,20' 6 times
 worker._recentHexes = ['20,20', '21,20', '20,20', '21,20', '20,20', '21,20'];
 worker.path = [{ x: 20, y: 20 }];
 worker.state = 'moving';

 sim.watchdog.checkAnts(0.5);

 const oscIncident = sim.watchdog.incidents.find(inc => inc.type === 'PATH_OSCILLATION');
 assert.ok(oscIncident, 'Watchdog must flag PATH_OSCILLATION incident');
 assert.equal(oscIncident.entityId, worker.id);
 assert.equal(worker.state, 'idle', 'Oscillating ant must be reset to idle');
 assert.equal(worker.path.length, 0, 'Path must be cleared on recovery');
});

test('watchdog detects state deadlock and stalls', () => {
 const sim = new Simulation(3005);
 sim.watchdog = new Watchdog(sim, { policy: 'recover' });
 const worker = sim.addAnt('worker', 25, 25, 1);
 worker.state = 'digging';
 worker._lastState = 'digging';
 worker._stateDuration = 26.0; // exceeds 25s threshold

 sim.watchdog.checkAnts(0.5);

 const stallIncident = sim.watchdog.incidents.find(inc => inc.type === 'STATE_DEADLOCK');
 assert.ok(stallIncident, 'Watchdog must flag STATE_DEADLOCK incident');
 assert.equal(stallIncident.entityId, worker.id);
 assert.equal(worker.state, 'idle', 'Deadlocked ant must be reset to idle');
});

test('watchdog detects numerical corruption anomalies', () => {
 const sim = new Simulation(3006);
 sim.watchdog = new Watchdog(sim, { policy: 'recover' });
 const worker = sim.addAnt('worker', 30, 30, 1);
 worker.x = NaN;

 sim.watchdog.checkAnts(0.5);

 const nanIncident = sim.watchdog.incidents.find(inc => inc.type === 'NUMERICAL_CORRUPTION');
 assert.ok(nanIncident, 'Watchdog must catch NaN coordinates');
 assert.equal(nanIncident.severity, 'critical');
});

test('war scenario creates balanced duel arena and runs headlessly with full report', () => {
 const sim = WarScenario.createDuel(101, {
  distance: 30,
  startingFood: 200,
  startingWater: 200,
  soldiers: 4,
  workers: 6,
  majors: 1
 });

 assert.ok(sim.telemetry, 'Telemetry must be initialized');
 assert.ok(sim.watchdog, 'Watchdog must be initialized');
 assert.equal(sim.livingPopulation(1), 12);
 assert.equal(sim.livingPopulation(2), 12);
 assert.ok(sim.queen(1)?.alive);
 assert.ok(sim.queen(2)?.alive);

 const result = WarScenario.runHeadless(sim, 300, 0.2);
 assert.ok(result.totalTicksSimulated > 0);
 assert.ok(result.telemetry);
 assert.ok(result.watchdog);
 assert.equal(typeof result.telemetry.totalKills, 'number');
 assert.equal(typeof result.watchdog.totalIncidents, 'number');
});

test('telemetry tracks food eaten, water drank, and dirt mined for both colonies', () => {
 const sim = WarScenario.createDuel(202, {
  distance: 35,
  startingFood: 250,
  startingWater: 250,
  initialAntFoodRatio: 0.3,
  initialAntWaterRatio: 0.3,
  antFoodNeedRatio: 0.5,
  antWaterNeedRatio: 0.5
 });

 for (let t = 0; t < 200; t++) {
  sim.update(0.2);
 }

 const rep = sim.telemetry.getReport();
 assert.ok(rep.colonies.colony1.waterDrank > 0 || rep.colonies.colony1.foodEaten > 0, 'Colony 1 should have consumed water or food');
 assert.ok(rep.colonies.colony2.waterDrank > 0 || rep.colonies.colony2.foodEaten > 0, 'Colony 2 should have consumed water or food');
 assert.ok(rep.colonies.colony1.dirtMined > 0, 'Colony 1 should autonomously mine dirt in spectator mode');
 assert.ok(rep.colonies.colony2.dirtMined > 0, 'Colony 2 should autonomously mine dirt');
});

test('telemetry tracks full food/water accounting ledgers, creature kills by species, and seeds gathered', () => {
 const sim = new Simulation(4001);
 sim.telemetry = new TelemetryEngine(sim);

 // Initial ledger setup
 sim.telemetry.setStartingStores(1, 1000, 1000);
 sim.telemetry.setStartingStores(2, 800, 800);

 const c1Stats = sim.telemetry.getColonyStats(1);
 assert.equal(c1Stats.foodGains.starting, 1000);
 assert.equal(c1Stats.foodGains.totalGained, 1000);
 assert.equal(c1Stats.waterGains.starting, 1000);

 // Test non-ant creature kill
 const soldier1 = sim.addAnt('soldier', 5, 5, 1);
 const spider = Ecology.spawnCreature(sim, 'spider', 5, 6, { alive: false, food: 100 });
 sim.telemetry.recordCreatureKill(soldier1, spider);

 assert.equal(c1Stats.creaturesKilled, 1);
 assert.equal(c1Stats.creatureKillsBySpecies.spider, 1);

 // Test seed gathering and food/water loss accounting
 const worker1 = sim.addAnt('worker', 6, 6, 1);
 const seed = { id: 888, remaining: 50 };
 sim.telemetry.recordSeedGathered(worker1, seed);
 sim.telemetry.recordFoodGain(1, 50, 'seedsHarvested');
 sim.telemetry.recordFoodLoss(1, 20, 'queenDrain');
 sim.telemetry.recordFoodLoss(1, 10, 'eggProduction');
 sim.telemetry.recordFoodLoss(1, 5, 'larvaeFeeding');
 sim.telemetry.recordFoodLoss(1, 1, 'combatHealing');
 sim.telemetry.recordWaterLoss(1, 15, 'queenDrain');
 sim.telemetry.recordWaterLoss(1, 2, 'eggProduction');

 assert.equal(c1Stats.seedsGatheredCount, 1);
 assert.equal(c1Stats.foodGains.seedsHarvested, 50);
 assert.equal(c1Stats.foodGains.totalGained, 1050);
 assert.equal(c1Stats.foodLosses.queenDrain, 20);
 assert.equal(c1Stats.foodLosses.eggProduction, 10);
 assert.equal(c1Stats.foodLosses.larvaeFeeding, 5);
 assert.equal(c1Stats.foodLosses.combatHealing, 1);
 assert.equal(c1Stats.foodLosses.totalLost, 36);
 assert.equal(c1Stats.waterLosses.queenDrain, 15);
 assert.equal(c1Stats.waterLosses.eggProduction, 2);
 assert.equal(c1Stats.waterLosses.totalLost, 17);

 const report = sim.telemetry.getReport();
 assert.equal(report.colonies.colony1.creaturesKilled, 1);
 assert.equal(report.colonies.colony1.seedsGatheredCount, 1);
 assert.equal(report.colonies.colony1.foodGains.totalGained, 1050);
 assert.equal(report.colonies.colony1.foodLosses.totalLost, 36);
});

