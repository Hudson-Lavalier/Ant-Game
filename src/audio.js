/*
 * UNDERFOOT AUDIO COORDINATOR
 * Manages atmospheric weather audio layers, ambient cave/nest loops,
 * ant footsteps and digging action loops, and equalized acoustic triggers.
 *
 * Bus Architecture:
 * - Master: Overall gain multiplier (masterVolume)
 * - Ambient: Environmental loops (rain, wind, nest ambience, water cavern)
 * - Effects: Tactical and entity sounds (dig, build, combat, feed, drop, hatch, etc.)
 *
 * Equalization:
 * - Tiny ant sounds (footsteps, digging, chewing, sips) are calibrated with
 *   delicate base gains so they sit naturally under the ambient nature mix.
 */
(()=>{
class AudioCoordinator {
 constructor() {
  this.enabled = true;
  this.masterVolume = 0.65;
  this.buses = {
   master: 0.65,
   ambient: 1.0,
   effects: 1.0
  };
  this.activeLoops = new Map();
  this.unlocked = false;
  this.lastPlayed = [];
  if (typeof AntGame !== 'undefined' && AntGame.Settings) {
   this.enabled = AntGame.Settings.soundEnabled !== false;
  }

  this.soundPaths = {
   // Ambient Loops
   amb_nest_underground: 'SFX/Ambient/amb_nest_underground_loop.ogg',
   amb_water_cavern: 'SFX/Ambient/amb_water_cavern_loop.ogg',
   rain_underground: 'SFX/Weather/rain_underground.ogg',
   rain_surface: 'SFX/Weather/rain_surface.ogg',
   wind: 'SFX/Weather/heavy_wind.ogg',

   // Weather & Disasters
   thunder_01: 'SFX/Weather/thunder_01.ogg',
   thunder_02: 'SFX/Weather/thunder_02.ogg',
   thunder_03: 'SFX/Weather/thunder_03.ogg',
   flood: 'SFX/Weather/flood_surface_water.ogg',
   earthquake: 'SFX/Weather/earthquake.ogg',
   cave_in: 'SFX/Weather/cave_in.ogg',

   // Ants & Colony Labor
   ant_dig: 'SFX/Ants/ant_dig_01.ogg',
   ant_dig_heavy: 'SFX/Ants/ant_dig_heavy_01.ogg',
   rock_strike_01: 'SFX/Ants/rock_strike_01.ogg',
   rock_strike_02: 'SFX/Ants/rock_strike_02.ogg',
   rock_strike_03: 'SFX/Ants/rock_strike_03.ogg',
   chamber_build_pack_01: 'SFX/Ants/chamber_build_pack_01.ogg',
   chamber_build_pack_02: 'SFX/Ants/chamber_build_pack_02.ogg',
   chamber_build_pack_03: 'SFX/Ants/chamber_build_pack_03.ogg',
   chamber_built_complete: 'SFX/Ants/chamber_built_complete.ogg',
   soil_drop_pit: 'SFX/Ants/soil_drop_pit_01.ogg',
   soil_drop_floor: 'SFX/Ants/soil_drop_floor_01.ogg',
   corpse_pickup: 'SFX/Ants/corpse_pickup_01.ogg',
   corpse_store: 'SFX/Ants/corpse_store_01.ogg',
   seed_store: 'SFX/Ants/seed_store_01.ogg',
   feeder_chew_food: 'SFX/Ants/feeder_chew_food_01.ogg',
   ant_eat: 'SFX/Ants/ant_eat_01.ogg',
   ant_drink: 'SFX/Ants/ant_drink_01.ogg',
   water_droplet_extract: 'SFX/Ants/water_droplet_extract_01.ogg',
   queen_lay_egg: 'SFX/Ants/queen_lay_egg_01.ogg',
   egg_hatch: 'SFX/Ants/egg_hatch_01.ogg',
   ant_alarm_retreat: 'SFX/Ants/ant_alarm_retreat_01.ogg',
   soldier_threat_response: 'SFX/Ants/soldier_threat_response_01.ogg',

   // Footsteps
   footsteps_normal: 'SFX/Ants/ant_footsteps_loop_01.ogg',
   footsteps_heavy: 'SFX/Ants/ant_heavy_footsteps_loop_01.ogg',
   ant_footsteps_loop_01: 'SFX/Ants/ant_footsteps_loop_01.ogg',
   ant_footsteps_loop_02: 'SFX/Ants/ant_footsteps_loop_02.ogg',
   ant_heavy_footsteps_loop_01: 'SFX/Ants/ant_heavy_footsteps_loop_01.ogg',
   ant_heavy_footsteps_loop_02: 'SFX/Ants/ant_heavy_footsteps_loop_02.ogg',

   // Combat
   ant_bite_worker_01: 'SFX/Combat/ant_bite_worker_01.ogg',
   ant_bite_worker_02: 'SFX/Combat/ant_bite_worker_02.ogg',
   ant_bite_worker_03: 'SFX/Combat/ant_bite_worker_03.ogg',
   ant_bite_soldier_01: 'SFX/Combat/ant_bite_soldier_01.ogg',
   ant_bite_soldier_02: 'SFX/Combat/ant_bite_soldier_02.ogg',
   ant_bite_soldier_03: 'SFX/Combat/ant_bite_soldier_03.ogg',
   ant_bite_supermajor_01: 'SFX/Combat/ant_bite_supermajor_01.ogg',
   ant_bite_supermajor_02: 'SFX/Combat/ant_bite_supermajor_02.ogg',
   impact_chitin: 'SFX/Combat/impact_chitin_01.ogg',
   ant_death: 'SFX/Combat/ant_death_01.ogg'
  };

  this.variantPools = {
   rockStrike: ['rock_strike_01', 'rock_strike_02', 'rock_strike_03'],
   chamberBuildPack: ['chamber_build_pack_01', 'chamber_build_pack_02', 'chamber_build_pack_03'],
   biteWorker: ['ant_bite_worker_01', 'ant_bite_worker_02', 'ant_bite_worker_03'],
   biteSoldier: ['ant_bite_soldier_01', 'ant_bite_soldier_02', 'ant_bite_soldier_03'],
   biteSupermajor: ['ant_bite_supermajor_01', 'ant_bite_supermajor_02'],
   footstepsNormal: ['ant_footsteps_loop_01', 'ant_footsteps_loop_02'],
   footstepsHeavy: ['ant_heavy_footsteps_loop_01', 'ant_heavy_footsteps_loop_02'],
   thunder: ['thunder_01', 'thunder_02', 'thunder_03']
  };

  // Equalized gain profiles for tiny ant sounds vs environmental weather
  this.cueProfiles = {
   // Footsteps: subtle scurrying on dirt
   footsteps_normal:      { volume: 0.10, bus: 'effects' },
   footsteps_heavy:       { volume: 0.15, bus: 'effects' },

   // Digging: soft granular scraping / excavating
   ant_dig:               { volume: 0.12, bus: 'effects' },
   ant_dig_heavy:         { volume: 0.16, bus: 'effects' },
   dig_normal:            { volume: 0.12, bus: 'effects' },
   dig_heavy:             { volume: 0.16, bus: 'effects' },
   rock_strike:           { volume: 0.18, bus: 'effects' },
   rock_strike_01:        { volume: 0.18, bus: 'effects' },
   rock_strike_02:        { volume: 0.18, bus: 'effects' },
   rock_strike_03:        { volume: 0.18, bus: 'effects' },

   // Building
   chamber_build_pack:    { volume: 0.11, bus: 'effects' },
   chamber_build_pack_01: { volume: 0.11, bus: 'effects' },
   chamber_build_pack_02: { volume: 0.11, bus: 'effects' },
   chamber_build_pack_03: { volume: 0.11, bus: 'effects' },
   chamber_built_complete:{ volume: 0.20, bus: 'effects' },

   // Soil & Resource drops
   soil_drop_pit:         { volume: 0.12, bus: 'effects' },
   soil_drop_floor:       { volume: 0.10, bus: 'effects' },
   corpse_pickup:         { volume: 0.11, bus: 'effects' },
   corpse_store:          { volume: 0.12, bus: 'effects' },
   seed_store:            { volume: 0.12, bus: 'effects' },
   water_droplet_extract: { volume: 0.11, bus: 'effects' },

   // Sustenance
   feeder_chew_food:      { volume: 0.12, bus: 'effects' },
   ant_eat:               { volume: 0.10, bus: 'effects' },
   ant_drink:             { volume: 0.10, bus: 'effects' },

   // Brood
   queen_lay_egg:         { volume: 0.13, bus: 'effects' },
   egg_hatch:             { volume: 0.13, bus: 'effects' },

   // Alarm & Response
   ant_alarm_retreat:     { volume: 0.16, bus: 'effects' },
   soldier_threat_response:{ volume: 0.18, bus: 'effects' },

   // Combat
   ant_bite_worker_01:    { volume: 0.12, bus: 'effects' },
   ant_bite_worker_02:    { volume: 0.12, bus: 'effects' },
   ant_bite_worker_03:    { volume: 0.12, bus: 'effects' },
   ant_bite_soldier_01:   { volume: 0.15, bus: 'effects' },
   ant_bite_soldier_02:   { volume: 0.15, bus: 'effects' },
   ant_bite_soldier_03:   { volume: 0.15, bus: 'effects' },
   ant_bite_supermajor_01:{ volume: 0.20, bus: 'effects' },
   ant_bite_supermajor_02:{ volume: 0.20, bus: 'effects' },
   impact_chitin:         { volume: 0.14, bus: 'effects' },
   ant_death:             { volume: 0.15, bus: 'effects' },

   // Weather & Disasters (Full environmental presence)
   nearThunder:           { volume: 0.55, bus: 'effects' },
   distantThunder:        { volume: 0.25, bus: 'effects' },
   destructiveLightning:  { volume: 0.75, bus: 'effects' },
   flood:                 { volume: 0.45, bus: 'effects' },
   earthquake:            { volume: 0.60, bus: 'effects' },
   cave_in:               { volume: 0.50, bus: 'effects' },

   // Ambient
   amb_nest_underground:  { volume: 0.32, bus: 'ambient' },
   amb_water_cavern:      { volume: 0.45, bus: 'ambient' },
   rain_underground:      { volume: 0.70, bus: 'ambient' },
   rain_surface:          { volume: 0.70, bus: 'ambient' },
   wind:                  { volume: 0.70, bus: 'ambient' }
  };

  // Activity loop state tracking
  this.footstepsNormalActive = false;
  this.footstepsHeavyActive = false;
  this.diggingNormalActive = false;
  this.diggingHeavyActive = false;

  // Browser Autoplay Policy unlocker
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
   const unlock = () => {
    this.unlocked = true;
    for (const item of this.activeLoops.values()) {
     const audio = item?.audio || item;
     if (audio && audio.paused) {
      audio.play().catch(() => {});
     }
    }
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
   };
   window.addEventListener('pointerdown', unlock, { once: true });
   window.addEventListener('keydown', unlock, { once: true });
  }
 }

 enableSound(enabled) {
  this.enabled = Boolean(enabled);
  if (!this.enabled) {
   for (const [, item] of this.activeLoops) {
    try {
     const audio = item?.audio || item;
     if (audio && typeof audio.pause === 'function') audio.pause();
    } catch {}
   }
   this.activeLoops.clear();
  }
  return this.enabled;
 }

 getBusVolume(busName = 'effects') {
  const master = this.buses.master ?? this.masterVolume;
  const bus = this.buses[busName] ?? 1.0;
  return Math.max(0, Math.min(1, master * bus));
 }

 setBusVolume(busName, vol) {
  const v = Math.max(0, Math.min(1, vol));
  if (busName === 'master') {
   this.masterVolume = v;
   this.buses.master = v;
  } else if (this.buses[busName] !== undefined) {
   this.buses[busName] = v;
  }
  // Update running loops to reflect new bus volume
  for (const [key, item] of this.activeLoops.entries()) {
   if (item && item.audio) {
    const bus = item.bus || (['rain_underground', 'rain_surface', 'wind', 'amb_nest_underground', 'amb_water_cavern'].includes(key) ? 'ambient' : 'effects');
    const baseVol = item.baseVol ?? 1.0;
    item.audio.volume = Math.max(0, Math.min(1, this.getBusVolume(bus) * baseVol * (item.volumeScale || 1.0)));
   }
  }
 }

 setMasterVolume(vol) {
  this.setBusVolume('master', vol);
 }

 resolveCue(cue) {
  if (cue === 'rockStrike' || cue === 'rock_strike') {
   const p = this.variantPools.rockStrike;
   return p[Math.floor(Math.random() * p.length)];
  }
  if (cue === 'chamberBuildPack' || cue === 'chamber_pack') {
   const p = this.variantPools.chamberBuildPack;
   return p[Math.floor(Math.random() * p.length)];
  }
  if (cue === 'antBiteWorker' || cue === 'biteWorker') {
   const p = this.variantPools.biteWorker;
   return p[Math.floor(Math.random() * p.length)];
  }
  if (cue === 'antBiteSoldier' || cue === 'biteSoldier') {
   const p = this.variantPools.biteSoldier;
   return p[Math.floor(Math.random() * p.length)];
  }
  if (cue === 'antBiteSupermajor' || cue === 'biteSupermajor') {
   const p = this.variantPools.biteSupermajor;
   return p[Math.floor(Math.random() * p.length)];
  }
  if (cue === 'nearThunder') {
   const p = this.variantPools.thunder;
   return p[Math.floor(Math.random() * p.length)];
  }
  if (cue === 'distantThunder') {
   const p = this.variantPools.thunder;
   return p[Math.floor(Math.random() * p.length)];
  }
  if (cue === 'destructiveLightning') {
   return 'thunder_02';
  }
  if (cue === 'flood' || cue === 'inflow') return 'flood';
  if (cue === 'earthquake') return 'earthquake';
  if (cue === 'caveIn' || cue === 'cave_in') return 'cave_in';
  if (cue === 'antDig') return 'ant_dig';
  if (cue === 'antDigHeavy') return 'ant_dig_heavy';
  if (cue === 'chamberBuiltComplete') return 'chamber_built_complete';
  if (cue === 'soilDropPit') return 'soil_drop_pit';
  if (cue === 'soilDropFloor') return 'soil_drop_floor';
  if (cue === 'corpsePickup') return 'corpse_pickup';
  if (cue === 'corpseStore') return 'corpse_store';
  if (cue === 'seedStore') return 'seed_store';
  if (cue === 'feederChewFood') return 'feeder_chew_food';
  if (cue === 'antEat') return 'ant_eat';
  if (cue === 'antDrink') return 'ant_drink';
  if (cue === 'waterDropletExtract') return 'water_droplet_extract';
  if (cue === 'queenLayEgg') return 'queen_lay_egg';
  if (cue === 'eggHatch') return 'egg_hatch';
  if (cue === 'antAlarmRetreat') return 'ant_alarm_retreat';
  if (cue === 'soldierThreatResponse') return 'soldier_threat_response';
  if (cue === 'impactChitin') return 'impact_chitin';
  if (cue === 'antDeath') return 'ant_death';
  return cue;
 }

 getAudio(path, loop = false) {
  if (!this.enabled || typeof Audio === 'undefined') return null;
  try {
   const audio = new Audio(path);
   audio.loop = loop;
   audio.volume = this.getBusVolume('effects') * 0.2;
   return audio;
  } catch {
   return null;
  }
 }

 play(key, options = {}) {
  let volumeScale = 1.0;
  let pitchVariation = true;
  let bus = null;

  if (typeof options === 'number') {
   volumeScale = options;
  } else if (typeof options === 'object' && options !== null) {
   if (options.volumeScale !== undefined) volumeScale = options.volumeScale;
   if (options.pitchVariation !== undefined) pitchVariation = options.pitchVariation;
   if (options.bus !== undefined) bus = options.bus;
  }

  const resolved = this.resolveCue(key);
  const chosenPath = this.soundPaths[resolved] || this.soundPaths[key] || key;

  this.lastPlayed.push({ key, resolved, chosenPath, time: Date.now() });
  if (this.lastPlayed.length > 30) this.lastPlayed.shift();

  if (!this.enabled || typeof Audio === 'undefined' || !chosenPath) return;

  const profile = this.cueProfiles[key] || this.cueProfiles[resolved] || { volume: 0.15, bus: 'effects' };
  const baseVol = profile.volume ?? 0.15;
  const busName = bus || profile.bus || (['rain_underground', 'rain_surface', 'wind', 'amb_nest_underground', 'amb_water_cavern'].includes(resolved) ? 'ambient' : 'effects');
  const targetVol = Math.max(0, Math.min(1, this.getBusVolume(busName) * baseVol * volumeScale));

  try {
   const audio = new Audio(chosenPath);
   audio.volume = targetVol;
   if (pitchVariation) {
    // ±8% randomized pitch variation to prevent acoustic repetition
    const pitch = 1.0 + (Math.random() * 0.16 - 0.08);
    audio.playbackRate = pitch;
   }
   audio.play().catch(() => {});
  } catch {}
 }

 setLoop(key, active, options = {}) {
  let volumeScale = 1.0;
  let bus = null;
  let offset = 0;

  if (typeof options === 'number') {
   volumeScale = options;
  } else if (typeof options === 'object' && options !== null) {
   if (options.volumeScale !== undefined) volumeScale = options.volumeScale;
   if (options.bus !== undefined) bus = options.bus;
   if (options.offset !== undefined) offset = options.offset;
  }

  const profileKey = options.profileKey || key;
  const profile = this.cueProfiles[profileKey] || this.cueProfiles[key] || { volume: 1.0, bus: 'ambient' };
  const baseVol = profile.volume ?? 1.0;
  const busName = bus || profile.bus || (['rain_underground', 'rain_surface', 'wind', 'amb_nest_underground', 'amb_water_cavern'].includes(key) ? 'ambient' : 'effects');
  const path = options.path || this.soundPaths[key] || key;

  if (!this.enabled || typeof Audio === 'undefined') {
   if (active) {
    this.activeLoops.set(key, { path, bus: busName, volumeScale, baseVol, audio: null });
   } else {
    this.activeLoops.delete(key);
   }
   return;
  }

  let entry = this.activeLoops.get(key);
  if (active) {
   const targetVol = Math.max(0, Math.min(1, this.getBusVolume(busName) * baseVol * volumeScale));
   if (!entry || !entry.audio) {
    try {
     const audio = new Audio(path);
     audio.loop = true;
     audio.volume = targetVol;
     if (offset > 0) {
      try {
       if (audio.readyState >= 1) {
        audio.currentTime = offset;
       } else {
        audio.addEventListener('loadedmetadata', () => {
         try { audio.currentTime = offset; } catch {}
        }, { once: true });
       }
      } catch {}
     }
     const p = audio.play();
     if (p && typeof p.catch === 'function') p.catch(() => {});
     this.activeLoops.set(key, { audio, bus: busName, volumeScale, baseVol, path });
    } catch {}
   } else {
    entry.volumeScale = volumeScale;
    entry.baseVol = baseVol;
    entry.audio.volume = targetVol;
    if (entry.audio.paused && this.unlocked) {
     entry.audio.play().catch(() => {});
    }
   }
  } else if (entry) {
   if (entry.audio) {
    try {
     entry.audio.pause();
     entry.audio.currentTime = 0;
    } catch {}
   }
   this.activeLoops.delete(key);
  }
 }

 updateDigging(sim) {
  if (!sim || !sim.ants) return;

  let normalDigCount = 0;
  let heavyDigCount = 0;

  for (const a of sim.ants) {
   if (!a.alive || a.state !== 'digging') continue;
   if (a.colonyId && a.colonyId !== 1) continue;
   if (a.type === 'supermajor' || a.type === 'major') {
    heavyDigCount++;
   } else {
    normalDigCount++;
   }
  }

  // Normal ant digging loop
  if (normalDigCount > 0) {
   if (!this.diggingNormalActive) {
    this.diggingNormalActive = true;
    const randomOffset = Math.random() * 2.0;
    this.setLoop('dig_normal', true, { path: this.soundPaths.ant_dig, bus: 'effects', profileKey: 'dig_normal', offset: randomOffset });
   }
  } else if (this.diggingNormalActive) {
   this.setLoop('dig_normal', false);
   this.diggingNormalActive = false;
  }

  // Heavy ant digging loop
  if (heavyDigCount > 0) {
   if (!this.diggingHeavyActive) {
    this.diggingHeavyActive = true;
    const randomOffset = Math.random() * 2.0;
    this.setLoop('dig_heavy', true, { path: this.soundPaths.ant_dig_heavy, bus: 'effects', profileKey: 'dig_heavy', offset: randomOffset });
   }
  } else if (this.diggingHeavyActive) {
   this.setLoop('dig_heavy', false);
   this.diggingHeavyActive = false;
  }
 }

 updateFootsteps(sim) {
  if (!sim || !sim.ants) return;

  let normalMovingCount = 0;
  let heavyMovingCount = 0;

  for (const a of sim.ants) {
   if (!a.alive || a.state === 'idle' || a.state === 'digging') continue;
   if (a.colonyId && a.colonyId !== 1) continue;
   const isMoving = Boolean(a.isMoving) || Boolean(a.path && a.path.length > 0 && (!a.waitTimer || a.waitTimer <= 0.1));
   if (!isMoving) continue;
   if (a.type === 'supermajor' || a.type === 'major') {
    heavyMovingCount++;
   } else if (a.type !== 'queen') {
    normalMovingCount++;
   }
  }

  // Normal ant walking loop
  if (normalMovingCount > 0) {
   if (!this.footstepsNormalActive) {
    const chosen = Math.random() < 0.5 ? 'ant_footsteps_loop_01' : 'ant_footsteps_loop_02';
    this.currentFootstepsNormal = chosen;
    this.footstepsNormalActive = true;
    const randomOffset = Math.random() * 2.0;
    this.setLoop('footsteps_normal', true, { path: this.soundPaths[chosen], bus: 'effects', profileKey: 'footsteps_normal', offset: randomOffset });
   }
  } else if (this.footstepsNormalActive) {
   this.setLoop('footsteps_normal', false);
   this.footstepsNormalActive = false;
   this.currentFootstepsNormal = null;
  }

  // Heavy ant walking loop
  if (heavyMovingCount > 0) {
   if (!this.footstepsHeavyActive) {
    const chosen = Math.random() < 0.5 ? 'ant_heavy_footsteps_loop_01' : 'ant_heavy_footsteps_loop_02';
    this.currentFootstepsHeavy = chosen;
    this.footstepsHeavyActive = true;
    const randomOffset = Math.random() * 2.0;
    this.setLoop('footsteps_heavy', true, { path: this.soundPaths[chosen], bus: 'effects', profileKey: 'footsteps_heavy', offset: randomOffset });
   }
  } else if (this.footstepsHeavyActive) {
   this.setLoop('footsteps_heavy', false);
   this.footstepsHeavyActive = false;
   this.currentFootstepsHeavy = null;
  }
 }

 updateAntActivity(sim) {
  if (!sim) return;
  this.updateFootsteps(sim);
  this.updateDigging(sim);
 }

 update(climate, camera = null, sim = null) {
  // Surface proximity: surface is y ~ -25, deep underground is y >= 0
  const camY = camera ? camera.y : 0;
  const camX = camera ? camera.x : 0;
  // 0 when deep underground (camY >= 0), 1 when at surface (camY <= -20)
  const surfaceProximity = Math.max(0, Math.min(1, (-camY) / 20));

  // 1. Weather Loops
  if (climate) {
   if (climate.rainActive) {
    const intensity = climate.rainIntensity || 0.75;
    const ugVol = (0.3 + (1 - surfaceProximity) * 0.7) * intensity;
    const surfVol = (0.1 + surfaceProximity * 0.9) * intensity;
    this.setLoop('rain_underground', true, { volumeScale: ugVol, bus: 'ambient' });
    this.setLoop('rain_surface', true, { volumeScale: surfVol, bus: 'ambient' });
   } else {
    this.setLoop('rain_underground', false);
    this.setLoop('rain_surface', false);
   }

   if (climate.heavyWindActive) {
    const windVol = (0.35 + surfaceProximity * 0.65) * 0.85;
    this.setLoop('wind', true, { volumeScale: windVol, bus: 'ambient' });
   } else {
    this.setLoop('wind', false);
   }
  }

  // 2. Underground Nest Ambience Loop
  // Active underground; muffled at the surface
  const nestVol = Math.max(0.05, (1 - surfaceProximity * 0.85) * 0.45);
  this.setLoop('amb_nest_underground', true, { volumeScale: nestVol, bus: 'ambient' });

  // 3. Water Cavern Ambience Loop
  // Only plays when camera is near well tiles (c.isWell || c.zone === 'well')
  let wellNearby = false;
  if (sim && sim.world) {
   if (sim.world.cells) {
    for (const c of sim.world.cells.values()) {
     if ((c.isWell || c.zone === 'well') && c.discovered) {
      if (Math.hypot(c.x - camX, c.y - camY) <= 8) {
       wellNearby = true;
       break;
      }
     }
    }
   }
   if (!wellNearby && sim.world.features) {
    for (const f of sim.world.features) {
     if (f.type === 'well') {
      const cell = sim.world.peek(f.x, f.y);
      if (cell && cell.discovered && Math.hypot(f.x - camX, f.y - camY) <= 8) {
       wellNearby = true;
       break;
      }
     }
    }
   }
  }
  if (wellNearby) {
   this.setLoop('amb_water_cavern', true, { volumeScale: 0.50, bus: 'ambient' });
  } else {
   this.setLoop('amb_water_cavern', false);
  }

  // 4. Ant Activity (Footsteps & Digging)
  if (sim) {
   this.updateAntActivity(sim);
  }
 }

 onWeatherChange(climate) {
  this.update(climate);
 }
}

AntGame.AudioCoordinator = new AudioCoordinator();
})();
