/*
 * TELEMETRY & EVENT LOGGING SUBSYSTEM
 * Tracks key behavioral events (kills, deaths with attribution, combat damage,
 * queen alerts, territory crossings, brood milestones, and food plundering)
 * and generates structured battle reports.
 */
(()=>{
const key = AntGame.key || ((x, y) => `${x},${y}`);

class TelemetryEngine {
  constructor(sim) {
   this.sim = sim;
   this.events = [];
   this.kills = [];
   this.stats = {
    colony1: this.createColonyStats(1),
    colony2: this.createColonyStats(2)
   };
   this.maxEvents = 1000;
  }

  createColonyStats(colonyId) {
   return {
    kills: 0,
    losses: 0,
    damageDealt: 0,
    damageReceived: 0,
    foodEaten: 0,
    waterDrank: 0,
    dirtMined: 0,
    foodPlundered: 0,
    broodHatched: 0,
    creaturesKilled: 0,
    creatureKillsBySpecies: {},
    seedsGatheredCount: 0,
    corpsesGatheredCount: 0,
    foodGains: {
     starting: 0,
     seedsHarvested: 0,
     corpsesHarvested: 0,
     foodPlundered: 0,
     directFood: 0,
     totalGained: 0
    },
    foodLosses: {
     workerHunger: 0,
     queenDrain: 0,
     eggProduction: 0,
     larvaeFeeding: 0,
     combatHealing: 0,
     plunderedLost: 0,
     totalLost: 0
    },
    waterGains: {
     starting: 0,
     harvested: 0,
     totalGained: 0
    },
    waterLosses: {
     workerThirst: 0,
     queenDrain: 0,
     eggProduction: 0,
     totalLost: 0
    }
   };
  }

  getColonyStats(colonyId) {
   const key = `colony${colonyId}`;
   if (!this.stats[key]) {
    this.stats[key] = this.createColonyStats(colonyId);
   }
   return this.stats[key];
  }

  setStartingStores(colonyId, food = 0, water = 0) {
   const stats = this.getColonyStats(colonyId);
   stats.foodGains.starting = Number(food.toFixed(1));
   stats.foodGains.totalGained = Number((stats.foodGains.seedsHarvested + stats.foodGains.corpsesHarvested + stats.foodGains.foodPlundered + stats.foodGains.directFood + food).toFixed(1));
   stats.waterGains.starting = Number(water.toFixed(1));
   stats.waterGains.totalGained = Number((stats.waterGains.harvested + water).toFixed(1));
  }

  recordFoodGain(colonyId, amount, category = 'seedsHarvested') {
   if (!amount || amount <= 0) return;
   const stats = this.getColonyStats(colonyId);
   if (stats.foodGains[category] === undefined) stats.foodGains[category] = 0;
   stats.foodGains[category] += amount;
   stats.foodGains.totalGained += amount;
   if (category === 'foodPlundered') {
    stats.foodPlundered += amount;
   }
  }

  recordFoodLoss(colonyId, amount, category = 'workerHunger') {
   if (!amount || amount <= 0) return;
   const stats = this.getColonyStats(colonyId);
   if (stats.foodLosses[category] === undefined) stats.foodLosses[category] = 0;
   stats.foodLosses[category] += amount;
   stats.foodLosses.totalLost += amount;
   if (category === 'workerHunger') {
    stats.foodEaten += amount;
   }
  }

  recordWaterGain(colonyId, amount, category = 'harvested') {
   if (!amount || amount <= 0) return;
   const stats = this.getColonyStats(colonyId);
   if (stats.waterGains[category] === undefined) stats.waterGains[category] = 0;
   stats.waterGains[category] += amount;
   stats.waterGains.totalGained += amount;
  }

  recordWaterLoss(colonyId, amount, category = 'workerThirst') {
   if (!amount || amount <= 0) return;
   const stats = this.getColonyStats(colonyId);
   if (stats.waterLosses[category] === undefined) stats.waterLosses[category] = 0;
   stats.waterLosses[category] += amount;
   stats.waterLosses.totalLost += amount;
   if (category === 'workerThirst') {
    stats.waterDrank += amount;
   }
  }

  recordFoodEaten(ant, amount) {
   if (!ant || amount <= 0) return;
   this.recordFoodLoss(ant.colonyId || 1, amount, 'workerHunger');
  }

  recordWaterDrank(ant, amount) {
   if (!ant || amount <= 0) return;
   this.recordWaterLoss(ant.colonyId || 1, amount, 'workerThirst');
  }

  recordSeedGathered(ant, resource) {
   if (!ant) return;
   const stats = this.getColonyStats(ant.colonyId || 1);
   stats.seedsGatheredCount = (stats.seedsGatheredCount || 0) + 1;
   this.recordEvent('seed_gathered', {
    antId: ant.id,
    colonyId: ant.colonyId || 1,
    resourceId: resource?.id || null
   });
  }

  recordCorpseGathered(ant, creature) {
   if (!ant) return;
   const stats = this.getColonyStats(ant.colonyId || 1);
   stats.corpsesGatheredCount = (stats.corpsesGatheredCount || 0) + 1;
   this.recordEvent('corpse_gathered', {
    antId: ant.id,
    colonyId: ant.colonyId || 1,
    creatureId: creature?.id || null,
    species: creature?.species || 'unknown'
   });
  }

  recordCreatureKill(killerAnt, creature) {
   if (!killerAnt || !creature) return;
   const colonyId = killerAnt.colonyId || 1;
   const stats = this.getColonyStats(colonyId);
   stats.creaturesKilled = (stats.creaturesKilled || 0) + 1;
   const sp = creature.species || 'unknown';
   stats.creatureKillsBySpecies[sp] = (stats.creatureKillsBySpecies[sp] || 0) + 1;

   const killRecord = {
    victimId: creature.id,
    victimType: creature.species || 'creature',
    victimColony: 0,
    killerId: killerAnt.id,
    killerType: killerAnt.type,
    killerColony: colonyId,
    cause: 'combat',
    x: Math.round(creature.x),
    y: Math.round(creature.y)
   };
   this.kills.push(killRecord);
   this.recordEvent('creature_kill', killRecord);
  }

  recordDirtMined(ant, amount = 1) {
   if (!ant || amount <= 0) return;
   const stats = this.getColonyStats(ant.colonyId || 1);
   stats.dirtMined = (stats.dirtMined || 0) + amount;
  }

 recordEvent(type, data = {}) {
  const entry = {
   type,
   tick: this.sim.ticks || 0,
   time: Number((this.sim.time || 0).toFixed(2)),
   ...data
  };
  this.events.push(entry);
  if (this.events.length > this.maxEvents) {
   this.events.shift();
  }
  return entry;
 }

 recordDamage(attacker, victim, amount) {
  if (!victim || amount <= 0) return;
  if (attacker?.colonyId) {
   const aStats = this.getColonyStats(attacker.colonyId);
   aStats.damageDealt = Number((aStats.damageDealt + amount).toFixed(1));
  }
  if (victim?.colonyId) {
   const vStats = this.getColonyStats(victim.colonyId);
   vStats.damageReceived = Number((vStats.damageReceived + amount).toFixed(1));
  }
 }

 recordKill(victim, killer = null, cause = 'combat') {
  if (!victim) return;
  const victimColony = victim.colonyId || 0;
  const killerColony = killer?.colonyId || 0;

  if (victimColony) {
   this.getColonyStats(victimColony).losses++;
  }
  if (killerColony) {
   this.getColonyStats(killerColony).kills++;
  }

  const killRecord = {
   victimId: victim.id,
   victimType: victim.type || victim.species || 'unknown',
   victimColony,
   killerId: killer?.id || null,
   killerType: killer?.type || killer?.species || null,
   killerColony,
   cause,
   x: Math.round(victim.x),
   y: Math.round(victim.y)
  };

  this.kills.push(killRecord);
  this.recordEvent('kill', killRecord);

  if (victim.type === 'queen') {
   this.recordEvent('queen_slain', {
    colonyId: victimColony,
    slainByColony: killerColony,
    killerId: killer?.id || null
   });
  }
 }

 recordBroodHatch(ant) {
  if (!ant) return;
  if (ant.colonyId) {
   this.getColonyStats(ant.colonyId).broodHatched++;
  }
  this.recordEvent('brood_hatched', {
   antId: ant.id,
   caste: ant.type,
   colonyId: ant.colonyId
  });
 }

 recordHostility(colonyA, colonyB) {
  this.recordEvent('hostility_declared', {
   colonyA,
   colonyB
  });
 }

  formatColonyStats(raw) {
   const roundObject = obj => {
    const res = {};
    for (const [k, v] of Object.entries(obj)) {
     res[k] = typeof v === 'number' ? Number(v.toFixed(1)) : v;
    }
    return res;
   };
   return {
    ...raw,
    damageDealt: Number(raw.damageDealt.toFixed(1)),
    damageReceived: Number(raw.damageReceived.toFixed(1)),
    foodEaten: Number(raw.foodEaten.toFixed(1)),
    waterDrank: Number(raw.waterDrank.toFixed(1)),
    foodPlundered: Number(raw.foodPlundered.toFixed(1)),
    foodGains: roundObject(raw.foodGains),
    foodLosses: roundObject(raw.foodLosses),
    waterGains: roundObject(raw.waterGains),
    waterLosses: roundObject(raw.waterLosses)
   };
  }

  getReport() {
   const sim = this.sim;
   const c1Alive = sim.livingPopulation ? sim.livingPopulation(1) : 0;
   const c2Alive = sim.livingPopulation ? sim.livingPopulation(2) : 0;
   const q1 = sim.queen ? sim.queen(1) : null;
   const q2 = sim.queen ? sim.queen(2) : null;

   let winner = null;
   if (q1 && q1.alive && (!q2 || !q2.alive)) {
    winner = 'Colony 1';
   } else if (q2 && q2.alive && (!q1 || !q1.alive)) {
    winner = 'Colony 2';
   } else if (!q1?.alive && !q2?.alive) {
    winner = 'Mutual Destruction';
   } else {
    winner = 'Ongoing / Stalemate';
   }

   return {
    simTime: Number((sim.time || 0).toFixed(2)),
    simTicks: sim.ticks || 0,
    winner,
    colonies: {
     colony1: {
      population: c1Alive,
      queenAlive: Boolean(q1?.alive),
      queenHp: q1 ? Number(q1.health.toFixed(1)) : 0,
      ...this.formatColonyStats(this.getColonyStats(1))
     },
     colony2: {
      population: c2Alive,
      queenAlive: Boolean(q2?.alive),
      queenHp: q2 ? Number(q2.health.toFixed(1)) : 0,
      ...this.formatColonyStats(this.getColonyStats(2))
     }
    },
    totalKills: this.kills.length,
    recentEvents: this.events.slice(-20)
   };
  }
}

AntGame.TelemetryEngine = TelemetryEngine;
})();
