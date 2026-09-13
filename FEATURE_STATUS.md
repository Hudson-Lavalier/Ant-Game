# Ant Game Feature Status

This document provides a comprehensive audit of all implemented features, systems, game logic, and visual capabilities in the Ant Game codebase.

---

## Implemented Systems & Features

### 1. Revamped Ant Caste System
- **Disabled Reproductive Hatching**: Egg hatching probability for `queen`, `drone`, and `princess` is set to `0%`. The founding queen remains the sole fertile egg layer for the colony.
- **Worker & Soldier Morphs**:
  - **Worker (65% roll chance)**: Standard generalist ant (100 HP, 50 food/water capacity, 1.0x speed, 5 carry capacity). Digs, builds, hauls, harvests, and performs brood care.
  - **Minor (10% roll chance)**: Fast lightweight nursing and foraging worker (50 HP, 25 food/water capacity, 2.0x travel speed). Cannot dig or build (`canMine = false`, `canBuild = false`). Specialized in carrying food/water and recovering dropped loads.
  - **Media (10% roll chance)**: Intermediate worker morph (200 HP, 100 food/water capacity, 1.0x speed).
  - **Soldier (10% roll chance)**: Guard/combat major (250 HP, 20 attack damage). Features an enlarged head with curved mandibles. Idle soldiers automatically patrol colony paths with a slight pull toward newly excavated tiles, and respond to threat reports from retreating workers.
  - **Major (3% roll chance)**: Heavy worker morph (300 HP, 3.0x dig speed, 24 attack damage, 15 food/water carry capacity or 2 soil blocks, 2.0x need drain). Digs 2 adjacent blocks simultaneously. Requires 3-block wide passage clearance (`clearanceNeeded = 3`).
  - **Supermajor (2% roll chance)**: Extreme heavy worker morph (500 HP, 5.0x dig speed, 40 attack damage, 25 food/water carry capacity or 3 soil blocks, 3.0x need drain). Big soldier head structure with curved mandibles. Digs 3 adjacent blocks simultaneously. Requires 3-block wide passage clearance (`clearanceNeeded = 3`).

### 2. Feeder Ant System & Evolution
- **Initial Cap**: Starting feeder capacity is set to **1** ant (`feederCapacity() = 1`).
- **Assignment**: Players select a living worker morph and click **Assign feeder**.
- **Feeder Specialization Evolution**: Added `feeder_limit` to the Biological Evolution panel (initial cost 75 EP). Each evolved tier doubles feeder capacity ($1 \rightarrow 2 \rightarrow 4 \rightarrow 8 \dots$) and costs $1.5\times$ more EP per tier.
- **Feeder Behavior**: Designated feeders prioritize queen hunger/water needs within 70 hexes, automatically retrieving loose food, harvesting edible corpses, or gathering water droplets.

### 3. Dig Orders, Brush Performance & Chunk Integrity
- **Brush Performance**: Dig brush designation runs in $O(1)$ time per painted cell without triggering synchronous full-colony path refreshes, eliminating lag during large brush drag painting.
- **Unrevealed Dig Jobs**: Dragging dig orders over unseen/undiscovered terrain creates pending job markers without revealing terrain or generating unrevealed chunks.
- **Auto-Cancellation on Reveal**: When ants reveal an unseen dig target, if the tile is open space or solid rock, the invalid dig request automatically disappears.
- **Chunk & Insect Isolation**: Dormant creatures and foreign colonies in unrevealed chunks remain strictly frozen and dormant until ant vision reveals their hex.

### 4. Water Physics, Extraction & Deep Wells
- **Extractable Water Value**: `AntGame.getWaterExtractValue(level)` maps tile water level (0 to 7) to extractable water percentage (e.g. level 7 = 100, level 6 = 85, level 5 = 70, down to level 0 = dry).
- **Dynamic Tile Level Reduction**: Ants drinking or extracting water reduce tile water levels proportionally down to dry (`0.0`).
- **Fluid Flow & Spreading Force**:
  - Water flows between adjacent open cells toward lower water levels to equalize.
  - Spreading force activates when a tile's water level exceeds $1.0$.
  - Once active, water continues spreading into lower neighbors until the tile thins down to **0.5**, where spreading stops until refilled $> 1.0$.
- **Water Reservoirs (Built Chambers)**:
  - Built water storage tiles (`waterStorage = true`) act as impassable non-walkable protective catchment barriers.
  - Active suction pulls water in from adjacent open tiles until reaching level 7.0 (max capacity).
  - Below level 7.0, reservoirs never leak or release water to lower dry neighbors. Excess water overflows at level 7.0.
- **Deep Wells**:
  - Rare natural well features enclosed on all sides by unexcavable rock, with a single entrance passage.
  - Holds a 20-level deep water reservoir (~285 extractable water) that does not overflow.

### 5. Rock Formations & Unexcavable Terrain
- **Clustered Rocks**: Rocks generate in dense 7-hex radius clusters per chunk and in dedicated rock features.
- **Unexcavable**: Solid rock tiles (`rock: true`) cannot be mined through. Dig orders on rock tiles are rejected or cleared upon discovery.
- **Visuals**: Rendered as grey stone tiles (`hsl(0, 0%, 38%)`) with stone textures.
- **Inspection**: Selecting a rock tile displays: `Solid Rock · Solid unexcavable rock. Cannot be dug through.`

### 6. Queen Hunger, Thirst & Dehydration Warnings
- **Initial Resources**: Queen starts with 200 food / 100 water.
- **Consumption & Warnings**: Drains 200 food and 90 water over 15 minutes. At 0 food or water, explicit red blinking UI banners (`QUEEN IS STARVING` / `QUEEN IS DEHYDRATED`) flash at top of screen and warning alerts emit to the log feed.
- **Damage & Game Over**: Queen takes 3 HP/s starvation damage and 5 HP/s dehydration damage (stacking to 8 HP/s when both active). Queen death triggers Game Over.

### 7. Core Terrain, Storage & Colony Operations
- **Hex Grid Model**: Axial flat-top hex geometry for drawing, brush painting, sensing, pathing, and building.
- **Seeded Founding Layout**: Every world seed deterministically chooses nest placement, spoil hole location, food room anchor, and initial passage.
- **Individual Stored Items**: Food and queen water exist as discrete stored item objects with physical `storageTile` and `storageSlot` layouts. Spoil uses individual soil objects up to 5 per tile.
- **Chamber Construction**: Building food rooms, spoil rooms, or water reservoirs requires worker construction hauling (consuming food and conserved soil).
- **Colony Operations Modal**: Centralized header modal managing egg toggle, ant counter visibility, path visualization, water target, and reservoir retrieval.

### 8. Developer Tools
- **Caste Spawn Dropdown**: Select and spawn any of the 9 castes (`Worker`, `Minor`, `Media`, `Soldier`, `Major`, `Supermajor`, `Queen`, `Drone`, `Princess`) directly at the nest.
- **Find Well Expedition**: `data-expedition="well"` carves a navigable tunnel directly to the nearest deep well entrance without destroying surrounding rock.
- Path toggle, AI toggle, expedition shortcuts (food, water, well, ruins, surface, colony), and debug status.

---

## Verification & Test Suite

Run `npm test` in the workspace root to execute the test suite.

- **Passed Tests**: **42 / 42 tests passing**.
- **Coverage Includes**:
  - Revamped caste roll probabilities (65% worker, 10% minor, 10% media, 10% soldier, 3% major, 2% supermajor, 0% repros).
  - Minor speed, carry capacity, and mining/building restrictions.
  - Media double health and need capacity.
  - Major & Supermajor 3x/5x stats, 2x/3x drain rates, multi-block mining, and 3-block passage clearance.
  - Supermajor pathfinding and travel stability.
  - Feeder capacity cap (1 starting) and `feeder_limit` evolution doubling.
  - Rock unexcavable checks and clustered rock generation.
  - Deep well generation, passage access, 20-level water capacity, and overflow containment.
  - Water extraction value mapping and level reduction down to dry.
  - Water spreading force cutoff at 0.5 level and flow key order neutrality.
  - Reservoir suction behavior, non-walkable barrier checks, and level 4 leak prevention.
  - Queen starvation and dehydration warning timers and damage stacking.
  - Unrevealed dig job creation without unrevealed chunk generation.
  - UI contracts, area planning, and map overlay cleanup.

The application is hosted locally via `npm start` at `http://127.0.0.1:4173/`.

---

## Creature Ecology Cleanup Brief: Implemented

The Creature Ecology Cleanup update is implemented in the active runtime and covered by the simulation suite.

- `src/data.js` now declares Bull Weevil, Hercules Beetle, Mite, Isopod/Woodlouse, Spider, Baby Spider, and Root Aphid alongside the revised Earthworm and Beetle Grub. Each generated creature receives a persisted 0.91–1.10 size multiplier, proportional corpse food, and a subtle color variation.
- Seeded chunks now include dedicated Earthworm and Hercules cavities, seed-site mite/isopod groups, and rare long rotted-root veins. Earthworms and Grubs physically excavate one- and two-cell passages; all large creatures use the shared clearance-aware routing rules.
- Mites have their own route search that may cross exactly one dirt tile but never rock, water, or consecutive dirt. Isopods and Woodlice flee; Weevils and Grubs defend when provoked; Hercules Beetles, Mites, and Spiders attack on sight.
- Spiders make persistent web tiles, web targets every 50 seconds, immobilize ants for 40 seconds, convert webbed ant deaths into eggs, hatch Baby Spiders after 3:30, and mature them after 15 minutes.
- Root Aphids become active near a discovered root, consume one wood durability every eight seconds, can be milked with Harvest for 15 food on a one-minute individual cooldown, and automatically map/remove their root harvest area as the vein is consumed. Root encounters can also contain harmless Woodlice.
- The renderer includes individual top-down silhouettes for every new creature, root-vein material, and readable web overlays. The test suite has 46 passing checks, including direct coverage of variation, mite restrictions, web hatching, and root-area creation.
- The Dev panel includes a creature selector for Earthworms, Beetle Grubs, Bull Weevils, Hercules Beetles, Mites, Isopods, Woodlice, Spiders, Baby Spiders, and Root Aphids. Each action places the selected creature on a visible open tile near the colony; Root Aphid testing also creates a one-tile Root habitat.

## Creature Scale, Anatomy, and Animation Correction: Implemented

- Creature collision is now derived from declared central-body dimensions measured against the worker/block reference, instead of preserving the former arbitrary `1 / 2 / 3` categories. Isopods use 2-cell body clearance, Spiders 3, and Hercules Beetles 5; Weevil snouts, Hercules horns, and articulated legs do not increase collision width.
- Earthworms and Beetle Grubs mine the same clearance-width cross-section required by their declared body. Their renderer uses head-history body sections, so the body bends through turns and does not translate as a rigid line.
- Creature movement stores previous fixed-step positions and renderer interpolation blends them between updates. Mites now have eight articulated legs; Weevils and Hercules Beetles have six; Spiders have eight; Isopod legs, Beetle legs, and Spider legs use attached walk cycles.
- Corrected visual proportions include a tiny Mite, 1.2–1.8-block-scale Weevil, compact 2.4-block Isopod, thick Grub, and a long-horned Hercules Beetle whose wide central body, not its horn, determines access. The suite has 48 passing checks, including clearance and segmented-motion regression coverage.
