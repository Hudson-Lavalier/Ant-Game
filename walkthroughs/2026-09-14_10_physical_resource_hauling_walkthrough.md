# Physical Resource Hauling — Walkthrough

## Summary

Implemented a physical resource hauling system requiring ants to physically carry materials from storage to build sites and larvae, replacing the previous instant-access model.

## Changes Made

### Core Mechanic: Multi-Trip Construction Hauling
#### [MODIFY] [construction.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/construction.js)

- **`routeToBuildSupply`**: Routes workers to the nearest reachable food-store tile (for food) or spoil pit (for dirt). Tracks `job.deliveredFood` and `job.deliveredDirt`. Only transitions to `'building'` when all materials are delivered.
- **`stepBuilding`**: Handles `to-build-supply` (pickup at source, bounded by `a.maxCarry`) and `delivering-build-material` (carry to build site, increment delivered counters). Worker loops: food→deliver→dirt→deliver→build.
- **`cancel`**: Refunds `job.deliveredFood`, `job.deliveredDirt`, and any in-transit `a.carry` with matching `buildId`.

### Core Mechanic: Physical Larval Feeding
#### [MODIFY] [tasks.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/tasks.js)

- `feedLarvae` candidate selection now validates a reachable food source tile AND path from food source to larva.
- Execution routes worker to food source tile first (`to-feed-larva-supply` state).

#### [MODIFY] [simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js)

- **`to-feed-larva-supply` handler**: Worker arrives at food-store tile, picks up `Math.min(tileFood, sim.food, maxCarry, needed, feedBatchAmount)`, deducts from `cell.food` and `sim.food`, then routes to larva.
- **`feeding-larva` handler**: Checks distance to larva before delivering (waits for path completion).
- Updated `isBusy` list to include new states.
- Updated `antNeedSource` to use `getFoodSourceTile` for hunger routing.

### Food Tile Tracking
#### [MODIFY] [inventory.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/inventory.js)

- **`syncFoodTiles(sim)`**: Distributes `sim.food` across food-store tiles proportionally.
- **`getFoodTiles(sim)`**: Returns all discovered, non-solid food-store zone cells.
- **`getFoodSourceTile(sim, a)`**: Returns the closest reachable food-store tile with food > 0.001.

### Test Fixes
#### [MODIFY] [brood.test.cjs](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/tests/brood.test.cjs)

- **Brood Helper test**: Changed assertion from `'feeding-larva'` to `'to-feed-larva-supply'` and added simulation loop (300 ticks) to verify food delivery completes.
- **Feeder fallback test**: Changed assertion from `'feeding-larva'` to `'to-feed-larva-supply'`.

#### [MODIFY] [simulation.test.cjs](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/tests/simulation.test.cjs)

- **Build cancellation test**: Increased loop from 120 to 400 ticks, added `syncStores()` call, and updated refund assertions to dynamically check `job.deliveredFood`/`job.deliveredDirt`.

### Evolution Points Fix (prior session)
#### [MODIFY] [simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js)

- Added passive EP accumulation in `update(dt)` using `C.passiveEvolutionRate * dt`.

## What Was Tested

- Full test suite: **115/115 pass**
- Renderer benchmark: **1.87 ms/frame** (no regression)

## State Machine Reference

### Building Flow
```
assign → to-build-supply (fetch food) → delivering-build-material → to-build-supply (fetch dirt) → delivering-build-material → building → complete
```

### Larval Feeding Flow
```
assign → to-feed-larva-supply (go to food store) → feeding-larva (carry food to larva) → idle
```
