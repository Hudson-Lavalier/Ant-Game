# Implementation Plan: Weather, Seasons, and Day Cycle Update

## Overview
Implement the complete, scientifically grounded Day/Night, Climate, Weather, and Geological Event system for Underfoot based on the San Antonio–KM18 cloud-forest specifications (`ant_game_complete_climate_map_cauca_cloud_forest.md` and `ant_game_FINAL_day_night_climate_weather_update.md`).

The update establishes a real regional Andean cloud-forest calendar (starting January 1), 30-minute game days (15 min Day / 15 min Night), bimodal rainfall seasonality with IDEAM Pichindé rain-day frequencies, layered weather escalation (Rain $\rightarrow$ Heavy Wind $\rightarrow$ Thunderstorm), continuous thermodynamics and humidity, cave-ins, underground rain infiltration, permanent lightning surface breaches, independent geological earthquakes with entity trapping/suffocation, surface hole daylight rendering, weather audio architecture, and developer telemetry controls.

> [!IMPORTANT]
> **Core Behavioral Rule:** Climate and weather change the environment; they do **not** apply arbitrary universal stat buffs or debuffs to ants or creatures.

---

## User Review Required

> [!NOTE]
> **Calendar Speed:** 1 full game day = 30 real minutes (15 min Day, 15 min Night). 1 calendar year = 365 game days (~182.5 real hours). This follows the specification's authentic calendar model.
>
> **Audio Assets:** Audio will be implemented via an audio coordinator that gracefully supports external `.ogg` audio files (rain, wind, thunderstorm, lightning, thunder, earthquake) without throwing errors when files are not yet present on disk.
>
> **Queen Safety:** All collapse events (Heavy Wind cave-ins and Earthquakes) strictly exclude any candidate area containing any Queen.

---

## Proposed Changes

### 1. Climate & Weather Engine

#### [NEW] [src/climate.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/climate.js)
Create `AntGame.Climate` encapsulating:
* **Calendar & Time Progression:**
  - 30 real-minute day (15 min Day, 15 min Night) with smooth `dayProgress` ($0.0 \rightarrow 1.0$) and continuous time of day (00:00 to 24:00).
  - Real month lengths: Jan: 31, Feb: 28, Mar: 31, Apr: 30, May: 31, Jun: 30, Jul: 31, Aug: 31, Sep: 30, Oct: 31, Nov: 30, Dec: 31.
  - 4 Bimodal Rainfall Phases:
    - Phase 1: First Less-Rainy Period (Dec–Feb)
    - Phase 2: First Wetter Period (Mar–May)
    - Phase 3: Second Less-Rainy Period (Jun–Aug)
    - Phase 4: Second Wetter Period (Sep–Nov)
* **Empirical Rain-Day Backbone (IDEAM Pichindé 1991–2020 normal):**
  - Jan: 31.0%, Feb: 32.6%, Mar: 44.2%, Apr: 54.0%, May: 51.9%, Jun: 32.3%, Jul: 25.5%, Aug: 19.0%, Sep: 31.7%, Oct: 44.5%, Nov: 46.3%, Dec: 36.5%.
  - Evaluated at the start of each calendar day to designate rain days.
* **Rain Event Scheduling & Diurnal Timing:**
  - 1 or 2 rain events on rain days with realistic diurnal start timing (afternoon peak around 15:00–16:00 equivalent, morning peak ~07:00, and evening/night convection).
  - Variable duration: ordinary (3–8 game min, center ~6 min), convective (1–3 min), or persistent (8–12+ min).
* **Layered Weather Escalation Hierarchy:**
  - Rain active $\rightarrow$ 45% conditional roll for Heavy Wind (duration 1–3 min, up to 4–5 min).
  - Heavy Wind active $\rightarrow$ 65% conditional roll for Thunderstorm (duration 1–3 min electrical phase).
  - Combined ~29% thunderstorm-per-rain-event (~50% per rain day).
* **Thermodynamics & Humidity Modeling:**
  - Monthly mean temperature center: 16.7°C to 17.5°C.
  - Smooth daily thermal curve: cool night (13–16°C), afternoon warm (17–21°C).
  - Cloud / rain cooling offset, clear sky daytime warming / night radiative cooling.
  - Relative humidity: 85–95% baseline, 95–100% during fog/rain, down toward ~80% on clear dry afternoons.
  - Cloud / fog states: `Clear`, `Partly Cloudy`, `Cloudy`, `Fog / Low Cloud`, `Rain`, `Thunderstorm`.
* **Infiltration & Disaster Tick Loops:**
  - Rain infiltration check: once/minute, diminishing probabilities (5% $\rightarrow$ 3% $\rightarrow$ 1.5% $\rightarrow$ 0.75% $\rightarrow$ 0.375% $\rightarrow$ 0.1875% $\rightarrow$ 0.1% floor) per rain event.
  - Heavy Wind cave-in check: once/minute, 5% chance.
  - Destructive lightning strike check: once/minute, 2% chance, max 1 destructive strike per thunderstorm.
  - Ambient lightning timer and earthquake trigger support.
* **Serialization:** Full state serialization and restoration (`serialize()` / `restore()`).

---

### 2. Colony Simulation Integration

#### [MODIFY] [src/simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js)
* **Lifecycle & State:**
  - Instantiate `this.climate = new AntGame.Climate(seed, this)` in `constructor`.
  - Update climate in `update(dt)` with delta time.
  - Track active inflows, lightning breaches, and trapped entities.
* **Infiltration & Flooding:**
  - `triggerRainInflow()`: generates invisible inflow into open space near a player ant (~112 water volume over ~2 game minutes).
  - `triggerLightningStrike()`: selects discovered/excavated tile near colony, creates permanent surface breach (`isBreach: true, depth: 0, zone: 'surface'`), pours 20–30 Level-7 water tiles equivalent (~140–210 water) over ~1 game minute, respecting the Level-7 tile capacity cap.
* **Cave-Ins & Earthquakes:**
  - `triggerCaveIn(radius=1.5)`: ~3x3 collapse of excavated space into normal Dirt, destroying structures. **Strictly rerolls if any Queen is in the target area.**
  - `triggerEarthquake()`: independent geological event with screen shake warning phase, ~15x4 irregular collapse into normal Dirt. **Strictly excludes any Queen.**
  - Entities caught beneath Dirt become trapped (`trapped: true, suffocationTimer: 20s`), taking damage unless dug out by workers.
* **Save/Load:**
  - Save `s.climate` in `serialize()` and restore in `Simulation.restore()`.

---

### 3. Rendering & Visuals

#### [MODIFY] [src/renderer.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/renderer.js)
* **Underground Day/Night Visuals:**
  - Subtle underground ambient brightness shift between Day (slightly brighter) and Night (slightly darker).
* **Surface Hole & Breach Daylight Rays:**
  - Surface holes (`depth === 0` or `isBreach === true`) emit visible natural daylight glow into nearby underground tiles during Day, and **zero natural daylight** at Night.
* **Weather Visual FX:**
  - Ambient lightning flash overlay (subtle canvas flash during thunder strikes).
  - Camera screen shake during Earthquake warning and tremor phase.

---

### 4. Audio Coordinator

#### [NEW] [src/audio.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/audio.js)
* Web Audio / HTML5 Audio coordinator managing weather audio:
  - Ambient loops: rain, heavy wind, thunderstorm.
  - One-shots: distant thunder, near thunder, destructive lightning strike, earthquake rumble.
  - Graceful fallback: checks if audio files are present; if not, logs or fails silently without game interruption.

---

### 5. UI, HUD & Dev Tools

#### [MODIFY] [index.html](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/index.html)
* Add climate & weather HUD indicators in top header or bottom meta:
  - Calendar date & time (e.g. `Jan 14 · 15:42`).
  - Season/Rainfall phase (e.g. `First Wetter Period`).
  - Weather state, Temperature (°C), and Humidity (% RH).
* Add Dev Tools triggers:
  - Weather force buttons: Rain, Heavy Wind, Thunderstorm, Clear.
  - Event force buttons: Destructive Lightning, Cave-in, Earthquake.
  - Time advance button (+1 hour, +1 day).

#### [MODIFY] [src/app.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/app.js)
* Update `updateUI()` to render real calendar date, time of day, weather state, temperature, and humidity.
* Bind Dev Tools climate event buttons and keyboard shortcuts.
* Wire screen shake from simulation earthquake state to `renderer.camera`.

#### [MODIFY] [hex-ui.css](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/hex-ui.css)
* Styling for climate HUD elements and dev weather controls.

---

## Verification Plan

### Automated Tests
Run via Electron Node test runner:
`$env:ELECTRON_RUN_AS_NODE="1"; & "c:\Users\hudso\AppData\Local\Programs\Microsoft VS Code\Code.exe" --test tests/climate.test.cjs tests/simulation.test.cjs`

Key test cases:
1. **Calendar & Progression:** 30 min per day, month length accuracy, year rollover from Dec 31 to Jan 1.
2. **Rainfall Distribution:** Monte Carlo test verifying Pichindé rain-day probabilities match monthly targets across a statistical sample.
3. **Weather Escalation:** Verification of Rain $\rightarrow$ Heavy Wind (45%) $\rightarrow$ Thunderstorm (65%) conditional escalation logic.
4. **Thermodynamics & Humidity:** Day/Night temperature curves, cool night/warm afternoon ranges, rain/fog humidity saturation.
5. **No Universal Debuffs:** Verification that ants and creatures maintain normal speed, attack, and need rates regardless of Day/Night or season.
6. **Disaster Mechanics & Queen Safety:**
   - Heavy wind cave-in collapses ~3x3 into Dirt; never touches any Queen.
   - Rain infiltration delivers gradual water inflow with diminishing odds.
   - Lightning breach creates permanent surface hole, delivers flood, and respects Level-7 water tile capacity cap.
   - Earthquake triggers ~15x4 collapse, traps entities with suffocation, and never touches any Queen.
7. **Serialization & Restore:** Full climate state, date, temperature, active weather, and trapped entities persist cleanly across save/load.
8. **Renderer Benchmark:** Execute `tests/test_renderer.cjs` to confirm 60+ FPS rendering performance is preserved.

### Manual Verification
1. Launch game, observe calendar progression, date, temperature, and humidity in HUD.
2. Test Dev Tools weather overrides: trigger Rain, Wind, Thunderstorm, and Earthquake.
3. Observe day/night ambient shift underground and daylight rays emitting from surface holes during Day vs. dark at Night.
4. Inspect cave-in and earthquake terrain collapse and rescue a trapped ant.
