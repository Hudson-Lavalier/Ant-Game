/*
 * HEADLESS WAR SCENARIO RUNNER
 * Executes automated territorial colony wars headlessly, streaming key events,
 * monitoring telemetry, and reporting all watchdog incidents.
 *
 * Usage:
 *   node scripts/run_war_scenario.cjs [seed] [ticks] [distance]
 */

globalThis.window = globalThis;
const modules = [
 'config', 'data', 'world', 'brood', 'tasks', 'construction',
 'inventory', 'ecology', 'climate', 'audio', 'telemetry',
 'watchdog', 'war_scenario', 'simulation'
];
for (const m of modules) {
 require('../src/' + m + '.js');
}

const seed = parseInt(process.argv[2] || '42', 10);
const maxTicks = parseInt(process.argv[3] || '2000', 10);
const distance = parseInt(process.argv[4] || '40', 10);
const initFoodRatio = process.argv[5] ? parseFloat(process.argv[5]) : 0.5;
const initWaterRatio = process.argv[6] ? parseFloat(process.argv[6]) : 0.5;

console.log('====================================================');
console.log(`STARTING HEADLESS WAR SCENARIO (Seed: ${seed}, Distance: ${distance})`);
console.log('Running until one colony is eliminated...');
console.log('====================================================\n');

const sim = AntGame.WarScenario.createDuel(seed, {
 distance,
 startingFood: 1500,
 startingWater: 1500,
 soldiers: 6,
 workers: 10,
 majors: 2,
 initialAntFoodRatio: initFoodRatio,
 initialAntWaterRatio: initWaterRatio,
 antFoodNeedRatio: 0.45,
 antWaterNeedRatio: 0.45
});

let lastKillsCount = 0;
let lastIncidentsCount = 0;
let step = 0;
let winner = null;
const dt = 0.2;

while (step < maxTicks) {
 step++;
 sim.update(dt);

 const q1 = sim.queen ? sim.queen(1) : null;
 const q2 = sim.queen ? sim.queen(2) : null;
 const c1Pop = sim.livingPopulation(1);
 const c2Pop = sim.livingPopulation(2);

 // Stream new kills
 while (lastKillsCount < sim.telemetry.kills.length) {
  const k = sim.telemetry.kills[lastKillsCount++];
  console.log(`[Tick ${step.toString().padStart(5, ' ')} / ${(step * dt).toFixed(1)}s] KILL: Colony ${k.killerColony || '?'} (${k.killerType || 'nature'}) defeated Colony ${k.victimColony} ${k.victimType} (#${k.victimId}) via ${k.cause} at (${k.x}, ${k.y})`);
 }

 // Stream new watchdog incidents
 while (lastIncidentsCount < sim.watchdog.incidents.length) {
  const inc = sim.watchdog.incidents[lastIncidentsCount++];
  console.log(`[Tick ${step.toString().padStart(5, ' ')} / ${(step * dt).toFixed(1)}s] WATCHDOG [${inc.severity.toUpperCase()}]: ${inc.type} on Ant #${inc.entityId} (${inc.caste}): ${JSON.stringify(inc.details)}`);
 }

 // Progress summary every 250 ticks
 if (step % 250 === 0) {
  const q1Hp = q1?.alive ? q1.health.toFixed(1) : 'DEAD';
  const q2Hp = q2?.alive ? q2.health.toFixed(1) : 'DEAD';
  console.log(`--- [Tick ${step.toString().padStart(5, ' ')} / ${(step * dt).toFixed(1)}s] Status: C1 Pop=${c1Pop} (Queen: ${q1Hp}) | C2 Pop=${c2Pop} (Queen: ${q2Hp}) | Total Kills=${sim.telemetry.kills.length} ---`);
 }

 // Check termination condition: one colony completely dies (queen dead AND population 0, or queen dead)
 if (!q1?.alive && q2?.alive) {
  winner = 'Colony 2 (Rival)';
  console.log(`\n>>> [Tick ${step} / ${(step * dt).toFixed(1)}s] COLONY 1 QUEEN SLAIN! Colony 2 claims victory! <<<`);
  break;
 }
 if (!q2?.alive && q1?.alive) {
  winner = 'Colony 1 (Player)';
  console.log(`\n>>> [Tick ${step} / ${(step * dt).toFixed(1)}s] COLONY 2 QUEEN SLAIN! Colony 1 claims victory! <<<`);
  break;
 }
 if (!q1?.alive && !q2?.alive) {
  winner = 'Mutual Destruction';
  console.log(`\n>>> [Tick ${step} / ${(step * dt).toFixed(1)}s] BOTH QUEENS PERISHED! Mutual destruction! <<<`);
  break;
 }
}

console.log('\n====================================================');
console.log('WAR SIMULATION REPORT');
console.log('====================================================');
const telRep = sim.telemetry.getReport();
const wdRep = sim.watchdog.getReport();

console.log(`Result: ${winner || telRep.winner}`);
console.log(`Ticks Executed: ${step} (${(step * dt).toFixed(1)}s in-game)`);
console.log(`Total Kills: ${telRep.totalKills}`);
console.log('\nColony 1 Final Status:');
console.log(`  Living Population: ${telRep.colonies.colony1.population}`);
console.log(`  Queen Alive: ${telRep.colonies.colony1.queenAlive} (HP: ${telRep.colonies.colony1.queenHp})`);
console.log(`  Kills: ${telRep.colonies.colony1.kills} | Losses: ${telRep.colonies.colony1.losses}`);
console.log(`  Damage Dealt: ${telRep.colonies.colony1.damageDealt} | Damage Received: ${telRep.colonies.colony1.damageReceived}`);
console.log(`  Food Eaten: ${telRep.colonies.colony1.foodEaten} | Water Drank: ${telRep.colonies.colony1.waterDrank}`);
console.log(`  Dirt Mined: ${telRep.colonies.colony1.dirtMined || 0} blocks`);

console.log('\nColony 2 Final Status:');
console.log(`  Living Population: ${telRep.colonies.colony2.population}`);
console.log(`  Queen Alive: ${telRep.colonies.colony2.queenAlive} (HP: ${telRep.colonies.colony2.queenHp})`);
console.log(`  Kills: ${telRep.colonies.colony2.kills} | Losses: ${telRep.colonies.colony2.losses}`);
console.log(`  Damage Dealt: ${telRep.colonies.colony2.damageDealt} | Damage Received: ${telRep.colonies.colony2.damageReceived}`);
console.log(`  Food Eaten: ${telRep.colonies.colony2.foodEaten} | Water Drank: ${telRep.colonies.colony2.waterDrank}`);
console.log(`  Dirt Mined: ${telRep.colonies.colony2.dirtMined || 0} blocks`);

console.log('\nWatchdog Anomaly & Glitch Audit:');
console.log(`  Total Incidents Flagged: ${wdRep.totalIncidents}`);
if (wdRep.totalIncidents > 0) {
 console.log('  Breakdown by Incident Type:');
 for (const [type, count] of Object.entries(wdRep.breakdown)) {
  console.log(`    - ${type}: ${count}`);
 }
 console.log('\n  Recent Incidents:');
 for (const inc of wdRep.recentIncidents) {
  console.log(`    [Tick ${inc.tick}] ${inc.type} (Severity: ${inc.severity}) on Ant #${inc.entityId} (${inc.caste}): ${JSON.stringify(inc.details)}`);
 }
} else {
 console.log('  Clean run! No task thrashing, path oscillations, deadlocks, or anomalies detected.');
}
console.log('====================================================\n');
