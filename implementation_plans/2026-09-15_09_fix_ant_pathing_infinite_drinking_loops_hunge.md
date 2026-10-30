# Fix Ant Pathing, Infinite Drinking Loops & Hunger/Thirst Caste Scaling

Address 4 core simulation and navigation issues reported by the user:
1. **Ant Transport Clipping**: Ants carrying water get stuck or clip infinitely when returning to the colony.
2. **Infinite Low-Source Drinking**: Ants get trapped in rapid, continuous drinking/eating loops when water/food sources are nearly depleted.
3. **Excessive Hunger & Thirst Drain**: Ants lose hunger and thirst too fast, constantly interrupting tasks.
4. **Caste Hunger & Thirst Scaling**: Larger castes (Soldier, Major, Supermajor) currently have the same 50-point capacity as tiny workers, causing high-drain castes to starve in minutes.

---

## User Review Required

> [!IMPORTANT]
> **Proposed Capacity & Drain Balancing**:
> - **Base Drain Rates**: Increased baseline survival time from 8 min (water) / 12 min (food) to **18 minutes (water)** and **25 minutes (food)** for a standard 50-point supply.
> - **Caste Stomach Capacities**:
>   - **Minor** (50 HP): `25 Food / 25 Water` (0.8x drain)
>   - **Worker** (100 HP): `50 Food / 50 Water` (1.0x drain)
>   - **Media** (200 HP): `100 Food / 100 Water` (1.2x drain)
>   - **Soldier** (250 HP): Raised from 50 to **125 Food / 125 Water** (1.2x drain)
>   - **Major** (300 HP, 3 clearance): Raised from 50 to **200 Food / 200 Water** (2.0x drain)
>   - **Supermajor** (500 HP, 3 clearance): Raised from 50 to **300 Food / 300 Water** (3.0x drain)
> With this scaling, a Major or Supermajor's larger stomach properly counterbalances its higher metabolism (`drainMult`), allowing it to work continuously for ~18–25 minutes rather than starving every 2.5 minutes.

---

## Proposed Changes

### 1. Fix Ant Water Transport Pathing & Infinite Wall-Clipping

#### [MODIFY] [simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js)
- **Root Cause in `storage(a)`**: When an ant carries water (`a.carry.type === 'water'`), `storage(a)` returned `{ point: this.world.founding.waterStore || this.nest, kind: 'queen' }`. But `this.world.founding.waterStore` is a non-walkable, flooded water reservoir block (`waterStorage: true, water: 7`). Pathfinding to it returned `null`, setting `a.state = 'blocked'`. Every second, the ant unblocked, tried to path to the impassable reservoir cell again, and bounced/clipped against the wall indefinitely.
- **Fix**:
  - In `storage(a)`: If `this.waterTarget === 'reservoir'`, use `this.reservoirDestination(a)` (which targets an open adjacent face). If delivering to the queen/colony (`kind: 'queen'`), always route to `this.nest` (an open, walkable floor tile where the Queen lives).
  - In `travel(a, dt)`: Add impassable-tile guard on target point `p` (check `!targetCell || targetCell.solid || targetCell.water >= 6 || targetCell.waterStorage || targetCell.isWell`) to prevent ants from stepping into impassable blocks.
  - In `travel(a, dt)`: Reduce maximum lookahead skip in `canTravelDirect` from 7 hexes to 3 hexes to prevent path smoothing from grazing diagonal wall corners.

---

### 2. Fix Infinite Drinking / Eating Loop on Low Sources

#### [MODIFY] [simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js)
- **Root Cause**:
  - `antNeedSource(a, 'water')` accepted tiles with `cell.water > 0.01`. When a puddle had near-zero water (e.g. 0.03), the ant pathfinder targeted the water tile, consumed ~0.4 water points, and ended `consumeAntNeed`. Because its thirst was still unquenched, `this.assign(a)` retriggered `assignAntNeed` on the very next frame, repeatedly targeting the same depleted puddle in an infinite loop.
  - Furthermore, `antNeedSource` allowed the ant to stand directly on a water puddle rather than on a dry bank.
- **Fix**:
  - In `antNeedSource(a, 'water')`: Enforce a minimum extractable threshold (`cell.water >= 0.35` or extractable volume $\ge 5$).
  - For non-reservoir terrain water, route the ant to a dry adjacent neighbor (`this.world.faces(cell)`), preventing ants from standing inside flooded water cells.
  - In `antNeedSource(a, 'food')`: Enforce a minimum threshold (`remaining >= 1` or `food >= 1`).
  - In `consumeAntNeed(a)`: When an ant finishes drinking or eating (especially from an exhausted source), apply a brief need cooldown timer (`a.timer = 1.5`) so it cannot re-trigger a need assignment on the immediate next frame, allowing it to seek a better source or resume colony labor.

---

### 3. Balance Hunger & Thirst Drain Rates

#### [MODIFY] [config.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/config.js)
- Extend baseline survival durations:
  - `antFoodDrainPerSecond`: Change from `50 / (12 * 60)` to `50 / (25 * 60)` (food lasts 25 min for baseline 50 cap).
  - `antWaterDrainPerSecond`: Change from `50 / (8 * 60)` to `50 / (18 * 60)` (water lasts 18 min for baseline 50 cap).

---

### 4. Scale Hunger & Thirst Capacities by Caste

#### [MODIFY] [simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js)
- Update `addAnt(type, ...)`:
  - `soldier`: `maxFoodNeed = 125, maxWaterNeed = 125, drainMult = 1.2`
  - `major`: `maxFoodNeed = 200, maxWaterNeed = 200, drainMult = 2.0`
  - `supermajor`: `maxFoodNeed = 300, maxWaterNeed = 300, drainMult = 3.0`

#### [MODIFY] [simulation.test.cjs](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/tests/simulation.test.cjs)
- Update caste stat assertions in `simulation.test.cjs` to reflect the scaled capacities.

---

## Verification Plan

### Automated Tests
Run all 4 test suites with `agy-node.cmd`:
```powershell
& "C:\Users\hudso\AppData\Roaming\Antigravity\bin\agy-node.cmd" --test tests/brood.test.cjs tests/climate.test.cjs tests/simulation.test.cjs tests/test_renderer.cjs
```
- Verify caste need capacities in `tests/simulation.test.cjs`.
- Verify water hauling to nest / queen completes and resets worker to idle without blocking.
- Verify that a depleted water tile (`water < 0.35`) is ignored by thirsty ants and does not cause an infinite loop.
- Verify 100% test pass rate across all suites.
