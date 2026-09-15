/*
 * UNDERFOOT CLIMATE & WEATHER SYSTEM
 * Canonical Setting: San Antonio–KM18 Cloud-Forest Plateau, Valle del Cauca, Colombia
 * Elevation: ~1,900–2,000 m. Climatological Center: ~17°C, 85–95% RH.
 *
 * Implements:
 * - 30-minute game days (15 min Day / 15 min Night)
 * - Real calendar year starting January 1 with real month lengths
 * - 4 bimodal rainfall seasons using IDEAM Pichindé 1991–2020 rain-day normals
 * - Layered weather escalation: Rain -> Heavy Wind (45%) -> Thunderstorm (65%)
 * - Continuous thermodynamics (13–21°C) and cloud-forest humidity (80–100% RH)
 * - Heavy wind cave-in checks (5%/min), rain infiltration checks with diminishing odds
 * - Destructive lightning strikes (max 1/storm) with permanent surface breaches
 * - Independent geological earthquakes with entity trapping & suffocation
 * - Absolute Queen protection from all collapses
 */
(()=>{
const MONTHS = [
 { name: 'January', days: 31, rainDays: 9.6, rainChance: 0.310, meanTemp: 17.0, phase: 'First Less-Rainy Period' },
 { name: 'February', days: 28, rainDays: 9.2, rainChance: 0.326, meanTemp: 17.1, phase: 'First Less-Rainy Period' },
 { name: 'March', days: 31, rainDays: 13.7, rainChance: 0.442, meanTemp: 16.9, phase: 'First Wetter Period' },
 { name: 'April', days: 30, rainDays: 16.2, rainChance: 0.540, meanTemp: 16.7, phase: 'First Wetter Period' },
 { name: 'May', days: 31, rainDays: 16.1, rainChance: 0.519, meanTemp: 16.7, phase: 'First Wetter Period' },
 { name: 'June', days: 30, rainDays: 9.7, rainChance: 0.323, meanTemp: 17.0, phase: 'Second Less-Rainy Period' },
 { name: 'July', days: 31, rainDays: 7.9, rainChance: 0.255, meanTemp: 17.3, phase: 'Second Less-Rainy Period' },
 { name: 'August', days: 31, rainDays: 5.9, rainChance: 0.190, meanTemp: 17.5, phase: 'Second Less-Rainy Period' },
 { name: 'September', days: 30, rainDays: 9.5, rainChance: 0.317, meanTemp: 17.3, phase: 'Second Wetter Period' },
 { name: 'October', days: 31, rainDays: 13.8, rainChance: 0.445, meanTemp: 16.9, phase: 'Second Wetter Period' },
 { name: 'November', days: 30, rainDays: 13.9, rainChance: 0.463, meanTemp: 16.8, phase: 'Second Wetter Period' },
 { name: 'December', days: 31, rainDays: 11.3, rainChance: 0.365, meanTemp: 16.9, phase: 'First Less-Rainy Period' }
];

const SECONDS_PER_DAY = 1800; // 30 real minutes per game day
const SECONDS_PER_HOUR = SECONDS_PER_DAY / 24; // 75 seconds per game hour
const INFILTRATION_DIMINISHING = [0.05, 0.03, 0.015, 0.0075, 0.00375, 0.001875];
const MIN_INFILTRATION_FLOOR = 0.001;

class Climate {
 constructor(seed = 12345, sim = null) {
  this.sim = sim;
  this.seed = seed;
  this.random = new (AntGame.Random || class { constructor(s){this.s=s>>>0;} next(){this.s=(this.s*1664525+1013904223)>>>0;return this.s/4294967296;} })(seed + 9001);

  // Calendar State (Starts Jan 1, Year 1)
  this.year = 1;
  this.monthIndex = 0; // 0 = Jan
  this.dayOfMonth = 1;
  this.dayTime = 0; // 0 to 1800s within day

  // Day / Night
  this.dayProgress = 0;
  this.isDay = true;
  this.hour = 6;
  this.minute = 0;

  // Rain day & events
  this.isRainDay = false;
  this.scheduledRainEvents = [];
  this.currentRainEvent = null;

  // Weather States
  this.rainActive = false;
  this.rainIntensity = 0; // 0 to 1
  this.heavyWindActive = false;
  this.heavyWindTimer = 0;
  this.thunderstormActive = false;
  this.thunderstormTimer = 0;
  this.destructiveLightningUsed = false;

  // Periodic Disaster Check Timers (checked once per minute = 60s)
  this.infiltrationCheckTimer = 0;
  this.infiltrationSuccessCount = 0;
  this.caveInCheckTimer = 0;
  this.lightningCheckTimer = 0;
  this.ambientThunderTimer = 0;

  // Atmosphere
  this.cloudState = 'Partly Cloudy';
  this.temperature = 17.0;
  this.targetTemperature = 17.0;
  this.humidity = 90.0;
  this.targetHumidity = 90.0;
  this.weatherNoise = 0;
  this.weatherNoiseTimer = 0;

  // Screen shake & ambient lightning FX for renderer
  this.screenShake = 0; // 0 to 1
  this.lightningFlash = 0; // 0 to 1

  // Active Earthquake state
  this.earthquake = null; // { phase: 'warning'|'tremor', timer: 4.0, target: {x,y} }

  // Initial Day Setup
  this.evaluateNewDay();
 }

 get currentMonth() {
  return MONTHS[this.monthIndex];
 }

 get rainfallPhase() {
  return this.currentMonth.phase;
 }

 get formattedDate() {
  return `${this.currentMonth.name} ${this.dayOfMonth}, Year ${this.year}`;
 }

 get dateFormatted() {
  return `${this.currentMonth.name.slice(0, 3)} ${this.dayOfMonth}, Yr ${this.year}`;
 }

 get formattedTime() {
  const h = String(this.hour).padStart(2, '0');
  const m = String(this.minute).padStart(2, '0');
  return `${h}:${m}`;
 }

 get timeOfDayFormatted() {
  const h = String(this.hour).padStart(2, '0');
  const m = String(this.minute).padStart(2, '0');
  let label = 'Night';
  if (this.hour >= 5 && this.hour < 7) label = 'Dawn';
  else if (this.hour >= 7 && this.hour < 12) label = 'Morning';
  else if (this.hour >= 12 && this.hour < 17) label = 'Afternoon';
  else if (this.hour >= 17 && this.hour < 19) label = 'Dusk';
  return `${h}:${m} (${label})`;
 }

 get seasonName() {
  return this.currentMonth.name;
 }

 get seasonPhase() {
  return this.currentMonth.phase;
 }

 get weather() {
  if (this.thunderstormActive) return 'thunderstorm';
  if (this.heavyWindActive) return 'heavy_wind';
  if (this.rainActive) return 'rain';
  if (this.cloudState === 'Clear') return 'clear';
  return 'overcast';
 }

 get weatherSummary() {
  if (this.earthquake) return 'EARTHQUAKE';
  if (this.thunderstormActive) return 'Thunderstorm';
  if (this.heavyWindActive && this.rainActive) return 'Rain & Heavy Wind';
  if (this.heavyWindActive) return 'Heavy Wind';
  if (this.rainActive) return 'Rain';
  return this.cloudState;
 }

 get infiltrationChance() {
  if (!this.rainActive) return 0;
  return this.infiltrationSuccessCount < INFILTRATION_DIMINISHING.length
   ? INFILTRATION_DIMINISHING[this.infiltrationSuccessCount]
   : MIN_INFILTRATION_FLOOR;
 }

 get groundwaterSaturation() {
  let base = 85.0;
  if (this.currentMonth.phase === 'First Wetter Period' || this.currentMonth.phase === 'Second Wetter Period') base = 95.0;
  if (this.rainActive) base = 100.0;
  return base;
 }

 forceWeather(type) {
  if (type === 'clear') {
   this.rainActive = false;
   this.heavyWindActive = false;
   this.thunderstormActive = false;
   this.cloudState = 'Clear';
   this.currentRainEvent = null;
  } else if (type === 'rain') {
   this.rainActive = true;
   this.rainIntensity = 0.8;
   this.heavyWindActive = false;
   this.thunderstormActive = false;
   this.cloudState = 'Rain';
  } else if (type === 'heavy_wind') {
   this.rainActive = true;
   this.rainIntensity = 0.85;
   this.heavyWindActive = true;
   this.heavyWindTimer = 300;
   this.thunderstormActive = false;
   this.cloudState = 'Rain';
  } else if (type === 'thunderstorm') {
   this.rainActive = true;
   this.rainIntensity = 1.0;
   this.heavyWindActive = true;
   this.heavyWindTimer = 300;
   this.thunderstormActive = true;
   this.thunderstormTimer = 300;
   this.cloudState = 'Thunderstorm';
  }
  if (AntGame.AudioCoordinator) {
   AntGame.AudioCoordinator.onWeatherChange(this);
  }
 }

 evaluateNewDay() {
  const month = this.currentMonth;
  // Roll if today is a rain day based on IDEAM Pichindé normals
  this.isRainDay = this.random.next() < month.rainChance;
  this.scheduledRainEvents = [];
  this.currentRainEvent = null;
  this.infiltrationSuccessCount = 0;
  this.destructiveLightningUsed = false;

  if (this.isRainDay) {
   // Schedule 1 or 2 rain events for the day
   const count = this.random.next() < 0.65 ? 1 : 2;
   for (let i = 0; i < count; i++) {
    // Diurnal start weighting: afternoon (14:00-17:00 / 0.58-0.71) or morning (06:00-09:00 / 0.25-0.375) or night
    let startRatio;
    const r = this.random.next();
    if (r < 0.50) {
     // Afternoon peak
     startRatio = 0.58 + this.random.next() * 0.15;
    } else if (r < 0.75) {
     // Morning peak
     startRatio = 0.25 + this.random.next() * 0.13;
    } else {
     // Evening / nocturnal convection
     startRatio = 0.75 + this.random.next() * 0.22;
    }
    const startTime = Math.floor(startRatio * SECONDS_PER_DAY);

    // Duration: 70% ordinary (3-8 min), 20% convective (1-3 min), 10% persistent (8-12+ min)
    let durationSeconds;
    const durRoll = this.random.next();
    if (durRoll < 0.70) {
     durationSeconds = 180 + this.random.next() * 300; // 3 to 8 min
    } else if (durRoll < 0.90) {
     durationSeconds = 60 + this.random.next() * 120; // 1 to 3 min
    } else {
     durationSeconds = 480 + this.random.next() * 240; // 8 to 12 min
    }

    // Weather Escalation:
    // 45% conditional roll for Heavy Wind
    const hasWind = this.random.next() < 0.45;
    const windDuration = hasWind ? (60 + this.random.next() * 180) : 0; // 1 to 4 min

    // 65% conditional roll for Thunderstorm (once Wind is present)
    const hasThunder = hasWind && (this.random.next() < 0.65);
    const thunderDuration = hasThunder ? (60 + this.random.next() * 150) : 0; // 1 to 3.5 min

    this.scheduledRainEvents.push({
     startTime,
     duration: durationSeconds,
     hasWind,
     windDuration,
     hasThunder,
     thunderDuration,
     executed: false
    });
   }
   // Sort chronologically
   this.scheduledRainEvents.sort((a, b) => a.startTime - b.startTime);
  }
 }

 update(dt) {
  this.dayTime += dt;
  if (this.dayTime >= SECONDS_PER_DAY) {
   this.dayTime -= SECONDS_PER_DAY;
   this.advanceCalendarDay();
  }

  this.dayProgress = this.dayTime / SECONDS_PER_DAY;
  this.isDay = this.dayProgress < 0.5; // First 15 min is Day, second 15 min is Night

  const totalGameHours = (6 + (this.dayTime / SECONDS_PER_DAY) * 24) % 24;
  this.hour = Math.floor(totalGameHours);
  this.minute = Math.floor((totalGameHours % 1) * 60);

  this.updateWeatherEvents(dt);
  this.updateThermodynamics(dt);
  this.updateDisasters(dt);
  this.updateAudioAndVisualFX(dt);
 }

 advanceCalendarDay() {
  this.dayOfMonth++;
  const daysInMonth = this.currentMonth.days;
  if (this.dayOfMonth > daysInMonth) {
   this.dayOfMonth = 1;
   this.monthIndex++;
   if (this.monthIndex >= MONTHS.length) {
    this.monthIndex = 0;
    this.year++;
   }
  }
  this.evaluateNewDay();
  if (this.sim) {
   this.sim.emit(`A new day begins: ${this.formattedDate} (${this.rainfallPhase}).`);
   this.sim.onNewDay?.();
  }
 }

 updateWeatherEvents(dt) {
  // Check scheduled rain events
  if (this.isRainDay && this.scheduledRainEvents.length) {
   for (const ev of this.scheduledRainEvents) {
    if (!ev.executed && this.dayTime >= ev.startTime && this.dayTime <= ev.startTime + ev.duration) {
     this.startRainEvent(ev);
    }
   }
  }

  // Progress active rain event
  if (this.currentRainEvent) {
   this.currentRainEvent.elapsed = (this.currentRainEvent.elapsed || 0) + dt;
   if (this.currentRainEvent.elapsed >= this.currentRainEvent.duration) {
    this.endRainEvent();
   }
  }

  // Progress Heavy Wind timer
  if (this.heavyWindActive) {
   this.heavyWindTimer -= dt;
   if (this.heavyWindTimer <= 0) {
    this.heavyWindActive = false;
   }
  }

  // Progress Thunderstorm timer
  if (this.thunderstormActive) {
   this.thunderstormTimer -= dt;
   if (this.thunderstormTimer <= 0) {
    this.thunderstormActive = false;
   }
  }

  // Cloud/fog state updates when not raining
  if (!this.rainActive) {
   this.updateCloudCover(dt);
  } else {
   this.cloudState = this.thunderstormActive ? 'Thunderstorm' : 'Rain';
  }
 }

 startRainEvent(ev) {
  ev.executed = true;
  this.currentRainEvent = ev;
  ev.elapsed = 0;
  this.rainActive = true;
  this.rainIntensity = 0.7 + this.random.next() * 0.3;
  this.infiltrationSuccessCount = 0;
  this.destructiveLightningUsed = false;

  if (ev.hasWind) {
   this.heavyWindActive = true;
   this.heavyWindTimer = ev.windDuration;
  }
  if (ev.hasThunder) {
   this.thunderstormActive = true;
   this.thunderstormTimer = ev.thunderDuration;
  }

  if (this.sim) {
   const desc = ev.hasThunder ? 'Thunderstorm' : ev.hasWind ? 'Rain with Heavy Wind' : 'Rain';
   this.sim.emit(`Weather alert: ${desc} has begun.`);
  }
  if (AntGame.AudioCoordinator) {
   AntGame.AudioCoordinator.onWeatherChange(this);
  }
 }

 endRainEvent() {
  this.rainActive = false;
  this.rainIntensity = 0;
  this.currentRainEvent = null;
  this.cloudState = 'Cloudy';
  if (this.sim) {
   this.sim.emit('The rain has ceased.');
  }
  if (AntGame.AudioCoordinator) {
   AntGame.AudioCoordinator.onWeatherChange(this);
  }
 }

 updateCloudCover(dt) {
  // San Antonio cloud forest: frequent afternoon fog/low cloud as moist Pacific air condenses on the ridge
  this.cloudTimer = (this.cloudTimer || 0) + dt;
  if (this.cloudTimer >= 45) { // Evaluate every 45s
   this.cloudTimer = 0;
   const r = this.random.next();
   if (this.hour >= 13 && this.hour <= 18) {
    // Afternoon: strong fog and low cloud tendency
    this.cloudState = r < 0.55 ? 'Fog / Low Cloud' : r < 0.85 ? 'Cloudy' : 'Partly Cloudy';
   } else if (this.isDay) {
    // Morning: clear or partly cloudy
    this.cloudState = r < 0.40 ? 'Partly Cloudy' : r < 0.75 ? 'Cloudy' : 'Clear';
   } else {
    // Night: cloudy or fog
    this.cloudState = r < 0.45 ? 'Cloudy' : r < 0.75 ? 'Fog / Low Cloud' : 'Partly Cloudy';
   }
  }
 }

 updateThermodynamics(dt) {
  // 1. Monthly baseline mean
  const monthlyMean = this.currentMonth.meanTemp; // 16.7 to 17.5°C

  // 2. Diurnal curve: min pre-dawn (~05:00, -2.5°C), max afternoon (~14:30, +3.0°C)
  const hourAngle = ((this.hour + this.minute / 60) - 14.5) * (Math.PI / 12);
  const dailyOffset = Math.cos(hourAngle) * 2.8;

  // 3. Cloud / rain effects
  let cloudOffset = 0;
  if (this.rainActive) cloudOffset = -1.8;
  else if (this.cloudState === 'Fog / Low Cloud') cloudOffset = -1.2;
  else if (this.cloudState === 'Cloudy') cloudOffset = -0.8;
  else if (this.cloudState === 'Clear' && this.isDay) cloudOffset = +1.4;

  // 4. Weather noise (slow smooth drift)
  this.weatherNoiseTimer -= dt;
  if (this.weatherNoiseTimer <= 0) {
   this.weatherNoise = (this.random.next() - 0.5) * 0.8;
   this.weatherNoiseTimer = 60 + this.random.next() * 60;
  }

  this.targetTemperature = Math.max(13.2, Math.min(20.8, monthlyMean + dailyOffset + cloudOffset + this.weatherNoise));
  // Smoothly approach target temperature
  this.temperature += (this.targetTemperature - this.temperature) * Math.min(1, dt * 0.1);
  this.temperature = Math.max(13.0, Math.min(21.0, this.temperature));

  // 5. Humidity Modeling (80% to 100% RH)
  let baseHumidity = 90.0;
  if (this.currentMonth.phase === 'Second Less-Rainy Period') baseHumidity = 86.0;
  else if (this.currentMonth.phase === 'First Wetter Period' || this.currentMonth.phase === 'Second Wetter Period') baseHumidity = 92.0;

  let diurnalHumOffset = this.isDay ? -3.5 : +3.0;
  if (this.cloudState === 'Clear' && this.hour >= 11 && this.hour <= 15) diurnalHumOffset = -8.0;

  let weatherHumOffset = 0;
  if (this.rainActive) weatherHumOffset = +8.0;
  else if (this.cloudState === 'Fog / Low Cloud') weatherHumOffset = +6.0;

  this.targetHumidity = Math.max(78.0, Math.min(100.0, baseHumidity + diurnalHumOffset + weatherHumOffset));
  this.humidity += (this.targetHumidity - this.humidity) * Math.min(1, dt * 0.1);
  this.humidity = Math.max(75.0, Math.min(100.0, this.humidity));
 }

 updateDisasters(dt) {
  if (!this.sim) return;

  // 1. Rain Infiltration: check once per minute while rain is active
  if (this.rainActive) {
   this.infiltrationCheckTimer += dt;
   if (this.infiltrationCheckTimer >= 60) {
    this.infiltrationCheckTimer = 0;
    const chance = this.infiltrationSuccessCount < INFILTRATION_DIMINISHING.length
     ? INFILTRATION_DIMINISHING[this.infiltrationSuccessCount]
     : MIN_INFILTRATION_FLOOR;

    if (this.random.next() < chance) {
     this.infiltrationSuccessCount++;
     this.sim.triggerRainInflow();
    }
   }
  } else {
   this.infiltrationCheckTimer = 0;
  }

  // 2. Heavy Wind Cave-In: check once per minute (5% chance)
  if (this.heavyWindActive) {
   this.caveInCheckTimer += dt;
   if (this.caveInCheckTimer >= 60) {
    this.caveInCheckTimer = 0;
    if (this.random.next() < 0.05) {
     this.sim.triggerCaveIn('wind');
    }
   }
  } else {
   this.caveInCheckTimer = 0;
  }

  // 3. Thunderstorm: ambient lightning & destructive strike check
  if (this.thunderstormActive) {
   this.ambientThunderTimer -= dt;
   if (this.ambientThunderTimer <= 0) {
    this.ambientThunderTimer = 8 + this.random.next() * 12; // Every 8 to 20s
    this.lightningFlash = 0.85; // Visual flash
    if (AntGame.AudioCoordinator) {
     const near = this.random.next() < 0.40;
     AntGame.AudioCoordinator.play(near ? 'nearThunder' : 'distantThunder');
    }
   }

   this.lightningCheckTimer += dt;
   if (this.lightningCheckTimer >= 60) {
    this.lightningCheckTimer = 0;
    if (!this.destructiveLightningUsed && this.random.next() < 0.02) {
     this.destructiveLightningUsed = true;
     this.sim.triggerLightningStrike();
    }
   }
  } else {
   this.lightningCheckTimer = 0;
   this.ambientThunderTimer = 0;
  }

  // 4. Earthquake progression
  if (this.earthquake) {
   this.earthquake.timer -= dt;
   if (this.earthquake.phase === 'warning') {
    this.screenShake = Math.min(1.0, this.screenShake + dt * 0.4);
    if (this.earthquake.timer <= 0) {
     this.earthquake.phase = 'tremor';
     this.earthquake.timer = 2.5;
     this.sim.executeEarthquake(this.earthquake.target);
    }
   } else if (this.earthquake.phase === 'tremor') {
    this.screenShake = Math.max(0, this.screenShake - dt * 0.35);
    if (this.earthquake.timer <= 0) {
     this.earthquake = null;
     this.screenShake = 0;
    }
   }
  }
 }

 updateAudioAndVisualFX(dt) {
  // Fade visual effects
  if (this.lightningFlash > 0) {
   this.lightningFlash = Math.max(0, this.lightningFlash - dt * 4.0);
  }
 }

 triggerEarthquake() {
  if (this.earthquake || !this.sim) return;
  // Choose target near colony
  const ant = this.sim.ants.find(a => a.alive && a.colonyId === 1 && a.type !== 'queen') || this.sim.queen();
  const target = ant ? { x: Math.round(ant.x), y: Math.round(ant.y) } : { ...this.sim.nest };
  this.earthquake = {
   phase: 'warning',
   timer: 4.0, // 4-second ground rumble warning
   target
  };
  this.screenShake = 0.3;
  this.sim.emit('WARNING: Ground tremors detected! An earthquake is imminent!');
  if (AntGame.AudioCoordinator) {
   AntGame.AudioCoordinator.play('earthquake');
  }
 }

 serialize() {
  return {
   year: this.year,
   monthIndex: this.monthIndex,
   dayOfMonth: this.dayOfMonth,
   dayTime: this.dayTime,
   isRainDay: this.isRainDay,
   scheduledRainEvents: this.scheduledRainEvents,
   rainActive: this.rainActive,
   rainIntensity: this.rainIntensity,
   heavyWindActive: this.heavyWindActive,
   heavyWindTimer: this.heavyWindTimer,
   thunderstormActive: this.thunderstormActive,
   thunderstormTimer: this.thunderstormTimer,
   destructiveLightningUsed: this.destructiveLightningUsed,
   infiltrationSuccessCount: this.infiltrationSuccessCount,
   cloudState: this.cloudState,
   temperature: this.temperature,
   humidity: this.humidity
  };
 }

 restore(data) {
  if (!data) return;
  Object.assign(this, data);
  this.dayProgress = this.dayTime / SECONDS_PER_DAY;
  this.isDay = this.dayProgress < 0.5;
  const totalGameHours = (6 + (this.dayTime / SECONDS_PER_DAY) * 24) % 24;
  this.hour = Math.floor(totalGameHours);
  this.minute = Math.floor((totalGameHours % 1) * 60);
 }
}

AntGame.MONTHS = MONTHS;
AntGame.Climate = Climate;
})();
