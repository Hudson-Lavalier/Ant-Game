# Walkthrough: Build System Rework (Milestone 1 Building Blocks)

**Date**: September 15, 2026  
**Status**: Complete  
**Permanent Walkthrough Archive**: [`walkthroughs/2026-09-15_build_system_rework.md`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/walkthroughs/2026-09-15_build_system_rework.md)

---

## What Was Done

### 1. Structure Costs & Data Definitions ([`src/data.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/data.js#L21-L32))
- Configured all 10 structures according to user approval:
  - **Food Store (`food`)**: 3 Food, 1 Dirt, 0 Excavations
  - **Water Reservoir (`water`)**: 5 Food, 2 Dirt, 2 Excavations
  - **Spoilroom (`spoil`)**: 0 Food, 1 Dirt, 0 Excavations
  - **Hatchery Floor (`hatchery_floor`)**: 5 Food, 3 Dirt, 0 Excavations (`solid: false`)
  - **Hatchery Wall (`hatchery_wall`)**: 5 Food, 3 Dirt, 0 Excavations (`solid: true`)
  - **Plain Dirt (`dirt`)**: 0 Food, 1 Dirt, 0 Excavations (`solid: true`)
  - **Rough Dirt (`rough_dirt`)**: 0 Food, 1 Dirt, 0 Excavations (`solid: false`)
  - **Compacted Dirt Wall (`compacted_dirt`)**: 0 Food, 5 Dirt, 0 Excavations (`solid: true`, `hardness: 3.5`)
  - **Trench (`trench`)**: 0 Food, 0 Dirt, 1 Excavation (`solid: false`)
  - **Smooth Floor / Highway (`smooth_floor`)**: 1 Food, 4 Dirt, 0 Excavations (`solid: false`, unlocked via `smooth_floor` evolution trait)

### 2. Construction Rules & Behavior ([`src/construction.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/construction.js))
- **Trenches Cost No Dirt or Food**: Zero resource cost; schedules a 1-dig excavation job immediately upon designation.
- **Plain Dirt Trench Restoration**: Building Plain Dirt on an active trench fills the ditch back to open traversable floor (`solid: false, zone: 'soil'`). Building on normal open floor creates a solid dirt wall.
- **Standing Water Check**: Plain Dirt cannot be placed on water $\ge 1.0$.
- **Compacted Dirt Placement**: Denied from placement directly onto active trenches.
- **Multi-Resource Delivery & Refunds**: Handles multi-resource deliveries (dirt + food) and cleanly refunds both upon cancellation.

### 3. Pathfinding & Movement Physics ([`src/world.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/world.js), [`src/simulation.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js), [`src/ecology.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/ecology.js))
- **Trench Clearance**: A* and BFS in `findRoute()` block clearance 1 units (ants/minors/mites), while letting clearance $\ge 2$ creatures step across. Direct movement in `travel()` enforces this constraint.
- **Speed Multipliers**:
  - `rough-dirt`: 0.5× speed penalty on ants and creatures.
  - `smooth-floor`: 1.35× (+35%) speed bonus on ants and creatures.
- **Compacted Dirt Fortification**:
  - Immunity to cave-in collapses in `triggerCaveIn()`.
  - Immunity to direct rain breaches in `triggerRainInflow()`.
  - Mite single-dirt phase digging blocked in `Ecology.miteRoute()`.
  - 4.1× longer boring time for burrowing creatures in `Ecology.excavate()`.

### 4. Canvas Visuals & User Interface ([`src/renderer.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/renderer.js), [`src/app.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/app.js), [`index.html`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/index.html))
- Added custom textures for `compacted-dirt`, `rough-dirt`, `trench`, and `smooth-floor`.
- Updated `<select id="build-type">` dropdown to show all 10 structures with exact costs.
- Updated `roomSummary()` inspector tooltip with detailed structural profiles for the new terrain types.

---

## Verification Results

Ran the full test suite with agy-node:
```powershell
& "C:\Users\hudso\AppData\Roaming\Antigravity\bin\agy-node.cmd" --test tests/brood.test.cjs tests/climate.test.cjs tests/simulation.test.cjs tests/test_renderer.cjs
```
- **139 tests passed out of 139 (0 failures, 0 regressions)**
- Full renderer benchmark completed in 1.89 ms/frame across 100 frames.
