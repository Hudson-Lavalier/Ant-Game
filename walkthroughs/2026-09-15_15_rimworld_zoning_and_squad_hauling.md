# Walkthrough: RimWorld-Style Zoning & Squad Hauling (Milestone 1, Item 2)

This document provides a comprehensive overview of the **RimWorld-Style Zoning & Squad Hauling** implementation. It details architectural decisions, the strict separation between architectural Area Planning and Behavioral Zoning, independent overlays, and verification test results.

---

## 1. Key Accomplishments & Features

### A. Strict Separation of Areas vs. Zones (Menus, Overlays & Functions)
- **Distinct Purposes**:
  - **Areas**: Pure architectural layouts, default room connections, and walkways (`sim.areas`, `cell.area`). Planning and adding areas has zero effect on ant gameplay or logistics.
  - **Zones**: Behavioral territories (`sim.zones`, `cell.behaviorZone`) dictating squad bounds, foraging/hunting grounds, and spoil-locked stockpiles.
- **Dedicated Independent Menus**:
  - `Areas` button opens `#areas-panel` with title **AREA PLANNING**. Dragging on the canvas paints only architectural areas.
  - `Zones` button opens `#zones-panel` with title **BEHAVIORAL ZONING & SQUADS**. Dragging on the canvas paints only behavioral zones.
  - Opening one immediately closes the other.
  - Removed all emojis across all UI elements, options, and text.
- **Mutually Exclusive Overlays**:
  - In **Areas** mode (`overlayMode: 'areas'`), the renderer highlights only architectural areas and default room walkways (`cell.area` and `cell.zone`). Behavioral zones and squad borders are completely hidden.
  - In **Zones** mode (`overlayMode: 'zones'`), the renderer highlights only behavioral zones (`cell.behaviorZone`) and squad borders. Architectural areas and room labels are completely hidden.
  - You never see both overlays at the same time, eliminating visual clutter.
  - Hex tiles can still possess both an area and a zone simultaneously without interference.

### B. Stockpile Zone Spoil-Locking
- **Strict Tile Constraint**: Stockpile zones can only be designated on excavated spoil tiles (`cell.zone === 'spoil' && !cell.solid`).
- Designation attempts on living rock, unexcavated soil, water, or open nest corridors reject invalid placement with explicit error feedback (`"Stockpiles can only be designated on spoil tiles"`).

### C. Multi-Tier Stockpile Prioritization & Routing
- **Priorities (1–4)**: Stockpile zones support priority levels (`1: Low`, `2: Normal`, `3: Preferred`, `4: Critical`).
- **Filter Categories**: Stockpile zones can selectively accept `corpses`, `seeds`, and `soil`.
- **Intelligent Haul Destination**: When carrying resources, workers check candidate stockpiles, prioritizing higher priority levels (Critical > Preferred > Normal > Low) before falling back to founding food chambers or soil dump pits.

### D. Multi-Layered Priority Hierarchy & Dynamic Overrides
The task engine resolves ant task priorities through an explicit 4-tier hierarchy:
$$\text{Squad Priority Overrides (Level 1)} \;\succ\; \text{Squad Role Priorities (Level 2)} \;\succ\; \text{Zone Priority Overrides (Level 3)} \;\succ\; \text{Caste Baseline (Level 4)}$$
1. **Level 1 (Explicit Squad Overrides)**: Direct player tuning on a squad (`sim.setSquadPriorityOverride(squadId, taskType, priority)`). Supersedes all underlying roles, zones, and caste baselines.
2. **Level 2 (Squad Role Priorities)**: Specialization roles (`hauler`, `hunter`, `forager`, `guard`, `digger`) provide standard role-based task priorities.
3. **Level 3 (Zone Priority Overrides)**: Overrides inherited from a squad's assigned zone OR from the hex tile an unassigned ant is currently standing in (e.g., a designated quarry giving dig priority 1).
4. **Level 4 (Caste Baseline)**: Base caste priority configured via Colony Operations.

### E. Squad Territory Bounds & Strict Enforcement
- **Biased (Strict = false)**: Squad members prefer tasks, harvests, and carry targets within their assigned zone, but will take other colony jobs if the zone is clear.
- **Strict (Strict = true)**: Squad members strictly reject any carry, harvest, or combat task outside their assigned zone's perimeter.

### F. Cooperative Multi-Ant Squad Hauling
- Defined caste haul capacities: Supermajors (300), Majors (150), Workers (50), Feeders (30).
- Heavy prey (such as large spiders or beetles) can now be transported cooperatively by squads designated with the `hauler` role or explicit teams, pooling their carry capacities together.

### G. Excavation Zone & Unbreakable Block Loop Prevention
- **Automated Mining Bounds**: Players can paint an **Excavation Zone** (`excavation` zone type) over solid dirt tiles.
- **Auto-Designation**: Painting over solid dirt automatically creates dig jobs (`1:dig:x,y`) and sets default zone priority overrides `{ dig: 1, haulSoil: 2 }`.
- **Periodic Zone Sync**: `syncExcavationZones()` periodically sweeps excavation zones and automatically designates newly exposed reachable solid dirt tiles.
- **Strict Unbreakable Safeguards & No-Loop Guarantee**:
  - `AntGame.ZoneTileConstraints.excavation` and `sim.designate` strictly reject unbreakable blocks (stone/rock, wells, holes, and pits).
  - `findAvailableJobs` filters out dig jobs on unbreakable blocks.
  - If a worker in `state === 'digging'` encounters an unbreakable or invalid block, it immediately purges the job from `this.jobs`, clears `a.task = null`, and resets `a.state = 'idle'` to guarantee workers never get stuck in an execution or pathing loop.
- **Zone Cleanup**: Erasing an excavation zone (`eraseZone`) automatically cleans up all associated pending excavation dig jobs.

### H. Brush Size for Painting Areas and Zones
- **Configurable Brush Size (1 hex, 7 hexes, 19 hexes)**: Painting in both **Areas** mode and **Zones** mode is now fully linked to the active toolbar brush size selector (`data-radius="0"`, `"1"`, `"2"`).
- **Smooth Drag Interpolation**: Moving the pointer across the canvas performs Bresenham/hex line interpolation between pointer samples, preventing gaps or skips during fast drags.
- **Visual Hover Cursor**: The hex disk brush outline renders directly when in Areas or Zones overlay modes, giving clear feedback on the area of effect prior to clicking.

### I. Group Tool Drag Box Selection
- **Area-Based Box Selection**: When dragging with the Group tool (`mode === 'group'`), the selection box captures every living colony ant within the dragged area.
- **Robust Intersection**: Evaluates both ant screen positions (including caste sprite radius) and the hex tile positions covered by the drag box, ensuring ants along borders or in mid-transit are cleanly captured.
- **Single-Click & Additive Selection**: Clicking without dragging (`b.w < 6 && b.h < 6`) selects the ant directly under the cursor, and holding Shift allows adding ants to the active selection.

---

## 2. File Changes & Architecture

| Module | Purpose & Modifications |
|---|---|
| [`src/renderer.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/renderer.js) | Implemented `overlayMode` (`'none'`, `'areas'`, `'zones'`). Separated `zoneColor(cell)` (areas & default room tiles) from `behaviorZoneColor(cell)` (behavioral zones). Enabled excavation overlays over solid dirt cells with gold border `#e6c229`. Overlays are strictly mutually exclusive. |
| [`src/completion-ui.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/completion-ui.js) | Created two completely separate panels (`#areas-panel` and `#zones-panel`), wired distinct `Areas` and `Zones` toolbar buttons, added Excavation Zone option, removed all emojis, and linked painting to active brush size with hex interpolation. |
| [`hex-ui.css`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/hex-ui.css) | Added shared clean styling for `#areas-panel` and `#zones-panel` with scrolling support. |
| [`src/data.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/data.js) | Added `AntGame.ZoneTypes.excavation`, `AntGame.ZoneTileConstraints.excavation`, and `AntGame.SquadRoles.digger`. |
| [`src/simulation.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/simulation.js) | Added excavation zone creation, auto-designation, job cleanup on erase, `syncExcavationZones()`, unbreakable block safeguards, and brush radius support in `paintArea` and `paintZone`. |
| [`src/app.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/app.js) | Enhanced group tool drag box selection to capture all living colony ants in the dragged area with click fallback and Shift support; enabled hover brush outline in overlay modes. |
| [`src/tasks.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/tasks.js) | Updated `TaskEngine.getEffectivePriority` hierarchy, zone override evaluation, and strict bounds candidate filtering for `cand.jobs` and `cand.drops`. |
| [`tests/zoning_squads.test.cjs`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/tests/zoning_squads.test.cjs) | 13 comprehensive tests covering zoning, squad bounds, spoil-locking, cooperative hauling, priority hierarchy tiers, overlay mutual exclusivity, excavation zone safeguards, brush radius painting, and group box-selection. |

---

## 3. Verification & Automated Test Results

### Dedicated Test Suite: `tests/zoning_squads.test.cjs` (13 / 13 Passing)
1. `Area planning and Behavioral Zoning remain strictly separated and coexist`: Verified dual assignment on same hex, independent erasure, and area data preservation.
2. `Stockpile zones are strictly locked to excavated spoil tiles`: Confirmed solid dirt, rock, and open corridors reject stockpile painting, while excavated spoil tiles succeed.
3. `Stockpile prioritization routes items to higher priority and category-matching spoil stockpiles`: Verified workers deposit into Critical priority spoil stockpiles over Low priority ones.
4. `Squad roles and zone priority overrides cleanly supersede caste priorities`: Tested role override pipeline (`hauler` role overrides caste digging priority).
5. `Strict vs biased squad zone bounds enforce labor boundaries`: Verified strict squads reject out-of-zone candidates while biased squads take them when no in-zone candidates exist.
6. `Cooperative multi-ant hauling allows teams to transport heavy prey`: Verified multi-worker team pooling carry capacities to transport large targets.
7. `Serialization preserves behavioral zones, tile bindings, and squad configurations`: Verified round-trip JSON serialization and restoration of zones, squads, and tile associations.
8. `Task prioritization hierarchy strictly follows: Squad Overrides > Squad Roles > Zone Overrides > Caste Baseline`: Step-by-step collision and fallback verification across all 4 levels, plus hex zone override for unassigned ants.
9. `Live task candidate sorting strictly follows the effective priority hierarchy`: Tested dynamic job selection between competing tasks (dig vs harvest) as zone overrides, squad roles, and explicit squad overrides are applied.
10. `Renderer overlay modes for Areas and Zones are mutually exclusive on overlapping tiles`: Verified that overlapping tiles render only area colors in area mode and only zone colors in zone mode, never both simultaneously.
11. `Excavation Zone automatically designates dirt, rejects rock/holes/wells, and safeguards against infinite mining loops`: Verified auto-designation of dirt, rejection of rock/wells/holes, unbreakable job filtering, digging abort and job purging, periodic sync, and clean job removal on zone erase.
12. `Areas and zones paint with brush radius (1 hex, 7 hexes, 19 hexes)`: Verified 1-hex, 7-hex, and 19-hex disks for both areas and behavioral zones (including excavation solid dirt auto-designation).
13. `Group tool drag box selects all living colony ants in the dragged area`: Verified that dragging over an area selects all colony ants within the box while excluding distant ants and enemy units.

### Full Test Suite Run
```
✔ Area planning and Behavioral Zoning remain strictly separated and coexist (19.81ms)
✔ Stockpile zones are strictly locked to excavated spoil tiles (9.35ms)
✔ Stockpile prioritization routes items to higher priority and category-matching spoil stockpiles (8.09ms)
✔ Squad roles and zone priority overrides cleanly supersede caste priorities (5.27ms)
✔ Strict vs biased squad zone bounds enforce labor boundaries (10.31ms)
✔ Cooperative multi-ant hauling allows teams to transport heavy prey (4.79ms)
✔ Serialization preserves behavioral zones, tile bindings, and squad configurations (8.72ms)
✔ Task prioritization hierarchy strictly follows: Squad Overrides > Squad Roles > Zone Overrides > Caste Baseline (11.44ms)
✔ Live task candidate sorting strictly follows the effective priority hierarchy (9.04ms)
✔ Renderer overlay modes for Areas and Zones are mutually exclusive on overlapping tiles (6.04ms)
✔ Excavation Zone automatically designates dirt, rejects rock/holes/wells, and safeguards against infinite mining loops (8.85ms)
✔ Areas and zones paint with brush radius (1 hex, 7 hexes, 19 hexes) (6.77ms)
✔ Group tool drag box selects all living colony ants in the dragged area (5.79ms)

ℹ tests 151
ℹ suites 0
ℹ pass 151
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 1601.8136
```

All 151 unit tests and the renderer benchmark (`test_renderer.cjs`: 1.86 ms/frame) passed without errors or regressions.


