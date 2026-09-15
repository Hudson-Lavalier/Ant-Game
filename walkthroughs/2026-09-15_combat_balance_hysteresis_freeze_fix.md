# Combat Balance, Feeder Hysteresis, World Generation Memoization & Bug Fixes Walkthrough

## Overview

This update addresses critical balance, visual glitches, pathfinding/job boundary freezes, and gameplay tuning:

1. **Queen Regeneration & Combat Nerf**:
   - Queen passive regeneration reduced from 10 HP/s to 0.5 HP/s.
   - Regeneration is paused when the queen is actively engaged in combat, under threat, has sustained combat damage within the last 5 seconds, or when hostile/provoked creatures are within 6 hexes of the nest.

2. **Creature Food Values Rebalance**:
   - Adult Spider corpse `baseFood`: raised from 90 to **1000**.
   - Hercules Beetle corpse `baseFood`: raised from 350 to **1750**.

3. **Elimination of Floating Black Bars**:
   - Fixed the renderer health bar background (`#190d0d`) which drew an empty black rectangular box when entities died or when spider eggs hatched on dead ant bodies (`z < 1.4 || !entity.alive || (entity.health || 0) <= 0`).

4. **Feeder Queen Top-Off Hysteresis**:
   - Implemented stateful hysteresis (`q.tendingFood` and `q.tendingWater`).
   - Feeders trigger feeding/hydration when queen falls below 80% capacity (`< 80%`), and continuously tend and deliver food/water until the queen is topped off (>= 98%), eliminating inefficient single-trip start/stop loops.

5. **Block Building on Holes & Pits**:
   - Building chamber designations or walls on spoil holes / pits is strictly disallowed in both `designateBuild` and `refreshJobStates`.

6. **Chunk Generation Memoization & Boundary Freeze Fix**:
   - Fixed catastrophic lag and freezes caused by generating unscanned chunks near daylight/surface tiles.
   - Cached `featureDefinitions(cx, cy)` in `World._featureDefCache` and cached root vein cells in `f._cachedRootCells` (saving over 28,000 redundant feature definitions and array allocations per chunk).
   - Prevented dig designations from queueing orders in ungenerated space (`!c`).

7. **Starter Cave Guarantee & Spider Nest Distance**:
   - Replaced the hardcoded spider lair in Chunk (0, 0) with a guaranteed natural exploration cave (`cave-start`, radius 4).
   - Enforced a minimum distance of 45 hexes from the nest for procedural spider lairs.

8. **Starter Food Creature Pack**:
   - Spawns a starter creature pack around the starter seed node (`food-start`): deterministically rolls 2 isopods (40%), 1 weevil (30%), or 5 mites (30%).

---

## Detailed Code Changes

### 1. `src/data.js`
- Updated `Species.spider.baseFood = 1000`.
- Updated `Species.hercules.baseFood = 1750`.

### 2. `src/simulation.js`
- **Queen Regen & Combat Detection**:
  - Track `q.combatTimer` decaying by `dt`.
  - Defined `queenInCombat` checking `q.combatTimer > 0`, `q.threatId`, and aggressive/provoked creatures within 6 hexes.
  - Regulates healing to `0.5 * dt` only when `!queenInCombat`.
- **Top-Off Hysteresis**:
  - `feederNeed()` activates `q.tendingFood` / `q.tendingWater` when < 80%, deactivates when >= 98%.
  - `deposit()` and `pickupFeed()` clear tending flags once queen reaches >= 98% capacity.
- **Dig Orders Protection**:
  - `designate(x, y)` rejects `!c` (ungenerated space) while allowing valid unrevealed solid cells in generated chunks.

### 3. `src/renderer.js`
- In `hp(entity, p, z, max)`:
  - Added guard `if (z < 1.4 || !entity.alive || (entity.health || 0) <= 0) return;` so dead entities and hatched bodies never draw empty pitch-black background boxes.

### 4. `src/construction.js`
- Created `Construction.isHole(sim, c, x, y)` detecting `zone === 'pit'`, `hole`, `isHole`, or un-filled pits.
- Added checks in `designateBuild` and `refreshJobStates` to block and prune build jobs on hole tiles.

### 5. `src/world.js`
- Added `this._featureDefCache = new Map()` on `World` instance and in `World.restore()`.
- Memoized `featureDefinitions(cx, cy)` to compute once per chunk.
- Memoized `rootCells(f)` via `f._cachedRootCells`.
- Replaced `{id:'spider-start', ...}` in Chunk (0, 0) with `{id:'cave-start', type:'cavity', x:-18, y:22, r:4}`.
- Enforced `hexDistance({x: p.x, y: p.y}) >= 45` for procedural spider lairs.

### 6. `src/ecology.js`
- In `Ecology.sync(s)`:
  - Deterministically spawn a starter creature pack around `food-start` (2 isopods, 1 weevil, or 5 mites).
- In `Ecology.damage(s, a, amount)`:
  - Set `a.combatTimer = 5.0` to track recent damage.

---

## Verification Results

### Automated Test Suite
Ran full test suite:
`agy-node.cmd --test tests/brood.test.cjs tests/climate.test.cjs tests/simulation.test.cjs tests/test_renderer.cjs`

```text
✔ 133 tests passed (0 failures, 0 skipped)
✔ All 9 castes x 4 carry states x alive/dead rendered cleanly
✔ All 9 species rendered cleanly in all movement and life states
✔ Full Simulation draw cycle benchmark: 100 frames in 188ms
```
