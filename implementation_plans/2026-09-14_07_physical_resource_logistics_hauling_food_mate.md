# Physical Resource Logistics: Hauling Food & Materials for Construction and Brood

Ensure food and building materials cannot be accessed remotely or magically. For chamber construction and feeding larvae, ants must physically travel to the storage source, pick up resources up to their individual carry capacity (`maxCarry`), and haul them one by one to and from the destination.

---

## User Review Required

> [!IMPORTANT]
> **Key Gameplay Flow Changes:**
> 1. **Larva Feeding**: Workers and Brood Helpers will no longer deduct food remotely. They will walk to a food storage tile (`food-store` zone / nest food store), pick up food bounded by `ant.maxCarry` (default 5 for workers, up to 15–25 for majors/supermajors), carry it physically to the larva, and feed it.
> 2. **Chamber Construction Logistics**: Construction sites will now require material delivery. Workers will fetch food from food storage and dirt from the spoil pit in discrete hauls matching their carry size, deliver them to the build site, and only begin physical construction once all required materials have arrived.
> 3. **Material Conservation & Cancellation**: Any materials staged at a construction site or currently in transit by workers are refunded if the build is cancelled.

---

## Proposed Changes

### Construction Subsystem (`src/construction.js`)

#### [MODIFY] [construction.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/construction.js)
- Extend build job structure to track staged resources:
  - `deliveredFood`: food units already delivered to the site (starts at 0).
  - `deliveredDirt`: dirt units already delivered to the site (starts at 0).
- Update `refreshJobStates`:
  - A build job is ready for material delivery if excavated and colony has food or dirt available.
  - A build job is ready for construction work once `deliveredFood >= requiredFood` and `deliveredDirt >= requiredDirt`.
- Replace instant supply grabbing with two-stage material hauling:
  - If a job needs food: Worker routes to food storage (`to-build-food`), picks up `Math.min(sim.food, a.maxCarry, requiredFood - deliveredFood)`, deducts from `sim.food`, and carries it to the build site (`delivering-build-food`).
  - If a job needs dirt: Worker routes to spoil pit (`to-build-dirt`), picks up `Math.min(sim.world.pit.used, a.maxCarry, requiredDirt - deliveredDirt)`, deducts from `pit.used`, and carries it to the build site (`delivering-build-dirt`).
  - Once all materials are delivered on-site, worker enters `building` state to execute the construction over `C.buildSeconds`.
- Update `cancel`:
  - Refund any `deliveredFood` and `deliveredDirt` from the cancelled job.
  - Refund any in-transit `construction-food` or `construction-dirt` carried by ants assigned to that job.

---

### Brood Subsystem & Task Dispatch (`src/tasks.js` & `src/simulation.js`)

#### [MODIFY] [tasks.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/tasks.js)
- Update `feedLarvae` task assignment:
  - Do **not** deduct `sim.food` remotely or set `a.carry` at the worker's current location.
  - Check if food storage is reachable (`sim.getFoodSupplyPoint(a)`).
  - Route the ant to food storage first: state `to-feed-larva-supply`.
  - Store target larva ID in `a.task = { type: 'feed-larva', larvaId: larva.id, stage: 'pickup' }`.

#### [MODIFY] [simulation.js](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js)
- Add helper `getFoodSupplyPoint(a)`:
  - Finds the closest reachable, revealed `food-store` zone tile, falling back to `this.world.founding.foodStore` or `this.nest`.
- In `updateWorker(a, dt)`:
  - Handle `to-feed-larva-supply`: When ant arrives at food storage, compute batch:
    `const batch = Math.min(this.food, a.maxCarry || C.carryCapacity, Math.max(0, 30 - larva.foodAccumulated), this.currentFeedBatchAmount());`
    Deduct `this.spendFood(batch)`.
    Set `a.carry = { type: 'brood-feed', amount: batch, multiplier: this.currentFeedMultiplier() }`.
    Route ant to larva: state `feeding-larva`.
  - Handle `feeding-larva`: When ant arrives at larva, transfer carried food to `larva.foodAccumulated`, clear carry, emit sound/event, and reset ant to idle.
  - Handle construction delivery states (`to-build-food`, `delivering-build-food`, `to-build-dirt`, `delivering-build-dirt`).

---

### Automated Tests (`tests/brood.test.cjs` & `tests/simulation.test.cjs`)

#### [MODIFY] [brood.test.cjs](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/tests/brood.test.cjs)
- Update tests 1006 and 1007 to verify the realistic two-phase pathing (worker routes to food storage first, picks up food load, then travels to larva and delivers).

#### [MODIFY] [simulation.test.cjs](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/tests/simulation.test.cjs)
- Add tests verifying:
  - Worker routes to food storage to pick up food bounded by `maxCarry` before delivering to building.
  - Building requires separate physical hauls for food and dirt according to ant carry capacity.
  - Cancelling a build in progress refunds all on-site and in-transit food and dirt.

---

## Verification Plan

### Automated Tests
Run the test suite with Node/Electron:
```powershell
$env:ELECTRON_RUN_AS_NODE="1"; & "c:\Users\hudso\AppData\Local\Programs\Microsoft VS Code\Code.exe" --test tests/brood.test.cjs tests/climate.test.cjs tests/simulation.test.cjs | Out-String
```
- Verify all tests pass with 0 failures.
- Verify soil and material conservation tests pass.

### Renderer Benchmark
```powershell
$env:ELECTRON_RUN_AS_NODE="1"; & "c:\Users\hudso\AppData\Local\Programs\Microsoft VS Code\Code.exe" tests/test_renderer.cjs | Out-String
```
- Verify headless renderer benchmark maintains < 2.0 ms/frame with carrying sprites.
