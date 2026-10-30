# Audio Assets Integration Walkthrough

All newly converted `.ogg` audio assets under `SFX/` have been integrated into the Ant Game audio architecture.

## Key Upgrades

### 1. Audio Coordinator & Bus Channel Architecture
Upgraded [src/audio.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/audio.js) with a 3-channel audio bus architecture:
- **`master` Bus**: Global master volume multiplier (`masterVolume`).
- **`ambient` Bus**: Environmental layers including weather (`rain_underground`, `rain_surface`, `wind`), underground nest background (`amb_nest_underground`), and subterranean water caverns (`amb_water_cavern`).
- **`effects` Bus**: Tactical one-shots and entity audio (`ant_dig`, `rock_strike`, `chamber_pack`, `chamber_complete`, `soil_drop`, `corpse_store`, `seed_store`, `feeder_chew`, `eat`, `drink`, `water_extract`, `lay_egg`, `egg_hatch`, `bites`, `chitin_impact`, etc.).
- Dedicated methods: `setBusVolume(busName, vol)`, `getBusVolume(busName)`.

### 2. Randomized Pitch Variation & Multi-Variant Pools
- **Pitch Randomization**: Automatically applies $\pm 8\%$ randomized pitch variation (`playbackRate = 1.0 + (Math.random() * 0.16 - 0.08)`) on one-shot effects to avoid acoustic fatigue and repetitive sound artifacts.
- **Variant Randomization Pools**:
  - `rockStrike`: Random selection among `rock_strike_01.ogg`, `02.ogg`, and `03.ogg`.
  - `chamberBuildPack`: Random selection among `chamber_build_pack_01.ogg`, `02.ogg`, and `03.ogg`.
  - `antBiteWorker`: Random selection among `ant_bite_worker_01.ogg`, `02.ogg`, and `03.ogg`.
  - `antBiteSoldier`: Random selection among `ant_bite_soldier_01.ogg`, `02.ogg`, and `03.ogg`.
  - `antBiteSupermajor`: Random selection among `ant_bite_supermajor_01.ogg` and `02.ogg`.
  - `thunder`: Random selection among `thunder_01.ogg`, `thunder_02.ogg`, and `thunder_03.ogg`.

### 3. Footstep Loop Management
Implemented strictly per [ant_footsteps_instuction_for_implementation (READ).txt](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/SFX/Ants/ant_footsteps_instuction_for_implementation%20%28READ%29.txt):
- **Normal Ant Movement**:
  - Starts playing when normal ants (workers, minors, media, soldiers) begin moving.
  - Randomly selects between `ant_footsteps_loop_01.ogg` and `ant_footsteps_loop_02.ogg`.
  - Begins with a randomized playback start offset.
  - Continuously loops while movement remains active; stops when movement ends.
  - Selects a new random loop and offset on next movement period.
- **Heavy Ant Movement**:
  - Starts playing when heavy ants (majors, supermajors) begin moving.
  - Randomly selects between `ant_heavy_footsteps_loop_01.ogg` and `ant_heavy_footsteps_loop_02.ogg`.
  - Begins with a randomized playback start offset.
  - Loops continuously while active; stops immediately when movement ends.

### 4. Seamless Ambient Loops
- **Nest Loop (`amb_nest_underground_loop.ogg`)**: Continuously loops; volume naturally scales with depth underground (quieter at surface, fuller in deep chambers).
- **Water Cavern Loop (`amb_water_cavern_loop.ogg`)**: Dynamically fades in when the camera is within proximity to water reservoirs, wells, or active ground water flows.

### 5. Gameplay Event Triggers
| Category | Cue | Event Hook & File |
| :--- | :--- | :--- |
| **Digging** | `antDig` / `antDigHeavy` | Periodic timer tick in `state === 'digging'` in [src/simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js) |
| **Rock Hit** | `rockStrike` | Encountering rock in digging or clicking/designating rock in [src/simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js) |
| **Chamber Pack** | `chamberBuildPack` | Periodic packing sound during `state === 'building'` in [src/simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js) |
| **Chamber Complete** | `chamberBuiltComplete` | Triggered once upon chamber finish in [src/simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js) |
| **Soil Drop** | `soilDropPit` / `soilDropFloor` | Dirt deposit in pit vs spoil floor in [src/simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js) |
| **Corpse Pickup** | `corpsePickup` | Corpse pickup in `to-carry`, `pickupFeed`, and harvest in [src/simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js) & [src/ecology.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/ecology.js) |
| **Corpse Store** | `corpseStore` | Storing corpse in food storage in [src/simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js) |
| **Seed Store** | `seedStore` | Storing seed in food storage in [src/simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js) |
| **Feeder Chew** | `feederChewFood` | Processing stored food into colony food in [src/simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js) |
| **Eat / Drink** | `antEat` / `antDrink` | Satisfying food/water needs and feeding queen in [src/simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js) |
| **Water Extraction**| `waterDropletExtract` | Extracting water droplet in [src/simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js) |
| **Queen Lay Egg** | `queenLayEgg` | Queen laying egg in [src/simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js) |
| **Egg Hatch** | `eggHatch` | Egg hatching in [src/simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js) |
| **Alarm Retreat** | `antAlarmRetreat` | Worker retreating to report predator in [src/ecology.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/ecology.js) |
| **Threat Response** | `soldierThreatResponse` | Soldiers rallying to reported threat in [src/ecology.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/ecology.js) |
| **Combat Bites** | `antBiteWorker` / `Soldier` / `Supermajor` | Combat attack strikes by morph in [src/ecology.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/ecology.js) |
| **Chitin Impact** | `impactChitin` | Taking combat damage in [src/ecology.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/ecology.js) |
| **Ant Death** | `antDeath` | Ant death event in [src/simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js) |
| **Cave-in** | `caveIn` | Tunnel collapse from high winds in [src/simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js) |

## Verification Results

Executed full automated test suite in headless environment:
```powershell
$env:ELECTRON_RUN_AS_NODE="1"; & "c:\Users\hudso\AppData\Local\Programs\Microsoft VS Code\Code.exe" --test tests/climate.test.cjs tests/simulation.test.cjs
$env:ELECTRON_RUN_AS_NODE="1"; & "c:\Users\hudso\AppData\Local\Programs\Microsoft VS Code\Code.exe" tests/test_renderer.cjs
```
- **Exit Code**: 0 (all test suites passing)
- **Verified**: Bus controls, asset registry, variant resolvers, loop states, proximity triggers, and safe headless execution.
