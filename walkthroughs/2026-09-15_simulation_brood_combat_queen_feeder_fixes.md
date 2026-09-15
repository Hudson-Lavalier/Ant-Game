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

### 6. Procedural Starter Hatchery Chamber Layout
- **Procedural Variation**: In `src/world.js:found()`, the starter hatchery generation is now procedurally derived using `hash(this.seed, 953, 617)`:
  - **18 Combinations**: 3 distinct back-tile floor shape variants $\times$ 6 hex grid orientations ($0^\circ, 60^\circ, 120^\circ, 180^\circ, 240^\circ, 300^\circ$).
  - **Strict Brood Compliance**: All procedural variations guarantee exactly **5 interior floor tiles** (`hatchery-floor`), a contiguous **3-tile wide entrance** for Major and Supermajor clearance (3 clearance), exactly 1 entrance segment (`entranceCount === 1`), and an egg capacity of 1 (`Math.floor(5 / 3) = 1`).
  - **Collision & Passage Protection**: Candidate placement evaluates floor, entrance, and surrounding wall tiles to ensure the chamber never collides with food storage, water storage, spoil, pit, nest center, or the carved corridor connecting nest to pit.

### 6b. Header Time & Weather Display & Compact Dashboard Redesign
- **Compact & Balanced Header**:
  - Reduced `header` height from 84px to 66px, eliminating excessive empty vertical space and matching the viewport canvas (`height: calc(100vh - 66px)`).
  - Reduced `.stats` horizontal item gaps from 24px to 16px and vertical element gaps to 2px, preventing items from crowding or overflowing buttons.
  - Refined typography: `.stats small` set to crisp uppercase 9px (`#8fa086`, letter-spacing 0.8px); `.stats strong` and evolution buttons sized to 13.5px (`#dbe3d4`, font-weight 600).
  - Streamlined `.climate-group`: padding tightened to `4px 10px`, date row set to 9.5px, summary row set to 13px, and succinct formatting `${c.dateFormatted} · ${c.timeOfDayFormatted} · ${c.seasonName}` with hover tooltips for detailed risk and day progress.
  - Header utility buttons sized to 11.5px with 6px 11px padding for clean visual rhythm.

### 6c. Queen Food Capacity Increase to 200
- In `src/config.js:queenFoodCapacity` and `src/simulation.js`, the Queen's stomach capacity was raised from 100 to 200 (`food: 200, maxFood: 200`).
- Feeder replenishment thresholds (`q.food < q.maxFood`), queen nutrition inspection in `src/ui-modals.js` (`Food X / 200`), and header health readouts now support full 200 food storage.
- Updated automated unit tests in `tests/simulation.test.cjs` validating that the queen correctly maintains 200 food capacity, drains over expected durations, and triggers starvation warnings accurately.

### 6d. Centered Bottom Toolbar
- In `style.css`, updated `.toolbar-container` from an offset `left: calc((100% - 277px)/2)` to true viewport horizontal centering: `left: 50%; transform: translateX(-50%)`.
- Normalized media queries across viewport widths to preserve true horizontal centering regardless of whether the right-side inspector panel is visible or hidden.

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

### 11. Water Transport Pathing, Low-Source Loop Prevention & Caste Need Scaling
- **Water Transport Pathing & Wall-Clipping Fix**:
  - *Root Cause*: `this.world.founding.waterStore` is initialized with `waterStorage: true, water: 7; staticWater: true;`. In `pathfind()`, tiles with `waterStorage: true` or `water >= 6` are strictly impassable. `storage(a)` had water delivery destination set to `this.world.founding.waterStore || this.nest`. Workers carrying droplets were instructed to navigate into an impassable block, failing pathfinding every frame and looping in `state = 'blocked'` while twitching into diagonal boundary walls.
  - *Fix*: In `src/simulation.js:storage(a)`, water delivery now routes directly to `this.nest`. In `travel(a, dt)`, lookahead smoothing was reduced from 7 to 3 hexes and guarded with impassability checks (`!targetCell.solid && targetCell.water < 6 && !targetCell.waterStorage && !targetCell.isWell && targetCell.zone !== 'well'`) to prevent grazing corners.
- **Infinite Low-Source Drinking Loops**:
  - *Root Cause*: `antNeedSource` accepted `cell.water > 0.01`. An ant drinking from a near-empty puddle took negligible water, exited drinking without satisfying thirst, and immediately re-targeted the same puddle with 0 travel distance every tick.
  - *Fix*: In `src/simulation.js:antNeedSource`, water sources require `cell.water >= 0.35` (minimum 1 droplet / 5 extractable volume) and approach points target adjacent dry banks (`faces(cell)`). Food sources require `source.val >= 1`. In `consumeAntNeed(a)`, a 1.5-second cooldown timer is applied upon finishing consumption.
- **Base Hunger & Thirst Drain Rebalance**:
  - In `src/config.js`, hunger drain was rebalanced from 12 minutes to 25 minutes (`antFoodDrainPerSecond: 50 / (25 * 60)`), and thirst drain was rebalanced from 8 minutes to 18 minutes (`antWaterDrainPerSecond: 50 / (18 * 60)`), preventing constant interruptions to ant labor.
- **Caste Hunger & Thirst Scaling**:
  - In `src/simulation.js:addAnt`, ant stomach capacities are now scaled proportionally to body size and tier instead of flat 50:
    - **Soldier**: `maxFoodNeed = 125, maxWaterNeed = 125, drainMult = 1.2` (~17.4 min hunger, ~12.5 min thirst)
    - **Major**: `maxFoodNeed = 200, maxWaterNeed = 200, drainMult = 2.0` (~16.7 min hunger, ~12.0 min thirst)
    - **Supermajor**: `maxFoodNeed = 300, maxWaterNeed = 300, drainMult = 3.0` (~16.7 min hunger, ~12.0 min thirst)
  - This resolves rapid starvation of combat castes while preserving their distinct biological energy consumption.

### 12. Feeder Queen Dehydration & Priority Gating Fix
- **Root Cause Analysis**:
  - *Hardcoded Feed/Water Mutual Exclusion*: In `src/tasks.js`, `queenWater` and `feedQueen` were gated behind `if (sim.feederNeed() === 'water')` and `if (sim.feederNeed() === 'food')`. Because `feederNeed()` evaluated `food < foodCap * 0.9` first, it virtually always returned `'food'`, meaning `queenWater` was **never even added to the task candidates list**! Even when the player set `queenWater` to Priority 1 (Max Priority), the priority sorting had no `queenWater` candidate to select.
  - *Queen Nutrition Disconnect in `feederNeed()`*: `feederNeed()` only inspected colony storage (`this.food` and `this.water`), completely ignoring the Queen's personal nutrition (`q.water` and `q.food`). If colony water was full or starting at 100, `feederNeed()` returned `null`, allowing the Queen to dehydrate to death at 0 water while feeders idled or chewed food.
  - *Water Target Reservoir Diversion*: In `src/simulation.js:storage(a)`, if `this.waterTarget === 'reservoir'`, any ant carrying water was instructed to deposit water into the reservoir instead of the Queen, starving the Queen of hydration.
  - *Source Exclusion*: `feederSource(a, 'water')` filtered for `!c.waterStorage`, preventing feeders from utilizing water stored in constructed reservoirs or drawing from colony water stores directly at the nest.
- **Fix**:
  - `src/tasks.js`:
    - Evaluated `feedQueen` and `queenWater` independently: `queenWater` is added to candidates whenever `q.water < q.maxWater * 0.9` OR colony water needs replenishing, provided a water source exists.
    - Updated `candidates.sort` so user-configured caste priority is strictly respected (Priority 1 wins over lower priority tasks), and added a life-or-death emergency override: when `q.water <= 20` or `q.food <= 20`, saving the Queen takes precedence over non-emergency labor.
    - Added immediate proximity execution in `executeChosenTask` when the feeder is within 1.2 hexes of the destination.
  - `src/simulation.js`:
    - Updated `storage(a)`: When `a.feeder`, `a.task?.type === 'feed-water'`, or `q.water < q.maxWater`, carried water is always routed to `this.nest` (`kind: 'queen'`), preventing diversion to reservoirs when the Queen needs water.
    - Updated `feederNeed()`: Prioritizes critical Queen water (`<= 20`) and food (`<= 20`) before storage checks.
    - Updated `feederSource(a, need)`: Feeders can draw water directly from colony storage (`this.water > 0`) at the nest, from reservoirs (`reservoirSource`), or from wild pools ($\ge 0.35$).
    - Updated `pickupFeed(a)`: Implemented direct hydration from colony water stores (`this.spendWater` $\rightarrow$ `q.water += take`), reservoir extraction, and food ration pickup.
    - Updated `updateWorker`: Added emergency Queen dehydration/starvation interrupt during `processing` (food chewing), so feeders immediately break away to save a dying Queen.
  - `tests/simulation.test.cjs`:
    - Added comprehensive regression test verifying `feeder ant prioritizes queen water with max priority and saves dehydrating queen`, including emergency interruption of corpse processing.

### 13. Feeder Queen Infinite Loop Fix, 80% Feeding/Hydration Threshold Gating, Audio Rate-Limiting & Reservoir Overflow
- **Root Cause Analysis**:
  - *Chewed Food Endless Loop*: In `src/tasks.js` and `src/simulation.js`, `feedQueen` was triggered whenever `queenNeedsFood || colonyNeedsFood`. In `feederSource`, `colony-food` was returned if `q.food < 200`. When the queen was at 199.99 food, a feeder ant fetched 5 food rations from food storage. Upon arrival, the queen consumed 0.01 food, reaching 200. Because `storage(a)` saw `q.food === 200`, it instructed the ant to carry the remaining 4.99 food back to storage. At storage, the ant deposited the food, immediately became idle with timer = 0, and on the next frame (since the queen was now at 199.99 food) fetched food again in an endless loop.
  - *Water Looping & Missing Reservoir Deposits*: In `src/simulation.js:storage(a)`, if `a.feeder` was true, carried water was unconditionally routed to `this.nest` (`kind: 'queen'`), completely bypassing the reservoir even when `waterTarget === 'reservoir'` and the queen was already 100% hydrated. Additionally, in `pickupFeed(a)`, direct hydration completed with `a.timer = 0`, causing feeders at the nest to re-trigger hydration every tick (30–60 times per second), repeatedly triggering the `antDrink` audio cue.
  - *Audio Spamming*: Audio coordinator played sound cues without cooldown rate-limiting, causing audio cues (`antDrink`, `antEat`) to play hundreds of times per second during tight logic loops.
- **Fix**:
  - `src/config.js`:
    - Added `queenFeedThresholdRatio: 0.80` (Queen must be below 80% food, i.e., $< 160 / 200$, to warrant feeding).
    - Added `queenWaterThresholdRatio: 0.80` (Queen must be below 80% water, i.e., $< 80 / 100$, to warrant hydration).
    - Added `queenFeedCooldownSeconds: 3.0` (Feeders pause for 3 seconds after tending to the queen before taking on queen care tasks again).
  - `src/audio.js`:
    - Added `cueCooldowns` (`antEat: 350ms`, `antDrink: 350ms`, `feederChewFood: 300ms`, `waterDropletExtract: 250ms`, etc., default `75ms`) and `lastCuePlayTime = new Map()`.
    - Throttled `AudioCoordinator.play(key, options)` to drop rapid duplicate audio requests within their cooldown window.
  - `src/tasks.js`:
    - Decoupled queen feeding from colony food needs: `feedQueen` candidate generation strictly requires `queenNeedsFood = q && q.food < q.maxFood * 0.80`.
    - Gated `queenWater` candidate generation behind `q.water < q.maxWater * 0.80` or active colony/reservoir replenishment.
  - `src/simulation.js`:
    - Updated `feederNeed()` and `feederSource(a, need)`: Colony food and colony water stores are only accessed for the queen if the queen is below 80% capacity and colony stores have at least 1 unit.
    - Updated `storage(a)`: Only returns `{ point: this.nest, kind: 'queen' }` if the queen actually needs food/water ($< 80\%$). If the queen does not need water, carried water routes directly to `reservoir` destination.
    - Updated `pickupFeed(a)`: Requires a minimum take of $\ge 1$ unit, and assigns `a.timer = 3.0` cooldown on completion to prevent same-frame re-triggering.
    - Updated `deposit(a, dt)`: When depositing food or water at the queen, surplus is automatically credited back into colony storage or transferred to reservoirs. Sets `a.timer = 3.0` cooldown after queen deliveries.
  - `ROADMAP.md`:
    - Created the development roadmap documenting Milestones 1 through 5 and post-launch backlog.
  - `tests/simulation.test.cjs`:
    - Added regression tests verifying 80% threshold gating, infinite loop prevention, reservoir water routing, and audio cue rate-limiting.

---

## Verification Results

### Automated Test Suite
Ran all 127 tests across all test suites via `agy-node.cmd`:
```powershell
& "C:\Users\hudso\AppData\Roaming\Antigravity\bin\agy-node.cmd" --test tests/brood.test.cjs tests/climate.test.cjs tests/simulation.test.cjs tests/test_renderer.cjs
```
- `tests/brood.test.cjs`: **15 / 15 passed** (100%)
- `tests/climate.test.cjs`: **13 / 13 passed** (100%)
- `tests/simulation.test.cjs`: **98 / 98 passed** (100%)
  - Feeder priority configuration and task execution.
  - Queen feeding and hydration obey 80% threshold gating and cooldown without infinite looping.
  - Feeder deposits water into reservoir when queen is hydrated.
  - Audio coordinator rate-limits duplicate sound cues within cooldown window.
- `tests/test_renderer.cjs`: **1 / 1 passed** (100%)
  - Total: **127 / 127 tests passing** (100%).
