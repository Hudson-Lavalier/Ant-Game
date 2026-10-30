# Core Simulation, Brood, Storage Logistics & Combat Fixes — Implementation Plan

This plan addresses the full suite of bugs and feature enhancements reported across the simulation, brood lifecycle, physical resource logistics, UI, combat ordering, and world generation.

---

## User Review Required

> [!IMPORTANT]
> **Key Architecture & Design Decisions:**
> 1. **Queen Food/Water vs. Colony Storage Separation**:
>    - The Queen now has her own dedicated stomach/nutrition meters (`queen.food` and `queen.water`, max 100), distinct from colony storage.
>    - Feeders and workers physically feed the Queen from `food-store` tiles to replenish her food.
>    - Starting food in colony storage is set to **3× Queen's max capacity** (300 food in storage).
>    - Top header displays colony storage capacity and current stock (`[Stored] / [Capacity]`).
> 2. **Larva Nutrition & Hatchery Gates**:
>    - **Stage 1 (Egg)**: Cannot advance to larva unless resting on a valid enclosed hatchery floor tile.
>    - **Stage 2 (Larva)**: Growth/pupation timer **only begins** after the larva has received all required food (`foodAccumulated >= 30`).
> 3. **Dirt Spoil Room Wall Refilling**:
>    - When all spoil pits / black holes are full, excess dirt placed in the spoil room fills individual spoil tiles (5 dirt each), converting them back into solid dirt walls from the perimeter inward.
> 4. **Shift-Click Order Queuing**:
>    - Holding Shift while issuing right-click orders (move, attack, carry, harvest) appends them to the ant's `orderQueue` and renders chain waypoints instead of overwriting the active command.
> 5. **Starter Hatchery Layout**:
>    - Generates with **5 interior floor tiles** and a guaranteed **3-tile wide entrance** into the nest so Majors and Supermajors (3 clearance) never get stuck.

---

## Proposed Changes

### 1. Brood Metamorphosis & Nutrition Subsystem (`src/brood.js` & `src/config.js`)

#### [MODIFY] [brood.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/brood.js)
- **Egg Hatchery Gate**: In `updateBrood(sim, dt)`:
  - For eggs in stage 1 (`e.stage === 'egg'`), check if the egg is located on a valid enclosed hatchery floor tile:
    `const inHatchery = hatcheries.some(h => h.isValid && h.tiles.some(t => t.x === Math.round(e.x) && t.y === Math.round(e.y)));`
  - If `e.colonyId === 1 && !inHatchery`, do NOT advance `e.stage` to `larva`. (Timer pauses or caps at duration until moved into hatchery).
- **Larva Food Timer Prerequisite**:
  - In `updateBrood(sim, dt)`:
  - For `e.stage === 'larva'`, do **not** advance `e.age` while `e.foodAccumulated < reqFood`.
  - Only start advancing `e.age` once `e.foodAccumulated >= reqFood`. Once the timer finishes, it pupates into a pupa (`e.stage = 'pupa'`).
- Update inspector string in `ui-modals.js` and progress bar in `renderer.js` to reflect that larva progress represents development after feeding is complete.

---

### 2. Food Storage, Queen Nutrition, and Feeder Chewing (`src/simulation.js`, `src/inventory.js`, `src/config.js`, `src/app.js`)

#### [MODIFY] [config.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/config.js)
- Set `startingFood: 300` (3× Queen's 100 max capacity in storage).
- Set `foodStoragePerTile: 10` or higher to provide spacious, clear capacity per storage hex.

#### [MODIFY] [inventory.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/inventory.js)
- Ensure `addFood` only accepts up to `sim.foodCapacity() - sim.food`.
- Update `syncFoodTiles` so individual `food-store` tiles show their exact contained food amount and capacity.
- Separate Queen's hunger/thirst from colony storage:
  - Add `queenFoodCapacity = 100`, `queenWaterCapacity = 100`.
  - Queen drains her own `queen.food` and `queen.water`.
  - When feeder brings food/water to the Queen, it replenishes `queen.food` / `queen.water` (from storage).

#### [MODIFY] [simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js)
- **Fix Chewed Food Vanishing**:
  - In `updateWorker(a, dt)` for `a.state === 'processing'`:
    - Calculate available capacity: `const space = Math.max(0, this.foodCapacity() - this.food);`
    - If `space <= 0.001`: feeder pauses processing (`a.state = 'idle'; a.task = null; return;`).
    - Feeder only deducts from target object what can actually be added:
      `const take = Math.min(10, remainingVal, space);`
    - Only call `targetObj.food -= take` / `targetObj.remaining -= take` for what was actually taken.
- **Queen Healing & Nutrition**:
  - When queen is well-fed (`queen.food > 20`) and hydrated, regenerate queen health by +10 HP/sec up to max.
  - Queen starvation and dehydration trigger only when `queen.food <= 0` or `queen.water <= 0`.
- **Dirt Spoil Refilling**:
  - When `this.world.pits` are all full (`pit.used >= pit.capacity`):
  - Ants route dirt to spoil tiles (`c.zone === 'spoil'`).
  - When a spoil tile accumulates `spoilStoragePerTile` dirt (5 dirt), it solidifies:
    `c.solid = true; c.zone = 'soil'; this.world.revision++;`
  - Solidification prioritizes tiles touching existing walls so the room fills from the outside inward.

---

### 3. Creature Corpse Food Balance (`src/data.js`)

#### [MODIFY] [data.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/data.js)
- Update creature food values so creatures yield significantly more food than seeds:
  - `isopod`: Increase `baseFood` from 5 to **45**.
  - `mite`: Increase `baseFood` from 1 to **8**.
  - `baby_spider`: Increase `baseFood` from 8 to **15**.
  - (Worm: 120, Grub: 240, Weevil: 85 remain consistent).

---

### 4. World Generation: Starter Hatchery Layout (`src/world.js`)

#### [MODIFY] [world.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/world.js)
- In `found()`:
  - Generate a **5-tile interior floor** (`hatchery-floor`): `{hx, hy}`, `{hx-1, hy}`, `{hx, hy-1}`, `{hx-1, hy-1}`, `{hx-2, hy}`.
  - Generate a guaranteed **3-tile wide contiguous entrance** connecting to the nest (`entrance` tiles opened to nest).
  - Enclose remaining perimeter with `hatchery-wall`.
  - Room capacity is `Math.floor(5 / 3) = 1` egg (requiring players to expand it after upgrading cap in the brood shop).
  - Wide entrance ensures Majors and Supermajors (3 clearance) never get blocked or trapped.

---

### 5. Construction & Block Placement Safety (`src/construction.js`)

#### [MODIFY] [construction.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/construction.js)
- **Safe Build Stand Location**:
  - When constructing a solid structure (such as `hatchery_wall` or dirt wall), the worker routes to an adjacent open neighbor cell (`hexDistance === 1`), rather than standing on top of the tile being solidified.
- **Self-Trapping Prevention**:
  - Before setting `c.solid = true` upon build completion:
    - Check if any ant (or creature/egg) is standing on `{c.x, c.y}`.
    - Safely nudge/step them to the nearest open adjacent cell.

---

### 6. Combat Ordering & Relentless Pursuit (`src/ecology.js` & `src/simulation.js`)

#### [MODIFY] [ecology.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/ecology.js)
- In `workTarget(s, a, dt)`:
  - When `a.state === 'attack'`:
  - If `distance(a, t) > 1.7`:
    - If `p === null`: do **NOT** cancel the attack order or set `a.state = 'idle'`. Instead, wait or retry on next tick, keeping the pursuit active.
    - If target moves to a new hex, repathfind dynamically towards the moving target so ants relentlessly pursue running creatures until they are dead.
  - Only transition `a.state = 'idle'` and clear `a.task` when `!t || !t.alive` or if player manually issues a new command.

---

### 7. Selection Tool, UI Header & Threat Indicator Fixes (`src/app.js`, `src/renderer.js`, `src/ui-modals.js`)

#### [MODIFY] [app.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/app.js)
- **Release Deselection**:
  - In `$('release').onclick`: call `setSelection([])` to completely clear selection state when releasing ants to colony work.
- **Tool Deselection**:
  - When switching modes (e.g. from Select to Brush), prevent left clicks in Brush mode from targeting/commanding previously selected units.
- **Top Header Display**:
  - Update `updateUI()`:
    - Colony Food: displays `${sim.food.toFixed(0)} / ${sim.foodCapacity().toFixed(0)}` (Stored food vs Storage capacity).
    - Queen Health & Nutrition: clearly visible in inspector or queen stats.
- **Shift-Click Queued Orders**:
  - In `canvas.onpointerup` for RMB:
    - If `e.shiftKey`: instead of replacing current path/task, append order (`{type: 'move', point: g}`, `{type: 'attack', targetId: t.id}`, etc.) to `a.orderQueue`.
    - Push command marker for each queued waypoint.
  - In `simulation.js`: when an ant arrives at destination or finishes a task, if `a.orderQueue.length > 0`, execute the next queued command.

#### [MODIFY] [renderer.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/renderer.js)
- **Queen Combat / Threat Indicator & Health Bar**:
  - Fix `inCombat` check and coordinate so queen does not display stray/confusing red lines.
  - Ensure queen health bar only displays when damaged and renders cleanly above the queen.
  - Clear queen threat state if set so red crossed lines don't get stuck permanently on the queen.

---

## Verification Plan

### Automated Test Suite
Run the test suite to verify no regressions across simulation, brood, and climate:
```powershell
$env:ELECTRON_RUN_AS_NODE="1"; & "c:\Users\hudso\AppData\Local\Programs\Microsoft VS Code\Code.exe" --test tests/brood.test.cjs tests/climate.test.cjs tests/simulation.test.cjs | Out-String
```
- Add unit tests for:
  - Larva timer does not advance until `foodAccumulated >= 30`.
  - Egg does not advance past stage 1 unless in valid hatchery.
  - Feeder chews food without vanishing when food storage is full.
  - Solidifying walls pushes ants to open tiles instead of trapping them.
  - Spoil tiles solidify into dirt blocks when pits are full.
  - Shift-click order queueing executes consecutive orders.
  - Isopod corpse food value is 45.

### Manual Verification
- Launch the browser view and test:
  - Header displays storage capacity and current stock accurately.
  - Hatchery starts with 5 interior tiles and 3 entrance tiles.
  - Shift-RMB queues multiple move/attack waypoints.
  - Queen does not have unexplained red lines underneath.
