/*
 * GLITCH DETECTION & BEHAVIORAL WATCHDOG SUBSYSTEM
 * Monitors ants and simulation entities for behavioral anomalies, task thrashing,
 * pathing ping-pong oscillations, state deadlocks, orphaned brood/reservations,
 * and numerical corruption.
 */
(()=>{
const key = AntGame.key || ((x, y) => `${x},${y}`);
const hexRound = AntGame.hexRound || ((x, y) => ({ x: Math.round(x), y: Math.round(y) }));

class Watchdog {
 constructor(sim, options = {}) {
  this.sim = sim;
  this.policy = options.policy || 'recover'; // 'recover' or 'report_only'
  this.incidents = [];
  this.maxIncidents = 500;
  this.checkInterval = 0.5; // check every 0.5 seconds
  this.checkTimer = 0;
 }

 logIncident(type, severity, ant, details) {
  const incident = {
   id: this.incidents.length + 1,
   tick: this.sim.ticks || 0,
   time: Number((this.sim.time || 0).toFixed(2)),
   type,
   severity, // 'warning' | 'error' | 'critical'
   entityId: ant?.id || null,
   caste: ant?.type || null,
   colonyId: ant?.colonyId || null,
   details,
   recovered: false
  };

  if (this.policy === 'recover' && ant && ant.alive) {
   this.recoverAnt(ant, type);
   incident.recovered = true;
  }

  this.incidents.push(incident);
  if (this.incidents.length > this.maxIncidents) {
   this.incidents.shift();
  }

  if (this.sim.telemetry) {
   this.sim.telemetry.recordEvent('watchdog_incident', incident);
  }

   if (AntGame.Diagnostics) {
    const upper = type.toUpperCase();
    const tier = (severity === 'critical' || upper.includes('CORRUPTION') || upper.includes('INVARIANT') || upper.includes('NAN')) ? AntGame.TIERS.INVARIANT :
                 (severity === 'error' || severity === 'high') ? AntGame.TIERS.BEHAVIOR :
                 AntGame.TIERS.TUNING;
    const sub = upper.includes('NUMERICAL') || upper.includes('NAN') || upper.includes('CORRUPTION') ? 'movement' :
                upper.includes('LAYER') ? 'surface_world' :
                upper.includes('PATH') || upper.includes('OSCILLATION') ? 'pathfinding' :
                upper.includes('BROOD') || upper.includes('STARVATION') ? 'storage' : 'tasks';
    AntGame.Diagnostics.log(tier, sub, type, `Watchdog incident: ${type}`, ant, { ...details, simTime: this.sim.time });
   }

  return incident;
 }

 recoverAnt(ant, reason) {
  if (this.sim.release) {
   this.sim.release(ant);
  } else {
   ant.task = null;
   ant.path = [];
   ant.state = 'idle';
   ant.timer = 0;
   ant.carry = null;
  }
  ant._recentStates = [];
  ant._recentHexes = [];
  ant._stateDuration = 0;
 }

 tick(dt) {
  this.checkTimer += dt;
  if (this.checkTimer < this.checkInterval) return;
  this.checkTimer = 0;

  this.checkAnts(dt);
  this.checkOrphanedReservations();
  this.checkNumericalAnomalies();
  this.checkLayerInvariants();
  this.checkStarvationInvariants();
  this.checkLivelock();
 }

 checkAnts(dt) {
  const sim = this.sim;
  const now = sim.time || 0;

  for (const a of sim.ants) {
   if (!a.alive) continue;
   if (AntGame.Diagnostics) AntGame.Diagnostics.recordBreadcrumb(a);

   // 1. Numerical Anomaly Check
   if (Number.isNaN(a.x) || Number.isNaN(a.y) || Number.isNaN(a.health)) {
    this.logIncident('NUMERICAL_CORRUPTION', 'critical', a, {
     x: a.x, y: a.y, health: a.health
    });
    continue;
   }

   // 2. State Deadlock Check
   if (!a._lastState || a._lastState !== a.state) {
    a._lastState = a.state;
    a._stateDuration = 0;
   } else {
    a._stateDuration = (a._stateDuration || 0) + this.checkInterval;
   }

   const workingStates = ['digging', 'to-dig', 'to-carry', 'to-feed-larva-supply', 'feeding-larva', 'to-build-supply', 'delivering-build-material', 'building', 'to-process', 'processing'];
   if (workingStates.includes(a.state) && a._stateDuration > 25.0) {
    this.logIncident('STATE_DEADLOCK', 'error', a, {
     state: a.state,
     duration: Number(a._stateDuration.toFixed(1)),
     taskId: a.task?.id || null
    });
    continue;
   }

   // 3. Task Thrashing Check (rapid switching between states)
   a._recentStates = a._recentStates || [];
   if (a._recentStates.length === 0 || a._recentStates[a._recentStates.length - 1].state !== a.state) {
    a._recentStates.push({ state: a.state, time: now });
    if (a._recentStates.length > 8) a._recentStates.shift();
   }

   // Clean out transitions older than 3 seconds
   while (a._recentStates.length > 0 && now - a._recentStates[0].time > 3.0) {
    a._recentStates.shift();
   }

   if (a._recentStates.length >= 6) {
    const states = a._recentStates.map(s => s.state);
    const uniqueStates = new Set(states);
    if (uniqueStates.size <= 2) {
     this.logIncident('TASK_THRASHING', 'warning', a, {
      cycle: states.join(' -> ')
     });
     continue;
    }
   }

   // 4. Pathing Ping-Pong / Oscillation Check
   const currentHex = hexRound(a.x, a.y);
   const hexK = key(currentHex.x, currentHex.y);

   a._recentHexes = a._recentHexes || [];
   if (a._recentHexes.length === 0 || a._recentHexes[a._recentHexes.length - 1].hex !== hexK) {
    a._recentHexes.push({ hex: hexK, time: now });
    if (a._recentHexes.length > 8) a._recentHexes.shift();
   }

   // Clean out hex transitions older than 3.5 seconds
   while (a._recentHexes.length > 0 && typeof a._recentHexes[0] === 'object' && now - a._recentHexes[0].time > 3.5) {
    a._recentHexes.shift();
   }

   if (a._recentHexes.length >= 6) {
    const h = a._recentHexes.map(entry => typeof entry === 'string' ? entry : entry.hex);
    // Check 2-hex oscillation: A -> B -> A -> B -> A -> B
    const is2Osc = (h[0] === h[2] && h[2] === h[4] && h[1] === h[3] && h[3] === h[5] && h[0] !== h[1]);
    if (is2Osc) {
     this.logIncident('PATH_OSCILLATION', 'warning', a, {
      oscillation: `${h[0]} <-> ${h[1]}`
     });
     continue;
    }
   }
  }
 }

 checkOrphanedReservations() {
  const sim = this.sim;

  // Check eggs: beingFedBy or beingTransportedBy
  for (const egg of sim.eggs) {
   if (egg.beingFedBy) {
    const feeder = sim.ants.find(a => a.id === egg.beingFedBy);
    if (!feeder || !feeder.alive || feeder.task?.larvaId !== egg.id) {
     this.logIncident('ORPHANED_BROOD_LOCK', 'warning', feeder, {
      eggId: egg.id,
      feederId: egg.beingFedBy,
      feederAlive: Boolean(feeder?.alive)
     });
     egg.beingFedBy = null;
    }
   }
   if (egg.beingTransportedBy) {
    const nurse = sim.ants.find(a => a.id === egg.beingTransportedBy);
    if (!nurse || !nurse.alive || (nurse.carry?.broodId !== egg.id && nurse.task?.broodId !== egg.id)) {
     this.logIncident('ORPHANED_BROOD_TRANSPORT', 'warning', nurse, {
      eggId: egg.id,
      nurseId: egg.beingTransportedBy
     });
     egg.beingTransportedBy = null;
     egg.carriedBy = null;
    }
   }
  }

  // Check creature corpse reservations
  for (const c of sim.creatures) {
   if (c.reservedFor) {
    const worker = sim.ants.find(a => a.id === c.reservedFor);
    if (!worker || !worker.alive || worker.task?.targetId !== c.id) {
     c.reservedFor = null;
    }
   }
   if (c.processingFeederId) {
    const feeder = sim.ants.find(a => a.id === c.processingFeederId);
    if (!feeder || !feeder.alive || feeder.task?.targetId !== c.id) {
     c.processingFeederId = null;
    }
   }
  }

  // Check resource reservations
  for (const r of sim.resources) {
   if (r.reservedFor) {
    const worker = sim.ants.find(a => a.id === r.reservedFor);
    if (!worker || !worker.alive || worker.task?.targetId !== r.id) {
     r.reservedFor = null;
    }
   }
  }
 }

 checkNumericalAnomalies() {
  const sim = this.sim;
  if (Number.isNaN(sim.food) || Number.isNaN(sim.water)) {
   this.logIncident('COLONY_RESOURCE_NAN', 'critical', null, {
    food: sim.food,
    water: sim.water
   });
   if (Number.isNaN(sim.food)) sim.food = 0;
   if (Number.isNaN(sim.water)) sim.water = 0;
  }
 }

 checkLayerInvariants() {
  const sim = this.sim;
  if (!sim.surfaceWorld) return;
  for (const a of sim.ants) {
   if (!a.alive) continue;
   if (a.state === 'carrying' || a.state === 'depositing' || a.carry) continue;
   const aLayer = a.layer || 0;
   if (a.task?.targetId) {
    const target = sim.target ? sim.target(a.task.targetId) : null;
    if (target && target.layer !== undefined && (target.layer || 0) !== aLayer) {
     const pt = { x: Math.round(target.x), y: Math.round(target.y) };
     if (!sim.canReach || !sim.canReach(a, pt, target.layer)) {
      this.logIncident('CROSS_LAYER_UNREACHABLE_TARGET', 'warning', a, {
       antLayer: aLayer, targetLayer: target.layer, targetId: target.id
      });
     }
    }
   }
  }
 }

 checkStarvationInvariants() {
  const sim = this.sim;
  if (sim.food <= 0) return;
  for (const a of sim.ants) {
   if (!a.alive || a.colonyId !== 1 || a.type === 'queen') continue;
   if (a.foodNeed <= 0 && a.state !== 'need-food' && !a.held) {
    const pt = AntGame.Inventory?.getFoodSourceTile(sim, a);
    if (pt && (a.layer || 0) === 0) {
     this.logIncident('ACCESSIBLE_FOOD_STARVATION', 'warning', a, {
      foodNeed: a.foodNeed, state: a.state, colonyFood: sim.food
     });
    }
   }
  }
 }

 checkLivelock() {
  const sim = this.sim;
  const now = sim.time || 0;
  if (this._lastProgressCheck === undefined || this._lastProgressCheck === null) {
   this._lastProgressCheck = now;
   this._lastProgressStats = {
    dirt: sim.telemetry?.metrics?.dirtMinedColony1 || 0,
    food: sim.foodHarvested || 0,
    jobs: (sim.jobs || []).length
   };
   return;
  }

  if (now - this._lastProgressCheck >= 30.0) {
   const currentDirt = sim.telemetry?.metrics?.dirtMinedColony1 || 0;
   const currentFood = sim.foodHarvested || 0;
   const currentJobs = (sim.jobs || []).length;
   const hasPendingWork = currentJobs > 0 || (sim.resources && sim.resources.some(r => r.remaining > 0));
   const commandableAnts = sim.ants.filter(a => a.alive && a.colonyId === 1 && a.type !== 'queen');

   if (hasPendingWork && commandableAnts.length >= 3) {
    const dirtDelta = currentDirt - this._lastProgressStats.dirt;
    const foodDelta = currentFood - this._lastProgressStats.food;
    if (dirtDelta === 0 && foodDelta === 0) {
     const allIdleOrBlocked = commandableAnts.every(a => ['idle', 'blocked'].includes(a.state));
     if (allIdleOrBlocked) {
      this.logIncident('COLONY_LIVELOCK_STALL', 'warning', null, {
       elapsed: Number((now - this._lastProgressCheck).toFixed(1)),
       pendingJobs: currentJobs,
       commandableAnts: commandableAnts.length
      });
     }
    }
   }

   this._lastProgressCheck = now;
   this._lastProgressStats = { dirt: currentDirt, food: currentFood, jobs: currentJobs };
  }
 }

 getReport() {
  const counts = {};
  for (const inc of this.incidents) {
   counts[inc.type] = (counts[inc.type] || 0) + 1;
  }
  return {
   totalIncidents: this.incidents.length,
   breakdown: counts,
   recentIncidents: this.incidents.slice(-10)
  };
 }
}

AntGame.Watchdog = Watchdog;
})();
