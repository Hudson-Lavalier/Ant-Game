# Complete Codebase Domain Extractions Architecture Plan

## Overview
The goal of this refactoring is to modularize the codebase by extracting concentrated logic out of the two primary monoliths (`simulation.js` at ~93 KB / 1,504 lines and `renderer.js` at ~65 KB / 1,135 lines) and slimming down controller logic in `app.js` (~44 KB / 499 lines).

To prevent regressions and avoid breaking any existing interfaces, each extracted module will:
1. Attach to the global `AntGame` namespace (matching the zero-build vanilla JS architecture).
2. Retain thin proxy methods on `Simulation.prototype` and `Renderer.prototype` for all existing public APIs so that callers, tests, and saves remain 100% backwards-compatible.
3. Be verified after each individual extraction against the full 112-test suite and the renderer benchmark.

---

## Proposed Domain Modules & Architecture

```
                       ┌───────────────────────┐
                       │       index.html      │
                       └───────────┬───────────┘
                                   │
       ┌──────────────┬────────────┼─────────────┬─────────────┐
       ▼              ▼            ▼             ▼             ▼
  [config.js]    [data.js]    [world.js]   [climate.js]   [audio.js]
       │              │            │
       │              ▼            │
       │        [tasks.js] (NEW)   │
       │              │            │
       ▼              ▼            ▼
  [inventory.js] [construction.js] [brood.js] (NEW)
  (NEW)          (NEW)             │
       │              │            │
       └──────────────┼────────────┴─────────────┐
                      ▼                          ▼
               [simulation.js]             [ecology.js]
                      │                          │
                      ├──────────────────────────┤
                      ▼                          ▼
             [creatures.js] (NEW)          [renderer.js]
                      │                          │
                      └────────────┬─────────────┘
                                   ▼
                             [ui-modals.js] (NEW)
                                   │
                                   ▼
                                [app.js]
```

---

## Detailed Extraction Breakdown

### 1. `src/brood.js` (Urgency: HIGHEST)
- **Source Files**: [`src/simulation.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js), [`src/world.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/world.js)
- **Extracted Logic**:
  - `updateBrood(sim, dt)`: Advances Egg (45s) $\rightarrow$ Larva (180s, 30 food required) $\rightarrow$ Pupa (85s) $\rightarrow$ Adult emergence. Handles drowning in deep water ($\ge 6$).
  - `rollMutations(brood, mutationTier)`: Evaluates accumulated nutrient multipliers and applies permanent random attribute buffs to emerging adults.
  - `getHatcheries(world)`: Enclosed connected component analysis, boundary wall verification (exactly 1 entrance), and capacity calculation (`tiles / 3`).
  - `physicalHatcheryCap(world)`, `effectiveBroodCap(sim)`: Physical vs unlocked capacity gating.
  - `findHungryLarva(sim, ant)`, `findMisplacedBrood(sim, ant)`, `findFreeHatcheryTile(sim, ant)`: Queries for brood care and relocation.
  - `BroodShop`: Daily BP calculation (`calculateDailyPoints`), upgrade state (`feedUpgradeTier`, `broodCapTier`, `hatchSpeedTier`, `mutationEnhancerTier`, `casteModifierTier`), and purchase transaction handlers.
- **Proxy Methods on Simulation**:
  `sim.updateBrood(dt)`, `sim.physicalHatcheryCap()`, `sim.effectiveBroodCap()`, `sim.findHungryLarva(a)`, `sim.findMisplacedBrood(a)`, `sim.findFreeHatcheryTile(a)`, `sim.setBroodHelper(a, state)`, `sim.onNewDay()`, `sim.buy*Upgrade()`.

### 2. `src/tasks.js` (Urgency: HIGH)
- **Source Files**: [`src/simulation.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js)
- **Extracted Logic**:
  - `assign(sim, ant)`: Gathers candidate activities (`selfFeed`, `selfWater`, `feedQueen`, `queenWater`, `chewFood`, `feedLarvae`, `transportBrood`, `build`, `dig`, `haulSoil`, `patrol`).
  - Priority evaluation: Numeric priority (1–10) weighting and tie-break ordering based on `AntGame.TaskHierarchy`.
  - Capability filters: Caste permissions (e.g., Feeder exclusivity for queen feeds/chewing, Minor dig ban, Brood Helper specialization, Supermajor clearance).
  - `executeChosenTask(sim, ant, chosen)`: Dispatches worker to the chosen task route and state.
  - `resolveCorridorConflict(sim, antA, antB)`: Pairwise ant corridor swap coordination.
  - `moveGroup(sim, ants, target)`: Non-overlapping spatial destination distribution.
- **Proxy Methods on Simulation**:
  `sim.assign(a)`, `sim.executeChosenTask(a, chosen)`, `sim.getCastePriority(caste, task)`, `sim.setCastePriority(caste, task, val)`, `sim.resetCastePriorities(caste)`.

### 3. `src/creatures.js` (Urgency: MEDIUM-HIGH)
- **Source Files**: [`src/renderer.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/renderer.js), [`src/ecology.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/ecology.js)
- **Extracted Logic**:
  - `CreatureRenderer.draw(ctx, screenX, screenY, creature, scale, alpha)`: Procedural drawing for Earthworms (body trails), Beetle Grubs (segmented curving body), Bull Weevils, Hercules Beetles (horns & shell), Mites, Isopods, Spiders (jointed legs & fangs), Baby Spiders, and Root Aphids.
  - `recordBodyTrail(creature, def, fromX, fromY)`: Kinematic trailing segment recording.
- **Proxy Interface**:
  `renderer.creature(c)` calls `AntGame.CreatureRenderer.draw(...)`.

### 4. `src/construction.js` (Urgency: MEDIUM)
- **Source Files**: [`src/simulation.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js)
- **Extracted Logic**:
  - `designateBuild(sim, x, y, worker, structure)`: Validates terrain, checks excavation requirements, and creates construction jobs.
  - `cancel(sim, x, y)`: Refunds construction costs (food and dirt) and resets workers safely to idle.
  - `dispatchJob(sim, worker, jobs, type)`: Allocates jobs to workers.
  - `ensureExcavationJob(sim, buildJob, cell)`: Manages intermediate excavation stages (e.g., 2 excavations for water reservoirs).
  - `routeToBuild(sim, worker)`: Routes worker to material supplies and building sites.
  - `stepBuilding(sim, worker, dt)`: Material consumption, construction timers, and structure finalization (`food-store`, `water-store`, `spoil`, `hatchery-floor`, `hatchery-wall`).
- **Proxy Methods on Simulation**:
  `sim.designateBuild(x, y, worker, structure)`, `sim.cancel(x, y)`, `sim.dispatchJob(...)`.

### 5. `src/inventory.js` (Urgency: MEDIUM)
- **Source Files**: [`src/simulation.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js)
- **Extracted Logic**:
  - `makeItems`, `makeFoodItems`, `itemTotal`, `takeItems`, `syncStores`: Individual slot item allocation and syncing.
  - Colony capacity calculations: `foodCapacity(sim)`, `waterCapacity(sim)`, `queenWaterCapacity(sim)`.
  - Colony resource mutations: `spendFood(sim, val)`, `addFood(sim, val, type)`, `spendWater(sim, val)`, `addWater(sim, val)`.
  - Reservoir logistics: `reservoirDestination(sim, ant)`, `reservoirSource(sim, ant)`, `requestReservoirWithdrawal(sim)`, `pickupReservoir(sim, ant)`.
  - Conservation ledger auditing: `conservation(sim)` calculating exact balance across pits, dumps, carried dirt, and structures.
- **Proxy Methods on Simulation**:
  `sim.foodCapacity()`, `sim.waterCapacity()`, `sim.queenWaterCapacity()`, `sim.spendFood()`, `sim.addFood()`, `sim.spendWater()`, `sim.addWater()`, `sim.syncStores()`, `sim.conservation()`.

### 6. `src/ui-modals.js` (Urgency: LOW-MEDIUM)
- **Source Files**: [`src/app.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/app.js)
- **Extracted Logic**:
  - `openEvolutionShop(sim, toast)`, `renderEvolutionTraits(sim, toast)`: Evolution modal DOM rendering and purchase buttons.
  - `openBroodShop(sim, toast)`, `renderBroodShop(sim, toast)`: Brood Shop modal DOM rendering, upgrade cards, and purchases.
  - `renderColonyOperationsPriorities(sim, caste, activeTab)`: Priority input lists and tab management.
  - `formatEntityInspection(entity, sim)`: Formats HTML readouts for Ants (mutations, specialist roles), Brood (stage, nutrition, mutation rate, carrier), Food/Seeds, and Creatures.
- **Proxy Interface**:
  `app.js` invokes `AntGame.UIModals.*`.

---

## Step-by-Step Staged Execution Plan

1. **Phase 1: Extract `src/brood.js`**
   - Create `src/brood.js` with `AntGame.Brood`.
   - Move hatchery geometry analysis from `world.js` and brood lifecycle/shop logic from `simulation.js`.
   - Add proxy methods to `Simulation.prototype` and `World.prototype`.
   - Update `index.html` and test runners to include `src/brood.js`.
   - **Verification Gate**: Run 112 tests and renderer benchmark.

2. **Phase 2: Extract `src/tasks.js`**
   - Create `src/tasks.js` with `AntGame.TaskEngine`.
   - Move task evaluation, candidate gathering, priority sorting, capability checks, and corridor swaps from `simulation.js`.
   - Add proxy methods to `Simulation.prototype`.
   - Update `index.html` and test runners to include `src/tasks.js`.
   - **Verification Gate**: Run 112 tests and renderer benchmark.

3. **Phase 3: Extract `src/creatures.js`**
   - Create `src/creatures.js` with `AntGame.CreatureRenderer`.
   - Move procedural creature rendering from `renderer.js` and body trail recording from `ecology.js`.
   - Update `renderer.js` to delegate `creature(c)` to `AntGame.CreatureRenderer.draw(...)`.
   - Update `index.html` and test runners to include `src/creatures.js`.
   - **Verification Gate**: Run 112 tests and renderer benchmark.

4. **Phase 4: Extract `src/construction.js`**
   - Create `src/construction.js` with `AntGame.Construction`.
   - Move `designateBuild`, `cancel`, excavation checks, and building step loops from `simulation.js`.
   - Add proxy methods to `Simulation.prototype`.
   - Update `index.html` and test runners to include `src/construction.js`.
   - **Verification Gate**: Run 112 tests and renderer benchmark.

5. **Phase 5: Extract `src/inventory.js`**
   - Create `src/inventory.js` with `AntGame.Inventory`.
   - Move discrete slot records, capacity calculations, reservoir retrieval, and conservation audit from `simulation.js`.
   - Add proxy methods to `Simulation.prototype`.
   - Update `index.html` and test runners to include `src/inventory.js`.
   - **Verification Gate**: Run 112 tests and renderer benchmark.

6. **Phase 6: Extract `src/ui-modals.js`**
   - Create `src/ui-modals.js` with `AntGame.UIModals`.
   - Move Evolution, Brood Shop, Colony Operations, and entity inspector formatting from `app.js`.
   - Update `app.js` to delegate modal rendering.
   - Update `index.html`.
   - **Verification Gate**: Run 112 tests and renderer benchmark.

---

## Verification Plan

### Automated Test Suite
Run after every single extraction step:
```powershell
$env:ELECTRON_RUN_AS_NODE="1"; & "c:\Users\hudso\AppData\Local\Programs\Microsoft VS Code\Code.exe" --test tests/brood.test.cjs tests/climate.test.cjs tests/simulation.test.cjs | Out-String
```
- Must pass all 112 tests with 0 failures at each stage.

### Headless Renderer Visual Regression Benchmark
Run after every single extraction step:
```powershell
$env:ELECTRON_RUN_AS_NODE="1"; & "c:\Users\hudso\AppData\Local\Programs\Microsoft VS Code\Code.exe" tests/test_renderer.cjs | Out-String
```
- Must render all 9 ant castes, all carry states, and all 9 creature species cleanly with sub-2ms frame benchmark.

### Invariant Checks
- Dirt conservation must strictly balance (`sim.conservation() === true`).
- Save / restore backwards compatibility must preserve all existing save schemas.
