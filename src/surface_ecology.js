/*
 * UNDERFOOT SURFACE DYNAMIC ECOLOGY
 * Manages surface-specific ecological cycles:
 * - 7-minute berry bush replenishment
 * - Wind-blown falling seeds
 * - 10-minute dynamic Boll Weevil spawns
 * - Night spiders appearing at dusk, with autonomous dawn retreat before despawning
 * - Ingress/egress of surface insects entering underground holes
 */
(()=>{
const {Config:C,Species,FoodTypes,hexDistance,hexDisk,hash}=AntGame;

class SurfaceEcology {
 static update(sim, dt){
  if(!sim.surfaceWorld) return;
  const sw = sim.surfaceWorld;


  // 1. 7-Minute Berry Bush Replenishment
  for(const cell of sw.cells.values()){
   if(cell.zone === 'berry_bush'){
    if(cell.hasBerries){
     if(!sim.resources.some(r => r.layer === 1 && r.foodType === 'berries' && Math.round(r.x) === cell.x && Math.round(r.y) === cell.y && r.remaining > 0)){
      sim.resources.push({
       id: `berries-${cell.x},${cell.y}`,
       foodType: 'berries',
       x: cell.x,
       y: cell.y,
       layer: 1,
       remaining: 20,
       initial: 20,
       decay: 0,
       state: 'active'
      });
     }
    } else {
     cell.berryReplenishTimer = (cell.berryReplenishTimer || 0) + dt;
     if(cell.berryReplenishTimer >= (C.berryReplenishSeconds || 420)){
      cell.hasBerries = true;
      cell.berryReplenishTimer = 0;
      if(!sim.resources.some(r => r.layer === 1 && r.foodType === 'berries' && Math.round(r.x) === cell.x && Math.round(r.y) === cell.y && r.remaining > 0)){
       sim.resources.push({
        id: `berries-${cell.x},${cell.y}-${Math.round(sim.time)}`,
        foodType: 'berries',
        x: cell.x,
        y: cell.y,
        layer: 1,
        remaining: 20,
        initial: 20,
        decay: 0,
        state: 'active'
       });
      }
     }
    }
   }
  }

  // 2. Wind-Blown Falling Seeds
  // Periodically drops thistle/grass seeds on open meadow
  sim.surfaceSeedTimer = (sim.surfaceSeedTimer || 0) + dt;
  if(sim.surfaceSeedTimer >= 180){ // Every 3 minutes
   sim.surfaceSeedTimer = 0;
   const openCells = [];
   for(const cell of sw.cells.values()){
    if(cell.discovered && cell.zone === 'grass' && !cell.solid && cell.water === 0){
     openCells.push(cell);
    }
   }
   if(openCells.length > 0){
    const dropCell = openCells[Math.floor(sim.random.next() * openCells.length)];
    sim.resources.push({
     id: `surface-seed-${dropCell.x},${dropCell.y}-${Math.round(sim.time)}`,
     foodType: 'seeds',
     x: dropCell.x,
     y: dropCell.y,
     layer: 1,
     remaining: 5,
     initial: 5,
     decay: 0,
     state: 'active'
    });
    sim.emit('A fresh seed drifted down on the wind to the surface meadow.');
   }
  }

  // 3. 10-Minute Dynamic Boll Weevil Respawns
  sim.weevilRespawnTimer = (sim.weevilRespawnTimer || 0) + dt;
  if(sim.weevilRespawnTimer >= (C.bollWeevilRespawnSeconds || 600)){
   sim.weevilRespawnTimer = 0;
   const activeWeevils = sim.creatures.filter(c => c.alive && c.layer === 1 && c.species === 'weevil').length;
   if(activeWeevils < 4){
    // Spawn a Boll Weevil on an open surface grass tile near an entrance or discovery
    const openGrass = [];
    for(const cell of sw.cells.values()){
     if(cell.discovered && cell.zone === 'grass' && !cell.solid){
      openGrass.push(cell);
     }
    }
    const spawnPt = openGrass.length ? openGrass[Math.floor(sim.random.next() * openGrass.length)] : {x: 0, y: -25};
    const weevil = AntGame.Ecology.spawnCreature(sim, 'weevil', spawnPt.x, spawnPt.y, {
     layer: 1,
     state: 'active',
     devActivated: true
    });
    sim.creatures.push(weevil);
   }
  }

  // 4. Night Danger: Spiders at Dusk & Dawn Retreat
  const isDay = sim.climate ? sim.climate.isDay : true;
  if(!isDay){
   // Spawn nocturnal hunting spiders on surface if count < 2
   sim.nightSpiderTimer = (sim.nightSpiderTimer || 0) + dt;
   if(sim.nightSpiderTimer >= 60){ // Check every minute during night
    sim.nightSpiderTimer = 0;
    const nightSpiders = sim.creatures.filter(c => c.alive && c.layer === 1 && c.species === 'night_spider').length;
    if(nightSpiders < 2){
     // Spawn along perimeter or wilderness away from active camera
     const ang = sim.random.next() * Math.PI * 2;
     const spawnX = Math.round(Math.cos(ang) * 45);
     const spawnY = Math.round(Math.sin(ang) * 45);
     const spider = AntGame.Ecology.spawnCreature(sim, 'night_spider', spawnX, spawnY, {
      layer: 1,
      state: 'active',
      devActivated: true
     });
     sim.creatures.push(spider);
     sim.emit('A shadow stirs in the high grass. Night Spiders hunt above ground.');
    }
   }
  } else {
   // Daytime: Dawn retreat behavior for night spiders
   for(const c of sim.creatures){
    if(c.alive && c.layer === 1 && c.species === 'night_spider'){
     c.retreating = true;
     // Direct path away from origin / colony
     const distFromCenter = Math.hypot(c.x, c.y);
     if(distFromCenter > 50){
      // Out of view: cleanly despawn
      c.alive = false;
      c.state = 'dormant';
     } else {
      // Move towards map edge
      const stepDist = 3.0 * dt;
      c.x += (c.x / (distFromCenter || 1)) * stepDist;
      c.y += (c.y / (distFromCenter || 1)) * stepDist;
     }
    }
   }
  }

  // 5. Entrance Hole Insect Traversal
  // Surface insects stepping onto entrance holes have a small chance to descend underground
  for(const c of sim.creatures){
   if(c.alive && c.layer === 1 && !c.retreating){
    const here = {x: Math.round(c.x), y: Math.round(c.y)};
    if(sw.isEntrance(here.x, here.y)){
     c.inHoleTimer = (c.inHoleTimer || 0) + dt;
     if(c.inHoleTimer > 3.0 && sim.random.next() < 0.25){
      // Descend into underground nest
      c.layer = 0;
      c.inHoleTimer = 0;
      sim.emit(`A ${Species[c.species]?.name || 'surface insect'} has crept down through the entrance shaft!`);
     }
    } else {
     c.inHoleTimer = 0;
    }
   }
  }
 }
}

AntGame.SurfaceEcology = SurfaceEcology;
})();
