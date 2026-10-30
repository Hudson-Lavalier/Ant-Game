# Walkthrough: Creature Spatial Updates, Soft Collision Bubbles, and Hex Perimeter Slots

## Overview
This update extends spatial updates, anti-stacking relaxation bubbles, and 6-way hex perimeter interaction slots to all other creatures (mites, beetles, spiders, night spiders, worms, grubs, isopods, and root aphids). It incorporates a zero-allocation numeric UID performance optimization, resolves the Bull Weevil exact coordinate stacking bug, and synchronizes renderer interpolation.

---

## Root Cause Audit: Why Bull Weevils Stacked

### 1. The Zero-Distance Escape Clause (`distSq > 0.000001`)
In `src/spatial.js`, `applySoftSeparation` checked:
```javascript
if (distSq < targetDist * targetDist && distSq > 0.000001) { ... }
```
When two weevils stepped onto the exact same hex tile or spawned on the same tile, `a.x === b.x` and `a.y === b.y`. Thus `distSq = 0.0`. Because `distSq > 0.000001` evaluated to `false`, the collision resolution code was skipped, leaving identical-position entities permanently stacked.

### 2. Blind Wandering Selection (`Ecology.chooseOpen`)
In `src/ecology.js`, when weevils wandered via `chooseOpen`, the neighbor selection randomly picked from adjacent open tiles without checking if another creature was already occupying or heading toward that tile. Two weevils in the same room frequently rolled the same target hex and snapped to the exact same position in `Ecology.move`.

### 3. Visual Interpolation Desynchronization (`prevX` / `prevY`)
In `src/renderer.js`, underground creatures interpolate between `prevX` and `x` via `ecoAlpha`. While `applySoftSeparation` nudged `x` and `y`, it did not update `prevX` and `prevY`. When `ecoAlpha` reset to 0 at the start of every ecology tick, the renderer visually snapped creatures back to their overlapping `prevX` positions.

---

## Changes Implemented

### 1. Deterministic Ejection on Exact Overlap (`src/spatial.js`)
When entities share identical coordinates (`distSq <= 0.000001`), the engine ejects them along a deterministic angle based on their unique numeric UIDs with an accelerated 40% spring factor:
```javascript
if (distSq < targetDist * targetDist) {
  let dist, nx, ny;
  if (distSq <= 0.000001) {
    const angle = (((aUid * 2654435761 ^ bUid * 2246822519) >>> 0) % 6283) / 1000;
    nx = Math.cos(angle);
    ny = Math.sin(angle);
    dist = 0;
  } else {
    dist = Math.sqrt(distSq);
    nx = dx / dist;
    ny = dy / dist;
  }
  const factor = distSq <= 0.000001 ? 0.40 : SEPARATION_FACTOR;
  const totalOverlap = (targetDist - dist) * factor;
  ...
```

### 2. Synchronized `prevX` and `prevY` Updates (`src/spatial.js`)
When soft separation nudges `a.x` and `a.y`, `a.prevX` and `a.prevY` are shifted by the exact same delta `(dAx, dAy)`, keeping renderer interpolation completely in sync with physical simulation coordinates.

### 3. Occupancy-Aware Neighbor Selection (`src/ecology.js`)
In `Ecology.chooseOpen`, adjacent candidate tiles are filtered to exclude tiles already occupied or targeted by another creature on the same layer. Wandering creatures naturally disperse and avoid pathing to the same tile.

### 4. 6-Way Hex Perimeter Slots for Predators (`src/ecology.js`)
Aggressive creatures claim 6-way axial perimeter slots around their prey and dynamically track moving targets without piling on a single hex tile.

### 5. Renderer Selection Bubbles (`src/renderer.js` & `src/surface_renderer.js`)
Selection bubbles are drawn for selected creatures in underground and surface views, scaled to each creature's collision radius.

---

## Verification Results

### 1. Automated Tests (`tests/creature_spatial_interaction.test.cjs`)
All 9 unit and edge-case tests passed:
- Bull Weevil exact coordinate overlap ejection: verified (two weevils at 15.0, 15.0 immediately separate).
- Bull Weevil wandering separation: verified (`chooseOpen` avoids occupied/targeted tiles).
- Creature-Creature anti-stacking: verified.
- Creature-Ant anti-stacking with zero-allocation UIDs: verified.
- Anchored aphid physical immunity: verified.
- Creature solid wall collision guard: verified.
- Creature cross-layer isolation: verified.
- Creature 6-way perimeter slot claiming and moving target tracking: verified.
- Creature slot cleanup on death: verified.

### 2. Full Regression Suite
- Total Tests: 222 passed (0 failed, 0 cancelled, 0 skipped).
- Renderer Tests: All 9 ant castes, 4 carry states, 9 creature species, and dual-layer draw benchmarks passed cleanly.
