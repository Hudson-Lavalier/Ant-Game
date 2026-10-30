# Implementation Plan — Complete Brood Update

Transition the colony reproductive model from a simple egg-timer into a complete biological developmental cycle (**Egg → Larva → Pupa → Adult**), accompanied by physical **Hatchery** chamber construction, the **Brood Helper** worker role (with **Feeder** fallback), an autonomous **Brood Care & Feeding** pipeline, **Brood Points** survival currency, and a comprehensive **Brood Shop** progression tree.

---

## User Review Required

> [!IMPORTANT]
> **Key Architecture Decisions for Approval:**
> 1. **Brood Entity Model**: The existing `sim.eggs` array will be upgraded into a unified `sim.brood` array (with backwards compatibility aliases where needed). Each brood entity has:
>    - `stage`: `'egg'` (45s) $\rightarrow$ `'larva'` (180s, needs 30 food) $\rightarrow$ `'pupa'` (85s) $\rightarrow$ adult emergence.
>    - `health`: 25 HP, vulnerable to drowning if water $\ge 6$ and auto-aggroed by hostile creatures.
>    - `foodAccumulated`: 0 to 30.
>    - `queenId`: Originating Queen lineage.
>    - `carriedBy`: Ant ID when being transported.
> 2. **Hatchery Room Geometry & Validation**:
>    - Floors: `hatchery_floor` (cost: 5 food, 3 dirt).
>    - Walls: `hatchery_wall` (cost: 5 food, 3 dirt).
>    - Enclosure Rule: Connected `hatchery_floor` tiles bordered by solid walls on perimeter with at most one 1-tile entrance opening.
>    - Physical capacity: 1 egg per 3 floor tiles.
>    - Effective egg cap: $\min(\text{unlockedBroodCap}, \text{physicalHatcheryCap})$.
>    - Founding Colony: Starts with a tiny enclosed Hatchery supporting 1 egg.
> 3. **Brood Helper & Feeder Fallback**:
>    - Brood Helper is an assignable worker role unlocked in the Brood Shop (cost: 50 BP).
>    - If no Brood Helper is assigned/unlocked, existing Feeders automatically perform brood transport and larval feeding.
>    - New task priorities in Colony Operations: `transportBrood` and `feedLarvae`.
> 4. **Brood Points & Brood Shop**:
>    - Brood Points accumulate daily upon `advanceCalendarDay()`: +1 BP per Worker/Minor/Media/Soldier/Drone/Princess, +2 BP per Major, +3 BP per Supermajor.
>    - Dedicated **Brood Shop** modal: Brood Helper Unlock, Feed Batch Upgrades (5 to 30 food with mutation multiplier up to 5x), Hatch Speed, Brood Capacity, Mutation Type Enhancers, and Caste Roll Adjustments.

---

## Proposed Changes

### Configuration & Data Layer

#### [MODIFY] [config.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/config.js)
- Add brood developmental timings:
  - `eggStageSeconds: 45`
  - `larvaStageSeconds: 180`
  - `pupaStageSeconds: 85`
  - `larvaFoodRequirement: 30`
  - `broodHealth: 25`
- Add Hatchery build costs:
  - `buildHatcheryFloorFoodCost: 5`, `buildHatcheryFloorDirtCost: 3`
  - `buildHatcheryWallFoodCost: 5`, `buildHatcheryWallDirtCost: 3`
- Add Brood Shop base costs & scaling constants.

#### [MODIFY] [data.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/data.js)
- Add new tasks to `AntGame.TaskHierarchy`:
  - `transportBrood`: Autonomous transport of eggs from Queen to Hatchery.
  - `feedLarvae`: Autonomous retrieval of stored food to feed hungry larvae in Hatcheries.
- Update `AntGame.DefaultCastePriorities` and caste eligibility for `brood_helper`, `feeder`, and general `worker`.
- Add mutation definitions (`hp`, `speed`, `digRate`, `buildRate`, `attackDamage`, `maxCarry`, `maxFoodNeed`, `maxWaterNeed`).

---

### World & Room Structure Layer

#### [MODIFY] [world.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/world.js)
- Add founding placement for the default starter Hatchery (3 hatchery floor tiles enclosed by walls with a 1-tile entrance opening beside the nest).
- Support `hatchery_wall` in cell properties (`c.solid = true`, `c.structure = 'hatchery_wall'`).
- Support `hatchery_floor` in cell properties (`c.solid = false`, `c.zone = 'hatchery'`).

---

### Simulation & Brood Logic Layer

#### [MODIFY] [simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js)
- **Hatchery Detection & Validation**:
  - Implement `getHatcheries()`: Flood-fills connected `zone === 'hatchery'` floor tiles and verifies enclosure perimeter (solid/wall border with $\le 1$ entrance gap).
  - Calculates `physicalHatcheryCapacity = Math.floor(validTiles / 3)`.
  - Calculates `effectiveBroodCapacity = Math.min(this.unlockedBroodCap, physicalHatcheryCapacity)`.
- **Queen Egg Laying**:
  - Gate `canLay(q)` by `activeBroodCount < effectiveBroodCapacity`.
  - Record originating `queenId`, `stage: 'egg'`, `health: 25`, `age: 0`, `stageDuration: 45`.
- **Brood Developmental Pipeline (`updateBrood(dt)`)**:
  - **Egg**: Advances age; when `age >= 45s`, transitions to `'larva'` (`stageDuration = 180s`, `foodAccumulated = 0`).
  - **Larva**: Advances age; receives food from Brood Helpers/Feeders. When `age >= 180s` AND `foodAccumulated >= 30`: rolls mutation bonus based on feeding quality and transitions to `'pupa'` (`stageDuration = 85s`).
  - **Pupa**: Advances age; when `age >= 85s`, emerges as adult ant with any gained developmental mutations applied.
- **Brood Transport & Feeding Jobs**:
  - `assignBroodTransport(ant)`: Dispatches worker to pick up unhoused eggs near queen and carry them to valid Hatchery floor tiles.
  - `assignLarvaFeeding(ant)`: Dispatches worker to collect food from food store (using unlocked feeding batch size: 5, 10, 15, 20, 25, 30) and deliver to hungry larvae.
- **Brood Points Daily Accumulation (`onNewDay()`)**:
  - Hooked into calendar day transition: counts living colony ants (+1 Worker/minor/etc., +2 Major, +3 Supermajor) and adds to `this.broodPoints`.
- **Brood Shop Methods**:
  - `buyBroodHelperUnlock()`, `upgradeFeedBatch()`, `upgradeHatchSpeed()`, `upgradeBroodCap()`, `upgradeMutationEnhancer(type)`, `adjustCasteBias(caste, delta)`.
- **Brood Helper Assignment**:
  - `setBroodHelper(ant)`: Similar to `setFeeder(ant)`, toggles the Brood Helper role on a selected worker once unlocked.

---

### Ecology & Hostile Creature Layer

#### [MODIFY] [ecology.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/ecology.js)
- In `Ecology.update()`:
  - Add `s.brood` to predator targeting: Aggressive creatures (spiders, mites, beetles) within range acquire eggs, larvae, and pupae as targets and deal damage to them.
  - Drowning check: If water depth on a brood cell is $\ge 6$, brood takes drowning damage (`C.drowningDamage * dt`) and perishes if HP drops $\le 0$.

---

### Canvas Rendering Layer

#### [MODIFY] [renderer.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/renderer.js)
- Draw Hatchery floors (subtle nursery soil patterning with border indicators) and Hatchery walls (masonry packed soil barrier).
- Render distinct visual graphics for each developmental stage:
  - **Egg**: Translucent pearl-white oval cluster with age progress indicator.
  - **Larva**: Segmented, curved cream grub body with dual progress bars (developmental age timer + nutrition/food bar).
  - **Pupa**: Amber cocoon/chrysalis capsule.
  - Carried brood offset: Follows the transporting ant's head/mandibles.
  - Health bar: Rendered above any damaged brood individual.

---

### User Interface & Controls Layer

#### [MODIFY] [index.html](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/index.html)
- Add "Hatchery Floor" and "Hatchery Wall" to `#build-type` dropdown.
- Add "BROOD POINTS" indicator and "Brood Shop" button to header.
- Add Brood Shop modal (`#brood-panel`) with tabs/sections for Role Unlock, Batch Upgrades, Hatch Speed, Brood Cap, Mutation Enhancers, and Caste Probabilities.
- Add "Assign Brood Helper" button to Inspector aside.

#### [MODIFY] [app.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/app.js)
- Wire Brood Shop modal open/close and purchase handlers.
- Wire Brood Helper button in Inspector.
- In `roomSummary()`, support Hatchery inspection: displays valid enclosure status, total area, max egg capacity, active eggs/larvae/pupae count.
- Update Colony Operations to include the Brood Helper caste tab and priorities for `transportBrood` and `feedLarvae`.

#### [MODIFY] [hex-ui.css](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/hex-ui.css)
- Add styling for the Brood Shop modal, upgrade cards, tier indicators, and Hatchery status badges.

---

## Verification Plan

### Automated Headless Tests
1. **Brood Developmental Cycle Tests** (`tests/brood.test.cjs`):
   - Verify Egg (45s) transitions to Larva.
   - Verify Larva remains in larval stage after 180s if food $< 30$.
   - Verify Larva transitions to Pupa once both 180s have elapsed AND 30 food is delivered.
   - Verify Pupa emerges into adult ant after 85s.
   - Verify developmental mutations apply correctly to the newly emerged adult.
2. **Hatchery Enclosure & Capacity Tests**:
   - Verify 3-tile enclosed room with 1 entrance yields 1 egg capacity.
   - Verify room with broken walls or $>1$ entrance is flagged invalid.
   - Verify queen laying is blocked when brood count reaches `effectiveBroodCapacity`.
3. **Brood Helper & Feeder Transport/Feeding Tests**:
   - Verify Brood Helper / Feeder transports freshly laid egg to Hatchery.
   - Verify hungry larva receives food deliveries matching current batch size.
4. **Brood Points & Shop Tests**:
   - Verify daily calendar transition awards correct Brood Points based on living caste counts.
   - Verify Brood Shop purchases correctly deduct BP and unlock benefits.
5. **Ecology & Hazard Tests**:
   - Verify hostile creatures target and damage brood entities.
   - Verify brood taking drowning damage in floodwater $\ge 6$.

### Test Command
```powershell
$env:ELECTRON_RUN_AS_NODE="1"; & "c:\Users\hudso\AppData\Local\Programs\Microsoft VS Code\Code.exe" --test tests/brood.test.cjs tests/climate.test.cjs tests/simulation.test.cjs
$env:ELECTRON_RUN_AS_NODE="1"; & "c:\Users\hudso\AppData\Local\Programs\Microsoft VS Code\Code.exe" tests/test_renderer.cjs
```
