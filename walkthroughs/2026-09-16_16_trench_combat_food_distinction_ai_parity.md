# Walkthrough: Trench Combat, Construction Food Distinction, and AI Colony Parity

This document outlines the implementation and verification of Combat Across Trenches, Food Type Distinction for Construction, and AI Colony Feature Parity, alongside the previously completed Zoning & Squad Hauling systems.

---

## 1. Key Accomplishments & Features

### A. Combat Across Trenches
- **1-Tile Trench Melee Reach**:
  - Implemented `AntGame.isAcrossOneTileTrench(world, posA, posB)` in [`src/world.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/world.js) to validate whether two combatants are at hex distance 2 separated by a non-solid trench tile (`zone === 'trench'` or `structure === 'trench'`).
  - Updated `Ecology.workTarget` in [`src/ecology.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/ecology.js) so that melee strikes can strike across the 1-tile gap without clearing or forcing a path onto the trench.
  - Updated `Ecology.creatures` in [`src/ecology.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/ecology.js) so aggressive creatures can attack defending ants across a 1-tile trench.
  - Updated `Simulation.orderTarget('attack')` in [`src/simulation.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js) to allow attack orders across 1-tile trenches without triggering false "Target blocked: open a tunnel to it first" pathfinding errors.
  - Updated `TaskEngine.assign` in [`src/tasks.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/tasks.js) to auto-target approaching enemies across 1-tile trenches.

### B. Food Type Distinction for Construction
- **Processed Food Requirements**:
  - Construction projects requiring food (such as `smooth_floor`, which requires 4 dirt + 1 food) strictly draw from processed colony food reserves (`sim.food` / refined food stores).
  - Raw unharvested seeds and raw corpses cannot be delivered as building mortar without prior processing by dedicated feeders.
  - Workers delivering construction food loads tag their carry with `material: 'food'` and `foodType: 'processed'`.
  - Blueprints and inspector tooltips in [`src/app.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/app.js) explicitly label food costs as `Processed Food: ${delivered} / ${needed} (refined food store rations only)`.
  - Cancelling an in-progress construction job via `Construction.cancel(sim, x, y)` cleanly refunds delivered food back into processed colony food stores (`sim.food`).

### C. AI Ant Colony Feature Parity
- **Full Brood Lifecycle (Egg -> Larva -> Pupa -> Adult)**:
  - Removed the legacy `e.colonyId !== 1` skip in `BroodSystem.updateBrood` in [`src/brood.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/brood.js). Rival colony eggs now mature through all 4 biological stages.
  - In `egg` stage, AI colony eggs incubate within their colony territory (`hexDistance <= 6` from the colony center).
  - In `larva` stage, AI larvae require food accumulation (`foodAccumulated >= larvaFoodRequired`).
  - In `pupa` stage, pupae spin cocoons and mature into full adults of their assigned caste with rolled mutations.
- **AI Colony Brood Feeding**:
  - Updated `Ecology.colonies` in [`src/ecology.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/ecology.js) to monitor hungry larvae and dispatch idle AI workers to retrieve food from their colony store (`col.foodStore`) to feed their developing larvae.
  - Updated `TaskEngine.feedLarvae` in [`src/tasks.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/tasks.js) and `Inventory.getFoodSourceTile` in [`src/inventory.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/inventory.js) to route AI workers to their own colony food stores rather than player stores.
- **Diverse Caste Distribution**:
  - Implemented `Simulation.rollCasteForColony(colonyId)` in [`src/simulation.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js) to generate a full spectrum of castes for AI colonies:
    - Worker: 40%
    - Minor: 15%
    - Media: 15%
    - Soldier: 15%
    - Major: 8%
    - Supermajor: 4%
    - Drone: 2%
    - Princess: 1%
  - Updated AI queen egg laying in `updateQueen` to roll castes from this distribution and assign proper brood lifecycle timers.

---

## 2. File Modifications

| File | Changes Made |
|---|---|
| [`src/world.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/world.js) | Added and exported `AntGame.isAcrossOneTileTrench(world, posA, posB)`. |
| [`src/ecology.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/ecology.js) | Updated `workTarget` for trench reach melee strikes; updated `creatures` for creature trench reach; updated `colonies` for AI brood care dispatch. |
| [`src/simulation.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js) | Added `queen(colonyId)` and `rollCasteForColony(colonyId)`; updated `orderTarget('attack')` trench reach bypass; updated `updateQueen` for AI brood lifecycle and diverse castes; updated `to-feed-larva-supply` for AI food deduction and routing. |
| [`src/tasks.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/tasks.js) | Updated `TaskEngine.assign` combat candidate generation for trench reach; updated `feedLarvae` to support AI colony workers and colony food stores. |
| [`src/inventory.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/inventory.js) | Updated `getFoodSourceTile` to resolve AI colony food stores (`col.foodStore` / colony center). |
| [`src/brood.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/brood.js) | Enabled AI colony brood lifecycle progression (`egg` -> `larva` -> `pupa` -> `adult`), adult hatching, mutation rolling, and AI territory incubation. |
| [`src/construction.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/construction.js) | Construction food carry tagged as `material: 'food'`, `foodType: 'processed'`; delivers strictly from processed stores and refunds on cancel. |
| [`src/app.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/app.js) | Inspector tooltip displays `Processed Food: ${delivered} / ${needed} (refined food store rations only)`. |
| [`tests/trench_combat_and_ai_parity.test.cjs`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/tests/trench_combat_and_ai_parity.test.cjs) | 6 dedicated unit tests for trench reach detection, ant melee attacks across trenches, creature melee attacks across trenches, construction food distinction and refund, AI brood full lifecycle, and AI caste diversity. |

---

## 3. Verification & Automated Test Results

### Dedicated Test Suite: `tests/trench_combat_and_ai_parity.test.cjs`
```
✔ isAcrossOneTileTrench detects valid 1-tile trench gap between non-solid hexes (18.45ms)
✔ combat across trenches: ants execute melee strikes across a 1-tile trench without crossing (21.77ms)
✔ combat across trenches: aggressive creatures attack ants across a 1-tile trench (15.60ms)
✔ food distinction: construction food uses processed colony stores and tags foodType processed (9.52ms)
✔ ai colony parity: rival colony brood goes through full egg -> larva -> pupa -> adult lifecycle (17.53ms)
✔ ai colony parity: rollCasteForColony provides diverse caste distribution (6.44ms)

ℹ tests 6
ℹ suites 0
ℹ pass 6
ℹ fail 0
```

### Full Test Suite Run
```
ℹ tests 157
ℹ suites 0
ℹ pass 157
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1617.1928
```

All 157 unit tests across the entire codebase passed with 0 failures and 0 regressions.
