# RimWorld-Style Zoning & Squad Hauling — Audit & Implementation Plan (Updated)

Implement RimWorld-inspired behavioral zoning (**Foraging**, **Hunting**, **Stockpiling**) and map the colony squad/group system (Groups 1–9) directly to those territories with configurable labor policies, multi-priority stockpiles, and cooperative multi-ant hauling.

---

## 1. System Audit & Key Architectural Clarifications

Following detailed user feedback, this update strictly separates **Architectural Area Planning** from **Behavioral Zoning**:

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                      TWO DISTINCT, COMPLEMENTARY SYSTEMS                      │
├───────────────────────────────────────┬───────────────────────────────────────┤
│         AREA PLANNING SYSTEM          │       BEHAVIORAL ZONING SYSTEM        │
│          (`sim.areas`, `cell.area`)   │   (`sim.zones`, `cell.behaviorZone`)  │
├───────────────────────────────────────┼───────────────────────────────────────┤
│ • Purely architectural & informational│ • Purely behavioral & operational     │
│ • Room names, room bounds, blueprints │ • Restricts & guides ant AI labor     │
│ • Categories: territory, passage,     │ • Types: Foraging, Hunting, Stockpile │
│   food, spoil, water, enemy           │ • Sets squad territory bounds & roles │
│ • Powering `roomSummary` inspections  │ • Custom stockpile filters & priority │
│ • 100% PRESERVED & UNCHANGED          │ • Squad hauling & priority overrides  │
└───────────────────────────────────────┴───────────────────────────────────────┘
```

### Critical Design Constraints Clarified in Audit:
1. **Preserve Area Planning & Room Inspections Intact**:
   - `sim.areas` and `cell.area` remain strictly dedicated to room planning, chamber naming, and inspection descriptions in `roomSummary` (e.g. "Hatchery Chamber", "Food Store", "West Spoil Chamber").
   - Behavioral zoning lives in its own dedicated layer: `sim.zones` and `cell.behaviorZone`.
   - A single hex can have both: an Area label (e.g., Area: "South Chamber") and a Behavioral Zone (e.g., Zone: "Meat Stockpile").
2. **Stockpiles Locked to Spoil Tiles (`cell.zone === 'spoil'`)**:
   - In accordance with the colony simulation theme, **Stockpile Zones can ONLY be designated on excavated spoil tiles** (`cell.zone === 'spoil'`).
   - Non-spoil tiles reject stockpile zoning with player feedback.
   - Spoil rooms thereby serve their natural role as the foundation for organized colony stockpiles (meat/corpses, seeds, or excavated dirt).
3. **Extensible Tile-to-Zone Constraint Architecture**:
   - Implemented via `AntGame.ZoneTileConstraints`, allowing each zone type to define allowed underlying tile zones and validation functions, making future tile-to-zone constraints (e.g. nursery on hatchery floors, reservoir on water tiles) trivial to add.
4. **Seamless Integration with the Priority System**:
   - Caste priorities (`sim.castePriorities`, 1–10 scale) remain the foundational baseline.
   - Zones and Squad Roles can define **Priority Overrides**:
     - A **Forager Squad** in a **Foraging Zone** overrides harvest priority to 1.
     - A **Hunter Squad** in a **Hunting Zone** overrides combat/patrol priority to 1.
     - A **Hauler Squad** overrides carry and soil-hauling to 1.
     - Zones can optionally declare explicit priority overrides (e.g. `priorityOverrides: { dig: 1 }`), which supersede caste priorities for all units assigned to that zone.
     - Within identical priority tiers, tasks located **inside** the squad's assigned zone take precedence over outside tasks.
     - If `strictBounds` is enabled, all outside tasks are completely disqualified.

---

## 2. Feature Specifications

### A. Behavioral Zone System (`sim.zones`)
1. **Zone Types**:
   - **Foraging Zone (`type: 'foraging'`)**:
     - Designated gathering grounds for seeds, aphid honeydew, and loose vegetation.
     - Allowed tiles: any discovered open walkable ground.
   - **Hunting Zone (`type: 'hunting'`)**:
     - Designated patrol and defense grounds.
     - Soldiers actively hunt hostile insects and prey within zone bounds. Detection radius boosted up to 12 hexes within the zone.
     - Allowed tiles: any discovered open walkable ground.
   - **Stockpile Zone (`type: 'stockpile'`)**:
     - **STRICT REQUIREMENT**: Only permitted on excavated spoil tiles (`cell.zone === 'spoil'`).
     - Configurable **Priority**: `1: Low`, `2: Normal`, `3: Preferred`, `4: Critical`.
     - Configurable **Item Filters**:
       - `allowCorpses: boolean` (insect carcasses)
       - `allowSeeds: boolean` (seeds and grains)
       - `allowSoil: boolean` (excavated dirt chunks and rubble)
2. **Tile-to-Zone Extensible Validation**:
   ```javascript
   AntGame.ZoneTileConstraints = {
     stockpile: {
       name: 'Stockpile Zone',
       color: '#b5890088',
       validate: (cell) => cell.zone === 'spoil' && !cell.solid,
       errorMsg: 'Stockpile zones can only be designated on excavated spoil tiles.'
     },
     foraging: {
       name: 'Foraging Zone',
       color: '#3d7a3a88',
       validate: (cell) => !cell.solid && cell.discovered,
       errorMsg: 'Foraging zones can only be placed on discovered open ground.'
     },
     hunting: {
       name: 'Hunting Zone',
       color: '#96323288',
       validate: (cell) => !cell.solid && cell.discovered,
       errorMsg: 'Hunting zones can only be placed on discovered open ground.'
     }
   };
   ```
3. **Spatial Indexing**:
   - Each zone maintains `tiles: Set<string>` for $O(1)$ inclusion testing (`sim.isHexInZone(x, y, zoneId)`).

### B. Squad-to-Zone Mapping & Priority Overrides
1. **Squad Data Model (`sim.squads[1..9]`)**:
   - Preserves 100% compatibility with `sim.groups[1..9]` ant ID arrays.
   ```javascript
   sim.squads[n] = {
     id: n,
     name: `Squad ${n}`,
     zoneId: null,          // null = Unrestricted (colony-wide)
     strictBounds: false,   // true = NEVER work outside zone; false = prioritize zone, fallback to global
     role: 'auto',          // 'auto' | 'forager' | 'hunter' | 'hauler' | 'guard'
     priorityOverrides: {}, // optional manual task priority overrides
   };
   ```
2. **Priority Resolution Pipeline (`TaskEngine.getEffectivePriority`)**:
   - When evaluating task $T$ for ant $A$:
     1. **Survival Needs**: Starvation / dehydration thresholds enforce emergency drinking/eating unless manually commanded.
     2. **Squad / Zone Priority Override**:
        - If squad role has an override for $T$ (e.g., `role === 'forager'` sets `harvest: 1`), use it.
        - If assigned zone has `priorityOverrides[T]`, use it.
     3. **Caste Priority Baseline**: Fallback to `sim.getCastePriority(caste, T)`.
3. **Spatial Filtering in `TaskEngine.assign(sim, a)`**:
   - Candidates inside the assigned zone are flagged `inZone: true`.
   - If `strictBounds` is true: discard all candidates with `inZone === false`.
   - In sorting:
     - If candidate A is `inZone` and candidate B is not, candidate A is preferred regardless of minor distance differences.
     - If both are `inZone` (or both out), sort by effective priority, then distance.

### C. Smart Multi-Stockpile Logistics (`sim.storage(a)`)
- When an ant carries a load (`corpse`, `seed`, or `soil`):
  1. Scan all active `stockpile` zones whose tiles are `cell.zone === 'spoil'`.
  2. Filter by allowed categories (`allowCorpses`, `allowSeeds`, `allowSoil`).
  3. Sort candidate stockpiles by:
     - Priority descending (`Critical (4) > Preferred (3) > Normal (2) > Low (1)`).
     - Distance to nearest reachable non-full tile.
  4. If a valid stockpile tile is found, route carrier there.
  5. Fallback smoothly to default founding `foodStore`, `nest`, or `pit` if no custom stockpile accepts the item or all matching stockpiles are full.

### D. Squad Hauling & Cooperative Multi-Ant Transport
- **Cooperative Hauling Mechanic**:
  - Heavy creatures (grubs, large earthworms, beetles, spiders) that exceed single-ant carry capacity can be carried by a squad hauling team.
  - Haul power per ant caste:
    - Supermajor: 4.0 | Major: 2.0 | Worker / Media: 1.0 | Minor: 0.5
  - Required haul power: Grub: 3.0, Large Worm: 2.5, Spider: 5.0, Hercules: 6.0.
  - Up to 4 ants in a hauling squad team up on the carcass, moving in formation along the path to the designated stockpile!

### E. UI & Controls Integration
1. **Area Planning vs. Behavioral Zoning UI**:
   - The Completion Panel provides two clean sections:
     - **AREA PLANNING (Layout & Blueprints)**: The original area tool (name, territory/passage/food/spoil/water/enemy categories, rename, erase) is 100% preserved.
     - **BEHAVIORAL ZONING (Labor & Squads)**:
       - Zone Tool: Create/Paint Foraging, Hunting, or Stockpile zones.
       - Stockpile Inspector: Priority selector (Low to Critical) and checkboxes for Corpses, Seeds, Dirt.
       - Clear visual rejection if player attempts to paint a Stockpile outside a Spoil room.
2. **Squad Manager**:
   - Shows Squads 1–9 with member counts.
   - Assigned Zone dropdown (`Unrestricted` or select zone).
   - Strict Bounds checkbox: `[x] Confine to Zone`.
   - Role selector: `Auto`, `Foragers`, `Hunters`, `Haulers`, `Guards`.
3. **Canvas Visuals**:
   - Subtle outer boundary line around behavioral zones.
   - Visual distinction between Area planning overlay and Behavioral Zone overlay.

---

## 3. Verification Plan

### Automated Unit Tests (`tests/zoning_squads.test.cjs`)
1. **Separation of Areas and Behavioral Zones**:
   - Create an Area plan (`sim.createArea('West Spoil', 'spoil')`) and paint it.
   - Paint a Behavioral Zone (`sim.paintZone`) over the same hexes.
   - Verify `cell.area` and `cell.behaviorZone` coexist without overwriting each other.
   - Verify `roomSummary` still correctly returns the Area title and room stats.
2. **Stockpile Spoil Tile Locking**:
   - Attempt to paint a Stockpile zone on normal dirt, water, and passage tiles. Verify rejection.
   - Paint a Stockpile zone on excavated spoil tiles (`cell.zone === 'spoil'`). Verify success.
3. **Priority Override System**:
   - Test worker with default caste priority (dig=5, harvest=4).
   - Assign worker to Forager squad (harvest=1). Verify harvest candidate is chosen over dig candidate.
   - Verify zone-specific priority overrides supersede caste priorities.
4. **Stockpile Prioritization & Filtering**:
   - Create a Normal-priority Seed stockpile and a Critical-priority Corpse stockpile on spoil tiles.
   - Verify corpses route to Critical stockpile and seeds route to Normal stockpile.
5. **Strict vs Biased Squad Zone Bounds**:
   - Test `strictBounds: true`: worker completely ignores tasks outside zone.
   - Test `strictBounds: false`: worker prefers zone tasks, but takes outside tasks when zone is clear.
6. **Cooperative Multi-Ant Hauling**:
   - Spawn a heavy spider carcass.
   - Verify 2-3 ants team up and successfully haul it to the designated corpse stockpile.
7. **Serialization & Backwards Compatibility**:
   - Save simulation with active zones, squads, and stockpiles.
   - Restore and verify complete state fidelity.
8. **Regression Verification**:
   - Run existing test suites (`simulation.test.cjs`, `brood.test.cjs`, `climate.test.cjs`, `test_renderer.cjs`) confirming all 139 tests continue to pass.
