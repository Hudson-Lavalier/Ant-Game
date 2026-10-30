# Walkthrough — Weather, Seasons, and Day Cycle Update

The complete **Weather, Seasons, and Day Cycle Update** for *Underfoot* is implemented and verified. All mechanics adhere strictly to the canonical cloud-forest setting (San Antonio / KM18 Plateau, Valle del Cauca, Colombia; ~1,900–2,000m) and the foundational game principle: **"Climate changes the world. It does not apply arbitrary universal buffs or debuffs to ants."**

---

## 1. Core Systems Implemented

### 🗓️ Calendar, Diurnal Clock & Seasons
- **30-minute Real Day**: 15 minutes of Day (~06:00 to 18:00 game time) and 15 minutes of Night (~18:00 to 06:00 game time).
- **Canonical Timeline**: Starts at January 1, Year 1, 06:00:00 (Dawn) with standard calendar month day counts (Jan=31, Feb=28, Mar=31, etc.).
- **Bimodal Cloud-Forest Rainfall Normals**: 4 annual seasons based directly on IDEAM Pichindé 1991–2020 weather station normals:
  1. *First Less-Rainy Period*: Dec–Feb (Jan 9.6 rain days, Feb 9.2 rain days)
  2. *First Wetter Period*: Mar–May (Mar 13.7, Apr 16.2, May 16.1 rain days)
  3. *Second Less-Rainy Period*: Jun–Aug (Jun 9.7, Jul 7.9, Aug 5.9 rain days — dry minimum)
  4. *Second Wetter Period*: Sep–Nov (Sep 9.5, Oct 13.8, Nov 13.9 rain days — wet peak)

### 🌡️ Thermodynamics & Humidity Modeling
- **Bounded Thermal Profile**: Kept strictly within **13.0°C to 21.0°C** across all conditions.
- **Diurnal Fluctuation**: Modeled on tropical high-elevation curves (minimum pre-dawn at ~05:00, maximum mid-afternoon at ~14:30).
- **Humidity Modeling**: Centered at **80% to 100% RH**, with afternoon clear-sky drops to ~78% and cloud-forest fog/rain saturating to 100%.

### ⛈️ Weather Escalation & Environmental Disasters
- **Layered Escalation**:
  $$\text{Rain} \xrightarrow{45\%} \text{Heavy Wind} \xrightarrow{65\%} \text{Thunderstorm}$$
- **Destructive Lightning Strike**: Maximum 1 per thunderstorm. Blasts open a permanent surface breach tile (`depth: 0, isBreach: true`) and pours in 140–210 water units over 60 seconds (up to 20–30 Level-7 tiles). Inflow halts early if the breach and open neighbors reach Level 7 capacity.
- **Heavy Wind Cave-Ins**: 5%/minute check during heavy winds. Causes a $3\times 3$ collapse, traps non-queen ants, and deals 40 impact damage.
- **Geological Earthquakes**: Independent tectonic events with a 4-second rumble warning and screen shake. Causes a linear fault-line collapse (~$15\times 4$ hexes).
- **👑 Absolute Queen Protection**: Collapses (cave-ins and earthquakes) strictly exclude tiles occupied by any Queen. The Queen is never buried, damaged, or trapped by environmental collapses.
- **Trapped Ant Rescue**: Trapped ants enter the `trapped` state and suffocate (taking 4 damage/sec with a 25-second countdown timer). When workers excavate the collapsed solid block, the trapped ant is immediately freed!

### 🎨 Rendering & Atmospheric Audio
- **Day/Night Underground Lighting**: Soft daylight glow emanates down into surface entrances and lightning breaches during the day; at night, this glow disappears completely.
- **Trapped Ant Indicators**: High-visibility dashed orange warning ring and `"TRAPPED"` status badge.
- **Screen Shake & Lightning Flashes**: Dynamic screen shake during tremors and screen flash overlays during thunderstorm strikes.
- **Audio Coordinator** (`src/audio.js`): Atmospheric weather loops (rain, wind, thunder) and one-shots (near thunder, distant thunder, destructive strike, earthquake rumble) with graceful silent fallback when assets are not present on disk.

### 🎛️ UI & Developer Controls
- **Header Climate Readout**: Displays Date, Game Time (Dawn/Morning/Afternoon/Dusk/Night), Current Weather with icon, and Temperature. Hover tooltip reveals Season Phase, Relative Humidity, Infiltration chance, and Groundwater saturation.
- **Dev Panel Tools**: Force Clear, Force Rain, Force Heavy Wind, Force Thunderstorm, Trigger Earthquake, Trigger Lightning Strike, and Trigger Cave-In.

---

## 2. Verification & Automated Test Results

Automated unit tests were executed with the Electron Node test runner:

```powershell
$env:ELECTRON_RUN_AS_NODE="1"; & "c:\Users\hudso\AppData\Local\Programs\Microsoft VS Code\Code.exe" --test tests/climate.test.cjs tests/simulation.test.cjs
```

### Output:
```
✔ Calendar and Time Progression: Starts Jan 1, Year 1, 06:00
✔ Diurnal Cycle: 30-minute real day = 1800s (900s Day, 900s Night)
✔ Calendar: Transitions through months and leap/non-leap days
✔ Four Rainfall Seasons map accurately to IDEAM Pichindé normals
✔ Thermodynamics: Temperatures remain strictly bounded between 13°C and 21°C
✔ Weather Escalation: Rain -> Heavy Wind (45%) -> Thunderstorm (65%)
✔ Heavy Wind Cave-In: 3x3 collapse NEVER buries or targets Queen
✔ Earthquake: Independent geological event NEVER collapses Queen tile
✔ Trapped Ants: Suffocation timer damages trapped ant and digging frees them
✔ Destructive Lightning Strike: Blasts permanent breach and triggers water inflow
✔ Save & Restore Serialization preserves complete climate state and active inflows
...
ℹ tests 100
ℹ suites 0
ℹ pass 100
ℹ fail 0
```

`tests/test_renderer.cjs` was also executed and passed with zero regressions.

---

## 3. Modified & Created Files Summary

- [NEW] [`src/climate.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/climate.js): Complete climate, weather, calendar, and disaster engine.
- [NEW] [`src/audio.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/audio.js): Audio coordinator for weather loops and acoustic triggers.
- [NEW] [`tests/climate.test.cjs`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/tests/climate.test.cjs): Unit test suite for climate, seasons, disasters, and trapped mechanics.
- [MODIFIED] [`src/simulation.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js): Integrated inflows, earthquake execution, cave-ins, queen safety guarantees, trapped ant suffocation & excavation rescue, serialization.
- [MODIFIED] [`src/renderer.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/renderer.js): Day/night surface glow, camera screen-shake, trapped ant badge, and lightning flash overlay.
- [MODIFIED] [`index.html`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/index.html): Script tags, header climate widget, and dev panel climate triggers.
- [MODIFIED] [`hex-ui.css`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/hex-ui.css): Climate widget styling in the header.
- [MODIFIED] [`src/app.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/app.js): HUD updates, dev controls wiring, and simulation listeners.
- [MODIFIED] [`tests/test_renderer.cjs`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/tests/test_renderer.cjs): Loaded climate and audio modules in renderer test suite.
- **UNTOUCHED**: `Most Recent Audit.md` was preserved completely untouched.
