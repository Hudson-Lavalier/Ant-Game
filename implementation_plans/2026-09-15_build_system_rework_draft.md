# Build System Rework Implementation Plan

This plan formalizes and implements the complete **Build System Rework** as specified in [`ant_game_build_system_rework.md`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/Updates/Build%20Improvement/ant_game_build_system_rework.md), finalizing the **Building Blocks Update** of Milestone 1.

---

## User Review Required

> [!IMPORTANT]
> **Proposed Structure Costs & Properties Summary**:
> 1. **Plain Dirt (`dirt`)**: 1 Dirt. Allowed only where water level $< 1.0$. Creates normal solid diggable soil (`hardness: 0.85`). When placed on a **Trench**, it fills the trench and restores it to open path/floor, rather than creating a wall.
> 2. **Half-Raised / Rough Dirt (`rough_dirt`)**: 1 Dirt. Creates traversable floor (`solid: false`, `zone: 'rough-dirt'`). Imposes a 50% movement speed penalty (`0.5x`) on player ants, rival ants, and non-exempt creatures.
> 3. **Compacted Dirt Wall (`compacted_dirt`)**: 5 Dirt. Creates solid wall (`solid: true`, `zone: 'compacted-dirt'`, `hardness: 3.5`). Diggable (~4x longer). Mites **cannot** phase through it. Prevents direct ordinary rain flood breaches and ordinary wind cave-ins (overridden by thunderstorms & earthquakes). Cannot be placed directly on a Trench.
> 4. **Trench (`trench`)**: 2 Dirt. Creates open defensive ditch (`solid: false`, `zone: 'trench'`). Holds water up to Level 3. Blocks small units (clearance 1: ants, minors, mites). Large creatures (clearance $\ge 2$: spiders, beetles) can cross. Attacks (reach $\ge 1.7$) reach across 1 tile.
> 5. **Smooth Dirt Floor (`smooth_floor`)**: 4 Dirt + 1 Food. Unlocked via Evolution (`smooth_floor` trait). Speeds movement across it by $+35\%$ (`1.35x`). Workers physically deliver both 4 Dirt AND 1 Food to the blueprint.
> 6. **Existing Room Types**:
>    - Food Store (`food`): 5 Food, 1 Dirt.
>    - Water Reservoir (`water`): 10 Food, 2 Dirt, 2 Excavations.
>    - Spoil Room (`spoil`): 0 Food, 1 Dirt.
>    - Hatchery Floor (`hatchery_floor`): 5 Food, 3 Dirt.
>    - Hatchery Wall (`hatchery_wall`): 5 Food, 3 Dirt.

---

## Proposed Changes

### Component 1: Data Catalog & Evolution Tree
#### [MODIFY] [`src/data.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/data.js)
- Add `smooth_floor` trait under `AntGame.Traits`:
  ```javascript
  {id:'smooth_floor', name:'Subterranean Highway', category:'Civil engineering', cost:160, prerequisites:[], description:'Enables construction of polished Smooth Dirt Floors that accelerate colony traffic.', effects:{smoothFloor:true}}
  ```
- Define canonical metadata dictionary for build types `AntGame.BuildTypes`:
  - `food`: `{ name: 'Food room', food: 5, dirt: 1, excavations: 0, solid: false }`
  - `water`: `{ name: 'Water reservoir', food: 10, dirt: 2, excavations: 2, solid: false }`
  - `spoil`: `{ name: 'Spoilroom', food: 0, dirt: 1, excavations: 0, solid: false }`
  - `hatchery_floor`: `{ name: 'Hatchery floor', food: 5, dirt: 3, excavations: 0, solid: false }`
  - `hatchery_wall`: `{ name: 'Hatchery wall', food: 5, dirt: 3, excavations: 0, solid: true }`
  - `dirt`: `{ name: 'Plain dirt', food: 0, dirt: 1, excavations: 0, solid: true }`
  - `rough_dirt`: `{ name: 'Rough dirt', food: 0, dirt: 1, excavations: 0, solid: false }`
  - `compacted_dirt`: `{ name: 'Compacted dirt wall', food: 0, dirt: 5, excavations: 0, solid: true }`
  - `trench`: `{ name: 'Trench', food: 0, dirt: 2, excavations: 0, solid: false }`
  - `smooth_floor`: `{ name: 'Smooth dirt floor', food: 1, dirt: 4, excavations: 0, solid: false, unlockTrait: 'smooth_floor' }`

---

### Component 2: Construction Logic & Resource Delivery
#### [MODIFY] [`src/construction.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/construction.js)
- Update `designateBuild(sim, x, y, ant, structure)`:
  - Check unlock condition for `smooth_floor` (`sim.traits.includes('smooth_floor') || sim.traitLevels.smooth_floor > 0`).
  - Read specific `food` and `dirt` costs from `AntGame.BuildTypes[structure]`.
  - Validate placement rules:
    - `dirt`: If `(c.water || 0) >= 1.0`, reject placement (cannot erase significant water bodies).
    - `compacted_dirt`: Cannot be placed directly on an active `trench` (`if (c.zone === 'trench' || c.structure === 'trench') return false`).
    - Spoil hole / pit check: Reject if `Construction.isHole(sim, c, x, y)`.
  - Multi-resource tracking: Initial job status evaluates both `sim.food >= job.food` and `sim.world.pit.used >= job.dirt`.
- Update `stepBuilding(sim, a, dt)`:
  - Ensure workers fetch Food from food storage and Dirt from spoil pit, delivering both to the blueprint until `foodNeeded <= 0 && dirtNeeded <= 0`.
  - When `timer >= C.buildSeconds`, complete construction based on `kind`:
    - `dirt`:
      - If tile was a `trench`: fills trench, returns tile to traversable open floor (`c.solid = false; c.zone = 'soil'; c.structure = null; c.water = 0;`).
      - Otherwise: `c.solid = true; c.zone = 'soil'; c.terrain = 'soil'; c.hardness = 0.85; c.structure = null;`. Displace any ants/eggs on the tile to an open neighbor.
    - `rough_dirt`:
      - `c.solid = false; c.zone = 'rough-dirt'; c.structure = 'rough_dirt';`.
    - `compacted_dirt`:
      - `c.solid = true; c.zone = 'compacted-dirt'; c.structure = 'compacted_dirt'; c.hardness = 3.5;`. Displace ants/eggs to open neighbor.
    - `trench`:
      - `c.solid = false; c.zone = 'trench'; c.structure = 'trench'; c.water = Math.min(3, c.water || 0);`.
    - `smooth_floor`:
      - `c.solid = false; c.zone = 'smooth-floor'; c.structure = 'smooth_floor';`.
- Pruning and Cancellation in `cancel(sim, x, y)`:
  - Fully refund both `deliveredFood` to colony food and `deliveredDirt` to spoil pit.

---

### Component 3: Movement, Pathfinding & Creature Ecology
#### [MODIFY] [`src/simulation.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js)
- In `travel(a, dt)`:
  - Check current tile zone for speed modifier:
    - If `cell.zone === 'rough-dirt'`: multiply step distance by `0.5` (50% movement speed).
    - If `cell.zone === 'smooth-floor'`: multiply step distance by `1.35` (+35% speed boost).
- In `triggerCaveIn(source)`:
  - Skip collapsed tiles if `cell.zone === 'compacted-dirt' || cell.structure === 'compacted_dirt'`.
- In `triggerRainInflow()`:
  - Avoid breaching directly on `compacted-dirt`.

#### [MODIFY] [`src/world.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/world.js)
- In `findRoute` & `pathfind`:
  - Trench blocking: If `n.zone === 'trench'`, only allow passage if `clearanceNeeded >= 2` (large creatures can step over, small ants cannot pass).
  - Combat line-of-sight / adjacency: Trench tiles remain valid targets across 1 hex distance.

#### [MODIFY] [`src/ecology.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/ecology.js)
- In `Ecology.move(c, d, dt)`:
  - Apply `0.5x` movement speed penalty if creature is traveling on `rough-dirt`.
- In `Ecology.miteRoute(s, c, target)`:
  - Add check: Mites **cannot** travel through `compacted-dirt` (`if (n.zone === 'compacted-dirt' || n.structure === 'compacted_dirt') continue;`).

---

### Component 4: Rendering & UI Controls
#### [MODIFY] [`index.html`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/index.html)
- Expand `<select id="build-type">` with the new structures:
  ```html
  <option value="food">Food room (5F, 1D)</option>
  <option value="water">Water reservoir (10F, 2D)</option>
  <option value="spoil">Spoilroom (1D)</option>
  <option value="hatchery_floor">Hatchery floor (5F, 3D)</option>
  <option value="hatchery_wall">Hatchery wall (5F, 3D)</option>
  <option value="dirt">Plain dirt (1D)</option>
  <option value="rough_dirt">Rough dirt (1D)</option>
  <option value="compacted_dirt">Compacted dirt wall (5D)</option>
  <option value="trench">Trench (2D)</option>
  <option value="smooth_floor">Smooth dirt floor (1F, 4D)</option>
  ```

#### [MODIFY] [`src/renderer.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/renderer.js)
- In `tile(c, p, z)`:
  - Render `compacted-dirt`: Fortified deep earthen brown with dense compression crosshatch.
  - Render `rough-dirt`: Rough clod/gravel stippling over soil.
  - Render `trench`: Inset shadowed ditch polygon with water if present.
  - Render `smooth-floor`: Light polished highway paver / packed earthen finish.
- In `drawJobs()`:
  - For blueprints requiring multi-resource delivery (e.g. food + dirt), draw segmented resource indicator rings/bars showing delivery progress for both materials.

#### [MODIFY] [`src/app.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/app.js)
- Update `roomSummary(start)` inspector tooltips for the new terrain types:
  - Plain Dirt: `Solid terrain · restored soil wall.`
  - Rough Dirt: `Rough Dirt · Difficult terrain (50% movement speed).`
  - Compacted Dirt Wall: `Compacted Dirt Wall · Fortified barrier resistant to cave-ins, rain breaches, and mites.`
  - Trench: `Trench · Defensive ditch (blocks small units, crossable by large creatures).`
  - Smooth Dirt Floor: `Smooth Dirt Floor · High-speed colony thoroughfare (+35% speed).`

---

## Verification Plan

### Automated Regression & Unit Tests
Run via:
`agy-node.cmd --test tests/brood.test.cjs tests/climate.test.cjs tests/simulation.test.cjs tests/test_renderer.cjs`

Add unit tests in [`tests/simulation.test.cjs`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/tests/simulation.test.cjs) verifying:
1. **Multi-Resource Delivery**:
   - `smooth_floor` requires and consumes both 4 Dirt and 1 Food before completing.
   - Cancelling `smooth_floor` mid-delivery refunds the exact amounts of delivered Dirt and Food.
2. **Plain Dirt Placement & Water Guard**:
   - Placing Plain Dirt on a dry or $< 1.0$ water tile succeeds, creating solid soil.
   - Placing Plain Dirt on water $\ge 1.0$ is rejected.
   - Placing Plain Dirt on a `trench` fills it and returns the tile to open traversable soil (`solid = false`).
3. **Rough Dirt Speed Penalty**:
   - Worker travels across `rough-dirt` at half speed (`0.5x`).
4. **Compacted Dirt**:
   - Excavation hardness is 3.5 (takes ~4x longer to dig than 0.85 soil).
   - Mites cannot path through compacted dirt via `miteRoute`.
   - Wind cave-ins skip compacted dirt blocks.
   - Placing Compacted Dirt on a `trench` is rejected.
5. **Trench Blocking & Crossing**:
   - Worker / ant (clearance 1) cannot path through an empty `trench`.
   - Large creature (clearance 2 or 3, e.g. Spider or Hercules) can path/step across a `trench`.
6. **Smooth Dirt Floor**:
   - Cannot be built if `smooth_floor` trait is not unlocked.
   - Speeds ant travel by 1.35x.
   - Building completes cleanly once both resources are delivered.

### Manual Verification
- Launch game, test building each of the 5 new structures using Brush and single-click.
- Inspect each tile in the aside panel to confirm correct titles and descriptions.
- Verify visual rendering of blueprints, delivered resource bars, and finished tiles.
