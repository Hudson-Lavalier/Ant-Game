# Implementation Plan - Bug Fixes, Combat Balance, Starter Ecology & Queen Care

Audit and address 10 reported gameplay issues, balance changes, visual anomalies, and freeze risks across simulation, world generation, renderer, and task systems.

## Proposed Changes

### 1. Queen Regeneration Rebalance
- **Problem**: Queen heals at 10 HP/s (`simulation.js:1002`), which nearly negates high-damage spider attacks.
- **Fix**:
  - In `src/simulation.js:updateQueen`:
    - Reduce regeneration from `10 * dt` to `0.5 * dt` (1 HP every 2 seconds, full heal from near-death takes ~200 seconds).
    - Require `q.threatId === null` and no combat damage taken recently before regeneration activates.

### 2. Creature Corpse Food Rebalance
- **Problem**: Spider and Hercules Beetle corpse food rewards are disproportionately low for their combat difficulty.
- **Fix**:
  - In `src/data.js`:
    - `spider.baseFood`: Increase from 90 to **1000**.
    - `hercules.baseFood`: Increase from 350 to **1750**.

### 3. Removal of Floating Black Bars Over Dead Entities
- **Problem**: In `src/renderer.js:hp(entity, p, z, max)`, when an entity has `health <= 0` or is dead (`!entity.alive`), the background `#190d0d` is drawn with width `w` and height `2.6*z`, but the red health bar fill has width 0. This renders a pitch-black box hovering permanently over dead ants (including ants that died while webbed and had spider eggs hatch on them).
- **Fix**:
  - In `src/renderer.js:hp`:
    - Early-return immediately if `!entity.alive || (entity.health || 0) <= 0 || entity.health >= max`.

### 4. Feeder Queen Top-Off Hysteresis
- **Problem**: Feeders trigger feeding when Queen drops below 80% (`159/200`), deliver 1 carry load (5 rations) bringing her to `164/200` (82%), and immediately stop because she is no longer `< 80%`. Seconds later she drops back to 79.9%, triggering another single delivery trip.
- **Fix**:
  - In `src/tasks.js` and `src/simulation.js`:
    - Implement stateful hysteresis (`q.tendingFood` and `q.tendingWater`):
      - `tendingFood` starts when `q.food < q.maxFood * 0.80`.
      - `tendingFood` remains `true` until `q.food >= q.maxFood * 0.98` (topped off!).
      - `tendingWater` starts when `q.water < q.maxWater * 0.80`.
      - `tendingWater` remains `true` until `q.water >= q.maxWater * 0.98` (topped off!).
    - Update `tasks.js` candidate evaluation and `simulation.js` (`feederNeed`, `feederSource`, `storage`, `pickupFeed`) to use this hysteresis flag.

### 5. Prevent Building On Top of Holes
- **Problem**: Players can place build designations (chambers, hatchery walls, etc.) directly on top of spoil pits / black holes.
- **Fix**:
  - In `src/construction.js:designateBuild`:
    - Check `if (c.zone === 'pit' || c.hole || c.isHole || sim.world.pits.some(p => p.x === x && p.y === y && !p.filled)) return false;`
  - In `src/construction.js:refreshJobStates`:
    - Cancel any build jobs placed on hole tiles.

### 6. Chunk Generation Memoization & Disallow Digging Undiscovered Tiles (Freeze Fix)
- **Problem**:
  1. `designate(x, y)` allowed creating dig jobs on undiscovered / ungenerated tiles outside the chunk (`if (c && c.discovered)` didn't return false when `!c || !c.discovered`).
  2. When an ant moved near the edge of chunk (0, 0) by the daylight shaft, `ensureChunk` ran on an adjacent chunk (e.g. `(0, -1)`).
  3. In `world.js:featureAt`, `featureDefinitions` was invoked 9 times per tile $\times$ 3,367 tiles ($= 30,303$ times), instantiating millions of temporary arrays and `rootCells` objects on the main thread, causing severe freeze/hang.
- **Fix**:
  - In `src/simulation.js:designate`:
    - Enforce `if (!c || !c.discovered) return false;` so digging can only target revealed tiles.
  - In `src/world.js`:
    - Add `this._featureDefCache = new Map()` to memoize `featureDefinitions(cx, cy)`.
    - Cache `f._rootCells` on feature objects instead of generating arrays on every hex lookup.

### 7. Early Game Starter Food Creature Pack
- **Problem**: Early game food is too scarce when only starting with 1 seed node.
- **Fix**:
  - In `src/ecology.js:sync`:
    - When synchronizing `food-start` (`f.id === 'food-start'`), deterministically spawn one of three early foraging packs around `(f.x, f.y)`:
      - Option A (40% chance): 2 Isopods
      - Option B (30% chance): 1 Bull Weevil
      - Option C (30% chance): 5 Mites

### 8. Guaranteed Starter Cave & Removal of Starter Spider Lair
- **Problem**: Chunk (0, 0) had a hardcoded adult spider lair at `(-18, 22)` that spawned next to the player in every single seed.
- **Fix**:
  - In `src/world.js:featureDefinitions(0, 0)`:
    - Replace `{id:'spider-start', type:'spider-cavity', x:-18, y:22, r:4, species:'spider'}` with `{id:'cave-start', type:'cavity', x:-18, y:22, r:4}`.
    - This satisfies the guaranteed close-by natural cave at spawn without spawning a deadly spider right beside the player.
  - In `src/world.js:featureDefinitions(cx, cy)`:
    - Add distance check `hexDistance({x: p.x, y: p.y}, {x: 0, y: 0}) >= 45` to outer chunk spider cavities, preventing spider lairs from generating on the starting doorstep.

---

## Verification Plan

### Automated Tests
- Run complete test suite:
  `& "C:\Users\hudso\AppData\Roaming\Antigravity\bin\agy-node.cmd" --test tests/brood.test.cjs tests/climate.test.cjs tests/simulation.test.cjs tests/test_renderer.cjs`
- Add tests in `tests/simulation.test.cjs`:
  1. Queen regen is bounded at 0.5 HP/s and disabled during combat.
  2. Spider corpse baseFood is 1000 and Hercules beetle is 1750.
  3. Renderer `hp()` does not draw bars for dead entities.
  4. Feeder queen care top-off hysteresis keeps feeding/watering active until $\ge 98\%$ once triggered.
  5. Cannot designate builds on top of spoil pit / black hole tiles.
  6. Cannot designate dig orders on undiscovered hexes.
  7. Starter seed node spawns starter prey creatures (isopods, weevil, or mites).
  8. Chunk (0, 0) spawns starter natural cave without hardcoded spider lair.
