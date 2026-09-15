# Development Roadmap

This document outlines the official development roadmap for Underfoot / Ant Game from here on out.

---

## Milestone 1: Foundations & Architecture

- **Building Blocks Update**: Finish active primitives and block-building mechanics.
- **RimWorld-Style Zoning & Squad Hauling**: Implement zone bounds (foraging, hunting, stockpiling) and map the existing group system to those territories.
- **Save & Load Architecture**: Build the core serialization pipeline. Save terrain, block states, worker data, and active zones to disk, verifying round-trip stability before the world gets bigger.
- **Music Track 1 & Core Sound Pipeline**: Establish subterranean audio muffling versus open-air sound profiles.

---

## Milestone 2: World Expansion & Environment

- **Outdoors V1 (Dual-Plane Surface)**: Establish the mechanical bridge between above-ground and subterranean views. Implement dual-plane rendering, surface pathfinding, and transition portals.
- **Rain & Flooding Overhaul**: Connect surface weather accumulation directly into fluid physics so water spills into entrances and floods lower galleries.
- **Worldgen & Blueprint Tool**: Build internal blueprint editor to design and save structured encounters. Expand random cavern generation, varied soil blocks, and initial food nodes.

---

## Milestone 3: Colony Life & Deep Threats

- **Cordyceps & Deep Fauna**: Add underground threats, emerging Hercules beetles, and the zombie fungus outbreak system.
- **Ant Social Behaviors**: Integrate rest/sleep cycles, grooming, and social interactions among idle workers.
- **Queens & Evolution Overhaul**: Overhaul the evolution tree and introduce specialized queen types (brood thieves, slave-makers, cooperative super-colonies).
- **Music Tracks 2 & 3**: Compose biome and tension-focused background music.

---

## Milestone 4: Surface Ecology & Strategic Warfare

- **Outdoors V2 (Flora & Fauna)**: Populate the surface with dynamic vegetation, rich seasonal food variation, and surface insects.
- **Ant War & Raids (Strategic Map)**: Roll the macro intelligence map, scouting systems, and rival colony siege raids into a unified military update.

---

## Milestone 5: The Master Polish Pass

- **Full Art Redo**: Hand-craft final sprites, tiles, and animations across every locked feature.
- **Final Audio & Track 4**: Master all remaining sound effects, stingers, and the main theme.
- **Hard Feature Freeze & Optimization**: Stress test entity pathfinding, patch physics bottlenecks, and fix bugs for launch.

---

## Post-Launch Backlog (Do Not Touch Before 1.0)

- **Co-op Multiplayer**
- **Mobile Port**
