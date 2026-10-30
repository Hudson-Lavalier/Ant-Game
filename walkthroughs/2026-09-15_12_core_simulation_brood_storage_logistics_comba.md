# Core Simulation, Brood, Storage Logistics & Combat Fixes — Walkthrough

All 12 reported issues and requested features have been implemented, verified, and integrated into the simulation and test suite with 100% passing automated tests.

---

## Key Changes Made

### 1. Queen Combat Indicator & Decoupled Nutrition
- **Root Cause of Stuck Red Lines**: In `Ecology.damage`, threats set `threatId` on nearby non-soldier entities, including the queen. In `simulation.js`, the ant update loop skipped the queen during threat reporting, leaving `queen.threatId` permanently set and drawing the crossed combat lines (`inCombat = ... || entity.threatId`). Additionally, without a natural regeneration mechanism, any queen damage left `health < maxHealth`, permanently rendering a 25px red health bar.
- **Fix**:
  - `src/renderer.js`: Excluded the queen from combat indicator crossed lines (`entity.type !== 'queen'`).
  - `src/ecology.js`: Excluded the queen from threat acquisition (`near.type !== 'soldier' && near.type !== 'queen'`).
  - `src/simulation.js`: Decoupled the Queen's nutrition from colony storage (`queen.food: 100, queen.water: 100, queen.maxFood: 100, queen.maxWater: 100`). Cleared `queen.threatId = null`. Added +10 HP/sec regeneration when the queen is well-fed (`food > 20 && water > 20`).
  - `src/app.js` & `src/ui-modals.js`: Updated header and inspector to display Queen health and nutrition (`Food X/100 · Water Y/100`). Starvation and dehydration alerts now check `queen.food <= 0.01` and `queen.water <= 0.01`.

### 2. Egg & Larva Development Gating
- **Egg Hatchery Gate**: In `src/brood.js`, stage 1 eggs (`e.stage === 'egg'`) are checked against valid enclosed hatchery rooms (`h.isValid`). If an egg is outside a valid hatchery, its age is capped at `e.duration` and it will not advance to stage 2 (larva) until placed in a valid hatchery.
- **Larva Nutrition Clock**: In `src/brood.js`, `e.age` does not advance until `e.foodAccumulated >= 30` (full larval requirement). Once fed, the growth timer runs to completion before pupating.

### 3. Food Storage Capping & Chewed Food Loss
- **Root Cause**: Feeders in `simulation.js:updateWorker` deducted 10 food from corpses/seeds prior to calling `addFood`. When colony food storage was capped, `addFood` rejected the food, resulting in permanent resource loss.
- **Fix**: In `src/simulation.js`, available storage capacity (`foodCapacity() - food`) is checked first. Feeders only deduct and process up to `availSpace`. If storage is full, the feeder idles without consuming or destroying food.
- **Storage Starting Balance**: In `src/config.js` and `src/simulation.js`, starting food and capacity were increased to 300 (3× queen's max food capacity) across 60 storage slots.

### 4. Selection Release & Tool Switching
- In `src/app.js`, clicking the "Release workers" button now calls `setSelection([])` in addition to releasing held ants.
- Switching to Brush mode (`setMode('brush')`) clears current ant selections to prevent accidental move/attack commands.

### 5. Anti-Entrapment Block Placement
- In `src/construction.js:routeToBuild`, builders path to an adjacent open face rather than the target hex itself when building solid walls (`hatchery_wall`).
- On build completion, any ant, creature, or egg occupying the target hex is nudged safely to an adjacent non-solid neighbor before the tile becomes solid.

### 6. Starter Hatchery Chamber Layout
- In `src/world.js:found()`, the starter hatchery now generates with exactly **5 interior floor tiles** (`hatchery-floor`), a contiguous **3-tile wide entrance** for Major and Supermajor clearance (3 clearance), and an egg capacity of 1 (`Math.floor(5 / 3) = 1`).

### 7. Spoil Room Dirt Solidification
- In `src/simulation.js:storage(a)`, when all spoil pits / black holes are full, workers carry excess excavated dirt to the perimeter of the spoil chamber.
- In `src/simulation.js:deposit(a, dt)`, excess dirt accumulates on spoil tiles (`c.spoilDirt`). Upon reaching 5 dirt, the spoil tile solidifies into a solid soil wall (`c.solid = true`, `c.zone = 'soil'`).

### 8. Creature Corpse Food Balance
- In `src/data.js`, corpse food values were rebalanced to scale realistically with creature sizes:
  - **Isopod / Woodlouse**: `baseFood = 45` (was 5).
  - **Mite**: `baseFood = 8` (was 1).
  - **Baby Spider**: `baseFood = 15` (was 8).

### 9. Persistent Attack Targeting
- In `src/ecology.js:workTarget`, attack orders maintain continuous pursuit of their target (`pathStale` checks). Ants no longer abandon targets if the prey shifts positions or pathfinding momentarily pauses. Attack orders persist until the target is dead or manually redirected.

### 10. Shift-Click Order Queuing
- Holding Shift while issuing right-click movement, attack, or carry commands appends the action to `ant.orderQueue`.
- Upon arriving at a destination or completing a task, `simulation.js:executeNextOrder(a)` pops and executes the next order in sequence.

---

## Verification Results

### Automated Test Suite
Ran all 122 tests across all test suites via `agy-node.cmd`:
```powershell
& "C:\Users\hudso\AppData\Roaming\Antigravity\bin\agy-node.cmd" --test tests/brood.test.cjs tests/climate.test.cjs tests/simulation.test.cjs tests/test_renderer.cjs
```
- `tests/brood.test.cjs`: **15 / 15 passed** (100%)
  - Validated starter hatchery (5 tiles, 3-tile wide entrance, 1 egg capacity).
  - Validated egg gating outside hatchery.
  - Validated larva development timer freezing until 30 food fed.
  - Validated feeder chewing protection at storage cap.
  - Validated spoil dirt wall solidification at 5 dirt.
  - Validated creature food balances and Shift-click order queuing.
- `tests/climate.test.cjs`: **13 / 13 passed** (100%)
- `tests/simulation.test.cjs`: **93 / 93 passed** (100%)
  - Queen decoupled food/water depletion, starvation damage, and warnings.
  - 300 starting food capacity and item slots.
  - Conserved soil mass throughout excavations and spoil wall conversions (`sim.conservation() === true`).
- `tests/test_renderer.cjs`: **1 / 1 passed** (100%)
  - Clean rendering of all 9 castes, carry states, and 9 creature species.
  - Full simulation draw cycle benchmark: **1.912 ms/frame** (target < 2.0 ms/frame).
