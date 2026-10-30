# SFX Audio Assets Integration & Audio System Upgrade

Integrate the newly converted audio assets in `SFX/` into the game, upgrade `AudioCoordinator` with audio bus architecture (Master, Ambient, Effects), implement randomized pitch variation ($\pm 5\text{--}10\%$), multi-variant sound pools, seamless looping for ambient cavern & nest tracks, and hook triggers into simulation, ecology, and climate events.

## User Review Required

> [!IMPORTANT]
> - All audio playback calls are guarded with `typeof Audio !== 'undefined'` to keep the headless Node/Electron test suite (`tests/*.cjs`) passing with 100% test coverage.
> - Footsteps loops will follow `SFX/Ants/ant_footsteps_instuction_for_implementation (READ).txt` using an aggregate movement detector that starts/stops the loop from random offsets when normal or heavy ants begin/end movement, avoiding audio distortion from dozens of simultaneous instances.
> - `ant_death_01.ogg` was mentioned in user notes but does not currently exist on disk in `SFX/Combat/`; `AudioCoordinator` registers the path safely and checks availability so it works automatically when added without throwing errors.

## Proposed Changes

---

### Audio System & Bus Architecture

#### [MODIFY] [src/audio.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/audio.js)
- Implement 3-channel bus architecture:
  - `master`: Global volume multiplier.
  - `ambient`: Environmental loops (`rain_underground`, `rain_surface`, `wind`, `amb_nest_underground_loop`, `amb_water_cavern_loop`).
  - `effects`: Action one-shots and creature sounds (`ant_dig`, `rock_strike`, `chamber_pack`, `chamber_complete`, `soil_drop`, `corpse_pickup`, `corpse_store`, `seed_store`, `feeder_chew`, `eat`, `drink`, `water_extract`, `lay_egg`, `egg_hatch`, `alarm_retreat`, `threat_response`, `bites`, `impact_chitin`, `death`, `thunder`, `cave_in`, etc.).
- Register full sound registry for all `.ogg` files in `SFX/Ambient`, `SFX/Ants`, `SFX/Combat`, `SFX/Weather`.
- Implement randomized pitch variation: `playbackRate = 1.0 + (Math.random() * 0.16 - 0.08)` ($\pm 8\%$, within the requested $\pm 5\text{--}10\%$).
- Implement multi-variant sound pools with random selection:
  - `rockStrike`: `[rock_strike_01, rock_strike_02, rock_strike_03]`
  - `chamberPack`: `[chamber_build_pack_01, chamber_build_pack_02, chamber_build_pack_03]`
  - `biteWorker`: `[ant_bite_worker_01, ant_bite_worker_02, ant_bite_worker_03]`
  - `biteSoldier`: `[ant_bite_soldier_01, ant_bite_soldier_02, ant_bite_soldier_03]`
  - `biteSupermajor`: `[ant_bite_supermajor_01, ant_bite_supermajor_02]`
  - `thunder`: `[thunder_01, thunder_02, thunder_03]`
- Implement footsteps loop management according to `ant_footsteps_instuction_for_implementation (READ).txt`:
  - Worker/minor/media/soldier walking: random choice between `ant_footsteps_loop_01` and `02`, random start offset, loop while moving, stop when movement stops.
  - Major/supermajor walking: random choice between `ant_heavy_footsteps_loop_01` and `02`, random start offset, loop while moving, stop when movement stops.
- Implement seamless ambient loops:
  - `amb_nest_underground_loop`: active underground, volume scaled with camera depth.
  - `amb_water_cavern_loop`: active when camera is near reservoirs or active water bodies.

---

### Simulation Triggers

#### [MODIFY] [src/simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js)
- `layEgg`: trigger `queenLayEgg`.
- `update` (egg hatch): trigger `eggHatch`.
- `kill`: trigger `antDeath`.
- `deposit`:
  - `dest.kind === 'spoil'`: trigger `soilDropFloor`.
  - `dest.kind === 'pit'` / dirt pit: trigger `soilDropPit`.
  - `load.type === 'corpse'`: trigger `corpseStore`.
  - `load.type === 'seed'`: trigger `seedStore`.
- `pickupFeed`:
  - corpse pickup: trigger `corpsePickup`.
  - water extraction: trigger `waterDropletExtract`.
- `to-carry` corpse pickup: trigger `corpsePickup`.
- `consumeAntNeed`:
  - food need satisfied: trigger `antEat`.
  - water need satisfied: trigger `antDrink`.
- Feeder processing (`state === 'processing'`): trigger `feederChewFood`.
- Digging (`state === 'digging'`): trigger `antDig` (or `antDigHeavy` for major/supermajor); if digging solid rock encountered, trigger `rockStrike`.
- Building (`state === 'building'`):
  - wall packing interval: trigger `chamberBuildPack` (random variant).
  - completion (`a.timer >= C.buildSeconds`): trigger `chamberBuiltComplete`.
- Cave-in (`triggerCaveIn`): trigger `caveIn`.
- Designation: when clicking/designating rock, trigger `rockStrike`.

---

### Combat & Ecology Triggers

#### [MODIFY] [src/ecology.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/ecology.js)
- `workTarget` (combat strike):
  - major / supermajor ant attacking: trigger `antBiteSupermajor`.
  - soldier ant attacking: trigger `antBiteSoldier`.
  - worker / minor / media ant attacking: trigger `antBiteWorker`.
  - corpse pickup in harvest: trigger `corpsePickup`.
- `damage`: when taking damage, trigger `impactChitin`.
- Threat retreat (line 336): worker retreats to report threat: trigger `antAlarmRetreat`.
- Threat response (line 397): soldiers respond to threat: trigger `soldierThreatResponse`.

---

### Main Loop & Ambient Updates

#### [MODIFY] [src/app.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/app.js)
- Update `AudioCoordinator.update(sim.climate, renderer.camera, sim)` every UI frame to update nest ambient, water cavern ambient, and footsteps loops.

---

### Tests

#### [MODIFY] [tests/climate.test.cjs](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/tests/climate.test.cjs)
- Add unit tests verifying:
  - `AudioCoordinator` bus configuration (Master, Ambient, Effects).
  - Variant resolution for bites, rock strikes, chamber packing, footsteps, thunder.
  - Pitch variation calculation bounds ($\pm 5\text{--}10\%$).
  - Trigger calls in simulation and ecology execute safely without errors in headless mode.

## Verification Plan

### Automated Tests
- Run complete test suite:
  ```powershell
  $env:ELECTRON_RUN_AS_NODE="1"; & "c:\Users\hudso\AppData\Local\Programs\Microsoft VS Code\Code.exe" --test tests/climate.test.cjs tests/simulation.test.cjs
  ```
- Confirm 0 failures across all tests.

### Manual Verification
- Open game in browser / Electron environment and verify:
  - Digging produces digging audio (heavy for supermajors/majors, standard for workers).
  - Striking rock plays rock strike variations with pitch variation.
  - Chamber building plays packing sounds and completion sound.
  - Footsteps start and loop when ants move, stop when idle.
  - Combat produces bites and chitin impacts.
  - Feeder chewing, food eating, water drinking, egg laying, and egg hatching trigger correctly.
  - Master, Ambient, and Effects volume buses work independently.
