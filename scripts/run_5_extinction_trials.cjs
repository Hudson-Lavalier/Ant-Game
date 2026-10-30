/*
 * RUN 5 EXTINCTION TRIALS
 * Runs 5 independent territorial duel simulations until BOTH colonies/queens perish.
 * Logs real-time key events, tracks resources (food eaten, water drank, dirt mined),
 * and audits all watchdog glitch detections.
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

const seeds = [42, 101, 777, 1337, 2026];
const startingFood = 300;
const startingWater = 100;
const dt = 0.2;
const maxTicks = 25000;

console.log('========================================================================================');
console.log('EXECUTING 5 PROCEDURAL WORLD SIMULATION TRIALS (AUTHENTIC MAP GEN & NORMAL RESOURCES)');
console.log(`World Scope: 500+ Hex Procedural Map (100+ Creatures, Natural Features, Seed Sites)`);
console.log(`Starting Reserves: ${startingFood} Food / ${startingWater} Water (Standard In-Game Capacities)`);
console.log('Accounting: Worker Hunger, Queen Drain, Eggs, Larvae, Healing, Corpses, Seeds, Fauna');
console.log('========================================================================================\n');

const results = [];

for (let trial = 0; trial < seeds.length; trial++) {
 const seed = seeds[trial];
 console.log('----------------------------------------------------------------------------------------');
 console.log(`TRIAL ${trial + 1} OF 5 (Seed: ${seed}, 500+ Hex Procedural World)`);
 console.log('----------------------------------------------------------------------------------------');

 const sim = AntGame.WarScenario.createNormalWorld(seed, {
  chunkRadius: 5,
  colonyDistance: 40,
  startingFood,
  startingWater,
  workers: 4,
  soldiers: 1
 });

 const col2 = sim.colonies.find(c => c.id === 2) || sim.colonies.find(c => c.id === 'colony-3,0');
 const col2Id = col2 ? col2.id : 2;

 const c1StartPop = sim.livingPopulation(1);
 const c2StartPop = sim.livingPopulation(col2Id);
 let c1PeakPop = c1StartPop;
 let c2PeakPop = c2StartPop;

 let step = 0;
 let q1Death = null;
 let q2Death = null;

 while (step < maxTicks) {
  step++;
  sim.update(dt);

  const c1Pop = sim.livingPopulation(1);
  const c2Pop = sim.livingPopulation(col2Id);
  if (c1Pop > c1PeakPop) c1PeakPop = c1Pop;
  if (c2Pop > c2PeakPop) c2PeakPop = c2Pop;

  const q1 = sim.queen ? sim.queen(1) : null;
  const q2 = sim.queen ? (sim.queen(2) || sim.queen(col2Id)) : null;

  if (!q1?.alive && !q1Death) {
   const lastKill = sim.telemetry.kills.slice().reverse().find(k => k.victimType === 'queen' && k.victimColony === 1);
   q1Death = {
    tick: step,
    time: Number((step * dt).toFixed(1)),
    cause: lastKill ? lastKill.cause : 'starvation/dehydration',
    killer: lastKill ? `Colony ${lastKill.killerColony || '?'} (${lastKill.killerType || 'nature'})` : 'exhaustion'
   };
   console.log(`  [Tick ${step.toString().padStart(5, ' ')} / ${(step * dt).toFixed(1)}s] COLONY 1 QUEEN PERISHED via ${q1Death.cause}!`);
  }

  if (!q2?.alive && !q2Death) {
   const lastKill = sim.telemetry.kills.slice().reverse().find(k => k.victimType === 'queen' && (k.victimColony === 2 || k.victimColony === col2Id));
   q2Death = {
    tick: step,
    time: Number((step * dt).toFixed(1)),
    cause: lastKill ? lastKill.cause : 'starvation/dehydration',
    killer: lastKill ? `Colony ${lastKill.killerColony || '?'} (${lastKill.killerType || 'nature'})` : 'exhaustion'
   };
   console.log(`  [Tick ${step.toString().padStart(5, ' ')} / ${(step * dt).toFixed(1)}s] COLONY 2 QUEEN PERISHED via ${q2Death.cause}!`);
  }

  if (!q1?.alive && !q2?.alive) {
   console.log(`  >>> [Tick ${step} / ${(step * dt).toFixed(1)}s] MUTUAL EXTINCTION ACHIEVED! <<<\n`);
   break;
  }

  if (step % 1000 === 0) {
   const q1Hp = q1?.alive ? q1.health.toFixed(0) : 'DEAD';
   const q2Hp = q2?.alive ? q2.health.toFixed(0) : 'DEAD';
   const antKills = sim.telemetry.kills.filter(k => k.victimColony > 0).length;
   const faunaKills = sim.telemetry.kills.filter(k => k.victimColony === 0).length;
   console.log(`  [Tick ${step.toString().padStart(5, ' ')} / ${(step * dt).toFixed(1)}s] C1 Pop=${c1Pop} (Peak: ${c1PeakPop}, Q1: ${q1Hp}) | C2 Pop=${c2Pop} (Peak: ${c2PeakPop}, Q2: ${q2Hp}) | Ant Kills=${antKills} | Fauna Kills=${faunaKills}`);
  }
 }

 const telRep = sim.telemetry.getReport();
 const wdRep = sim.watchdog.getReport();
 const c1 = telRep.colonies.colony1;
 const c2 = telRep.colonies.colony2;

 const trialResult = {
  trial: trial + 1,
  seed,
  ticks: step,
  durationSeconds: Number((step * dt).toFixed(1)),
  durationMinutes: Number(((step * dt) / 60).toFixed(2)),
  q1Death,
  q2Death,
  c1StartPop,
  c1PeakPop,
  c1FinalPop: sim.livingPopulation(1),
  c2StartPop,
  c2PeakPop,
  c2FinalPop: sim.livingPopulation(col2Id),
  c1Stats: c1,
  c2Stats: c2,
  totalKills: telRep.totalKills,
  watchdogIncidents: wdRep.totalIncidents
 };
 results.push(trialResult);

 console.log(`\n=================== TRIAL ${trial + 1} DETAILED COLONY ACCOUNTING ===================`);
 console.log(`Match Duration: ${trialResult.durationMinutes} min (${step} ticks)`);
 console.log(`Colony 1 Pop: Start=${c1StartPop} | Peak=${c1PeakPop} | Final=${trialResult.c1FinalPop}`);
 console.log(`Colony 2 Pop: Start=${c2StartPop} | Peak=${c2PeakPop} | Final=${trialResult.c2FinalPop}`);
 console.log('');
 console.log('FOOD ACCOUNTING:');
 console.log(`  Colony 1 Food Gains:  Starting=${c1.foodGains.starting} | Seeds=${c1.foodGains.seedsHarvested} (Count: ${c1.seedsGatheredCount}) | Corpses=${c1.foodGains.corpsesHarvested} (Count: ${c1.corpsesGatheredCount}) | Total Gained=${c1.foodGains.totalGained}`);
 console.log(`  Colony 1 Food Losses: Worker Hunger=${c1.foodLosses.workerHunger} | Queen Drain=${c1.foodLosses.queenDrain} | Eggs=${c1.foodLosses.eggProduction} | Larvae=${c1.foodLosses.larvaeFeeding} | Healing=${c1.foodLosses.combatHealing} | Total Lost=${c1.foodLosses.totalLost}`);
 console.log(`  Colony 1 Net Food:    Store Remaining=${sim.food.toFixed(1)}`);
 console.log('');
 console.log(`  Colony 2 Food Gains:  Starting=${c2.foodGains.starting} | Seeds=${c2.foodGains.seedsHarvested} (Count: ${c2.seedsGatheredCount}) | Corpses=${c2.foodGains.corpsesHarvested} (Count: ${c2.corpsesGatheredCount}) | Total Gained=${c2.foodGains.totalGained}`);
 console.log(`  Colony 2 Food Losses: Worker Hunger=${c2.foodLosses.workerHunger} | Queen Drain=${c2.foodLosses.queenDrain} | Eggs=${c2.foodLosses.eggProduction} | Larvae=${c2.foodLosses.larvaeFeeding} | Total Lost=${c2.foodLosses.totalLost}`);
 console.log(`  Colony 2 Net Food:    Store Remaining=${(col2 ? col2.food : 0).toFixed(1)}`);
 console.log('');
 console.log('WATER ACCOUNTING:');
 console.log(`  Colony 1 Water Gains:  Starting=${c1.waterGains.starting} | Harvested=${c1.waterGains.harvested} | Total Gained=${c1.waterGains.totalGained}`);
 console.log(`  Colony 1 Water Losses: Worker Thirst=${c1.waterLosses.workerThirst} | Queen Drain=${c1.waterLosses.queenDrain} | Eggs=${c1.waterLosses.eggProduction} | Total Lost=${c1.waterLosses.totalLost}`);
 console.log(`  Colony 2 Water Gains:  Starting=${c2.waterGains.starting} | Harvested=${c2.waterGains.harvested} | Total Gained=${c2.waterGains.totalGained}`);
 console.log(`  Colony 2 Water Losses: Worker Thirst=${c2.waterLosses.workerThirst} | Queen Drain=${c2.waterLosses.queenDrain} | Eggs=${c2.waterLosses.eggProduction} | Total Lost=${c2.waterLosses.totalLost}`);
 console.log('');
 console.log('WILDLIFE (NON-ANT INSECT) KILLS & COMBAT:');
 console.log(`  Colony 1 Fauna Kills: ${c1.creaturesKilled} ${JSON.stringify(c1.creatureKillsBySpecies)} | Ant Kills: ${c1.kills} | Losses: ${c1.losses}`);
 console.log(`  Colony 2 Fauna Kills: ${c2.creaturesKilled} ${JSON.stringify(c2.creatureKillsBySpecies)} | Ant Kills: ${c2.kills} | Losses: ${c2.losses}`);
 console.log(`  Watchdog Detected Glitches: ${wdRep.totalIncidents}\n`);
}

console.log('========================================================================================');
console.log('5-TRIAL AGGREGATED EXTINCTION SUMMARY TABLE');
console.log('========================================================================================');

console.table(results.map(r => ({
 'Trial': r.trial,
 'Seed': r.seed,
 'Duration (min)': r.durationMinutes,
 'C1 Pop (Start/Peak/Final)': `${r.c1StartPop} / ${r.c1PeakPop} / ${r.c1FinalPop}`,
 'C2 Pop (Start/Peak/Final)': `${r.c2StartPop} / ${r.c2PeakPop} / ${r.c2FinalPop}`,
 'C1 Food (Gain/Lost)': `${r.c1Stats.foodGains.totalGained} / ${r.c1Stats.foodLosses.totalLost}`,
 'C2 Food (Gain/Lost)': `${r.c2Stats.foodGains.totalGained} / ${r.c2Stats.foodLosses.totalLost}`,
 'C1 Water (Gain/Lost)': `${r.c1Stats.waterGains.totalGained} / ${r.c1Stats.waterLosses.totalLost}`,
 'C2 Water (Gain/Lost)': `${r.c2Stats.waterGains.totalGained} / ${r.c2Stats.waterLosses.totalLost}`,
 'C1/C2 Seeds': `${r.c1Stats.seedsGatheredCount} / ${r.c2Stats.seedsGatheredCount}`,
 'C1/C2 Fauna Kills': `${r.c1Stats.creaturesKilled} / ${r.c2Stats.creaturesKilled}`,
 'C1/C2 Ant Kills': `${r.c1Stats.kills} / ${r.c2Stats.kills}`,
 'Watchdog Incidents': r.watchdogIncidents
})));

// Calculate 5-trial averages
const avg = {
 durationMinutes: Number((results.reduce((s, r) => s + r.durationMinutes, 0) / results.length).toFixed(2)),
 c1PeakPop: Number((results.reduce((s, r) => s + r.c1PeakPop, 0) / results.length).toFixed(1)),
 c2PeakPop: Number((results.reduce((s, r) => s + r.c2PeakPop, 0) / results.length).toFixed(1)),
 c1FoodGain: Number((results.reduce((s, r) => s + r.c1Stats.foodGains.totalGained, 0) / results.length).toFixed(1)),
 c2FoodGain: Number((results.reduce((s, r) => s + r.c2Stats.foodGains.totalGained, 0) / results.length).toFixed(1)),
 c1FoodLost: Number((results.reduce((s, r) => s + r.c1Stats.foodLosses.totalLost, 0) / results.length).toFixed(1)),
 c2FoodLost: Number((results.reduce((s, r) => s + r.c2Stats.foodLosses.totalLost, 0) / results.length).toFixed(1)),
 c1WaterLost: Number((results.reduce((s, r) => s + r.c1Stats.waterLosses.totalLost, 0) / results.length).toFixed(1)),
 c2WaterLost: Number((results.reduce((s, r) => s + r.c2Stats.waterLosses.totalLost, 0) / results.length).toFixed(1)),
 c1Seeds: Number((results.reduce((s, r) => s + r.c1Stats.seedsGatheredCount, 0) / results.length).toFixed(1)),
 c2Seeds: Number((results.reduce((s, r) => s + r.c2Stats.seedsGatheredCount, 0) / results.length).toFixed(1)),
 c1FaunaKills: Number((results.reduce((s, r) => s + r.c1Stats.creaturesKilled, 0) / results.length).toFixed(1)),
 c2FaunaKills: Number((results.reduce((s, r) => s + r.c2Stats.creaturesKilled, 0) / results.length).toFixed(1)),
 c1AntKills: Number((results.reduce((s, r) => s + r.c1Stats.kills, 0) / results.length).toFixed(1)),
 c2AntKills: Number((results.reduce((s, r) => s + r.c2Stats.kills, 0) / results.length).toFixed(1)),
 watchdogIncidents: Number((results.reduce((s, r) => s + r.watchdogIncidents, 0) / results.length).toFixed(1))
};

console.log('========================================================================================');
console.log('5-TRIAL AGGREGATED AVERAGES');
console.log('========================================================================================');
console.log(`Average Match Duration:       ${avg.durationMinutes} minutes`);
console.log(`Average C1 Peak Population:   ${avg.c1PeakPop} (Started: 5)`);
console.log(`Average C2 Peak Population:   ${avg.c2PeakPop} (Started: 5)`);
console.log(`Average C1 Food Gained:       ${avg.c1FoodGain} | Consumed: ${avg.c1FoodLost}`);
console.log(`Average C2 Food Gained:       ${avg.c2FoodGain} | Consumed: ${avg.c2FoodLost}`);
console.log(`Average C1 Water Consumed:    ${avg.c1WaterLost}`);
console.log(`Average C2 Water Consumed:    ${avg.c2WaterLost}`);
console.log(`Average Seeds Gathered:       C1=${avg.c1Seeds} | C2=${avg.c2Seeds}`);
console.log(`Average Fauna (Insect) Kills: C1=${avg.c1FaunaKills} | C2=${avg.c2FaunaKills}`);
console.log(`Average Ant Combat Kills:     C1=${avg.c1AntKills} | C2=${avg.c2AntKills}`);
console.log(`Average Watchdog Glitches:    ${avg.watchdogIncidents}`);
console.log('========================================================================================\n');

