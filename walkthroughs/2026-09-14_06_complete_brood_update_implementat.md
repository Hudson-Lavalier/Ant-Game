# Walkthrough — Complete Brood Update Implementation

The comprehensive **Brood Update** for *Ant Game* has been fully implemented and verified against all design requirements and biological constraints.

---

## Key Changes & Architecture

### 1. Complete Metamorphic Lifecycle (`Egg` $\rightarrow$ `Larva` $\rightarrow$ `Pupa` $\rightarrow$ `Adult`)
- **Egg Stage**:
  - Duration: **45s**.
  - Food required: **0 food**.
  - Automatically hatches into a Larva upon reaching 45s.
- **Larval Stage**:
  - Duration: **180s**.
  - Food required: **30 food** to pupate.
  - Workers deliver food in configurable batches (default 5 food, upgradeable up to 30 food in the Brood Shop).
  - Single larval stage (continuous growth); if duration reaches 180s before 30 food is consumed, it pauses development and remains a hungry larva until fed.
- **Pupal Stage**:
  - Duration: **85s**.
  - Food required: **0 food**.
  - Automatically pupates in a protective cocoon until adult emergence.
- **Adult Emergence**:
  - Evaluates cumulative mutation multipliers and enhancer tiers to apply permanent random attribute buffs (Health, Movement Speed, Dig Speed, Construct Speed, Attack Damage, Carry Capacity, Max Food, Max Water).
  - Spawns a fully functional adult ant into the colony roster.

### 2. Hatchery Room System & Physical Egg Capacity
- **Tiles & Construction**:
  - **Hatchery Floor** (`hatchery_floor` / `hatchery-floor`): Cost 5 food + 3 dirt.
  - **Hatchery Wall** (`hatchery_wall` / `hatchery-wall`): Cost 5 food + 3 dirt (solid fortified barrier).
- **Room Validation**:
  - Connected component of Hatchery Floor tiles.
  - Must be enclosed by solid walls/boundaries with **exactly 1 entrance**.
  - Rooms with 0 or $>1$ entrances are flagged `isValid = false` and provide 0 egg capacity.
- **Egg Capacity Ratio**:
  - **1 egg capacity per 3 floor tiles**.
  - Starter hatchery generates at colony founding with 3 floor tiles + enclosure with 1 entrance, providing capacity for 1 egg.
- **Colony Brood Gating**:
  - `effectiveBroodCap = Math.min(unlockedBroodCap, physicalHatcheryCap)`.
  - The Queen cannot lay additional eggs if `colonyBroodCount >= effectiveBroodCap`.

### 3. Brood Care Logistics: Brood Helper Specialist & Feeder Fallback
- **Brood Helper Specialist**:
  - Unlocked in the Brood Shop for **50 Brood Points (BP)**.
  - Players can designate any worker ant as a dedicated Brood Helper from the inspector.
  - Rendered with a distinctive lavender ant color (`#b589d6`).
- **Autonomous Task Hierarchy**:
  - Added `feedLarvae` (priority 1) and `transportBrood` (priority 2) to autonomous labor candidates.
  - Brood Helpers automatically search for hungry larvae and misplaced eggs/larvae/pupae, carrying misplaced brood directly into the nearest valid Hatchery chamber.
- **Feeder Fallback**:
  - If no Brood Helper is unlocked or assigned, designated Feeders autonomously take over larval feeding and hatchery brood relocation.

### 4. Brood Points (BP), Brood Shop, & Upgrades
- **Daily Generation**:
  - Generated at the end of each game day (every 1800s):
    - Workers, Minors, Media, Soldiers, Drones, Princesses: **+1 BP each**.
    - Majors: **+2 BP each**.
    - Supermajors: **+3 BP each**.
- **Brood Shop Modal & Upgrades**:
  - **Brood Helper Role**: 50 BP (one-time unlock).
  - **Nutrient Feed Batches**: Tiers 1–5 (costs: 100, 150, 200, 300, 500 BP; batch sizes 10, 15, 20, 25, 30 food; mutation rates 1.2×, 1.5×, 2.0×, 3.0×, 5.0×).
  - **Brood Capacity Expansion**: +1 unlocked capacity per tier ($50 \times 2^{\text{tier}}$ BP).
  - **Metamorphic Acceleration**: +10% faster development per tier ($75 \times 1.8^{\text{tier}}$ BP).
  - **Mutation Potency Enhancer**: Boosts mutation quality ($150 \times 2.5^{\text{tier}}$ BP).
  - **Hormonal Caste Bias**: Shifts developmental caste probability towards Majors & Supermajors ($200 \times 2.0^{\text{tier}}$ BP).

### 5. Brood Hazards
- **Health**: 25 HP for every developmental stage.
- **Deep Water Drowning**: Brood situated in water $\ge 6$ suffers rapid drowning damage (18 HP/s) and dies if not relocated.
- **Predator Aggression**: Hostile subterranean creatures (spiders, beetles, mites) automatically acquire and attack uncarried living brood.

### 6. User Interface & Visual Differentiation
- **Renderer**:
  - **Egg**: Translucent oval egg with soft specular highlight.
  - **Larva**: Curved, segmented creamy-white grub body with dual progress bars (development age & nutrition/food).
  - **Pupa**: Spun silken cocoon with wrapping threads and age progress bar.
  - **Carried Brood**: Visually positioned in carrying ant's mandibles.
  - **Hatchery Tiles**: Hatchery Floor (`#352b22` with honeycomb lattice) and Hatchery Wall (`#694e35` with packed mortar grooves).
- **Inspection & Controls**:
  - Header displays Brood Points (`#brood-points`) with direct click to open Brood Shop.
  - Inspector reveals stage, health, progress timers, nutrition levels (`x / 30 food`), mutation multiplier, and carrier ID.
  - Build dropdown includes `Hatchery Floor (5F, 3D)` and `Hatchery Wall (5F, 3D)`.
  - Colony Operations caste tabs include the dedicated `Brood Helper` tab.

---

## Verification Results

### Full Automated Test Suite
Ran all 3 test suites:
- `tests/brood.test.cjs` (10 tests)
- `tests/climate.test.cjs` (46 tests)
- `tests/simulation.test.cjs` (56 tests)

```powershell
$env:ELECTRON_RUN_AS_NODE="1"; & "c:\Users\hudso\AppData\Local\Programs\Microsoft VS Code\Code.exe" --test tests/brood.test.cjs tests/climate.test.cjs tests/simulation.test.cjs | Out-String
```

**Results:**
```
ℹ tests 112
ℹ suites 0
ℹ pass 112
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1801.0446
```

### Renderer Visual Regression Benchmark
```powershell
$env:ELECTRON_RUN_AS_NODE="1"; & "c:\Users\hudso\AppData\Local\Programs\Microsoft VS Code\Code.exe" tests/test_renderer.cjs | Out-String
```

**Results:**
```
Testing Renderer initialization...
Testing all ant castes with moving & carry variations...
✔ All 9 castes x 4 carry states x alive/dead rendered cleanly!
Testing all creature species...
✔ All 9 species rendered cleanly in all movement and life states!
Testing full Simulation draw cycle benchmark...
✔ Benchmark: 100 full frames rendered in 184.5ms (1.845 ms/frame)
ALL RENDERER TESTS PASSED SUCCESSFULLY!
```
