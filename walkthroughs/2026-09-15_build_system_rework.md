# Build System Rework: Comprehensive Finalization of Milestone 1 Building Blocks

**Date**: September 15, 2026  
**Status**: Completed & Verified  

---

## Executive Summary

The Build System Rework finalizes the **Building Blocks Update** of Milestone 1 from `Updates/Build Improvement/ant_game_build_system_rework.md` with user-approved costs and mechanics.

All ten construction structures are now fully integrated across data definitions, worker resource gathering/hauling, excavation jobs, cancellation refunds, tile properties, environmental disaster handling, ecology routing, UI inspection, canvas rendering textures, and unit test suites.

---

## 1. Structure Definitions & Cost Matrix

The structures conform strictly to the user's approved specifications in `src/data.js`:

| Structure ID | Display Name | Food Cost | Dirt Cost | Excavations | Solid | Special Mechanics & Gating |
|---|---|:---:|:---:|:---:|:---:|---|
| `food` | Food Store | **3** | **1** | 0 | `false` | Physical food storage chamber (`food-store`). |
| `water` | Water Reservoir | **5** | **2** | **2** | `false` | Sucks adjacent water up to Level 7 (`water-store`). Blocks walking. |
| `spoil` | Spoilroom | **0** | **1** | 0 | `false` | Waste depot chamber (`spoil`). |
| `hatchery_floor` | Hatchery Floor | **5** | **3** | 0 | `false` | Brood development floor (`hatchery-floor`). |
| `hatchery_wall` | Hatchery Wall | **5** | **3** | 0 | `true` | Fortified chamber boundary (`hatchery-wall`). Seals hatchery. |
| `dirt` | Plain Dirt | **0** | **1** | 0 | `true`* | Solid soil wall (`hardness: 0.85`). Blocked on water >= 1.0. *When placed on a trench, fills it back to open traversable floor (`solid: false, zone: 'soil'`). |
| `rough_dirt` | Rough Dirt | **0** | **1** | 0 | `false` | Half-raised clods (`rough-dirt`). Inflicts **50% speed penalty (0.5x)** on ants and creatures. |
| `compacted_dirt` | Compacted Wall | **0** | **5** | 0 | `true` | Fortified earthen wall (`hardness: 3.5`). Resists cave-ins, rain breaches, and blocks Mite phase-traversal. Cannot be built on trenches. |
| `trench` | Trench | **0** | **0** | **1** | `false` | **0 resource cost (excavation only)**. Holds water up to 3. Blocks clearance 1 (ants/mites); clearance >= 2 step across. |
| `smooth_floor` | Subterranean Highway | **1** | **4** | 0 | `false` | Unlocked via Evolution (`smooth_floor` trait). Grants **+35% speed (1.35x)** to traversing ants and creatures. |

---

## 2. Key Mechanics Implemented

### A. Trenches: Pure Excavation & Clearance Traversal
- **Zero Dirt / Zero Food**: Designating a trench requires 0 dirt and 0 food. Ants immediately schedule a digging job (`excavate`) on the hex.
- **Clearance Gating**: In `src/world.js`, both A* and BFS pathfinding check `((n.zone === 'trench' || n.structure === 'trench') && clearanceNeeded < 2)`. Clearance 1 units (ants, minors, mites) treat trenches as impassable obstacles. Clearance >= 2 creatures (e.g., Bull Weevils, Spiders, Hercules Beetles) can step across.
- **Direct Movement Check**: In `src/simulation.js`, `travel()` validates that clearance 1 units cannot step onto active trench hexes.

### B. Plain Dirt: Water Gating & Trench Restoration
- **Standing Water Gating**: Designating Plain Dirt on water >= 1.0 is rejected with: `"Cannot place dirt in standing water (water level must be below 1)."`.
- **Trench Restoration**: When built on top of an active trench, Plain Dirt fills the ditch back to open floor (`c.solid = false, c.zone = 'soil', c.water = 0, c.excavations = 0`), restoring flat traversable ground instead of creating a solid obstacle.

### C. Compacted Dirt: Fortified Earthen Walls
- **High Hardness**: Hardness is set to `3.5` (~4.1x standard soil hardness of 0.85).
- **Cave-In & Rain Protection**: `triggerCaveIn()` and `triggerRainInflow()` explicitly skip `compacted-dirt` tiles.
- **Mite Traversal Immunity**: In `src/ecology.js`, `miteRoute()` excludes `compacted-dirt`, denying mites their standard single-dirt phase ability.
- **Boring Resistance**: In `Ecology.excavate()`, burrowing creatures require `d.mineTime * (hardness / 0.85)` time, requiring 4x longer to excavate compacted dirt walls.

### D. Movement Modifiers: Rough Dirt & Smooth Highway
- **Rough Dirt (0.5x)**: Ants in `travel()` and creatures in `Ecology.move()` moving over `rough-dirt` receive a `0.5x` speed multiplier.
- **Smooth Floor Highway (1.35x)**: Ants and creatures receive a `1.35x` speed multiplier.
- **Evolution Trait**: `smooth_floor` trait (`"Subterranean Highway"`, 160 EP) in `AntGame.Traits`. Designation is blocked until the trait is unlocked in the colony's evolution tree.

---

## 3. Visual Rendering & UI

### Canvas Tile Renderers (`src/renderer.js`)
1. **Compacted Dirt Wall (`compactedTexture`)**: Dense horizontal striations and compressed clay pigment blocks.
2. **Rough Dirt (`roughDirtTexture`)**: Jagged dirt clods and gravel stippling.
3. **Trench (`trenchTexture`)**: Inset shadowed border with dark recessed trench polygon.
4. **Smooth Floor (`smoothFloorTexture`)**: Polished highway pavers with dual guidance seam lines.

### Inspector & Toolbar (`src/app.js`, `index.html`)
- Updated `<select id="build-type">` dropdown with all 10 options with exact costs and mechanical hints.
- Updated `roomSummary()` inspector tooltip with detailed stats for Compacted Dirt Wall, Rough Dirt, Dug Trench, and Subterranean Highway.

---

## 4. Verification & Automated Tests

All test suites passed cleanly with **139 tests passed (0 failures, 0 skipped)**:
- `tests/brood.test.cjs`: Pass
- `tests/climate.test.cjs`: Pass
- `tests/simulation.test.cjs`: Pass
- `tests/test_renderer.cjs`: Pass
