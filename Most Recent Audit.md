# Most Recent Audit — Underfoot (Ant Colony)

**Audit Date:** September 13, 2026  
**Project:** Underfoot — Ant Colony Simulation  
**Platform:** Browser (HTML5 Canvas, DOM, ES6 JavaScript, CSS3)  
**Dependencies:** Zero external dependencies (runs locally without build steps or bundlers)

---

## 1. Executive Summary

**Underfoot** is a 2D top-down ant colony simulation and management game written in vanilla JavaScript. The simulation operates on an **axial flat-top hexagonal grid** ($q, r$) with deterministic procedural generation governed by a 32-bit PRNG seed.

### Architectural Highlights
* **Zero Build/Install Step**: The game runs directly via [Launch Game.cmd](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/Launch%20Game.cmd) or [index.html](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/index.html), or served via [server.cjs](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/server.cjs) at `http://127.0.0.1:4173`.
* **Strict Conservation of Matter**: Every excavated cell creates physical soil that must be transported to spoil pits, surface dumps, or chamber construction. Dirt is never deleted or abstracted away.
* **Cellular Fluid Dynamics**: Water flows conservatively with threshold-activated spreading dynamics, non-leaking reservoirs, and deep rock-enclosed wells.
* **Biological Realism & Anatomy**: Procedural vector insect rendering with true kinematic gaits (alternating tripod gaits for ants, metachronal waves for isopods, tetrapod gaits for spiders, scurrying for mites, segmented annelid bending, mandibular combat lunges, and species-specific rostrums/horns).
* **Deep Autonomous AI & Labor Hierarchy**: Per-caste numeric task prioritization (1–10) with visual tie-breaking, individual action toggles, and safety/danger overrides.

---

## 2. Documentation & Feature Status Audit

A comparative audit of [README.md](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/README.md), [FEATURE_STATUS.md](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/FEATURE_STATUS.md), and the active codebase revealed the following:

### 2.1 Test Suite Expansion
* **README.md Status**: Outdated. States `"Run npm test for 42 tests covering..."`.
* **FEATURE_STATUS.md Status**: Partially updated (mentions 42, then 46, then 48 passing checks across update briefs).
* **Actual Runtime Codebase**: [tests/simulation.test.cjs](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/tests/simulation.test.cjs) contains **84 comprehensive unit tests**, plus the visual benchmark and context verification suite in [tests/test_renderer.cjs](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/tests/test_renderer.cjs). All systems—including the 2-layer task hierarchy, action toggles, corridor collision swaps, and creature clearance—are covered.

### 2.2 Unlisted Controls & Systems in README
The following implemented features are active in the runtime but omitted from [README.md](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/README.md):
1. **Radial Actions Wheel**: Accessible via the `⚙ Actions` button or hotkeys (`D`, `A`, `H`, `C`, `X`, `U`, `M`), enabling quick order switching between Move, Dig, Attack, Harvest, Carry, Cancel, and Build.
2. **Colony Operations Labor Hierarchy**: The modal allowing players to set 1–10 priority levels per caste with Danger Zone warnings.
3. **Per-Ant Action Toggles**: Live toggling of Dig, Carry, Harvest, Feed, Gather Food, Gather Water, Build, Haul Soil, and Combat for selected groups.
4. **Expanded Creature Catalogue**: [README.md](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/README.md) mentions only "worms, grubs and beetles", omitting Bull Weevil, Hercules Beetle, Mites, Isopods, Woodlice, Spiders, Baby Spiders, and Root Aphids.

---

## 3. Core Systems & Feature Audit

### 3.1 Revamped Ant Caste & Physiology System
Implemented in [src/config.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/config.js), [src/data.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/data.js), and [src/simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js):
* **Reproductive Hatching Disabled**: `queen`, `drone`, and `princess` hatch chances are strictly `0.00%`. The founding queen is the sole egg layer for the colony.
* **Worker & Combat Morphs**:
  * **Worker (65% roll chance)**: 100 HP, 5 carry capacity, 1.0× speed, 50/50 food/water capacity. Generalist laborer (digs, builds, hauls, harvests, broods).
  * **Minor (10% roll chance)**: 50 HP, 2.0× travel speed, 25/25 food/water capacity. Specialized lightweight nurse/hauler; mining and building are disabled (`canMine: false`, `canBuild: false`).
  * **Media (10% roll chance)**: 200 HP, 100/100 food/water capacity, 1.0× speed. High-endurance generalist.
  * **Soldier (10% roll chance)**: 250 HP, 20 attack damage, enlarged head and curved mandibles. Autonomous territorial patrol and threat response.
  * **Major (3% roll chance)**: 300 HP, 3.0× dig rate, 24 attack damage, 15 carry capacity, 2.0× need drain. Digs up to 2 adjacent blocks simultaneously; requires 3-block passage clearance (`clearanceNeeded = 3`).
  * **Supermajor (2% roll chance)**: 500 HP, 5.0× dig rate, 40 attack damage, 25 carry capacity, 3.0× need drain. Digs up to 3 adjacent blocks simultaneously; requires 3-block clearance; capable of carrying massive Beetle Grubs and giant Earthworms.

### 3.2 Two-Layer Autonomous Labor Prioritization & Danger Zone
Implemented in [src/data.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/data.js), [src/simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js), and [src/app.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/app.js):
* **Priorities (1 to 10)**: 1 is highest priority, 10 is lowest.
* **Strict Tie-Breaking**: When two candidate tasks share the same numerical score, execution strictly resolves according to the top-to-bottom hierarchy list order:
  1. `selfFeed` (Survival)
  2. `selfWater` (Survival)
  3. `combat` (Colony Defense)
  4. `feedQueen` (Feeder Only)
  5. `queenWater` (Feeder Only)
  6. `chewFood` (Feeder Only)
  7. `carry` (Whole corpses & seeds)
  8. `harvest` (Loose food & aphids)
  9. `build` (Chamber construction)
  10. `dig` (Excavation)
  11. `haulSoil` (Spoil recovery)
* **Danger Zone vs. Labor**:
  * Survival needs default to priority 1.
  * If the player lowers `selfFeed` or `selfWater` below labor tasks (e.g., `dig: 1`, `selfFeed: 5`), ants will prioritize finishing tunnels even while starving or dehydrating, suffering personal damage and risking death.
* **Auto-Release Timer**: Manually ordered or selected ants that finish their command and remain idle for 5 seconds automatically drop their held state and rejoin autonomous colony labor ([src/simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js#L1006-L1015)).

### 3.3 Conservation of Matter & Discrete Inventory
Implemented in [src/simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js):
* **Matter Conservation Formula**:
  $$\text{Dug Hexes} = \sum \text{Pit Fill} + \text{Surface Dump} + \sum \text{Rival Pit Fill} + \sum \text{Spoil Floor Chips} + \sum \text{Built Dirt} + \sum \text{Carried Dirt} + \sum \text{Dropped Dirt}$$
  Verified on every frame via `sim.conservation()`.
* **Discrete Physical Inventory**: Rations, water droplets, and soil items are tracked as individual objects (`storageTile`, `storageSlot`), preventing abstraction loss during serialization.
* **Whole Food Processing**: Raw corpses and seeds hauled to storage must be chewed by assigned feeders to convert potential food into edible colony rations.

### 3.4 Hydrology, Water Physics & Deep Wells
Implemented in [src/ecology.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/ecology.js) and [src/world.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/world.js):
* **Extractable Scaling**: `getWaterExtractValue(level)` maps 0–7 levels to stepped extraction values (level 7 = 100%, level 6 = 85%, down to 0% when dry).
* **Fluid Pressure**: Water only spreads to equalized neighbors when a cell's level exceeds $1.0$; once flowing, it continues spreading until thinning down to $0.5$, where surface tension halts dispersion.
* **Reservoirs**: Constructed water chambers act as non-walkable retaining basins that actively suck adjacent water until reaching capacity (7.0) without leaking into adjacent dry floor.
* **Deep Wells**: Rare natural features encased in indestructible solid rock with a 20-level water reservoir (~285 extractable water) that never overflows into the access corridor.

### 3.5 Creature Ecology & Clearance Routing
Implemented in [src/ecology.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/ecology.js) and [src/world.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/world.js):
* **Species Anatomy & Behaviors**:
  * **Earthworm (Clearance 1, Flee/Excavator)**: Bends along head-history trail; burrows through soil away from attackers.
  * **Beetle Grub (Clearance 2, Defensive/Excavator)**: 2-block clearance excavator with thick segmented cuticle.
  * **Bull Weevil (Clearance 1, Defensive)**: Features an elongated chewing rostrum with geniculate mid-snout antennae and punctate striae.
  * **Hercules Beetle (Clearance 8, Aggressive)**: Massive 650 HP apex predator with dual pincer horns, olive-amber spotted elytra, and 3.3 reach. Clearance is calculated from its 7.7-width central body rather than its horn length.
  * **Mite (Clearance 1, Aggressive)**: Fast scurrying scavenger with a custom route search capable of crossing exactly one soil tile, but never rock or water.
  * **Isopod / Woodlouse (Clearance 2, Flee)**: Overlapping dorsal tergites with 14 articulated legs walking on a metachronal ripple wave.
  * **Spider & Baby Spider (Clearance 3 & 1, Aggressive)**: Spawns in dark webbed lairs, casts webs (40s immobilization), converts webbed ant deaths into eggs, which hatch in 3.5 minutes and mature in 15 minutes.
  * **Root Aphid (Clearance 1, Anchored)**: Lives on discovered root veins, feeds on root wood durability, and can be milked with `Harvest` for 15 food every 60 seconds.
* **Hysteresis Activation**: Creatures in unrevealed chunks remain dormant. When ants approach within 30 hexes of a revealed creature, it activates; it only refreezes if ants move beyond 90 hexes (3× distance).

---

## 4. File-by-File Architecture Review

```
Ant Game/
├── Launch Game.cmd          # Native Windows launcher
├── index.html               # Main application markup and modal containers
├── style.css                # Base application layout and dark palette styling
├── hex-ui.css               # Radial wheel, priority hierarchy, and alert overlays
├── package.json             # NPM metadata and execution scripts
├── server.cjs               # Local read-only HTTP server (Port 4173)
├── src/
│   ├── config.js            # Balance sheet, RNG, hash, caste probabilities
│   ├── data.js              # Traits, food types, species dimensions, priorities
│   ├── world.js             # Hex math, chunk generator, clearance pathfinding
│   ├── ecology.js           # Water physics, creature AI, foreign colonies
│   ├── simulation.js        # Colony state loop, brood, task assignments, save/load
│   ├── renderer.js          # Procedural Canvas graphics, multi-LOD, animations
│   ├── completion-ui.js     # Area planning panel and live roster readouts
│   └── app.js               # Event bindings, UI synchronization, toolbar, dev tools
└── tests/
    ├── simulation.test.cjs  # 84-test Node.js verification suite
    └── test_renderer.cjs    # Canvas mock and frame budget benchmark
```

### [src/config.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/config.js)
* Contains the single frozen balance sheet `AntGame.Config`.
* Implements `AntGame.Random` using a 32-bit multiplication PRNG for seeded repeatability.
* Implements `AntGame.hash` for coordinate-based deterministic feature generation.

### [src/data.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/data.js)
* Declarative catalogue defining Traits (evolution tree), FoodTypes (meat, seeds, etc.), Species (dimensions, speed, clearance, behavior), Chunk Rarity tiers, the `canCarry` eligibility matrix, `AntActions`, and `DefaultCastePriorities`.

### [src/world.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/world.js)
* Axial flat-top hex math ($q, r$).
* Procedural chunk streaming with feature definitions (wells, root veins, rock clusters, caverns).
* Fast clearance-aware A* routing (`findRoute`, `hasBodyClearance`) with revision-invalidated clearance caching.

### [src/ecology.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/ecology.js)
* Advances off-colony mechanics: fluid flow, creature behavior, spider webs, aphids, and foreign colonies.
* Manages continuous movement interpolation, head-history body trails for worms/grubs, and threat reporting back to colony soldiers.

### [src/simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js)
* Colony state engine managing Queen hunger/thirst, personal ant needs, brood hatching, discrete inventory items, excavation, and chamber construction.
* Features pairwise corridor collision resolution (`swappingWith`) to eliminate narrow-tunnel deadlocks.
* Implements full `v3` serialization with conservation validation.

### [src/renderer.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/renderer.js)
* HTML5 Canvas renderer with multi-LOD culling (simplified block fills when zoomed out, rich textures and articulated limbs when zoomed in).
* Procedural insect rendering: 6-leg tripod gaits, 8-leg spiders, 14-leg isopods, compound eyes, ocelli, geniculate antennae, mandibles, and carry payloads.

### [src/app.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/app.js)
* Browser controller handling pointer events, camera panning, zooming, brush painting, selection boxes, hotkeys, and the developer panel.
* Hosts the interactive Colony Operations task hierarchy editor and caste tabs.

### [src/completion-ui.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/completion-ui.js)
* Lightweight area planning extension allowing players to name, categorize, and paint persistent zones over revealed terrain.

### [tests/simulation.test.cjs](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/tests/simulation.test.cjs) & [tests/test_renderer.cjs](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/tests/test_renderer.cjs)
* Exhaustive test suite covering 84 simulation scenarios and a 100-frame rendering benchmark that verifies frame execution remains under 5.0ms.

---

## 5. Observations & Recommendations

1. **Synchronize Documentation**:
   * Update [README.md](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/README.md) to state 84 passing unit tests (up from 42).
   * Document the Radial Actions Wheel, Colony Operations Labor Hierarchy, and the complete 10-species creature roster in [README.md](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/README.md) and [FEATURE_STATUS.md](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/FEATURE_STATUS.md).
2. **Audio & Ambience (Future Opportunity)**:
   * The simulation foundation is mechanically sound and visually detailed. Adding subtle procedural Web Audio effects (mandible excavation crunches, chitin steps, fluid drips) would further enhance immersion.
3. **Foreign Colony Mechanics (Future Expansion)**:
   * The underlying data model already tracks foreign colony dispositions (`neutral`, `tolerant`, `defensive`, `hostile`) and close contact encounters; expanding this into trade, raiding, or chemical communication would build naturally upon the current architecture.

