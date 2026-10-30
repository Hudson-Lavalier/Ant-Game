# Build System Rework Implementation Plan

This plan formalizes and implements the complete **Build System Rework** as specified in [`ant_game_build_system_rework.md`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/Updates/Build%20Improvement/ant_game_build_system_rework.md), with user-approved construction costs and mechanics:

---

## Approved Structure Costs & Mechanics

1. **Food Store (`food`)**: **3 Food, 1 Dirt**, 0 Excavations.
2. **Water Reservoir (`water`)**: **5 Food, 2 Dirt, 2 Excavations**.
3. **Spoilroom (`spoil`)**: **1 Dirt, 0 Food**, 0 Excavations.
4. **Hatchery Floor (`hatchery_floor`)**: **5 Food, 3 Dirt**, 0 Excavations.
5. **Hatchery Wall (`hatchery_wall`)**: **5 Food, 3 Dirt**, 0 Excavations (solid wall).
6. **Plain Dirt (`dirt`)**: **1 Dirt, 0 Food**.
   - Allowed only where water level $< 1.0$.
   - Creates normal solid diggable soil (`hardness: 0.85`).
   - When placed on a **Trench**, it fills the trench and restores it to open path/floor, rather than creating a wall.
7. **Half-Raised / Rough Dirt (`rough_dirt`)**: **1 Dirt, 0 Food**.
   - Creates traversable floor (`solid: false`, `zone: 'rough-dirt'`).
   - Imposes a 50% movement speed penalty (`0.5x`) on player ants, rival ants, and non-exempt creatures.
8. **Compacted Dirt Wall (`compacted_dirt`)**: **5 Dirt, 0 Food**.
   - Creates solid wall (`solid: true`, `zone: 'compacted-dirt'`, `hardness: 3.5`).
   - Diggable (~4x longer).
   - Mites **cannot** phase through it.
   - Prevents direct ordinary rain flood breaches and ordinary wind cave-ins (overridden by thunderstorms & earthquakes).
   - Cannot be placed directly on a Trench.
9. **Trench (`trench`)**: **0 Dirt, 0 Food, 1 Excavation** (you just dig it).
   - Creates open defensive ditch (`solid: false`, `zone: 'trench'`).
   - Holds water up to Level 3.
   - Blocks small units (clearance 1: ants, minors, mites).
   - Large creatures (clearance $\ge 2$: spiders, beetles) can cross.
   - Attacks (reach $\ge 1.7$) reach across 1 tile.
10. **Smooth Dirt Floor (`smooth_floor`)**: **4 Dirt, 1 Food**.
   - Unlocked via Evolution (`smooth_floor` trait: Subterranean Highway).
   - Speeds movement across it by $+35\%$ (`1.35x`).
   - Workers physically deliver both 4 Dirt AND 1 Food to the blueprint.

---

## Execution Steps

1. **`src/data.js`**:
   - Add `smooth_floor` trait to `AntGame.Traits`.
   - Export `AntGame.BuildTypes` with the exact costs, excavation requirements, and properties.

2. **`src/construction.js`**:
   - Wire `AntGame.BuildTypes` into `designateBuild` and `refreshJobStates`.
   - Enforce trench dig excavation (`excavations: 1` if solid or open floor requiring ditch excavation).
   - Support Plain Dirt filling a trench into open floor (`solid = false, zone = 'soil'`).
   - Support multi-resource delivery (Food + Dirt) for Smooth Floor and rooms.
   - Reject Compacted Dirt on trenches and Plain Dirt on water $\ge 1.0$.

3. **`src/simulation.js` & `src/world.js`**:
   - Add speed modifiers in `travel`: 0.5x for `rough-dirt`, 1.35x for `smooth-floor`.
   - Update `findRoute`/`pathfind` for trench clearance ($\ge 2$ required to cross).
   - Compacted dirt environmental protection against ordinary rain inflows and wind cave-ins.

4. **`src/ecology.js`**:
   - Block mites from passing through `compacted-dirt`.
   - Apply 0.5x speed on `rough-dirt` for creatures.

5. **`index.html`, `src/renderer.js`, `src/app.js`**:
   - Add new structures to `<select id="build-type">`.
   - Render distinct textures for compacted dirt, rough dirt, trench, and smooth floor.
   - Add tile inspection summaries in `roomSummary`.

6. **`tests/simulation.test.cjs`**:
   - Add unit tests verifying each structure cost, behavior, multi-resource delivery, speed modifiers, trench crossing, and mite blocking.
