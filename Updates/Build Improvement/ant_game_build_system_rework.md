# Ant Game — Build System Rework Design Notes

## Purpose

This document compiles the current ideas for a future **Build System Rework**.

It is intentionally written as design notes rather than an implementation handoff.

The goal is to preserve the intended construction logic, resource behavior, terrain interactions, and planned future build types without allowing implementation details to make design decisions on behalf of the game.

This update is expected to come **after the Brood Update**, because the Brood Update adds additional buildable room types that should be included in the same broader construction framework.

---

# 1. Current Build Flow

The existing build feature already follows a useful general pattern:

1. Player selects **Build**
2. Player selects a construction type
3. Player places the construction on a valid tile
4. A construction overlay / blueprint appears
5. Workers detect that construction is pending
6. Workers carry required resources to the blueprint
7. Workers complete the build

The intended rework keeps this basic system.

The main problem is that construction costs and resource delivery are currently incomplete or inconsistent.

---

# 2. Construction Resource Delivery Problem

Current behavior appears to primarily transport:

- Dirt

even when a construction also has a Food cost.

That means a build can appear to cost multiple resources while the actual construction workflow only physically delivers one of them.

The rework should treat all listed construction resources as real build requirements.

If a structure costs:

- Dirt
- Food
- or another future construction resource

then those resources should actually be delivered to the construction site before the build can complete.

---

# 3. Unique Construction Costs

Each buildable structure should have its own defined construction cost.

The exact values are currently **undecided**.

The important design point is that different structures should not silently share one generic cost unless intentionally designed that way.

Future cost definitions may include:

- Dirt
- Food
- other future resources

Current and future build types can be balanced individually later.

---

# 4. Plain Dirt Placement

A basic build option should allow the player to place ordinary Dirt back into the world.

This allows the colony to:

- fill holes
- rebuild walls
- close tunnels
- restore excavated terrain
- reshape passages

## Cost

- **1 Dirt**

## Result

The target becomes a normal Dirt block.

This is not a special reinforced structure.

It is ordinary diggable Dirt returned to the map.

---

# 5. Dirt Placement and Water

Plain Dirt placement should not be allowed to erase meaningful bodies of water.

The current rule idea is:

- Dirt may only be placed where water level is **below Level 1**

If water is at or above Level 1:

- Dirt cannot be placed directly into that tile

This prevents construction from functioning as an unrealistic instant water-deletion mechanic.

---

# 6. Half-Raised Dirt / Rough Terrain

A new terrain construction is planned that still consumes Dirt but does **not** create a solid wall.

Conceptually, this is a raised / rough / obstructed dirt floor.

## Cost

- **1 Dirt**

## Function

The tile remains fully navigable.

However, movement through it is substantially slower.

This affects:

- player ants
- rival ants
- creatures

Player Workers are **not exempt**.

The intended role is to create controllable difficult terrain rather than a complete barrier.

This makes it similar in strategic purpose to environmental slowing effects such as Spider Webs, except it remains traversable and is a construction made by the colony.

The final name is undecided.

---

# 7. Compacted Dirt Wall

A reinforced Dirt construction is planned:

**Compacted Dirt Wall**

## Cost

- **5 Dirt**

This is a much tougher construction than normal Dirt.

---

# 8. Compacted Dirt — Environmental Protection

Compacted Dirt provides protection against some environmental events.

It should prevent:

- ordinary Rain flood breaches from spawning directly on that block
- ordinary cave-ins from occurring directly on that block

However, stronger disasters override this protection.

Compacted Dirt does **not** protect against:

- Thunderstorm breach effects
- Earthquake effects

This makes it a risk-reduction tool rather than an absolute disaster-proof material.

---

# 9. Compacted Dirt — Digging Resistance

Compacted Dirt should take substantially longer to excavate than ordinary Dirt.

This applies to anything attempting to mine through it, including:

- player ants
- rival ants
- Worms
- Grubs
- other future digging creatures

The wall should remain technically diggable unless a later design explicitly changes that.

The distinction is:

**Normal Dirt = ordinary excavation**

**Compacted Dirt = very slow excavation**

---

# 10. Compacted Dirt — Mite Restriction

Mites currently have the special ability to pass through exactly one ordinary Dirt block.

Compacted Dirt should block that ability.

Mites cannot travel through:

- Compacted Dirt

This makes reinforced walls useful against Mite infiltration.

---

# 11. Trench

A new construction is planned:

**Trench**

Its main purpose is defensive terrain.

It also interacts with water.

---

# 12. Trench Water Capacity

The Trench can hold water up to approximately:

- **Level 3**

This is much lower than the dedicated Water Collector / Well system.

Water storage is therefore a secondary function.

The Trench is **not** intended to replace dedicated water storage.

---

# 13. Trench as a Defensive Barrier

The Trench's primary role is to act as:

- trench
- ditch
- moat
- movement barrier

Creatures unable to cross its physical gap should be blocked by it.

This gives the colony a defensive terrain option that is different from simply building a wall.

---

# 14. Combat Across a Trench

A Trench blocks movement where appropriate, but it does not automatically block attacks.

If two entities are directly opposite each other across a one-block Trench:

- attacks may still reach across it

This applies in both directions.

The Trench therefore creates a defensive positional advantage but does not function as an impenetrable combat wall.

---

# 15. Creature Size and Trench Crossing

Trench interaction depends on creature size and movement footprint.

A creature should not be blocked by a one-block Trench if its body / movement capability is large enough to cross that gap.

Example:

- a Spider should not necessarily be stopped by a one-block Trench

Large creatures should evaluate the Trench relative to their established physical/navigation size.

The Trench should therefore interact with the existing creature-size/pathing system rather than simply being universally impassable.

---

# 16. Filling a Trench

A Trench can be removed by placing ordinary Dirt into it.

## Result

Placing normal Dirt on a Trench:

- fills the Trench
- returns that tile to a normal traversable Dirt/path-floor state

It does **not** create a Dirt wall.

The idea is simply that the ditch has been filled in.

---

# 17. Invalid Constructions on a Trench

A Trench should not accept arbitrary stacked terrain constructions.

In particular:

- Compacted Dirt cannot be placed directly on top of a Trench
- other terrain constructions should not stack directly onto a Trench unless specifically designed to do so later

The normal way to remove a Trench is:

**Trench → fill with normal Dirt → ordinary floor/path**

Afterward, the resulting terrain can follow normal construction rules.

---

# 18. Smooth Dirt Floor

A future Evolution-unlocked construction is planned:

**Smooth Dirt Floor**

This is not available by default.

It becomes available through the Evolution system later.

---

# 19. Smooth Dirt Floor Cost

Planned cost per tile:

- **4 Dirt**
- **1 Food**

This makes it a relatively expensive infrastructure improvement.

---

# 20. Smooth Dirt Floor Function

Smooth Dirt Floor does not create a wall.

It uses the existing path/floor style of terrain but improves movement across that tile.

The intended function is:

- faster movement on that floor

This can benefit colony logistics by creating high-speed internal routes.

---

# 21. Smooth Dirt Floor and Resource Delivery

Because Smooth Dirt Floor costs both:

- Dirt
- Food

both resources should be physically delivered to the blueprint before construction completes.

This is an important example of why the Build rework needs multi-resource construction support.

---

# 22. Smooth Dirt Floor and Evolution

Smooth Dirt Floor is specifically planned as an **Evolution unlock**.

The Evolution system should determine whether the colony is capable of constructing it.

The Build system itself simply needs to support build types becoming available later through unlock conditions.

No Evolution tree design is being finalized in this update.

---

# 23. Relationship to Existing Build Types

Current build-related systems already include:

- Food Storage
- Spoil Storage
- Water Collector

The Brood Update is expected to add:

- Brood Room / Hatchery

The Build Rework should ultimately support all of these through one consistent construction framework.

---

# 24. Planned Construction Categories

The current construction ideas can be thought of broadly as:

## Rooms / Functional Areas
- Food Storage
- Spoil Storage
- Water Collector
- future Brood Room / Hatchery

## Terrain Reconstruction
- Plain Dirt

## Defensive / Terrain Control
- Half-Raised / Rough Dirt
- Compacted Dirt Wall
- Trench

## Infrastructure
- Smooth Dirt Floor

These are organizational notes only.

They do not require the UI to use these exact category names.

---

# 25. Build Blueprint Resource State

A construction blueprint may require multiple resources.

Conceptually, a blueprint should be able to track something like:

- Dirt required
- Dirt delivered
- Food required
- Food delivered
- future resource requirements

Construction should remain incomplete until all required resources have been delivered.

The exact data structure is not decided here.

---

# 26. Worker Construction Loop

The intended construction loop remains:

**Blueprint exists**  
→ **Workers identify missing resources**  
→ **Workers obtain those resources**  
→ **Workers carry them to the blueprint**  
→ **Resource requirement is satisfied**  
→ **Workers perform build work**  
→ **Construction completes**

This keeps construction tied to physical colony logistics.

---

# 27. No Free Resource Conversion

Construction should not silently convert colony totals into built structures without transport if the rest of the Build system is based on physical resource delivery.

Likewise:

- a Food cost should require delivered Food
- a Dirt cost should require delivered Dirt

This keeps Build behavior consistent with the physical Carry/Storage systems.

---

# 28. Terrain Interaction Summary

## Plain Dirt
- Cost: 1 Dirt
- Creates ordinary Dirt
- Cannot be placed into meaningful water depth
- Diggable normally

## Half-Raised / Rough Dirt
- Cost: 1 Dirt
- Traversable
- Significantly slows movement
- Affects allies and enemies

## Compacted Dirt Wall
- Cost: 5 Dirt
- Solid defensive wall
- Very slow to excavate
- Blocks Mite one-Dirt traversal
- Prevents ordinary Rain breach targeting
- Prevents ordinary cave-in targeting
- Thunderstorms and Earthquakes override protection

## Trench
- Water capacity: up to Level 3
- Defensive movement barrier
- Attacks can cross one tile
- Large enough creatures may cross
- Can be filled with normal Dirt
- Does not accept Compacted Dirt directly

## Smooth Dirt Floor
- Evolution unlock
- Cost: 4 Dirt + 1 Food
- Traversable floor
- Increases movement speed

---

# 29. Relationship to Weather

Several constructions intentionally interact with the planned Day / Weather Update.

## Compacted Dirt
Protects against:
- normal Rain breach placement
- ordinary cave-ins

Does not protect against:
- Thunderstorm breach
- Earthquake

## Trench
May:
- collect limited water
- redirect movement around flooded/defensive areas

No additional hydrology behavior is finalized yet.

---

# 30. Relationship to Creature Ecology

The Build system also interacts with creature movement.

Examples:

- Mites cannot cross Compacted Dirt using their special one-block Dirt traversal
- Worms and Grubs can mine Compacted Dirt, but much more slowly
- large creatures may cross a one-block Trench if their body/pathing size allows it
- rough terrain slows creatures as well as ants

These interactions should remain tied to each creature's existing size/pathing rules.

---

# 31. Relationship to Colony Traffic

Terrain constructions may eventually shape traffic flow.

Examples:

- Rough Dirt creates slow zones
- Smooth Dirt Floor creates fast routes
- Trench creates route restrictions
- Compacted Dirt creates hard defensive boundaries

This gives the colony internal infrastructure and defensive terrain choices without requiring every defensive mechanic to be a combat structure.

---

# 32. Future Expansion

More construction types are expected later.

They are intentionally not being defined here because other planned systems are still being designed.

The Build system should therefore remain expandable.

This document only covers the currently planned construction changes.

---

# 33. Current Open Questions

## Build Costs
- What should each existing storage/build type cost?
- Should each room have unique Dirt/Food requirements?
- Are any other resources eventually needed?

## Plain Dirt
- Is the final water-placement rule exactly "below Level 1"?
- Does placing Dirt consume exactly one stored Dirt unit in all cases?

## Rough / Half-Raised Dirt
- Final name?
- Exact movement-speed penalty?

## Compacted Dirt
- Exact excavation-time multiplier?
- Does it have a separate durability value?
- Can it eventually be damaged by combat, or only excavated?
- Does ordinary flooding flow around it exactly like any other solid wall?

## Trench
- Final construction cost?
- Exact visual depth/state?
- Can ants voluntarily enter an empty Trench, or is it always movement-blocking for ant-sized entities?
- Can small creatures become trapped inside it?
- How should water enter/leave the Trench relative to normal hydrology?
- Exact size threshold for creatures capable of crossing it?

## Combat Across Trench
- Which attack ranges can cross?
- Is direct adjacency enough for all melee attacks?
- Do larger reaches behave normally?

## Smooth Dirt Floor
- Exact movement-speed bonus?
- Does the 4 Dirt + 1 Food cost remain final?
- Which Evolution upgrade unlocks it?

## Build Resource Transport
- Does Food delivered to construction come from processed Food Storage only?
- Can raw whole food ever count as a construction resource, or only normal processed food?

## Construction Labor
- Should different construction types require different build times in addition to resource costs?

---

# 34. Current Design Summary

The Build Rework currently focuses on four main improvements:

## Resource-Accurate Construction
- every listed cost must actually be delivered
- structures can require multiple resource types
- each structure can have its own cost

## Terrain Reconstruction
- plain Dirt placement
- filling holes
- closing tunnels
- rebuilding terrain

## Defensive Terrain
- Rough Dirt slow zones
- Compacted Dirt walls
- Trenches

## Infrastructure
- Smooth Dirt Floors
- future Brood Rooms
- future additional construction types

The overall direction is to make building part of the colony's physical resource/logistics simulation rather than a simple instant-placement system.
