# Ant Game: Development & Engineering Best Practices

This document outlines core principles, workflows, and standards for developing, debugging, and expanding the *Underfoot* codebase.

---

## 1. The Golden Hierarchy of Truth

When developing, planning, or debugging, always observe this strict hierarchy:

```
1. Live Source Code (`src/*.js`, `tests/*.cjs`)  <-- GROUND TRUTH
2. Archived Walkthroughs (`walkthroughs/*.md`)   <-- INTENDED FINAL BEHAVIOR & CONTEXT
3. Archived Plans (`implementation_plans/*.md`)  <-- ORIGINAL PROPOSALS & DESIGN RATIONALE
```

* **Live Source Code is King**: The files currently in `src/` and `tests/` dictate what the game actually does right now. Never assume an architecture matches a written plan without verifying the live source.
* **Walkthroughs Record Reality**: A walkthrough records what was *actually built, tested, and validated* during a sprint.
* **Implementation Plans Record Intent**: An implementation plan records what was *initially proposed* before execution began. Proposals often adjust during implementation based on feedback and real-world edge cases.

---

## 2. Using Archives for Bugfixing

### ✅ When to Consult Walkthroughs & Plans
1. **Discerning Intent vs. Defect**: 
   * Code shows *what* is happening, not *why*. If an ant stops feeding the queen at 80% capacity, checking the walkthrough reveals whether this was a deliberate design choice (e.g., hysteresis to prevent audio looping) or an unintended flaw.
2. **Pinpointing Regressions ("When did this break?")**:
   * If a previously functional mechanic fails, scan [`walkthroughs/README.md`](./walkthroughs/README.md). Locate which sprint touched that subsystem (e.g., pathfinding, combat targeting, or water extraction) to find the exact modification that introduced the defect.
3. **Complex Edge Cases & Formula Math**:
   * Mechanics with non-obvious math (clearance thresholds, decay curves, asymmetric freeze hysteresis, digestion ratios) are explained in the walkthroughs with their design rationale.

### ❌ Anti-Patterns to Avoid During Bugfixing
* **Never Copy Stale Code from Plans**: Old plans may feature outdated method signatures, deprecated globals, or obsolete file locations (e.g., before modular domain extraction). Always write fixes directly against the live files.
* **Avoid Token / Context Bloat**: Do not read every walkthrough. Use the index table in `walkthroughs/README.md` to pinpoint and read **only the single relevant document**.
* **Do Not Fix Working Safeguards**: Before "fixing" unexpected behavior, check if the behavior is a documented safeguard designed to prevent soft-locks, infinite loops, or game-freezes.

---

## 3. Using Archives for Feature Planning

### ✅ When to Consult Walkthroughs & Plans
1. **Preserving Established Colony Constraints**:
   * When designing new systems (e.g., RimWorld-style zoning, territory bounds), check prior walkthroughs to ensure new logic respects existing mechanics (feeder exclusivity, carrier capacities, priority tie-breakers, body clearance widths).
2. **Architectural & Data Consistency**:
   * Maintain consistent conventions across systems (e.g., using `sim.jobs` for task assignment, `hexDisk()` for radial geometry, `axial` coordinates $(q, r)$, and `AntGame.HEX_DIRS`).
3. **Honoring User Design Decisions**:
   * Past plans preserve specific user design instructions (e.g., *"trenches cost 0 resources and are pure excavation"*). Checking them prevents regressing on user preferences.

### ❌ Anti-Patterns to Avoid During Feature Planning
* **Never Design Against a Phantom Architecture**: Do not plan a new feature assuming an older plan's structure. Always check current exports, module boundaries, and active class methods first.
* **Remember That Proposals Drift**: Plans are proposals; walkthroughs are reality. If a plan proposed 3 dirt for a trench but the user changed it to 0 dirt during review, the walkthrough reflects the true final design.

---

## 4. Documentation & Archive Maintenance

To prevent lost knowledge and ensure long-term stability:

1. **Keep Both Archives Chronological**:
   * Every major design or technical proposal is saved to [`implementation_plans/`](./implementation_plans/) with a date stamp (`YYYY-MM-DD_<feature>.md`) and indexed in `implementation_plans/README.md`.
   * Every finished feature or bugfix pass is saved to [`walkthroughs/`](./walkthroughs/) with a date stamp (`YYYY-MM-DD_<feature>.md`) and indexed in `walkthroughs/README.md`.
2. **No Deletions or Overwrites**:
   * Never delete, overwrite, or truncate past walkthroughs or plans. They form the permanent historical record of the game's evolution.
3. **Automated Verification Mandate**:
   * Every walkthrough must include reproducible test suite runs (`--test`) confirming 100% pass rates across all test files with 0 regressions.
