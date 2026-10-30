/*
 * UNDERFOOT COLONY SIMULATION
 * Simulation owns the player colony's durable state: ants, eggs, orders, food,
 * water, stored dirt, construction, evolution, saves, and worker tasks. Rendering
 * never changes this state; it only draws it. Input calls the public methods here.
 *
 * Feature landmarks: updateQueen handles hunger and brood; travel moves freely
 * inside valid hex boundaries; designate/designateBuild create work orders;
 * feederSource and pickupFeed automate the designated feeder; updateWorker performs
 * digging, hauling, construction, harvesting, and recovery; serialize/restore save.
 */
(()=>{
const {Config:C,Random,World,pathfind,findRoute,key,rollCaste,FoodTypes,Species,hexDistance,hexDisk,hexRound,canCarry,hexDistance3D}=AntGame;
const dist=(a,b)=>hexDistance3D?hexDistance3D(a,b):hexDistance(a,b);
const heading=(dq,dr)=>Math.atan2(Math.sqrt(3)*(dr+dq/2),1.5*dq);
const isWorkerMorph=type=>['worker','minor','media','major','supermajor'].includes(type);
const isCommandable=type=>['worker','minor','media','soldier','major','supermajor'].includes(type);
class Simulation {
 constructor(seed=12345){
  this.world=new World(seed);this.random=new Random(seed);this.time=0;this.evolution=0;this.totalEvolution=0;this.traits=[];this.traitLevels={};
  this.ants=[];this.eggs=[];this.jobs=[];this.events=[];this.nextId=1;this.resources=[];
  this.food=C.startingFood;this.water=C.startingWater;this.foodHarvested=0;this.foodConsumed=0;this.surfaceDump=0;
  // INVENTORY ROOTS: food and queen water are individual stored objects; reservoir
  // droplets and spoil objects remain at their own physical chamber cells.
  // FOUNDING ANCHORS: World supplies seed-randomized nest, storage, and spoil placements.
  this.nest={...this.world.founding.nest};this.foodStore={...this.world.founding.foodStore,used:this.food,capacity:C.startingFoodCapacity,hole:false,tiles:Math.round(C.startingFoodCapacity/C.foodStoragePerTile),items:[]};this.foodStore.items=this.makeFoodItems(this.food,'ration','starting-ration');
  const waterPos=this.world.founding.waterStore||{x:this.nest.x+2,y:this.nest.y};
  const waterCell=this.world.get(waterPos.x,waterPos.y);
  waterCell.solid=false;waterCell.zone='water-store';waterCell.structure='water';waterCell.waterStorage=true;waterCell.excavations=2;waterCell.water=7;waterCell.staticWater=true;waterCell.discovered=true;
  this.waterStore={used:0,capacity:0,items:this.makeItems('starting-water','water',this.water),tiles:[]};
  this.world.activeWater.add(key(waterPos.x,waterPos.y));
  this.spoilItems=[];this.areas={};this.groups=Array.from({length:10},()=>[]);this.feederId=null;this.commandMarkers=[];this.waterTarget='queen';this.antFoodNeedRatio=C.antFoodNeedRatio;this.antWaterNeedRatio=C.antWaterNeedRatio;
  this.zones={};this.squads=Array.from({length:10},(_,i)=>({id:i,name:`Squad ${i}`,zoneId:null,strictBounds:false,role:'auto',priorityOverrides:{}}));
  this.broodPoints=0;this.unlockedBroodCap=1;this.broodCapTier=0;this.broodHelperUnlocked=false;
  this.feedUpgradeTier=0;this.hatchSpeedTier=0;this.mutationEnhancerTier=0;this.casteModifierTier=0;
  this.customCasteChances=null;
  this.eggProduction=true;this.gameOver=false;this.creatures=[];this.colonies=[];this.drops=[];this.discoveries=[];this.spiderEggs=[];this.rootAreas={};
  this.castePriorities=JSON.parse(JSON.stringify(AntGame.DefaultCastePriorities||{}));
  this.ecologyTimer=0;this.statusTimer=0;this.healTimer=0;this.aiEnabled=true;
  this.activeInflows=[];
  this.surfaceWorld=AntGame.SurfaceWorld?new AntGame.SurfaceWorld(seed,this.world):null;
  this.activeLayer='underground'; // 'underground' (layer 0) or 'surface' (layer 1)
  this.climate=new (AntGame.Climate||class{constructor(){this.dayProgress=0;this.temperature=17;this.humidity=90;}update(){}serialize(){return null;}restore(){}})(seed,this);
  this.spatialHash=AntGame.HexSpatialHash?new AntGame.HexSpatialHash():null;
  for(const p of hexDisk(this.nest.x,this.nest.y,3))if((p.x!==this.nest.x||p.y!==this.nest.y)&&(p.x!==waterPos.x||p.y!==waterPos.y))this.world.open(p.x,p.y,'food-store');
  const queen=this.addAnt('queen',this.nest.x,this.nest.y);queen.fertile=true;queen.layTimer=C.firstEggTime;queen.health=C.queenHealth;this.addAnt('worker',this.nest.x+1,this.nest.y);this.world.senseAt(queen.x,queen.y,C.queenRevealRadius);
  AntGame.Ecology.sync(this);
 }
 emit(text){this.events.push({time:this.time,text});if(this.events.length>24)this.events.shift();}
 effect(name){let result=name==='vision'?0:1;for(const t of AntGame.Traits)if(this.traits.includes(t.id)&&t.effects[name]!==undefined){const level=this.traitLevels?.[t.id]||1;if(name==='vision')result+=t.effects[name]*level;else result*=t.effects[name]**level;}return result;}
  foodCapacity(){return AntGame.Inventory.foodCapacity(this);}
  makeItems(prefix,type,value,typeKey='type'){return AntGame.Inventory.makeItems(this,prefix,type,value,typeKey);}
  makeFoodItems(value,foodType='ration',prefix='food'){return AntGame.Inventory.makeFoodItems(this,value,foodType,prefix);}
  itemTotal(items=[]){return AntGame.Inventory.itemTotal(items);}
  queenWaterCapacity(){return AntGame.Inventory.queenWaterCapacity(this);}
  waterCapacity(){return AntGame.Inventory.waterCapacity(this);}
  colonyCapacity(){return AntGame.Inventory.colonyCapacity(this);}
  feederCapacity(){return AntGame.Inventory.feederCapacity(this);}
  getCastePriority(caste,task){return AntGame.TaskEngine.getCastePriority(this,caste,task);}
  setCastePriority(caste,task,val){return AntGame.TaskEngine.setCastePriority(this,caste,task,val);}
  resetCastePriorities(caste=null){return AntGame.TaskEngine.resetCastePriorities(this,caste);}
  syncStores(){return AntGame.Inventory.syncStores(this);}
  takeItems(items,value){return AntGame.Inventory.takeItems(items,value);}
  addFood(value,foodType='ration'){return AntGame.Inventory.addFood(this,value,foodType);}
  spendFood(value){return AntGame.Inventory.spendFood(this,value);}
  addWater(value){return AntGame.Inventory.addWater(this,value);}
  spendWater(value){return AntGame.Inventory.spendWater(this,value);}
  reservoirDestination(a){return AntGame.Inventory.reservoirDestination(this,a);}
  reservoirWater(){return AntGame.Inventory.reservoirWater(this);}
  reservoirSource(a){return AntGame.Inventory.reservoirSource(this,a);}
  requestReservoirWithdrawal(){return AntGame.Inventory.requestReservoirWithdrawal(this);}
  pickupReservoir(a){return AntGame.Inventory.pickupReservoir(this,a);}
 queen(colonyId=1){return this.ants.find(a=>a.colonyId===colonyId&&a.type==='queen'&&a.fertile);}
 rollCasteForColony(colonyId=1){
  if(colonyId===1)return this.rollCaste();
  const chances={worker:0.38,minor:0.15,media:0.15,soldier:0.15,major:0.08,supermajor:0.04,drone:0.03,princess:0.02};
  const roll=this.random.next();
  let cumulative=0;
  for(const [caste,prob] of Object.entries(chances)){
   cumulative+=prob;
   if(roll<cumulative)return caste;
  }
  return 'worker';
 }
 evolve(id){const t=AntGame.Traits.find(t=>t.id===id),repeatable=['food_store','water_store','colony_limit','feeder_limit'].includes(id),level=this.traitLevels[id]||0,cost=Math.ceil(t?.cost*(1.5**level));if(!t)return 'Unknown trait.';if(this.traits.includes(id)&&!repeatable)return 'Already evolved.';if(t.prerequisites.some(p=>!this.traits.includes(p)))return 'Evolve the prerequisite first.';if(this.evolution<cost)return 'Not enough Evolution Points.';this.evolution-=cost;if(!this.traits.includes(id))this.traits.push(id);this.traitLevels[id]=level+1;this.syncStores();this.emit(`${t.name} reached tier ${level+1}.`);return null;}
 // CASTE IDENTITY: visual.caste provides a durable renderer-facing identity for princesses.
 // ANT SPAWN: all non-queen ants receive independent 50-point food and water supplies.
 addAnt(type,x,y,colonyId=1){
  const shade=.86+this.random.next()*.28;
  const isQ=type==='queen';
  let health=100, maxFoodNeed=50, maxWaterNeed=50, speed=C.moveSpeed, canMine=true, canBuild=true, digRate=1.0, attackDamage=8, maxCarry=5, drainMult=1, clearanceNeeded=1;
  if(isQ){
   health=C.queenHealth; maxFoodNeed=null; maxWaterNeed=null;
  }else if(type==='minor'){
   health=50; speed=C.moveSpeed*2; maxFoodNeed=25; maxWaterNeed=25; canMine=false; canBuild=false; maxCarry=5;
  }else if(type==='worker'){
   health=100; speed=C.moveSpeed; maxFoodNeed=50; maxWaterNeed=50; maxCarry=5;
  }else if(type==='media'){
   health=200; speed=C.moveSpeed; maxFoodNeed=100; maxWaterNeed=100; maxCarry=5;
  }else if(type==='soldier'){
   health=250; speed=C.moveSpeed; maxFoodNeed=125; maxWaterNeed=125; attackDamage=20; canMine=false; canBuild=false; maxCarry=5; drainMult=1.2;
  }else if(type==='major'){
   health=300; speed=C.moveSpeed; maxFoodNeed=200; maxWaterNeed=200; digRate=3.0; attackDamage=24; maxCarry=15; drainMult=2; clearanceNeeded=3;
  }else if(type==='supermajor'){
   health=500; speed=C.moveSpeed; maxFoodNeed=300; maxWaterNeed=300; digRate=5.0; attackDamage=40; maxCarry=25; drainMult=3; clearanceNeeded=3;
  }
  const actions={
   dig:canMine!==false,
   carry:true,
   harvest:true,
   feed:false,
   gatherFood:true,
   gatherWater:true,
   build:canBuild!==false,
   haulSoil:true,
   combat:true
  };
  const antId=this.nextId++;
  const a={id:antId,_uid:antId,colonyId,type,x,y,layer:0,health,maxHealth:health,alive:true,age:0,speed,angle:0,state:'idle',path:[],task:null,orderQueue:[],carry:null,timer:0,held:false,preferred:null,fertile:false,feeder:false,broodHelper:false,nickname:null,roleName:null,shade,layTimer:C.eggInterval,food:isQ?(C.queenFoodCapacity||200):null,water:isQ?(C.queenWaterCapacity||100):null,maxFood:isQ?(C.queenFoodCapacity||200):null,maxWater:isQ?(C.queenWaterCapacity||100):null,foodNeed:isQ?null:maxFoodNeed,waterNeed:isQ?null:maxWaterNeed,maxFoodNeed,maxWaterNeed,canMine,canBuild,digRate,attackDamage,maxCarry,drainMult,clearanceNeeded,actions,visual:{sprite:null,animationSet:null,frame:0,scale:1,offset:[0,0],caste:type},reproductive:type==='princess'?{role:'princess',winged:true,mateReady:false,dispersal:false}:null,modifiers:{}};
  this.ants.push(a);return a;
 }
  getActiveWorld(){
   return this.activeLayer==='surface'?this.surfaceWorld:this.world;
  }
  switchLayer(targetLayer=null){
   if(targetLayer){
    this.activeLayer=targetLayer;
   }else{
    this.activeLayer=this.activeLayer==='underground'?'surface':'underground';
   }
    if(AntGame.AudioCoordinator){
     AntGame.AudioCoordinator.onLayerChange?.(this.activeLayer);
     AntGame.AudioCoordinator.update?.(this.climate, null, this);
    }
   return this.activeLayer;
  }
 livingPopulation(colonyId=1){return this.ants.filter(a=>a.alive&&a.colonyId===colonyId).length;}
 physicalHatcheryCap(){
  return AntGame.Brood?.physicalHatcheryCap(this.world)??0;
 }
 effectiveBroodCap(){
  return AntGame.Brood?.effectiveBroodCap(this)??1;
 }
 rollCaste(){
  return AntGame.Brood?.rollCaste(this, this.random)??rollCaste(this.random);
 }
 canLay(q){
  if(q.colonyId!==1)return true;
  const broodCount=this.eggs.filter(e=>e.colonyId===1&&(e.health===undefined||e.health>0)).length;
  return (!this.gameOver&&this.eggProduction&&this.livingPopulation(1)+broodCount<this.colonyCapacity()&&broodCount<this.effectiveBroodCap()&&this.food>=this.foodCapacity()*C.foodCriticalRatio&&this.water>=this.waterCapacity()*C.waterCriticalRatio&&this.food>=C.eggFoodCost&&this.water>=C.eggWaterCost);
 }
 layEgg(q){
  if(!this.canLay(q))return false;
   if(q.colonyId===1){
    this.spendFood(C.eggFoodCost);
    this.spendWater(C.eggWaterCost);
    if(this.telemetry){
     this.telemetry.recordFoodLoss(1,C.eggFoodCost,'eggProduction');
     this.telemetry.recordWaterLoss(1,C.eggWaterCost,'eggProduction');
    }
   }
   const assignedAntType=this.rollCasteForColony(q.colonyId),angle=this.random.next()*Math.PI*2,r=1+this.random.next()*2;let x=q.x+Math.cos(angle)*r,y=q.y+Math.sin(angle)*r;
   if(this.world.peek(Math.round(x),Math.round(y))?.solid!==false){x=q.x;y=q.y;}
   const speedMult=1/(1+(this.hatchSpeedTier||0)*0.10);
   const duration=(C.brood?.eggDuration||45)*speedMult;
   this.eggs.push({id:this.nextId++,x,y,assignedAntType,stage:'egg',age:0,duration,health:C.brood?.health||25,maxHealth:C.brood?.health||25,foodAccumulated:0,mutationMultiplier:1.0,mutations:[],colonyId:q.colonyId,carriedBy:null});
  if(q.colonyId===1){
   this.emit('The queen laid an egg. Food and water were consumed.');
   AntGame.AudioCoordinator?.play('queenLayEgg');
  }
  return true;
 }
 onNewDay(){
  AntGame.Brood?.onNewDay(this);
 }
 currentFeedBatchAmount(){
  return AntGame.Brood?.currentFeedBatchAmount(this)??5;
 }
 currentFeedMultiplier(){
  return AntGame.Brood?.currentFeedMultiplier(this)??1.0;
 }
 setBroodHelper(a, state=true){
  return AntGame.Brood?.setBroodHelper(this, a, state)??null;
 }
 buyBroodHelperUnlock(){
  return AntGame.Brood?.buyBroodHelperUnlock(this)??null;
 }
 buyFeedUpgrade(){
  return AntGame.Brood?.buyFeedUpgrade(this)??null;
 }
 buyBroodCapUpgrade(){
  return AntGame.Brood?.buyBroodCapUpgrade(this)??null;
 }
 buyHatchSpeedUpgrade(){
  return AntGame.Brood?.buyHatchSpeedUpgrade(this)??null;
 }
 buyMutationEnhancerUpgrade(){
  return AntGame.Brood?.buyMutationEnhancerUpgrade(this)??null;
 }
 buyCasteModifierUpgrade(caste='soldier'){
  return AntGame.Brood?.buyCasteModifierUpgrade(this, caste)??null;
 }
   getClosestEntrance(pos){
    return this.surfaceWorld?.getClosestEntrance?.(pos) || { x: 0, y: -25, r: 0 };
   }
   canReach(a, pt, targetLayer = 0){
    const antLayer = a.layer || 0;
    if(antLayer === targetLayer){
     const w = antLayer === 1 ? this.surfaceWorld : this.world;
     if(!w) return false;
     return pathfind(w, a, pt, a.clearanceNeeded || 1) !== null;
    }
    if(!this.surfaceWorld) return false;
    const entrances = this.surfaceWorld.entrances && this.surfaceWorld.entrances.length ? this.surfaceWorld.entrances : [this.getClosestEntrance(a)];
    for(const entr of entrances){
     const entrUnderground = this.world.peek(entr.x, entr.y);
     if(!entrUnderground?.discovered) continue;

     if(antLayer === 0 && targetLayer === 1){
      const toEntr = (hexDistance(a, entr) <= (entr.r || 0)) ? [] : pathfind(this.world, a, entr, a.clearanceNeeded || 1);
      if(toEntr === null) continue;
      const rim = this.surfaceWorld.getAdjacentPassableSurfaceHex(entr.x, entr.y, pt);
      const fromRimToDest = (hexDistance(rim, pt) === 0) ? [] : pathfind(this.surfaceWorld, rim, pt, a.clearanceNeeded || 1);
      if(fromRimToDest !== null) return true;
     }else if(antLayer === 1 && targetLayer === 0){
      const rim = this.surfaceWorld.getAdjacentPassableSurfaceHex(entr.x, entr.y, a);
      const toRim = (hexDistance(a, rim) === 0 || hexDistance(a, entr) <= (entr.r || 0) + 1) ? [] : pathfind(this.surfaceWorld, a, rim, a.clearanceNeeded || 1);
      if(toRim === null) continue;
      const fromEntrToDest = (hexDistance(entr, pt) === 0) ? [] : pathfind(this.world, entr, pt, a.clearanceNeeded || 1);
      if(fromEntrToDest !== null) return true;
     }
    }
    return false;
   }
   setPath(a,path,state){const center={x:Math.round(a.x),y:Math.round(a.y)};if(Math.hypot(a.x-center.x,a.y-center.y)>.001)path.unshift(center);a.path=path;a.state=state;}
   route(a,target,state){
    const antLayer = a.layer || 0;
    const targetLayer = target.layer !== undefined ? target.layer : antLayer;
    if(antLayer !== targetLayer){
     let entr = this.getClosestEntrance(a);
     const entrances = this.surfaceWorld?.entrances && this.surfaceWorld.entrances.length ? this.surfaceWorld.entrances : [entr];
     let bestEntr = entr, bestDist = Infinity;

     if(antLayer === 0 && targetLayer === 1){
      for(const e of entrances){
       const d = hexDistance(a, e);
       if(d < bestDist){
        const toE = (d <= (e.r || 0)) ? [] : pathfind(this.world, a, e, a.clearanceNeeded || 1);
        if(toE !== null){
         bestDist = d;
         bestEntr = e;
        }
       }
      }
      entr = bestEntr;
      if(hexDistance(a, entr) <= (entr.r || 0)){
       const rim = this.surfaceWorld.getAdjacentPassableSurfaceHex(entr.x, entr.y, target);
       a.x = rim.x; a.y = rim.y; a.layer = 1;
       if(a.carry?.creature) a.carry.creature.layer = 1;
       if(a.carry?.resource) a.carry.resource.layer = 1;
       delete a.pendingCrossLayerTarget;
       const p = (hexDistance(a, target) === 0) ? [] : pathfind(this.surfaceWorld, a, target, a.clearanceNeeded || 1);
       if(p === null) return false;
       this.setPath(a, p, state);
       return true;
      }else{
       const p = pathfind(this.world, a, entr, a.clearanceNeeded || 1);
       if(p === null) return false;
       this.setPath(a, p, state);
       a.pendingCrossLayerTarget = { x: target.x, y: target.y, layer: targetLayer, targetState: state };
       return true;
      }
     }else{
      for(const e of entrances){
       const rim = this.surfaceWorld.getAdjacentPassableSurfaceHex(e.x, e.y, a);
       const d = hexDistance(a, rim);
       if(d < bestDist){
        const toRim = (d === 0 || hexDistance(a, e) <= (e.r || 0) + 1) ? [] : pathfind(this.surfaceWorld, a, rim, a.clearanceNeeded || 1);
        if(toRim !== null){
         bestDist = d;
         bestEntr = e;
        }
       }
      }
      entr = bestEntr;
      const rim = this.surfaceWorld.getAdjacentPassableSurfaceHex(entr.x, entr.y, a);
      if(hexDistance(a, rim) === 0 || hexDistance(a, entr) <= (entr.r || 0) + 1){
       a.x = entr.x; a.y = entr.y; a.layer = 0;
       if(a.carry?.creature) a.carry.creature.layer = 0;
       if(a.carry?.resource) a.carry.resource.layer = 0;
       delete a.pendingCrossLayerTarget;
       const p = (hexDistance(a, target) === 0) ? [] : pathfind(this.world, a, target, a.clearanceNeeded || 1);
       if(p === null) return false;
       this.setPath(a, p, state);
       return true;
      }else{
       const p = pathfind(this.surfaceWorld, a, rim, a.clearanceNeeded || 1);
       if(p === null) return false;
       this.setPath(a, p, state);
       a.pendingCrossLayerTarget = { x: target.x, y: target.y, layer: targetLayer, targetState: state };
       return true;
      }
     }
    }
    const w = antLayer === 1 ? this.surfaceWorld : this.world;
    const p = pathfind(w, a, target, a.clearanceNeeded || 1);
    if(p === null) return false;
    this.setPath(a, p, state);
    return true;
   }
  releaseSlot(a){
   const antId=typeof a==='object'?a.id:a;
   for(const c of this.creatures){if(c.slots)c.slots.releaseSlot(antId);}
   for(const r of this.resources){if(r.slots)r.slots.releaseSlot(antId);}
   for(const other of this.ants){if(other.slots)other.slots.releaseSlot(antId);}
   if(typeof a==='object'){
    a.claimedSlot=null;
    a.claimedTargetId=null;
   }
  }
  release(a,unassignSpecial=false){
   if(a.task?.targetId){
    const t=this.target(a.task.targetId);
    if(t?.reservedFor===a.id)t.reservedFor=null;
    if(t?.processingFeederId===a.id)t.processingFeederId=null;
   }
   this.releaseSlot(a);
   if(a.carry?.type==='brood'){
    const b=this.eggs.find(e=>e.id===a.carry.broodId);
    if(b){b.carriedBy=null;b.beingTransportedBy=null;b.x=Math.round(a.x);b.y=Math.round(a.y);}
    a.carry=null;
   }
   for(const egg of this.eggs){
    if(egg.beingFedBy===a.id)egg.beingFedBy=null;
    if(egg.beingTransportedBy===a.id)egg.beingTransportedBy=null;
   }
   a.held=false;a.preferred=null;a.task=null;a.manualOrder=false;a.idleReleaseTimer=0;a.selected=false;
   if(unassignSpecial){a.feeder=false;a.broodHelper=false;}
   if(!a.carry){a.path=[];a.state='idle';a.timer=0;}
  }
 setFeeder(a){if(!a||!isWorkerMorph(a.type)||a.colonyId!==1||!a.alive)return 'Select a living worker to assign as feeder.';if(a.feeder)return 'That ant is already a feeder.';const currentFeeders=this.ants.filter(w=>w.alive&&w.colonyId===1&&w.feeder);if(currentFeeders.length>=this.feederCapacity())return `Feeder cap reached (${currentFeeders.length}/${this.feederCapacity()}). Evolve Feeder specialization to assign more feeders.`;const names=['Antdrew','Antony','BatholANTmuel','Anthondis','Crumb','Teedle','Dale','Carmen','Huuuuucha','Antromeda'];a.feeder=true;a.broodHelper=false;a.actions.feed=true;a.roleName=a.nickname||names[Math.floor(this.random.next()*names.length)];a.held=false;a.task=null;a.path=[];a.state='idle';this.emit(`${a.roleName} is now a colony feeder.`);return null;}
 setBroodHelper(a){if(!a||!isWorkerMorph(a.type)||a.colonyId!==1||!a.alive)return 'Select a living worker to assign as Brood Helper.';if(!this.broodHelperUnlocked)return 'Unlock the Brood Helper role in the Brood Shop first.';if(a.broodHelper)return 'That ant is already a Brood Helper.';a.broodHelper=true;a.feeder=false;a.actions.transportBrood=true;a.actions.feedLarvae=true;a.roleName=a.nickname||'Brood Nurse';a.held=false;a.task=null;a.path=[];a.state='idle';this.emit(`${a.roleName} is now assigned as Brood Helper.`);return null;}
 distributeDestinations(count,center){return AntGame.TaskEngine.distributeDestinations(this.world,count,center);}
 moveGroup(units,target,queue=false){return AntGame.TaskEngine.moveGroup(this,units,target,queue);}
  move(a,target){
   if(!a.alive||a.colonyId!==1)return 'You can order only living ants in your colony.';
   const antLayer = a.layer || 0;
   let targetLayer = target.layer !== undefined ? target.layer : antLayer;
   let destWorld = targetLayer === 1 ? this.surfaceWorld : this.world;
   let c = destWorld?.peek(target.x, target.y);
   const isTargetHole = (c?.layer === 1 || destWorld?.isSurface) && (c?.isHole || c?.terrain === 'entrance' || c?.structure === 'entrance_hole');
   let finalTarget = target;
   if(isTargetHole){
    if(antLayer === 0 && targetLayer === 1 && this.surfaceWorld){
     const rim = this.surfaceWorld.getAdjacentPassableSurfaceHex(target.x, target.y);
     finalTarget = { ...target, x: rim.x, y: rim.y, layer: 1 };
     c = this.surfaceWorld.peek(rim.x, rim.y);
    }else if(antLayer === 1 && targetLayer === 0){
     finalTarget = { ...target, layer: 0 };
     destWorld = this.world;
     c = this.world.peek(target.x, target.y);
    }else if(antLayer === 0 && targetLayer === 0 && this.surfaceWorld){
     targetLayer = 1;
     const rim = this.surfaceWorld.getAdjacentPassableSurfaceHex(target.x, target.y);
     finalTarget = { ...target, x: rim.x, y: rim.y, layer: 1 };
     destWorld = this.surfaceWorld;
     c = this.surfaceWorld.peek(rim.x, rim.y);
    }else{
     return 'Cannot move onto surface holes into the abyss.';
    }
   }
   if(antLayer === 0 && targetLayer === 1 && this.surfaceWorld && !c?.discovered){
    this.surfaceWorld.revealConnectedEntrance(target.x, target.y);
    c = destWorld?.peek(finalTarget.x, finalTarget.y);
   }
   if(!c?.discovered || c.solid || c.water >= 6) return 'No accessible revealed route to that location.';
   if(antLayer === targetLayer){
    if(pathfind(destWorld, a, finalTarget, a.clearanceNeeded || 1) === null) return 'No accessible revealed route to that location.';
   }else{
    if(!this.canReach(a, finalTarget, targetLayer)) return 'No accessible revealed route to entrance.';
   }
   if(a.claimedSlot){
    const t=this.target(a.claimedSlot.targetId);
    if(t?.slots)t.slots.releaseSlot(a.id);
    delete a.claimedSlot;
   }
   if(a.task?.targetId){
    const t=this.target(a.task.targetId);
    if(t?.slots)t.slots.releaseSlot(a.id);
   }
   a.task=null;a.preferred=null;a.held=true;a.manualOrder=true;a.idleReleaseTimer=0;a.pendingTask=null;a.path=[];
   if(a.carry){
    a.pendingMove={...finalTarget, layer: targetLayer};
    this.toStore(a);
   }else{
    this.route(a, {...finalTarget, layer: targetLayer}, 'moving');
   }
   return null;
  }
 designate(x,y,ant=null,colonyId=1){const c=this.world.peek(x,y);if(!c)return false;const isUnbreakable=c.rock||c.zone==='rock'||c.isWell||c.zone==='well'||c.terrain==='hole'||c.zone==='hole'||c.structure==='hole'||c.zone==='pit'||c.hole;if(isUnbreakable){if((c.rock||c.zone==='rock')&&colonyId===1)AntGame.AudioCoordinator?.play('rockStrike');return false;}if(c.discovered&&!c.solid)return false;const id=`${colonyId}:dig:${key(x,y)}`;if(!this.jobs.some(j=>j.id===id)){let status='unknown';const nestPos=colonyId===1?this.nest:(this.colonies.find(cl=>cl.id===colonyId)?.pit||{x,y});if(c&&(c.discovered||colonyId!==1)){const faces=this.world.faces(c,colonyId===1);status=faces.some(f=>pathfind(this.world,nestPos,f)!==null)?'available':'blocked';}this.jobs.push({id,type:'dig',x,y,colonyId,priority:1,status});}if(ant&&isWorkerMorph(ant.type)&&ant.canMine!==false&&ant.alive&&ant.colonyId===colonyId){ant.preferred=id;ant.held=false;ant.manualOrder=true;ant.idleReleaseTimer=0;}return true;}
 designateBuild(x,y,ant=null,structure='food'){return AntGame.Construction.designateBuild(this,x,y,ant,structure);}
 ensureExcavationJob(build,c){return AntGame.Construction.ensureExcavationJob(this,build,c);}
  brush(x,y,r,mode='dig',ants=[],structure='food'){
   let count=0;
   const activeLayer = this.activeLayer === 'surface' ? 1 : 0;
   for(const p of hexDisk(x,y,r)){
    const a=ants.length?ants[count%ants.length]:null;
    if(mode==='cancel'){
     this.cancel(p.x,p.y);
     count++;
    }else if(mode==='build'){
     count+=this.designateBuild(p.x,p.y,a,structure)?1:0;
    }else if(mode==='dig'){
     count+=this.designate(p.x,p.y,a)?1:0;
    }else if(mode==='harvest'){
     const t=this.resources.find(res=>res.remaining>0&&(res.layer||0)===activeLayer&&Math.round(res.x)===p.x&&Math.round(res.y)===p.y)||
             this.creatures.find(cr=>cr.alive&&(cr.layer||0)===activeLayer&&cr.species==='root_aphid'&&Math.round(cr.x)===p.x&&Math.round(cr.y)===p.y);
     if(t&&(!t.reservedFor||(a&&t.reservedFor===a.id))){
      this.orderTarget('harvest',t.id,ants);
      count++;
     }
    }else if(mode==='carry'){
     const t=this.creatures.find(cr=>!cr.alive&&cr.food>0&&!cr.inStorage&&(cr.layer||0)===activeLayer&&Math.round(cr.x)===p.x&&Math.round(cr.y)===p.y)||
             this.resources.find(res=>res.remaining>0&&!res.inStorage&&(res.layer||0)===activeLayer&&Math.round(res.x)===p.x&&Math.round(res.y)===p.y);
     if(t&&!t.carriedBy&&(!t.reservedFor||(a&&t.reservedFor===a.id))){
      this.orderTarget('carry',t.id,ants);
      count++;
     }
    }else if(mode==='attack'){
     const t=this.creatures.find(cr=>cr.alive&&cr.colonyId!==1&&(cr.layer||0)===activeLayer&&Math.round(cr.x)===p.x&&Math.round(cr.y)===p.y);
     if(t){
      this.orderTarget('attack',t.id,ants);
      count++;
     }
    }
   }
   return count;
  }
  // AREA MANAGEMENT: plans are created before painting, so one saved plan can label many hexes.
  createArea(name='Unnamed area',type='territory'){const cleanName=name.trim().slice(0,24)||'Unnamed area',id=`${type}:${cleanName}`;this.areas[id]={name:cleanName,type};return id;}
  paintArea(x,y,nameOrId='Unnamed area',type='territory',radius=0,layer=null){
   const targetLayer = layer !== null ? layer : (this.activeLayer === 'surface' ? 1 : 0);
   const targetWorld = targetLayer === 1 ? this.surfaceWorld : this.world;
   if(!targetWorld) return false;
   if(radius<=0){
    const cell=targetWorld.peek(x,y);if(!cell?.discovered||cell.solid)return false;const id=this.areas[nameOrId]?nameOrId:this.createArea(nameOrId,type),area=this.areas[id];cell.area={id,name:area.name,type:area.type};targetWorld.revision++;return true;
   }
   let count=0;
   for(const p of hexDisk(x,y,radius)){
    const cell=targetWorld.peek(p.x,p.y);
    if(!cell?.discovered||cell.solid)continue;
    const id=this.areas[nameOrId]?nameOrId:this.createArea(nameOrId,type),area=this.areas[id];
    cell.area={id,name:area.name,type:area.type};
    count++;
   }
   if(count>0)targetWorld.revision++;
   return count>0;
  }
  renameArea(id,name){const area=this.areas[id],cleanName=(name||'').trim().slice(0,24);if(!area||!cleanName)return false;const nextId=`${area.type}:${cleanName}`;for(const cell of this.world.cells.values())if(cell.area?.id===id)cell.area={id:nextId,name:cleanName,type:area.type};if(this.surfaceWorld){for(const cell of this.surfaceWorld.cells.values())if(cell.area?.id===id)cell.area={id:nextId,name:cleanName,type:area.type};this.surfaceWorld.revision++;}delete this.areas[id];this.areas[nextId]={name:cleanName,type:area.type};this.world.revision++;return nextId;}
  eraseArea(id){if(!this.areas[id])return false;for(const cell of this.world.cells.values())if(cell.area?.id===id)delete cell.area;if(this.surfaceWorld){for(const cell of this.surfaceWorld.cells.values())if(cell.area?.id===id)delete cell.area;this.surfaceWorld.revision++;}delete this.areas[id];this.world.revision++;return true;}
  // BEHAVIORAL ZONING: operational territory boundaries for foraging, hunting, and spoil-locked stockpiles.
  createZone(name='New zone',type='foraging',options={}){
   let cleanName=(name||'').trim().slice(0,24)||'New zone', zType=type;
   if(cleanName.includes(':')){
    const parts=cleanName.split(':');
    zType=parts[0];
    cleanName=parts.slice(1).join(':');
   }
   const id=`${zType}:${cleanName}`;
   const isExcavation=zType==='excavation';
   this.zones[id]={
    id,
    name:cleanName,
    type:zType,
    layer:options.layer,
    priority:options.priority||2,
    filters:options.filters||{corpses:true,seeds:true,soil:true},
    priorityOverrides:options.priorityOverrides||(isExcavation?{dig:1,haulSoil:2}:{}),
    tiles:options.tiles||[]
   };
   return id;
  }
  paintZone(x,y,nameOrId='New zone',type='foraging',options={},radius=0,layer=null){
   const targetLayer = layer !== null ? layer : (this.activeLayer === 'surface' ? 1 : 0);
   const targetWorld = targetLayer === 1 ? this.surfaceWorld : this.world;
   if(!targetWorld) return {ok:false,error:'Target world unavailable.'};
   if(radius<=0){
    const cell=targetWorld.peek(x,y);
    if(!cell?.discovered)return {ok:false,error:'Cannot zone undiscovered terrain.'};
    let id=nameOrId;
    if(!this.zones[id]){
     let zType=type;
     if(typeof nameOrId==='string'&&nameOrId.includes(':')){
      zType=nameOrId.split(':')[0];
     }
     id=this.createZone(nameOrId,zType,{...options,layer:targetLayer});
    }
    const zone=this.zones[id];
    if(zone.layer===undefined)zone.layer=targetLayer;
    if(zone.type!=='excavation'&&cell.solid)return {ok:false,error:'Cannot zone solid terrain.'};
    const constraint=AntGame.ZoneTileConstraints?.[zone.type];
    if(constraint&&!constraint.validate(cell,targetWorld)){
     return {ok:false,error:constraint.errorMsg||'Invalid tile for this zone type.',id};
    }
    cell.behaviorZone=id;
    const k=key(x,y);
    if(!zone.tiles.includes(k))zone.tiles.push(k);
    if(zone.type==='excavation'&&cell.solid&&targetLayer===0){
     this.designate(x,y);
    }
    targetWorld.revision++;
    return {ok:true,id};
   }
   let count=0,lastErr=null,resId=null;
   for(const p of hexDisk(x,y,radius)){
    const res=this.paintZone(p.x,p.y,nameOrId,type,options,0,targetLayer);
    if(res.ok){count++;resId=res.id;}
    else if(res.error&&!lastErr)lastErr=res.error;
   }
   if(count>0)return {ok:true,id:resId,count};
   return {ok:false,error:lastErr||'No valid tiles in brush radius.'};
  }
  renameZone(id,name){
   const zone=this.zones[id],cleanName=(name||'').trim().slice(0,24);
   if(!zone||!cleanName)return false;
   const nextId=`${zone.type}:${cleanName}`;
   for(const cell of this.world.cells.values())if(cell.behaviorZone===id)cell.behaviorZone=nextId;
   if(this.surfaceWorld){
    for(const cell of this.surfaceWorld.cells.values())if(cell.behaviorZone===id)cell.behaviorZone=nextId;
    this.surfaceWorld.revision++;
   }
   delete this.zones[id];
   zone.id=nextId;zone.name=cleanName;
   this.zones[nextId]=zone;
   for(const sq of this.squads)if(sq.zoneId===id)sq.zoneId=nextId;
   this.world.revision++;
   return nextId;
  }
  eraseZone(id){
   if(!this.zones[id])return false;
   const zone=this.zones[id];
   if(zone.type==='excavation'){
    for(const k of zone.tiles){
     const[x,y]=k.split(',').map(Number);
     const jobId=`1:dig:${key(x,y)}`;
     this.jobs=this.jobs.filter(j=>j.id!==jobId);
    }
   }
   for(const cell of this.world.cells.values())if(cell.behaviorZone===id)delete cell.behaviorZone;
   if(this.surfaceWorld){
    for(const cell of this.surfaceWorld.cells.values())if(cell.behaviorZone===id)delete cell.behaviorZone;
    this.surfaceWorld.revision++;
   }
   delete this.zones[id];
   for(const sq of this.squads)if(sq.zoneId===id)sq.zoneId=null;
   this.world.revision++;
   return true;
  }
  getZone(id){return this.zones[id]||null;}
  isHexInZone(x,y,zoneId,layer=null){
   if(!zoneId)return false;
   if(layer===1)return this.surfaceWorld?.peek(x,y)?.behaviorZone===zoneId;
   if(layer===0)return this.world.peek(x,y)?.behaviorZone===zoneId;
   const z=this.zones[zoneId];
   if(z&&z.layer!==undefined){
    const w=z.layer===1?this.surfaceWorld:this.world;
    return w?.peek(x,y)?.behaviorZone===zoneId;
   }
   return (this.surfaceWorld?.peek(x,y)?.behaviorZone===zoneId) || (this.world.peek(x,y)?.behaviorZone===zoneId);
  }
  getZoneTiles(zoneId){
   const z=this.zones[zoneId];
   if(!z)return [];
   return z.tiles.map(k=>{const[x,y]=k.split(',').map(Number);return{x,y};});
  }
  getAntSquad(antId){
   for(let i=1;i<=9;i++){
    if(this.groups[i]&&this.groups[i].includes(antId))return this.squads[i];
   }
   return null;
  }
  assignSquadToZone(squadId,zoneId,strictBounds=false,role='auto'){
   if(!this.squads[squadId])return false;
   this.squads[squadId].zoneId=zoneId;
   this.squads[squadId].strictBounds=Boolean(strictBounds);
   this.squads[squadId].role=role;
   return true;
  }
  setSquadPriorityOverride(squadId,taskType,priority){
   if(!this.squads[squadId])return false;
   if(!this.squads[squadId].priorityOverrides)this.squads[squadId].priorityOverrides={};
   if(priority===null||priority===undefined){
    delete this.squads[squadId].priorityOverrides[taskType];
   }else{
    this.squads[squadId].priorityOverrides[taskType]=Math.max(1,Math.min(10,Math.round(Number(priority))));
   }
   this.world.revision++;
   return true;
  }
  syncExcavationZones(){
   for(const [zId, zone] of Object.entries(this.zones)){
    if(zone.type!=='excavation')continue;
    for(const k of zone.tiles){
     const [x, y]=k.split(',').map(Number);
     const cell=this.world.peek(x, y);
     if(cell && cell.solid && cell.discovered){
      const isUnbreakable=cell.rock||cell.zone==='rock'||cell.isWell||cell.zone==='well'||cell.terrain==='hole'||cell.zone==='hole'||cell.structure==='hole'||cell.zone==='pit'||cell.hole;
      if(!isUnbreakable){
       this.designate(x, y);
      }
     }
    }
   }
  }
 cancel(x,y){return AntGame.Construction.cancel(this,x,y);}
  target(id){return this.resources.find(r=>r.id===id)||this.creatures.find(c=>c.id===id)||this.ants.find(a=>a.id===id);}
   orderTarget(kind,id,ants=[],queue=false){
    const t=this.target(id);
    const tLayer = t?.layer || 0;
    const tWorld = tLayer === 1 ? this.surfaceWorld : this.world;
    if(!t||!tWorld?.peek(Math.round(t.x),Math.round(t.y))?.discovered)return 'No visible target.';
    if(kind==='attack'&&!t.alive)return 'That target is already dead.';
    if(kind==='carry'){
     if(t.alive)return 'Cannot carry a living creature.';
     if(t.carriedBy)return 'That object is already being carried.';
     if(t.inStorage)return 'That object is already in storage.';
    }
    if(kind==='harvest'&&t.species==='root_aphid'&&t.milkCooldown>0)return 'That Root Aphid needs time before it can be milked again.';
    if(kind==='harvest'&&t.species!=='root_aphid'&&((t.remaining===undefined&&(!t.food||t.alive))||(t.remaining!==undefined&&t.remaining<=0)))return 'Choose a discovered food source, Root Aphid, or dead creature with food remaining.';
    const units=(ants.length?ants:this.ants.filter(a=>isCommandable(a.type)&&a.alive&&a.colonyId===1));
    const commandable=units.filter(a=>isCommandable(a.type)&&a.alive&&a.colonyId===1);
    if(!commandable.length)return 'No commandable ant is selected.';
    if(kind==='carry'){
     const carrier=commandable.find(a=>canCarry(a,t)&&this.canReach(a,{x:Math.round(t.x),y:Math.round(t.y)},tLayer));
     if(!carrier)return 'None of the selected ants are strong enough or have a clear path to carry that object.';
     if(queue&&(carrier.path?.length||carrier.task)){
      carrier.orderQueue=carrier.orderQueue||[];
      carrier.orderQueue.push({type:'carry',targetId:t.id});
      return null;
     }
     t.reservedFor=carrier.id;
     carrier.held=false;carrier.preferred=null;carrier.path=[];carrier.manualOrder=true;carrier.idleReleaseTimer=0;
     const carryTask={type:'carry',targetId:t.id,source:'manual'};
     const foodCap=carrier.maxFoodNeed||C.antFoodCapacity;
     if((carrier.foodNeed??foodCap)<foodCap*0.4){
      const nearby=this.antNeedSource(carrier,'food');
      if(nearby&&nearby.distance<=5){
       carrier.pendingCarry=carryTask;
       carrier.task={type:'need-food',source:'needs',needSource:nearby};
       this.route(carrier,nearby.point,'need-food');
       return null;
      }
     }
     carrier.task=carryTask;
     this.route(carrier,{x:Math.round(t.x),y:Math.round(t.y),layer:tLayer},'to-carry');
     return null;
    }
    const isLargeTarget = t.species === 'hercules' || t.species === 'spider' || t.species === 'worm' || (t.radius || 0) >= 1.5 || t.type === 'queen';
    if(AntGame.HexInteractionSlots && !t.slots){
     t.slots = new AntGame.HexInteractionSlots(t, isLargeTarget ? 2 : 1);
    }
    let orders=0;
    for(const a of commandable){
     const canReachDirect = this.canReach(a,{x:Math.round(t.x),y:Math.round(t.y)},tLayer);
     const acrossTrench = kind==='attack' && tLayer===0 && (a.layer||0)===0 && (AntGame.isAcrossOneTileTrench?.(this.world,a,t) || false);
     let trenchApproach = null;
     if(!canReachDirect && !acrossTrench && kind === 'attack' && tLayer === 0){
      const tx = Math.round(t.x), ty = Math.round(t.y);
      for(const mid of this.world.neighbors(tx, ty)){
       if(!mid.solid && (mid.zone === 'trench' || mid.structure === 'trench')){
        for(const lip of this.world.neighbors(mid.x, mid.y)){
         if(!lip.solid && hexDistance(lip, {x: tx, y: ty}) === 2){
          const p = pathfind(this.world, a, lip, a.clearanceNeeded || 1);
          if(p !== null){
           trenchApproach = lip;
           break;
          }
         }
        }
        if(trenchApproach) break;
       }
      }
     }
     if(!canReachDirect && !acrossTrench && !trenchApproach)continue;
     if(queue&&(a.path?.length||a.task)){
      a.orderQueue=a.orderQueue||[];
      a.orderQueue.push({type:kind,targetId:id});
      orders++;
      continue;
     }
     const order={type:kind,targetId:id,source:'manual'};
     a.held=false;a.preferred=null;a.manualOrder=true;a.idleReleaseTimer=0;
     if(a.carry){a.pendingTask=order;this.toStore(a);}
     else{
      a.path=[];a.task=order;a.state=kind;a.timer=0;
      if(trenchApproach) this.route(a, trenchApproach, kind);
      else{
       let targetCoord = {x:Math.round(t.x),y:Math.round(t.y),layer:tLayer};
       if(t.slots){
        const slot = t.slots.claimBestSlot(a, tWorld);
        if(slot){
         targetCoord = {x:slot.targetQ,y:slot.targetR,layer:tLayer};
         a.claimedSlot = {targetId:t.id,slotIndex:slot.slotIndex,dq:slot.dq,dr:slot.dr};
        }
       }
       this.route(a, targetCoord, kind);
      }
     }
     orders++;
    }
    if(!orders)return 'Target blocked: open a tunnel to it first.';
    if(kind==='attack'&&t.colonyId){const col=this.colonies.find(c=>c.id===t.colonyId);if(col)col.relation='hostile';}
    return null;
   }
  executeNextOrder(a){
   if(!a.orderQueue||!a.orderQueue.length){
    a.state='idle';a.task=null;a.manualOrder=false;return;
   }
   const next=a.orderQueue.shift();
   if(next.type==='move'){
    this.route(a,next.point,'moving');
   }else if(next.type==='attack'||next.type==='carry'||next.type==='harvest'){
    this.orderTarget(next.type,next.targetId,[a]);
   }
  }
  storage(a){
   if(a.carry?.type==='food'||a.carry?.type==='corpse'||a.carry?.type==='seed'){
    if(a.colonyId===1){
     if(a.feeder&&a.carry?.type==='food'){
      const q=this.queen();
      if(q&&(q.food??200)<(q.maxFood||200)*0.98){
       return {point:this.nest,kind:'queen'};
      }
     }
     // Check active Stockpile zones locked to spoil tiles (for corpses and seeds only)
     if(a.carry?.type==='corpse'||a.carry?.type==='seed'){
      const stockpiles = Object.values(this.zones).filter(z => {
       if (z.type !== 'stockpile') return false;
       if (a.carry?.type === 'corpse' && z.filters?.corpses === false) return false;
       if (a.carry?.type === 'seed' && z.filters?.seeds === false) return false;
       return true;
      });
      if (stockpiles.length) {
       stockpiles.sort((z1, z2) => (z2.priority || 2) - (z1.priority || 2));
       for (const sp of stockpiles) {
        const candidateTiles = [];
        for (const k of sp.tiles) {
         const [tx, ty] = k.split(',').map(Number);
         const c = this.world.peek(tx, ty);
         const reachable = a.layer === 1 ? (pathfind(this.world, this.getClosestEntrance(a), c) !== null) : (pathfind(this.world, a, c) !== null);
         if (c && c.zone === 'spoil' && !c.solid && c.discovered && reachable) {
          candidateTiles.push({ point: c, dist: dist(a, c) });
         }
        }
        if (candidateTiles.length) {
         candidateTiles.sort((x, y) => x.dist - y.dist);
         return { point: candidateTiles[0].point, kind: 'stockpile', zoneId: sp.id, layer: 0 };
        }
       }
      }
     }
     const fs=[...this.world.cells.values()].find(c=>{
      if(c.zone!=='food-store'||c.solid||!c.discovered)return false;
      return a.layer === 1 ? (pathfind(this.world, this.getClosestEntrance(a), c) !== null) : (pathfind(this.world, a, c) !== null);
     });
     return {point:fs||this.world.founding.foodStore||this.nest,kind:'food-store',layer:0};
    }else{
     const col=this.colonies.find(c=>c.id===a.colonyId);
     return col?{point:col.foodStore||{x:col.x+1,y:col.y},kind:'food-store',colonyId:col.id,layer:0}:null;
    }
   }
   if(a.carry?.type==='water'){
    if(a.colonyId===1){
     const q=this.queen();
     const queenNeedsWater=q&&(q.water??100)<(q.maxWater||100)*0.98;
     if(queenNeedsWater){
      return {point:this.nest,kind:'queen',layer:0};
     }
     if(this.waterTarget==='reservoir'){const r=this.reservoirDestination(a);if(r)return {...r,layer:0};}
     return {point:this.nest,kind:'queen',layer:0};
    }else{
     const col=this.colonies.find(c=>c.id===a.colonyId);
     return col?{point:col.waterStore||{x:col.x-1,y:col.y},kind:'water-store',colonyId:col.id,layer:0}:null;
    }
   }
   if(a.colonyId!==1){const col=this.colonies.find(c=>c.id===a.colonyId);return col?{point:col.pit,kind:'foreign',colonyId:col.id,layer:0}:null;}
   // Check active Stockpile zones on spoil tiles that accept soil
   const soilStockpiles = Object.values(this.zones).filter(z => z.type === 'stockpile' && z.filters?.soil !== false);
   if(soilStockpiles.length){
    soilStockpiles.sort((z1, z2) => (z2.priority || 2) - (z1.priority || 2));
    for(const sp of soilStockpiles){
     const candidateTiles = [];
     for(const k of sp.tiles){
      const [tx, ty] = k.split(',').map(Number);
      const c = this.world.peek(tx, ty);
      const reachable = a.layer === 1 ? (pathfind(this.world, this.getClosestEntrance(a), c) !== null) : (pathfind(this.world, a, c) !== null);
      if(c && c.zone === 'spoil' && !c.solid && c.discovered && reachable){
       candidateTiles.push({ point: c, dist: dist(a, c) });
      }
     }
     if(candidateTiles.length){
      candidateTiles.sort((x, y) => x.dist - y.dist);
      return { point: candidateTiles[0].point, kind: 'stockpile', zoneId: sp.id, layer: 0 };
     }
    }
   }
   for(const pit of this.world.pits){
    const reachable = a.layer === 1 ? (pathfind(this.world, this.getClosestEntrance(a), pit) !== null) : (pathfind(this.world, a, pit) !== null);
    if(pit.used < pit.capacity && reachable) return {point: pit, kind: 'pit', pit, layer: 0};
   }
   const spoilCells=[...this.world.cells.values()].filter(c=>{
    if(c.zone!=='spoil'||c.solid)return false;
    return a.layer === 1 ? (pathfind(this.world, this.getClosestEntrance(a), c) !== null) : (pathfind(this.world, a, c) !== null);
   });
   if(spoilCells.length){
    spoilCells.sort((x, y) => {
     const xSolid = this.world.neighbors(x.x, x.y).filter(n => n.solid).length;
     const ySolid = this.world.neighbors(y.x, y.y).filter(n => n.solid).length;
     return ySolid - xSolid;
    });
    return {point:spoilCells[0],kind:'spoil',layer:0};
   }
   return null;
  }
  toStore(a){this.releaseSlot(a);const dest=this.storage(a);a.destination=dest;if(!dest||!this.route(a,{...dest.point,layer:dest.layer!==undefined?dest.layer:0},'carrying')){a.state='blocked';a.timer=1;}}
  routeToBuildSupply(a){return AntGame.Construction.routeToBuildSupply(this,a);}
  routeToBuild(a){return AntGame.Construction.routeToBuild(this,a);}
  refreshJobStates(){return AntGame.Construction.refreshJobStates(this);}
  findAvailableCarryTarget(a){
   const candidates=[];
   const squad=this.getAntSquad?this.getAntSquad(a.id):null;
   for(const c of this.creatures){
    if(!c.alive&&c.food>0&&!c.inStorage&&!c.carriedBy&&(!c.reservedFor||c.reservedFor===a.id)){
     const canSolo=AntGame.canCarry(a,c);
     const canCoop=(squad?.role==='hauler')&&!canSolo&&(AntGame.CasteHaulPower[a.type]||0)>0&&(!c.haulers||c.haulers.length<4);
     if(canSolo||canCoop){
      const pt={x:Math.round(c.x),y:Math.round(c.y)};
      const cLayer=c.layer||0;
      const targetWorld=cLayer===1?this.surfaceWorld:this.world;
      if(targetWorld?.peek(pt.x,pt.y)?.discovered){
       const inZone=squad?.zoneId?this.isHexInZone(pt.x,pt.y,squad.zoneId,cLayer):false;
       if(!squad?.strictBounds||!squad?.zoneId||inZone){
        candidates.push({target:c,point:pt,layer:cLayer,dist:dist(a,{...pt,layer:cLayer}),inZone});
       }
      }
     }
    }
   }
   for(const r of this.resources){
    if(r.remaining>0&&r.foodType!=='berries'&&!r.inStorage&&!r.carriedBy&&(!r.reservedFor||r.reservedFor===a.id)&&AntGame.canCarry(a,r)){
     const pt={x:Math.round(r.x),y:Math.round(r.y)};
     const rLayer=r.layer||0;
     const targetWorld=rLayer===1?this.surfaceWorld:this.world;
     if(targetWorld?.peek(pt.x,pt.y)?.discovered){
      const inZone=squad?.zoneId?this.isHexInZone(pt.x,pt.y,squad.zoneId,rLayer):false;
      if(!squad?.strictBounds||!squad?.zoneId||inZone){
       candidates.push({target:r,point:pt,layer:rLayer,dist:dist(a,{...pt,layer:rLayer}),inZone});
      }
     }
    }
   }
   if(squad?.zoneId){
    candidates.sort((x,y)=>(y.inZone?1:0)-(x.inZone?1:0)||(x.dist-y.dist));
   }else{
    candidates.sort((x,y)=>x.dist-y.dist);
   }
   for(const cand of candidates){
    if(this.canReach(a,cand.point,cand.layer)){
     return cand.target;
    }
   }
   return null;
  }
  findAvailableHarvestTarget(a){
   const candidates=[];
   const squad=this.getAntSquad?this.getAntSquad(a.id):null;
   if(this.surfaceWorld && this.lastBerrySyncTime !== this.time){
    this.lastBerrySyncTime = this.time;
    for(const cell of this.surfaceWorld.cells.values()){
     if(cell.zone==='berry_bush'&&cell.hasBerries&&cell.discovered){
      if(!this.resources.some(r=>r.layer===1&&r.foodType==='berries'&&Math.round(r.x)===cell.x&&Math.round(r.y)===cell.y&&r.remaining>0)){
       this.resources.push({
        id:`berries-${cell.x},${cell.y}`,
        foodType:'berries',
        x:cell.x,
        y:cell.y,
        layer:1,
        remaining:20,
        initial:20,
        decay:0,
        state:'active'
       });
      }
     }
    }
   }
   for(const r of this.resources){
    if(r.remaining>0&&!r.inStorage&&!r.carriedBy&&(!r.reservedFor||r.reservedFor===a.id)){
     const pt={x:Math.round(r.x),y:Math.round(r.y)};
     const rLayer=r.layer||0;
     const targetWorld=rLayer===1?this.surfaceWorld:this.world;
     if(targetWorld?.peek(pt.x,pt.y)?.discovered){
      const inZone=squad?.zoneId?this.isHexInZone(pt.x,pt.y,squad.zoneId,rLayer):false;
      if(!squad?.strictBounds||!squad?.zoneId||inZone){
       candidates.push({target:r,point:pt,layer:rLayer,dist:dist(a,{...pt,layer:rLayer}),inZone});
      }
     }
    }
   }
   for(const c of this.creatures){
    if(c.alive&&c.species==='root_aphid'&&c.milkCooldown<=0){
     const pt={x:Math.round(c.x),y:Math.round(c.y)};
     const cLayer=c.layer||0;
     const targetWorld=cLayer===1?this.surfaceWorld:this.world;
     if(targetWorld?.peek(pt.x,pt.y)?.discovered){
      const inZone=squad?.zoneId?this.isHexInZone(pt.x,pt.y,squad.zoneId,cLayer):false;
      if(!squad?.strictBounds||!squad?.zoneId||inZone){
       candidates.push({target:c,point:pt,layer:cLayer,dist:dist(a,{...pt,layer:cLayer}),inZone});
      }
     }
    }
   }
   if(squad?.zoneId){
    candidates.sort((x,y)=>(y.inZone?1:0)-(x.inZone?1:0)||(x.dist-y.dist));
   }else{
    candidates.sort((x,y)=>x.dist-y.dist);
   }
   for(const cand of candidates){
    if(this.canReach(a,cand.point,cand.layer)){
     return cand.target;
    }
   }
   return null;
  }
   findAvailableJobs(a,type){
    return this.jobs.filter(j=>{
     if(j.colonyId!==a.colonyId||j.type!==type||j.status!=='available'||this.ants.some(b=>b.id!==a.id&&b.task?.id===j.id))return false;
     if(j.type==='dig'){
      const c=this.world.peek(j.x,j.y);
      if(!c)return false;
      const isUnbreakable=c.rock||c.zone==='rock'||c.isWell||c.zone==='well'||c.terrain==='hole'||c.zone==='hole'||c.structure==='hole'||c.zone==='pit'||c.hole;
      if(isUnbreakable)return false;
     }
     return true;
    });
   }
  dispatchJob(a,jobs,type){
   const goals=new Map();
   const aLayer = a.layer || 0;
   for(const j of jobs){
    const jLayer = j.layer !== undefined ? j.layer : aLayer;
    const targetWorld = jLayer === 1 ? (this.surfaceWorld || this.world) : this.world;
    const c=targetWorld.peek(j.x,j.y);
    if(!c)continue;
    const isWater = (c.water || 0) >= 6 || c.terrain === 'water' || c.zone === 'stream' || c.zone === 'pond';
    if(j.type==='build' && (isWater || c.solid)){
     for(const face of targetWorld.faces(c,a.colonyId===1)){
      const k=key(face.x,face.y);if(!goals.has(k))goals.set(k,{job:j,face});
     }
     continue;
    }
    if(j.type==='build'&&!c.solid){goals.set(key(c.x,c.y),{job:j,face:c});continue;}
    if(j.type==='dig'&&j.buildId&&!c.solid){goals.set(key(c.x,c.y),{job:j,face:c});continue;}
    if(j.type==='dig'&&c.solid)for(const face of targetWorld.faces(c,a.colonyId===1)){
     const k=key(face.x,face.y);if(!goals.has(k))goals.set(k,{job:j,face});
    }
   }
   const worldForRoute = aLayer === 1 ? (this.surfaceWorld || this.world) : this.world;
   const result=findRoute(worldForRoute,a,goals,a.clearanceNeeded||1);
   if(!result){a.timer=1;a.state='idle';return false;}
   a.task={...result.goal.job,face:{x:result.goal.face.x,y:result.goal.face.y},source:a.preferred?'manual':'colony'};
   if(a.task.type==='build')this.routeToBuildSupply(a);
   else this.setPath(a,result.path,'to-dig');
   return true;
  }
  dispatchDrop(a,drops){
   const goals=new Map();
   for(const drop of drops){
    const c=this.world.peek(drop.x,drop.y);
    if(c&&!c.solid)goals.set(key(drop.x,drop.y),{drop});
   }
   const result=findRoute(this.world,a,goals,a.clearanceNeeded||1);
   if(!result||!result.goal.drop){a.timer=1;a.state='idle';return false;}
   result.goal.drop.claimed=a.id;
   a.task={type:'recover',dropId:result.goal.drop.id};
   this.setPath(a,result.path,'recover');
   return true;
  }
  executeChosenTask(a,chosen){return AntGame.TaskEngine.executeChosenTask(this,a,chosen);}
  assign(a){return AntGame.TaskEngine.assign(this,a);}
  feederNeed(){
   const q=this.queen();
   if(q){
    if(q.tendingWater){if((q.water??100)>=(q.maxWater||100)*0.98)q.tendingWater=false;}
    else if((q.water??100)<(q.maxWater||100)*(C.queenWaterThresholdRatio||0.80))q.tendingWater=true;
    if(q.tendingFood){if((q.food??200)>=(q.maxFood||200)*0.98)q.tendingFood=false;}
    else if((q.food??200)<(q.maxFood||200)*(C.queenFeedThresholdRatio||0.80))q.tendingFood=true;
   }
   if(q&&(q.water??100)<=20)return 'water';
   if(q&&(q.food??200)<=20)return 'food';
   if(q&&q.tendingWater)return 'water';
   if(q&&q.tendingFood)return 'food';
   if(this.waterTarget==='reservoir'&&this.reservoirWater()<this.waterStore.tiles.length*C.waterStoragePerTile)return 'water';
   if(this.water<this.waterCapacity()*(C.queenWaterThresholdRatio||0.80))return 'water';
   if(this.food<this.foodCapacity()*(C.queenFeedThresholdRatio||0.80))return 'food';
   return null;
  }
  // FEEDER TARGETING: food sources include discovered loose food and edible corpses.
  feederSource(a,need){
   if(need==='food'){
    if(a.actions?.gatherFood===false||a.actions?.selfFeed===false)return null;
    const q=this.queen();
    if(q){
     if(q.tendingFood){if((q.food??200)>=(q.maxFood||200)*0.98)q.tendingFood=false;}
     else if((q.food??200)<(q.maxFood||200)*(C.queenFeedThresholdRatio||0.80))q.tendingFood=true;
    }
    const queenNeedsFood=q&&Boolean(q.tendingFood);
    if(queenNeedsFood&&this.food>=1){
     const pt=AntGame.Inventory?.getFoodSourceTile(this,a);
     if(pt&&pathfind(this.world,a,pt)!==null)return {point:pt,x:pt.x,y:pt.y,feedKind:'colony-food',kind:'colony-food'};
    }
     const aLayer=a.layer||0;
     const visible=r=>{
      const rLayer=r.layer||0;
      if(rLayer!==aLayer)return false;
      const targetWorld=rLayer===1?this.surfaceWorld:this.world;
      return targetWorld?.peek(Math.round(r.x),Math.round(r.y))?.discovered&&dist(a,r)<=C.feederRange;
     };
     const looseFood=this.resources.filter(r=>r.remaining>0&&!r.inStorage&&!r.carriedBy&&(!r.reservedFor||r.reservedFor===a.id)&&visible(r)).map(r=>({...r,feedKind:'resource'}));
     const corpses=this.creatures.filter(c=>!c.alive&&c.food>0&&!c.inStorage&&!c.carriedBy&&(!c.reservedFor||c.reservedFor===a.id)&&visible(c)).map(c=>({...c,feedKind:'corpse'}));
    return [...looseFood,...corpses].sort((x,y)=>dist(a,x)-dist(a,y))[0];
   }
   if(a.actions?.gatherWater===false||a.actions?.selfWater===false)return null;
   const q=this.queen();
   if(q){
    if(q.tendingWater){if((q.water??100)>=(q.maxWater||100)*0.98)q.tendingWater=false;}
    else if((q.water??100)<(q.maxWater||100)*(C.queenWaterThresholdRatio||0.80))q.tendingWater=true;
   }
   const queenNeedsWater=q&&Boolean(q.tendingWater);
   if(queenNeedsWater&&this.water>=1){
    if(pathfind(this.world,a,this.nest)!==null)return {point:this.nest,x:this.nest.x,y:this.nest.y,feedKind:'colony-water',kind:'colony-water'};
   }
   if(this.reservoirWater()>0){
    const res=AntGame.Inventory?.reservoirSource(this,a);
    if(res)return {...res.tile,point:res.point,feedKind:'reservoir',kind:'reservoir',isReservoir:true};
   }
   const cells=[...this.world.activeWater].map(k=>this.world.cells.get(k)).filter(c=>c&&c.discovered&&c.water>=0.35&&!c.waterStorage&&dist(a,c)<=C.feederRange);
   if(!cells.length){
    cells.push(...[...this.world.activeWater].map(k=>this.world.cells.get(k)).filter(c=>c&&c.discovered&&c.water>0.01&&!c.waterStorage&&dist(a,c)<=C.feederRange));
   }
   for(const cell of cells){
    const point=pathfind(this.world,a,cell)?cell:(this.world.faces(cell).find(n=>pathfind(this.world,a,n)!=null)||cell);
    if(pathfind(this.world,a,point)!=null)return {...cell,point,feedKind:'water'};
   }
   return null;
  }
 assignFeeder(a){if(a.actions?.feed===false)return false;const need=this.feederNeed();if(!need)return false;const source=this.feederSource(a,need);if(!source)return false;const p=source.point||{x:Math.round(source.x),y:Math.round(source.y)};if(pathfind(this.world,a,p)===null)return false;a.task={type:`feed-${need}`,targetId:source.id||key(source.x,source.y),sourceKind:source.feedKind,source};this.route(a,p,`feeding-${need}`);return true;}
 // ANT HUNGER AND THIRST: personal supplies drain independently from queen stores for all colonies.
 drainAntNeeds(a,dt){
  if(a.type==='queen')return;
  const mult=a.drainMult||1;
  const foodCap=a.maxFoodNeed||C.antFoodCapacity,waterCap=a.maxWaterNeed||C.antWaterCapacity;
  a.foodNeed=Math.max(0,(a.foodNeed??foodCap)-C.antFoodDrainPerSecond*mult*dt);
  a.waterNeed=Math.max(0,(a.waterNeed??waterCap)-C.antWaterDrainPerSecond*mult*dt);
  let damage=0;
  if(a.foodNeed<=0)damage+=C.antStarvationDamagePerSecond;
  if(a.waterNeed<=0)damage+=C.antDehydrationDamagePerSecond;
   if(damage){a.health-=damage*dt;if(a.health<=0)this.kill(a,null,a.foodNeed<=0?'starvation':'dehydration');}
 }
 antNeedType(a){const foodCap=a.maxFoodNeed||C.antFoodCapacity,waterCap=a.maxWaterNeed||C.antWaterCapacity;const foodThreshold=Math.max(0,Math.min(1,this.antFoodNeedRatio)),waterThreshold=Math.max(0,Math.min(1,this.antWaterNeedRatio));if(a.foodNeed<foodCap*foodThreshold)return 'food';if(a.waterNeed<waterCap*waterThreshold)return 'water';return null;}
 antNeedProtected(a){return a.held||a.state==='attack'||a.threatId||a.task?.source==='manual'||a.task?.source==='defense'||a.task?.source==='threat-report';}
 // NEED SOURCES: colony stores, discovered loose food/corpses, reservoirs, and safe terrain water. Ants never take from the Queen.
  antNeedSource(a,type){
   const aLayer=a.layer||0;
   const targetWorld=aLayer===1?this.surfaceWorld:this.world;
   const reachable=point=>pathfind(targetWorld,a,point,a.clearanceNeeded||1)!==null;
   if(type==='food'){
    const isStarving=a.foodNeed<=0||a.foodNeed<(a.maxFoodNeed||C.antFoodCapacity)*0.1;
    const choices=[];
    if(a.colonyId===1){
     if(this.food>0){
      const pt=AntGame.Inventory?.getFoodSourceTile(this,a);
      if(pt&&reachable(pt)){
       choices.push({kind:'food-store',point:pt,distance:dist(a,pt)});
      }
     }
    }else{
     const col=this.colonies.find(c=>c.id===a.colonyId);
     if(col&&col.food>0){
      const pt=col.foodStore||{x:col.x+1,y:col.y};
      if(reachable(pt))choices.push({kind:'food-store',point:pt,colonyId:col.id,distance:dist(a,pt)});
     }
    }
    // Loose edible resources (non-stored, non-carried, unreserved)
    for(const resource of this.resources){
     const rLayer=resource.layer||0;
     if(rLayer!==aLayer)continue;
     if(resource.remaining>=1&&!resource.inStorage&&!resource.carriedBy&&(!resource.reservedFor||resource.reservedFor===a.id)&&targetWorld?.peek(Math.round(resource.x),Math.round(resource.y))?.discovered&&reachable(resource)){
      choices.push({kind:'resource',resource,point:{x:Math.round(resource.x),y:Math.round(resource.y)},distance:dist(a,resource)});
     }
    }
    // If edible processed rations or loose food exist, pick closest!
    if(choices.length){
     return choices.sort((x,y)=>x.distance-y.distance)[0];
    }
    // Emergency starvation exception: only if starving and no processed food is reachable
    if(isStarving){
     const rawChoices=[];
     for(const creature of this.creatures){
      const cLayer=creature.layer||0;
      if(cLayer!==aLayer)continue;
      if(!creature.alive&&creature.food>=1&&!creature.carriedBy&&(!creature.reservedFor||creature.reservedFor===a.id)&&targetWorld?.peek(Math.round(creature.x),Math.round(creature.y))?.discovered&&reachable(creature)){
       rawChoices.push({kind:'corpse',creature,point:{x:Math.round(creature.x),y:Math.round(creature.y)},distance:dist(a,creature)});
      }
     }
     for(const resource of this.resources){
      const rLayer=resource.layer||0;
      if(rLayer!==aLayer)continue;
      if(resource.remaining>=1&&resource.inStorage&&!resource.carriedBy&&(!resource.reservedFor||resource.reservedFor===a.id)&&reachable(resource)){
       rawChoices.push({kind:'resource',resource,point:{x:Math.round(resource.x),y:Math.round(resource.y)},distance:dist(a,resource)});
      }
     }
     if(rawChoices.length){
      return rawChoices.sort((x,y)=>x.distance-y.distance)[0];
     }
    }
    return null;
   }
   // Water: Ants seek real water sources (reservoirs, wells, terrain pools) - never take from queen!
   const choices=[];
   if(a.colonyId===1){
    if(this.waterStore.tiles.length){
     for(const tile of this.waterStore.tiles){
      const source=this.reservoirSource(a);
      if(source)choices.push({kind:'reservoir',tile:source.tile,point:source.point,distance:dist(a,source.point)});
      break;
     }
    }else if(this.water>0){
     const pt=this.world.founding?.waterStore||this.nest;
     if(reachable(pt))choices.push({kind:'water-store',point:pt,distance:dist(a,pt)});
    }
   }else{
    const col=this.colonies.find(c=>c.id===a.colonyId);
    if(col&&col.water>0){
     const pt=col.waterStore||{x:col.x-1,y:col.y};
     if(reachable(pt))choices.push({kind:'water-store',point:pt,colonyId:col.id,distance:dist(a,pt)});
    }
   }
   for(const k of this.world.activeWater){
    const cell=this.world.cells.get(k);
    if(cell&&(cell.discovered||a.colonyId!==1)&&cell.water>=0.35){
     const faces=this.world.faces(cell,a.colonyId!==1);
     const point=faces.find(n=>reachable(n))||(reachable(cell)?cell:null);
     if(point)choices.push({kind:cell.waterStorage?'reservoir':cell.isWell?'well':'terrain-water',cell,point,distance:dist(a,point)});
    }
   }
   return choices.sort((x,y)=>x.distance-y.distance)[0]||null;
 }
 assignAntNeed(a){const type=this.antNeedType(a);if(!type||this.antNeedProtected(a)||a.carry||a.task||a.state==='need-food'||a.state==='need-water')return false;const source=this.antNeedSource(a,type);if(!source)return false;a.task={type:`need-${type}`,source:'needs',needSource:source};if(this.route(a,source.point,`need-${type}`))return true;a.task=null;return false;}
 consumeAntNeed(a){
  const type=a.task?.type?.replace('need-',''),source=a.task?.needSource;
  if(!type||!source){a.state='idle';return;}
  const capacity=type==='food'?(a.maxFoodNeed||C.antFoodCapacity):(a.maxWaterNeed||C.antWaterCapacity),current=type==='food'?a.foodNeed:a.waterNeed,gap=Math.max(0,capacity-current);
  let amount=0;
  if(type==='food'){
   if(source.kind==='food-store'){
    if(source.colonyId){const col=this.colonies.find(c=>c.id===source.colonyId);amount=Math.min(gap,col?.food||0);if(col)col.food-=amount;}
    else amount=this.spendFood(gap);
   }else if(source.kind==='resource'){
    amount=Math.min(gap,source.resource.remaining);source.resource.remaining-=amount;source.resource.decay=0;
    if(source.resource.remaining<=0.001){this.resources=this.resources.filter(r=>r!==source.resource);}
   }else if(source.kind==='corpse'){
    amount=Math.min(gap,source.creature.food);source.creature.food-=amount;
    if(source.creature.food<=0.001){this.creatures=this.creatures.filter(c=>c!==source.creature);}
   }
  }else{
   if(source.kind==='water-store'){
    if(source.colonyId){
     const col=this.colonies.find(c=>c.id===source.colonyId);amount=Math.min(gap,col?.water||0);if(col)col.water-=amount;
    }else{
     amount=Math.min(gap,this.water||0);this.water-=amount;
    }
   }else if(source.kind==='reservoir'){
    if(source.tile){
     amount=Math.min(gap,source.tile.water);source.tile.water-=amount;this.takeItems(source.tile.items||[],amount);
    }else if(source.cell){
     const avail=(source.cell.water/7)*100;amount=Math.min(gap,avail);
     if(amount>0){source.cell.water=Math.max(0,source.cell.water-(amount/100)*7);if(source.cell.water<=.0001){source.cell.water=0;this.world.activeWater.delete(key(source.cell.x,source.cell.y));}}
    }
   }else if(source.kind==='terrain-water'||source.kind==='well'){
    const avail=(source.cell.water/(source.cell.isWell?20:7))*100;amount=Math.min(gap,avail);
    if(amount>0){source.cell.water=Math.max(0,source.cell.water-(amount/100)*(source.cell.isWell?20:7));if(source.cell.water<=.0001){source.cell.water=0;this.world.activeWater.delete(key(source.cell.x,source.cell.y));}}
   }
  }
   if(type==='food'){
    a.foodNeed=Math.min(capacity,a.foodNeed+amount);
    if(amount>0){
     if(this.telemetry)this.telemetry.recordFoodEaten(a,amount);
     if(a.colonyId===1)AntGame.AudioCoordinator?.play('antEat');
    }
   }else{
    a.waterNeed=Math.min(capacity,a.waterNeed+amount);
    if(amount>0){
     if(this.telemetry)this.telemetry.recordWaterDrank(a,amount);
     if(a.colonyId===1)AntGame.AudioCoordinator?.play('antDrink');
    }
   }
   a.task=null;a.state='idle';a.timer=1.5;
  if(a.pendingCarry){
   const pc=a.pendingCarry;delete a.pendingCarry;
   a.task=pc;a.state='to-carry';
   const t=this.target(pc.targetId);
   if(t)this.route(a,{x:Math.round(t.x),y:Math.round(t.y)},'to-carry');
  }
 }
    kill(a, killer = null, cause = 'combat'){
     if(!a.alive)return;
     a.alive=false;a.health=0;a.path=[];a.isMoving=false;a.state='dead';
     if(a.colonyId===1)AntGame.AudioCoordinator?.play('antDeath');
     if((a.webbedUntil||0)>this.time){this.spiderEggs.push({id:`spider-egg-${this.nextId++}`,x:Math.round(a.x),y:Math.round(a.y),age:0,duration:C.spiderEggHatchTime});}
     if(a.carry){
      if(a.carry.type==='brood'){
       const b=this.eggs.find(e=>e.id===a.carry.broodId);
       if(b){b.carriedBy=null;b.beingTransportedBy=null;b.x=Math.round(a.x);b.y=Math.round(a.y);}
      }else{
       this.drops.push({id:this.nextId++,x:Math.round(a.x),y:Math.round(a.y),load:a.carry,claimed:null});
      }
     }
     a.carry=null;
     for(const d of this.drops)if(d.claimed===a.id)d.claimed=null;
     for(const egg of this.eggs){
      if(egg.beingFedBy===a.id)egg.beingFedBy=null;
      if(egg.beingTransportedBy===a.id){egg.beingTransportedBy=null;egg.carriedBy=null;}
     }
     for(const c of this.creatures){
      if(c.reservedFor===a.id)c.reservedFor=null;
      if(c.processingFeederId===a.id)c.processingFeederId=null;
     }
     for(const r of this.resources){
      if(r.reservedFor===a.id)r.reservedFor=null;
     }
     if(a.slots)a.slots.releaseAll();
     this.releaseSlot(a);
     const resolvedKiller = killer || a.lastAttackerEntity || null;
     if(this.telemetry)this.telemetry.recordKill(a, resolvedKiller, cause);
     if(a.colonyId===1)this.emit(a.type==='queen'?'The queen has died. The colony is dead.':`Worker ${a.id} has died.`);
     if(a.type==='queen'&&a.colonyId===1)this.gameOver=true;
    }
  canTravelDirect(a,target){
   const w=a.layer===1?this.surfaceWorld:this.world;
   const steps=Math.max(2,Math.ceil(hexDistance(a,target)*4));
   for(let i=1;i<=steps;i++){
    const t=i/steps,p=hexRound(a.x+(target.x-a.x)*t,a.y+(target.y-a.y)*t),c=w.peek(p.x,p.y);
    if(!c||c.solid||c.water>=6||c.waterStorage||c.isWell||c.zone==='well')return false;
    if(!AntGame.hasBodyClearance(w,p.x,p.y,a.clearanceNeeded||1)&&hexDistance(p,target)>0)return false;
   }
   return true;
  }
  // WEB IMMOBILIZATION: a webbed ant retains its order but cannot advance until
  // its individual webbedUntil clock expires.
   travel(a,dt){
    if((a.webbedUntil||0)>this.time)return true;
    if(a.state==='idle'||!a.path.length){
     if(a.pendingCrossLayerTarget){
      const dest=a.pendingCrossLayerTarget;
      delete a.pendingCrossLayerTarget;
      if(dest.layer === 1 && this.surfaceWorld){
       const rim = this.surfaceWorld.getAdjacentPassableSurfaceHex(a.x, a.y, dest);
       a.x = rim.x; a.y = rim.y;
      }else if(dest.layer === 0 && this.surfaceWorld){
       const entr = this.surfaceWorld.getClosestEntrance(a);
       a.x = entr.x; a.y = entr.y;
      }
      a.layer=dest.layer;
      if(a.carry?.creature)a.carry.creature.layer=a.layer;
      if(a.carry?.resource)a.carry.resource.layer=a.layer;
      const newWorld=a.layer===1?this.surfaceWorld:this.world;
      if(dest.x!==undefined&&dest.y!==undefined&&(dest.x!==a.x||dest.y!==a.y)){
       const p=pathfind(newWorld,a,dest,a.clearanceNeeded||1);
       if(p&&p.length){
        this.setPath(a,p,dest.targetState||'moving');
        return true;
       }else if(a.carry){
        this.toStore(a);
        return true;
       }
      }else if(a.carry){
       this.toStore(a);
       return true;
      }
     }
     a.path=[];a.waitTimer=0;return false;
    }

    const currHex=hexRound(a.x,a.y);
    const nextHex=a.path[0];

    if(nextHex&&(nextHex.x!==currHex.x||nextHex.y!==currHex.y)){
     if(AntGame.TaskEngine.handleCorridorConflict(this,a,dt,currHex,nextHex))return true;
    }

    let index=0;
    for(let i=Math.min(a.path.length-1,3);i>0;i--)if(this.canTravelDirect(a,a.path[i])){index=i;break;}
    const p=a.path[index];
    const w=a.layer===1?this.surfaceWorld:this.world;
    const targetCell=w.peek(p.x,p.y);
    if(!targetCell||targetCell.solid||targetCell.water>=6||targetCell.waterStorage||targetCell.isWell||targetCell.zone==='well'||((targetCell.zone==='trench'||targetCell.structure==='trench')&&(a.clearanceNeeded||1)<2)){
     a.path=[];a.state='idle';return false;
    }
    let terrainMult=1.0;
    const cell=w.peek(hexRound(a.x,a.y).x,hexRound(a.x,a.y).y);
    if(cell?.zone==='rough-dirt'||cell?.structure==='rough_dirt')terrainMult=0.5;
    else if(cell?.zone==='smooth-floor'||cell?.structure==='smooth_floor')terrainMult=1.35;
    const dx=p.x-a.x,dy=p.y-a.y,d=Math.hypot(dx,dy),water=cell?.water||0,step=a.speed*dt*(a.colonyId===1?this.effect('moveRate'):1)*terrainMult/(1+water*.4);
   a.angle=heading(dx,dy);
   if(d<=step){
    a.x=p.x;a.y=p.y;a.path.splice(0,index+1);
    if(a.swappingWith){
     const occ=this.ants.find(b=>b.id===a.swappingWith);
     if(!occ||(hexRound(occ.x,occ.y).x===currHex.x&&hexRound(occ.y,occ.y).y===currHex.y)){
      a.swappingWith=null;
     }
    }
    if(!a.path.length&&a.pendingCrossLayerTarget){
     const dest=a.pendingCrossLayerTarget;
     delete a.pendingCrossLayerTarget;
     if(dest.layer === 1 && this.surfaceWorld){
      const rim = this.surfaceWorld.getAdjacentPassableSurfaceHex(a.x, a.y, dest);
      a.x = rim.x; a.y = rim.y;
     }else if(dest.layer === 0 && this.surfaceWorld){
      const entr = this.surfaceWorld.getClosestEntrance(a);
      a.x = entr.x; a.y = entr.y;
     }
     a.layer=dest.layer;
     if(a.carry?.creature)a.carry.creature.layer=a.layer;
     if(a.carry?.resource)a.carry.resource.layer=a.layer;
     const newWorld=a.layer===1?this.surfaceWorld:this.world;
     if(dest.x!==undefined&&dest.y!==undefined&&(dest.x!==a.x||dest.y!==a.y)){
      const newP=pathfind(newWorld,a,dest,a.clearanceNeeded||1);
      if(newP&&newP.length){
       this.setPath(a,newP,dest.targetState||'moving');
      }else if(a.carry){
       this.toStore(a);
      }else{
       a.state='idle';
      }
     }else if(a.carry){
      this.toStore(a);
     }else{
      a.state='idle';
     }
    }
   }else{
    a.x+=dx/d*step;a.y+=dy/d*step;
   }
   if(a.carry?.creature){a.carry.creature.x=a.x;a.carry.creature.y=a.y;a.carry.creature.angle=a.angle;a.carry.creature.layer=a.layer;}
   if(a.carry?.resource){a.carry.resource.x=a.x;a.carry.resource.y=a.y;a.carry.resource.layer=a.layer;}
   return true;
  }
  // DEPOSIT: whole corpses and whole seeds enter food storage as potential food.
  deposit(a,dt){
   a.timer-=dt;if(a.timer>0)return;
   const dest=a.destination,load=a.carry;
   if(!load){a.state='idle';return;}
   const pit=dest?.kind==='foreign'?this.colonies.find(c=>c.id===dest.colonyId)?.pit:dest?.pit;
   if((dest?.kind==='pit'||dest?.kind==='foreign')&&pit&&pit.used+load.amount>pit.capacity){a.state='storage-full';a.timer=1;return;}
    if(load.type==='corpse'){
     const cr=load.creature||this.creatures.find(c=>c.id===load.creatureId);
     if(cr){
      cr.x=dest.point.x;cr.y=dest.point.y;cr.layer=dest.layer!==undefined?dest.layer:0;cr.carriedBy=null;cr.inStorage=true;cr.storageColonyId=a.colonyId||1;cr.path=[];cr.isMoving=false;
     }
     if(this.telemetry){
      this.telemetry.recordCorpseGathered(a,cr);
      this.telemetry.recordFoodGain(a.colonyId||1,load.amount||cr?.food||0,'corpsesHarvested');
     }
     if(a.colonyId===1){this.emit(`Carried corpse stored in food storage.`);AntGame.AudioCoordinator?.play('corpseStore');}
    }else if(load.type==='seed'){
     const r=load.resource||this.resources.find(x=>x.id===load.resourceId);
     if(r){r.x=dest.point.x;r.y=dest.point.y;r.layer=dest.layer!==undefined?dest.layer:0;r.carriedBy=null;r.inStorage=true;r.storageColonyId=a.colonyId||1;if(a.colonyId===1)AntGame.AudioCoordinator?.play('seedStore');}
     if(this.telemetry){
      this.telemetry.recordSeedGathered(a,r);
      this.telemetry.recordFoodGain(a.colonyId||1,load.amount||r?.remaining||0,'seedsHarvested');
     }
    }else if(dest.kind==='queen'||dest.kind==='food-store'||dest.kind==='water-store'){
     if(dest.colonyId&&dest.colonyId!==1){
      const col=this.colonies.find(c=>c.id===dest.colonyId);
      if(col){
        if(load.type==='food'){
         col.food=Math.min(col.foodCapacity||800,(col.food||0)+load.amount);
         if(this.telemetry&&load.foodType!=='ration'&&load.source!=='store')this.telemetry.recordFoodGain(dest.colonyId,load.amount,'directFood');
        }else if(load.type==='water'){
         col.water=Math.min(col.waterCapacity||400,(col.water||0)+load.amount);
         if(this.telemetry&&load.source!=='store')this.telemetry.recordWaterGain(dest.colonyId,load.amount,'harvested');
        }
       }
      }else{
       if(this.telemetry){
        if(load.type==='food'&&load.foodType!=='ration'&&load.source!=='store')this.telemetry.recordFoodGain(1,load.amount,'directFood');
        else if(load.type==='water'&&load.source!=='store')this.telemetry.recordWaterGain(1,load.amount,'harvested');
       }
      if(dest.kind==='queen'){
       const q=this.queen();
       if(load.type==='water'){
        const needed=q?Math.max(0,(q.maxWater||100)-(q.water||0)):0;
        const give=Math.min(load.amount,needed);
        if(q&&give>0){
         q.water=(q.water||0)+give;
         if((q.water||0)>=(q.maxWater||100)*0.98)q.tendingWater=false;
         AntGame.AudioCoordinator?.play('antDrink');
        }
        const surplus=load.amount-give;
        if(surplus>0){
         if(this.waterTarget==='reservoir'){
          const r=this.reservoirDestination(a);
          if(r&&r.tile){
           const resStored=Math.min(surplus,C.waterStoragePerTile-(r.tile.water||0));
           r.tile.water=(r.tile.water||0)+resStored;
           r.tile.items=(r.tile.items||[]).concat(this.makeItems('reservoir-water','droplet',resStored));
           if(surplus-resStored>0)this.addWater(surplus-resStored);
          }else{
           this.addWater(surplus);
          }
         }else{
          this.addWater(surplus);
         }
        }
       }else if(load.type==='food'){
        if(a.feeder && (a.task?.type==='feed-queen' || a.task?.type==='feed-food')){
         const needed=q?Math.max(0,(q.maxFood||200)-(q.food||0)):0;
         const give=Math.min(load.amount,needed);
         if(q&&give>0){
          q.food=(q.food||0)+give;
          if((q.food||0)>=(q.maxFood||200)*0.98)q.tendingFood=false;
          AntGame.AudioCoordinator?.play('antEat');
         }
         const surplus=load.amount-give;
         if(surplus>0)this.addFood(surplus,load.foodType);
        }else{
         this.addFood(load.amount,load.foodType);
        }
       }
      }else{
       if(load.type==='food'){this.addFood(load.amount,load.foodType);}
       else if(load.type==='water'){this.addWater(load.amount);}
      }
     }
    }else if(dest.kind==='reservoir'){
     const stored=Math.min(load.amount,C.waterStoragePerTile-(dest.tile.water||0));
     dest.tile.water=(dest.tile.water||0)+stored;
     dest.tile.items=(dest.tile.items||[]).concat(this.makeItems('reservoir-water','droplet',stored));
    }else if(dest.kind==='spoil'){
     const c=this.world.peek(dest.point.x,dest.point.y);
     this.spoilItems.push(...this.makeItems(`spoil-${c.x}-${c.y}`,'soil',load.amount).map(item=>({...item,x:c.x,y:c.y})));
     if(a.colonyId===1)AntGame.AudioCoordinator?.play('soilDropFloor');
     c.spoilDirt=(c.spoilDirt||0)+load.amount;
     if(c.spoilDirt>=(C.spoilStoragePerTile||5)){
      c.solid=true;c.zone='soil';c.structure=null;this.world.revision++;
      this.emit('A spoil tile filled with dirt and hardened into a solid dirt wall.');
     }
    }else if(dest.kind==='stockpile'){
     if(load.type==='soil'||load.type==='dirt'){
      const c=this.world.peek(dest.point.x,dest.point.y);
      if(c){
       this.spoilItems.push(...this.makeItems(`spoil-${c.x}-${c.y}`,'soil',load.amount).map(item=>({...item,x:c.x,y:c.y})));
       if(a.colonyId===1)AntGame.AudioCoordinator?.play('soilDropFloor');
       c.spoilDirt=(c.spoilDirt||0)+load.amount;
       if(c.spoilDirt>=(C.spoilStoragePerTile||5)){
        c.solid=true;c.zone='soil';c.structure=null;this.world.revision++;
        this.emit('A spoil tile filled with dirt and hardened into a solid dirt wall.');
       }
      }
     }else if(load.type==='food'){
      this.addFood(load.amount,load.foodType);
     }
    }else if(load.type==='construction'){
     if(load.food)this.addFood(load.food);
     if(load.dirt&&this.world.pit)this.world.pit.used+=load.dirt;
    }else if(pit){
     pit.used+=load.amount;
     if(a.colonyId===1)AntGame.AudioCoordinator?.play('soilDropPit');
     if(pit.used>=pit.capacity&&pit.hole){
      const cell=this.world.peek(pit.x,pit.y);
      if(cell){cell.solid=true;cell.zone='soil';cell.filledHole=true;}
      pit.filled=true;
     }
    }
    const postTimer=(dest?.kind==='queen'&&a.feeder)?(C.queenFeedCooldownSeconds||3.0):0;
    a.carry=null;a.state='idle';a.timer=postTimer;this.syncStores();
    if(a.orderQueue&&a.orderQueue.length){this.executeNextOrder(a);return;}
    if(a.pendingMove){const p=a.pendingMove;delete a.pendingMove;this.route(a,p,'moving');}
    else if(a.pendingTask){a.task=a.pendingTask;delete a.pendingTask;a.state=a.task.type;}
    else if(a.task?.type==='harvest'){
     const t=this.target(a.task.targetId);
     if(!t||t.inStorage||(t.food!==undefined&&t.food<=0)||(t.remaining!==undefined&&t.remaining<=0)){
      a.task=null;a.state='idle';
     }else{
      a.state='harvest';
      this.route(a,{x:Math.round(t.x),y:Math.round(t.y),layer:t.layer||0},'harvest');
     }
    }
   }
    pickupFeed(a){
     const t=a.task?.source;const maxCap=a.maxCarry||C.carryCapacity;
     if(t?.kind==='colony-water'||t?.feedKind==='colony-water'){
      const q=this.queen();
      if(q){
       if(q.tendingWater){if((q.water??100)>=(q.maxWater||100)*0.98)q.tendingWater=false;}
       else if((q.water??100)<(q.maxWater||100)*(C.queenWaterThresholdRatio||0.80))q.tendingWater=true;
      }
      const queenNeedsWater=q&&Boolean(q.tendingWater);
      if(queenNeedsWater&&this.water>0){
       const take=Math.min(C.waterDropValue||20,this.water,(q.maxWater||100)-(q.water||0));
       if(take>=1){
        this.spendWater(take);
        q.water=Math.min(q.maxWater||100,(q.water||0)+take);
        if((q.water||0)>=(q.maxWater||100)*0.98)q.tendingWater=false;
        AntGame.AudioCoordinator?.play('antDrink');
        this.emit(`Feeder hydrated the queen (+${Math.round(take)} water).`);
       }
      }
      a.state='idle';a.task=null;a.timer=C.queenFeedCooldownSeconds||3.0;return;
     }
     if(t?.kind==='reservoir'||t?.isReservoir){
      const tile=t.tile||t;
      const take=Math.min(C.waterDropValue||20,tile.water||0);
      if(take>0){
       tile.water=Math.max(0,(tile.water||0)-take);
       AntGame.Inventory?.takeItems(tile.items||[],take);
       a.carry={type:'water',amount:take};
       if(this.waterStore)this.waterStore.used=AntGame.Inventory?.reservoirWater(this);
       if(a.colonyId===1)AntGame.AudioCoordinator?.play('waterDropletExtract');
       this.toStore(a);
       return;
      }else{
       a.state='idle';a.task=null;a.timer=C.queenFeedCooldownSeconds||3.0;return;
      }
     }
     if(t?.kind==='colony-food'||t?.feedKind==='colony-food'){
      const q=this.queen();
      if(q){
       if(q.tendingFood){if((q.food??200)>=(q.maxFood||200)*0.98)q.tendingFood=false;}
       else if((q.food??200)<(q.maxFood||200)*(C.queenFeedThresholdRatio||0.80))q.tendingFood=true;
      }
      const queenNeedsFood=q&&Boolean(q.tendingFood);
      if(!queenNeedsFood){
       a.state='idle';a.task=null;a.timer=C.queenFeedCooldownSeconds||3.0;return;
      }
      const take=Math.min(maxCap,this.food,(q?.maxFood||200)-(q?.food||0));
      if(take>=1){
       this.spendFood(take);
       a.carry={type:'food',amount:take,foodType:'ration'};
       this.toStore(a);
       return;
      }else{
       a.state='idle';a.task=null;a.timer=C.queenFeedCooldownSeconds||3.0;return;
      }
     }
     if(a.task?.type==='feed-food'){
      const corpse=a.task.sourceKind==='corpse'?this.creatures.find(x=>x.id===a.task.targetId):null,r=corpse||this.resources.find(x=>x.id===a.task.targetId),remaining=corpse?.food??r?.remaining;
      if(!r||remaining<=0){a.state='idle';return;}
      if(corpse&&corpse.species&&canCarry(a,corpse)){
       corpse.carriedBy=a.id;
       a.carry={type:'corpse',creature:corpse,creatureId:corpse.id,amount:corpse.food,foodType:'meat'};
       if(a.colonyId===1)AntGame.AudioCoordinator?.play('corpsePickup');
       this.toStore(a);
       return;
      }
      const take=corpse?Math.min(maxCap,corpse.food):Math.min(maxCap,r.remaining);
      if(corpse)corpse.food-=take;else{r.remaining-=take;r.decay=0;}
      a.carry={type:'food',amount:take,foodType:corpse?'meat':r.foodType};
     }else{
      const c=this.world.peek(t.x,t.y);
      if(!c||c.water<=.01){a.state='idle';return;}
      const avail=(c.water/7)*100,take=Math.min(maxCap,C.waterDropValue,avail);
      if(take<=0){a.state='idle';return;}
      c.water=Math.max(0,c.water-(take/100)*7);
      if(c.water<=.0001){c.water=0;this.world.activeWater.delete(key(c.x,c.y));}
      a.carry={type:'water',amount:take};
      if(a.colonyId===1)AntGame.AudioCoordinator?.play('waterDropletExtract');
     }
     this.toStore(a);
    }
  updateWorker(a,dt){
   if(a.state==='to-process'){
    const targetObj=a.task?.source||this.creatures.find(c=>c.id===a.task?.targetId)||this.resources.find(r=>r.id===a.task?.targetId);
    if(!targetObj||(targetObj.food<=0&&targetObj.remaining<=0)){
     if(targetObj?.processingFeederId===a.id)targetObj.processingFeederId=null;
     a.state='idle';a.task=null;return;
    }
    const distToObj=dist(a,targetObj);
    if(distToObj>1.2){
     if(!a.path.length&&!this.route(a,{x:Math.round(targetObj.x),y:Math.round(targetObj.y)},'to-process')){
      if(targetObj.processingFeederId===a.id)targetObj.processingFeederId=null;
      a.state='idle';a.task=null;
     }
     return;
    }
    a.state='processing';a.timer=0;
   }
   if(a.state==='processing'){
    const colId=a.colonyId||1;
    const targetObj=a.task?.source||this.creatures.find(c=>c.id===a.task?.targetId)||this.resources.find(r=>r.id===a.task?.targetId);
    if(!targetObj||(targetObj.food<=0&&targetObj.remaining<=0)){
     if(targetObj?.processingFeederId===a.id)targetObj.processingFeederId=null;
     a.state='idle';a.task=null;return;
    }
    const q=this.queen();
    if(q&&((q.water??100)<=20||(q.food??200)<=20)){
     if(targetObj?.processingFeederId===a.id)targetObj.processingFeederId=null;
     a.state='idle';a.task=null;return;
    }
    const colObj = colId === 1 ? null : this.colonies.find(c => c.id === colId);
    const availSpace = colId === 1 ? Math.max(0, this.foodCapacity() - this.food) : Math.max(0, (colObj?.foodCapacity || 800) - (colObj?.food || 0));
    if (availSpace <= 0.001) {
     if(targetObj?.processingFeederId===a.id)targetObj.processingFeederId=null;
     a.state='idle';a.task=null;return;
    }
    targetObj.processingFeederId=a.id;
    a.timer=(a.timer||0)+dt;
    if(a.timer>=1.0){
     a.timer=0;
     const remainingVal=targetObj.food!==undefined?targetObj.food:targetObj.remaining;
     const take=Math.min(10,remainingVal,availSpace);
     if(take<=0.001){
      if(targetObj?.processingFeederId===a.id)targetObj.processingFeederId=null;
      a.state='idle';a.task=null;return;
     }
     if(targetObj.food!==undefined)targetObj.food-=take;
     else{targetObj.remaining-=take;targetObj.decay=0;}
     if(colId===1){this.addFood(take,targetObj.food!==undefined?'meat':'seeds');this.emit('Feeder processed stored food into edible colony food.');AntGame.AudioCoordinator?.play('feederChewFood');}
     else{const col=this.colonies.find(c=>c.id===colId);if(col)col.food=Math.min(col.foodCapacity||800,(col.food||0)+take);}
     if((targetObj.food!==undefined?targetObj.food:targetObj.remaining)<=0){
      if(targetObj.food!==undefined)this.creatures=this.creatures.filter(c=>c.id!==targetObj.id);
      else this.resources=this.resources.filter(r=>r.id!==targetObj.id);
      a.state='idle';a.task=null;
     }
    }
    return;
   }
   if(a.state==='to-carry'){
    const t=this.target(a.task?.targetId);
    if(!t||t.alive||t.inStorage){
     if(t?.reservedFor===a.id)t.reservedFor=null;
     a.state='idle';a.task=null;return;
    }
    const d=dist(a,t);
    if(d<=1.3){
     t.reservedFor=null;t.carriedBy=a.id;
     if(t.species){
      a.carry={type:'corpse',creature:t,creatureId:t.id,amount:t.food,foodType:'meat'};
      if(a.colonyId===1)AntGame.AudioCoordinator?.play('corpsePickup');
     }else{
      a.carry={type:'seed',resource:t,resourceId:t.id,amount:t.remaining,foodType:'seeds'};
     }
     this.toStore(a);
     return;
    }
     if(!a.path.length){
      if(!this.route(a,{x:Math.round(t.x),y:Math.round(t.y),layer:t.layer||0},'to-carry')){
       if(t.reservedFor===a.id)t.reservedFor=null;
       a.state='idle';a.task=null;
      }
     }
    return;
   }
   if(a.state==='carrying'){a.state='depositing';a.timer=C.depositSeconds;}if(a.state==='depositing'){this.deposit(a,dt);return;}if(a.state==='storage-full'||a.state==='blocked'||a.state==='build-no-resources'||a.state==='build-blocked'){a.timer-=dt;if(a.timer<=0){if(a.carry)this.toStore(a);else a.state='idle';a.timer=1;}return;}
   if(a.state==='feeding-food'||a.state==='feeding-water'){this.pickupFeed(a);return;}
   if(a.state==='withdraw-water'){this.pickupReservoir(a);return;}
   if(a.state==='to-feed-larva-supply'){
    const isPlayer=a.colonyId===1;
    const col=isPlayer?null:this.colonies.find(c=>c.id===a.colonyId);
    const colFood=isPlayer?this.food:(col?.food||0);
    const foodPos=a.task?.foodTile||(isPlayer?(this.world.founding.foodStore||this.nest):(col?.foodStore||col||{x:a.x,y:a.y}));
    const targetLarva=this.eggs.find(e=>e.id===a.task?.larvaId);
    if(!targetLarva||targetLarva.stage!=='larva'||(targetLarva.foodAccumulated||0)>=30){
     if(targetLarva?.beingFedBy===a.id)targetLarva.beingFedBy=null;
     a.state='idle';a.task=null;return;
    }
    const d=dist(a,foodPos);
    if(d<=1.2||!a.path.length){
     const tileCell=a.task?.foodTile?this.world.peek(a.task.foodTile.x,a.task.foodTile.y):null;
     const tileFood=(tileCell&&tileCell.food!==undefined)?tileCell.food:colFood;
     const maxCap=a.maxCarry||C.carryCapacity;
     const needed=Math.max(0,30-(targetLarva.foodAccumulated||0));
     const batch=Math.min(tileFood,colFood,maxCap,needed,this.currentFeedBatchAmount());
     if(batch>0){
      if(tileCell&&tileCell.food!==undefined)tileCell.food-=batch;
      if(isPlayer)this.spendFood(batch);
      else if(col)col.food-=batch;
      if(this.telemetry)this.telemetry.recordFoodLoss(a.colonyId||1,batch,'larvaeFeeding');
      a.carry={type:'brood-feed',amount:batch,multiplier:isPlayer?this.currentFeedMultiplier():1.0};
      a.state='feeding-larva';
      if(a.colonyId===1)AntGame.AudioCoordinator?.play('antEat');
      if(!this.route(a,{x:Math.round(targetLarva.x),y:Math.round(targetLarva.y)},'feeding-larva')){
       a.state='feeding-larva';
      }
     }else{
      const nextTile=AntGame.Inventory?.getFoodSourceTile(this,a);
      if(nextTile&&(nextTile.x!==a.task?.foodTile?.x||nextTile.y!==a.task?.foodTile?.y)){
       a.task.foodTile={x:nextTile.x,y:nextTile.y};
       this.route(a,nextTile,'to-feed-larva-supply');
       return;
      }
      if(targetLarva?.beingFedBy===a.id)targetLarva.beingFedBy=null;
      a.state='idle';a.task=null;
     }
    }
    return;
   }
   if(a.state==='feeding-larva'){
    const l=this.eggs.find(e=>e.id===a.task?.larvaId);
    const d=l?dist(a,l):999;
    if(d>1.3&&a.path.length>0)return;
    if(l&&l.stage==='larva'){
     l.foodAccumulated=(l.foodAccumulated||0)+(a.carry?.amount||5);
     l.mutationMultiplier=Math.max(l.mutationMultiplier||1.0,a.carry?.multiplier||1.0);
     l.beingFedBy=null;
     if(a.colonyId===1){
      this.emit(`Worker fed a larva (${Math.min(30,Math.round(l.foodAccumulated))}/30 food).`);
      AntGame.AudioCoordinator?.play('feederChewFood');
     }
    }
    a.carry=null;a.task=null;a.state='idle';
    return;
   }
   if(a.state==='to-pickup-brood'){
    const b=this.eggs.find(e=>e.id===a.task?.broodId);
    if(b&&!b.carriedBy){
     b.carriedBy=a.id;
     a.carry={type:'brood',broodId:b.id};
     const target=a.task?.targetTile||this.findFreeHatcheryTile(a);
     if(target&&this.route(a,target,'to-deposit-brood')){
      a.task={type:'deposit-brood',broodId:b.id,target};
     }else{
      b.carriedBy=null;b.beingTransportedBy=null;a.carry=null;a.task=null;a.state='idle';
     }
    }else{
     a.task=null;a.state='idle';
    }
    return;
   }
   if(a.state==='to-deposit-brood'){
    const b=this.eggs.find(e=>e.id===a.task?.broodId);
    if(b){
     b.x=a.task.target?.x??Math.round(a.x);
     b.y=a.task.target?.y??Math.round(a.y);
     b.carriedBy=null;
     b.beingTransportedBy=null;
     if(a.colonyId===1){
      this.emit('Brood safely relocated to the hatchery.');
      AntGame.AudioCoordinator?.play('soilDropFloor');
     }
    }
    a.carry=null;a.task=null;a.state='idle';
    return;
   }
   if(a.state==='to-build-supply'||a.state==='delivering-build-material'||a.state==='building'){if(AntGame.Construction.stepBuilding(this,a,dt))return;}
    if(a.state==='recover'){const drop=this.drops.find(d=>d.id===a.task?.dropId);if(drop){a.carry=drop.load;this.drops.splice(this.drops.indexOf(drop),1);this.toStore(a);}else a.state='idle';return;}if(a.state==='attack'||a.state==='harvest'){AntGame.Ecology.workTarget(this,a,dt);return;}if(a.state==='to-dig'){a.state='digging';a.timer=0;}if(a.state==='digging'){const task=a.task,c=task&&this.world.peek(task.x,task.y);const isUnbreakable=c&&(c.rock||c.zone==='rock'||c.isWell||c.zone==='well'||c.terrain==='hole'||c.zone==='hole'||c.structure==='hole'||c.zone==='pit'||c.hole);if(!c||(!c.solid&&!task.buildId)||isUnbreakable||!this.jobs.some(j=>j.id===task.id)){if(c&&(c.rock||c.zone==='rock')&&a.colonyId===1)AntGame.AudioCoordinator?.play('rockStrike');if(task)this.jobs=this.jobs.filter(j=>j.id!==task.id);a.state='idle';a.task=null;return;}a.angle=heading(c.x-a.x,c.y-a.y);a.timer+=dt*(a.colonyId===1?this.effect('digRate'):1)*(a.digRate||1);if(a.timer>=C.digSeconds*c.hardness){let bridgeCarry=null;if(c&&(c.isBridge||c.structure==='earthen_bridge'||c.zone==='causeway')){const targetWorld=(a.layer===1&&this.surfaceWorld)?this.surfaceWorld:this.world;const isNearWater=targetWorld.neighbors(c.x,c.y).some(n=>n.terrain==='water'||n.zone==='stream'||n.zone==='pond'||(n.water||0)>=6);if(isNearWater){c.terrain='water';c.zone='stream';c.water=10;c.baselineWater=10;c.isBridge=false;c.structure=null;c.elevation=0;c.solid=false;bridgeCarry={type:'soil',amount:1,source:{x:c.x,y:c.y}};}}a.carry=bridgeCarry||(c.solid?this.world.removePiece(c,this.world.peek(task.face.x,task.face.y)):null);if(!c.solid)c.excavations=(c.excavations||0)+1;for(const victim of this.ants)if(victim.trapped&&Math.round(victim.x)===c.x&&Math.round(victim.y)===c.y){victim.trapped=false;victim.state='idle';this.emit(`${victim.type} ${victim.id} was rescued from the collapse!`);}a.timer=0;this.jobs=this.jobs.filter(j=>j.id!==task.id);const build=task.buildId&&this.jobs.find(j=>j.id===task.buildId);if(build){if((c.excavations||0)>=build.excavations){build.status=pathfind(this.world,this.nest,c)?(this.food>=build.food&&this.world.pit.used>=build.dirt?'available':'resources'):'blocked';}else{this.ensureExcavationJob(build,c);}}let extraMined=0;const maxBlocks=a.type==='supermajor'?3:a.type==='major'?2:1;if(maxBlocks>1){const adjJobs=this.jobs.filter(j=>j.type==='dig'&&j.colonyId===a.colonyId&&hexDistance(j,c)===1);for(const aj of adjJobs){if(extraMined>=maxBlocks-1)break;const ac=this.world.peek(aj.x,aj.y);const isAcUnbreakable=ac&&(ac.rock||ac.zone==='rock'||ac.isWell||ac.zone==='well'||ac.terrain==='hole'||ac.zone==='hole'||ac.structure==='hole'||ac.zone==='pit'||ac.hole);if(ac&&ac.solid&&!isAcUnbreakable){this.world.removePiece(ac,c);this.jobs=this.jobs.filter(j=>j.id!==aj.id);extraMined++;}else if(isAcUnbreakable){this.jobs=this.jobs.filter(j=>j.id!==aj.id);}}}    if(a.carry&&extraMined>0)a.carry.amount+=extraMined;if(this.telemetry)this.telemetry.recordDirtMined(a,1+extraMined);if(a.carry)this.toStore(a);else a.state='idle';}return;}if(a.state==='idle'&&!a.held&&!a.manualOrder){a.timer=(a.timer||0)-dt;if(a.timer<=0||(!a.task&&this.antNeedType(a)))this.assign(a);if(a.state==='processing'){this.updateWorker(a,dt);}}}
  updateQueen(dt){
   if(this.gameOver)return;
   const livingQueens=this.ants.filter(a=>a.alive&&a.type==='queen'&&a.fertile);
   for(const q of livingQueens){
    const isPlayer=q.colonyId===1;
    const col=isPlayer?null:this.colonies.find(c=>c.id===q.colonyId);
     if(isPlayer){
      const prevFood=q.food??(C.queenFoodCapacity||200);
      q.food=Math.max(0,prevFood-C.foodDrainPerSecond*dt);
      const foodSpent=prevFood-q.food;
      const prevWater=q.water??(C.queenWaterCapacity||100);
      q.water=Math.max(0,prevWater-C.waterDrainPerSecond*dt);
      const waterSpent=prevWater-q.water;
      if(this.telemetry){
       this.telemetry.recordFoodLoss(1,foodSpent,'queenDrain');
       this.telemetry.recordWaterLoss(1,waterSpent,'queenDrain');
      }
      q.maxFood=C.queenFoodCapacity||200;
      q.maxWater=C.queenWaterCapacity||100;
       if(q.combatTimer>0)q.combatTimer-=dt;
       if(q.threatId){
        const threat=this.creatures.find(c=>c.id===q.threatId&&c.alive);
        if(!threat&&q.threatId!=='spider-threat')q.threatId=null;
       }
       let damage=0;
       if(q.food<=0.01){
        damage+=3;this.warnStarvingTimer=(this.warnStarvingTimer||0)-dt;
        if(this.warnStarvingTimer<=0){this.emit('QUEEN IS STARVING! Queen health is dropping!');this.warnStarvingTimer=8;}
       }else{this.warnStarvingTimer=0;}
       if(q.water<=0.01){
        damage+=5;this.warnDehydratedTimer=(this.warnDehydratedTimer||0)-dt;
        if(this.warnDehydratedTimer<=0){this.emit('QUEEN IS DEHYDRATED! Queen health is dropping!');this.warnDehydratedTimer=8;}
       }else{this.warnDehydratedTimer=0;}
       const queenInCombat=(q.combatTimer>0)||Boolean(q.threatId)||this.creatures.some(c=>c.alive&&(Species[c.species]?.behavior==='aggressive'||c.provoked)&&hexDistance(c,q)<=6);
       if(damage){
        q.health-=damage*dt;
        if(q.health<=0){this.kill(q,null,q.food<=0.01?'starvation':'dehydration');return;}
       }else if(q.food>20&&q.water>20&&q.health<q.maxHealth&&!queenInCombat){
        q.health=Math.min(q.maxHealth,q.health+0.5*dt);
       }
      q.layTimer-=dt;
      if(q.layTimer<=0){if(this.layEgg(q))q.layTimer+=C.eggInterval;else q.layTimer=Math.min(5,C.eggInterval);}
     }else if(col&&col.state==='active'){
      // Rival Queen: in spectatorMode, 1.0x drain parity with player; otherwise 0.5x slower depletion
      const drainMult=this.spectatorMode?1.0:0.5;
      const prevFood=col.food||0;
      col.food=Math.max(0,prevFood-C.foodDrainPerSecond*drainMult*dt);
      const foodSpent=prevFood-col.food;
      const prevWater=col.water||0;
      col.water=Math.max(0,prevWater-C.waterDrainPerSecond*drainMult*dt);
      const waterSpent=prevWater-col.water;
      if(this.telemetry){
       this.telemetry.recordFoodLoss(col.id,foodSpent,'queenDrain');
       this.telemetry.recordWaterLoss(col.id,waterSpent,'queenDrain');
      }
      let damage=0;
      if(col.food<=0.01)damage+=3;
      if(col.water<=0.01)damage+=5;
      if(damage){q.health-=damage*dt;if(q.health<=0){this.kill(q,null,col.food<=0.01?'starvation':'dehydration');col.state='abandoned';this.emit(`Rival colony ${col.id} queen died.`);continue;}}
      q.layTimer-=dt;
      if(q.layTimer<=0){
       const pop=this.ants.filter(a=>a.alive&&a.colonyId===col.id).length;
       const eggCount=this.eggs.filter(e=>e.colonyId===col.id).length;
       const cap=col.capacity||C.startingColonyCap;
       if(pop+eggCount<cap&&col.food>=C.eggFoodCost&&col.water>=C.eggWaterCost){
        col.food-=C.eggFoodCost;col.water-=C.eggWaterCost;
        if(this.telemetry){
         this.telemetry.recordFoodLoss(col.id,C.eggFoodCost,'eggProduction');
         this.telemetry.recordWaterLoss(col.id,C.eggWaterCost,'eggProduction');
        }
       const assignedAntType=this.rollCasteForColony(col.id);
       const angle=this.random.next()*Math.PI*2,r=1+this.random.next()*2;
       let x=col.x+Math.cos(angle)*r,y=col.y+Math.sin(angle)*r;
       const duration=AntGame.Config.brood?.eggDuration||45;
       this.eggs.push({id:this.nextId++,x,y,assignedAntType,stage:'egg',age:0,duration,colonyId:col.id,health:C.brood?.health||25,maxHealth:C.brood?.health||25,foodAccumulated:0,mutationMultiplier:1.0,mutations:[],carriedBy:null});
      }
      q.layTimer=Math.min(5,C.eggInterval);
     }
    }
   }
  }
  findHungryLarva(a){
   return AntGame.Brood?.findHungryLarva(this, a)??null;
  }
  findMisplacedBrood(a){
   return AntGame.Brood?.findMisplacedBrood(this, a)??null;
  }
  findFreeHatcheryTile(a){
   return AntGame.Brood?.findFreeHatcheryTile(this, a)??null;
  }
  updateBrood(dt){
   AntGame.Brood?.updateBrood(this, dt);
  }
   update(dt){
    this.ticks=(this.ticks||0)+1;
    this.time+=dt;
    if(this.watchdog)this.watchdog.tick(dt);
    if(!this.gameOver){
     const ep=(C.passiveEvolutionRate||0.18)*dt;
     this.evolution+=ep;
     this.totalEvolution+=ep;
    }
   if(this.climate)this.climate.update(dt);
   this.updateInflows(dt);
   this.updateTrappedEntities(dt);
   this.updateQueen(dt);
   for(const a of this.ants)if(a.alive)this.drainAntNeeds(a,dt);
   this.updateBrood(dt);
   for(const a of this.ants){
    if(!a.alive)continue;
    if(a.colonyId===1&&(a.held||a.manualOrder||a.selected)){
     const isBusy=(a.carry!=null)||
      (a.path&&a.path.length>0)||
      ['digging','to-dig','building','to-build-supply','delivering-build-material','to-feed-larva-supply','feeding-larva','to-carry','to-process','processing','depositing','recover','need-food','need-water'].includes(a.state)||
      (a.state==='attack'&&this.target(a.task?.targetId)?.alive)||
      (a.state==='harvest'&&((this.target(a.task?.targetId)?.remaining||0)>0||(this.target(a.task?.targetId)?.species==='root_aphid'&&this.target(a.task?.targetId)?.milkCooldown<=0)));
     if(isBusy){
      a.idleReleaseTimer=0;
     }else if(a.state==='idle'){
      a.idleReleaseTimer=(a.idleReleaseTimer||0)+dt;
      if(a.idleReleaseTimer>=(C.idleReleaseSeconds||10.0)){
       this.release(a);
       a.manualOrder=false;
       a.idleReleaseTimer=0;
       a.selected=false;
       if(this.onAntAutoReleased)this.onAntAutoReleased(a.id);
      }
     }
    }
    if(a.type==='queen')continue;
    if(this.travel(a,dt))continue;
     if(a.state==='moving'||a.state==='patrol'){
      if(a.orderQueue&&a.orderQueue.length){this.executeNextOrder(a);continue;}
      a.state=a.threatId?'protective':'idle';if(a.threatId)AntGame.Ecology.reportThreat(this,a);continue;
     }
    if(a.state==='need-food'||a.state==='need-water'){this.consumeAntNeed(a);continue;}
    if(isCommandable(a.type))this.updateWorker(a,dt);
   }
   if(AntGame.applySoftSeparation&&this.spatialHash){
    AntGame.applySoftSeparation(this,this.spatialHash);
   }
   this.statusTimer+=dt;if(this.statusTimer>=1){this.refreshJobStates();this.syncExcavationZones();this.statusTimer=0;}
   this.ecologyTimer+=dt;if(this.ecologyTimer>=C.ecologyInterval){
    AntGame.Ecology.update(this,this.ecologyTimer);
    AntGame.SurfaceEcology?.update(this,this.ecologyTimer);
    this.ecologyTimer=0;
   }
   if(AntGame.AudioCoordinator)AntGame.AudioCoordinator.updateAntActivity(this);
  }
  triggerRainInflow(){
   const candidates=this.ants.filter(a=>a.alive&&a.colonyId===1&&a.type!=='queen');
   const anchor=candidates.length?candidates[Math.floor(this.random.next()*candidates.length)]:this.nest;
   let target=null;
   for(let r=1;r<=10&&!target;r++){
     for(const p of hexDisk(Math.round(anchor.x),Math.round(anchor.y),r)){
      const c=this.world.peek(p.x,p.y);
      if(c&&!c.solid&&!c.rock&&c.zone!=='rock'&&c.zone!=='compacted-dirt'&&c.structure!=='compacted_dirt'){target=c;break;}
     }
   }
   if(!target)target=this.world.peek(this.nest.x,this.nest.y);
   if(target){
    this.activeInflows.push({x:target.x,y:target.y,totalVolume:112,remainingVolume:112,rate:112/120,duration:120,elapsed:0,isLightning:false});
    this.emit(`Water is infiltrating the tunnels near ${target.x}, ${target.y}!`);
    if(AntGame.AudioCoordinator)AntGame.AudioCoordinator.play('flood');
   }
  }
  triggerLightningStrike(){
   const openCells=[];
   for(const c of this.world.cells.values()){
    if(c.discovered&&!c.solid&&hexDistance(c,this.nest)<=25){
     if(!this.ants.some(a=>a.alive&&a.type==='queen'&&Math.round(a.x)===c.x&&Math.round(a.y)===c.y)){
      openCells.push(c);
     }
    }
   }
   if(!openCells.length)return;
   const target=openCells[Math.floor(this.random.next()*openCells.length)];
   target.solid=false;target.depth=0;target.zone='surface';target.isBreach=true;target.structure='breach';
   this.world.revision++;

   // Dual-Plane Representation: Impact and scorched crater on surface
   if(this.surfaceWorld){
    const surfCell = this.surfaceWorld.get(target.x, target.y);
    surfCell.solid = false;
    surfCell.isHole = true;
    surfCell.isBreach = true;
    surfCell.structure = 'breach';
    surfCell.zone = 'crater';
    surfCell.scorch = true;
    surfCell.terrain = 'soil';
    surfCell.water = 0;
    surfCell.discovered = true;
    if(!this.surfaceWorld.entrances.some(e => e.x === target.x && e.y === target.y)){
     this.surfaceWorld.entrances.push({ x: target.x, y: target.y, r: 0, isBreach: true });
    }

    // Scorch and destroy vegetation in radius 1 on surface
    for(const p of hexDisk(target.x, target.y, 1)){
     const sc = this.surfaceWorld.peek(p.x, p.y);
     if(sc){
      sc.discovered = true;
      sc.scorch = true;
      if(sc.zone === 'berry_bush' || sc.structure === 'berry_bush'){
       sc.zone = 'grass';
       sc.structure = null;
       sc.hasBerries = false;
      }
      sc.flora = null;
      for(const a of this.ants){
       if(a.alive && a.layer === 1 && Math.round(a.x) === p.x && Math.round(a.y) === p.y){
        a.health -= 120;
        if(a.health <= 0) this.kill(a, null, 'lightning');
       }
      }
      for(const cr of this.creatures){
       if(cr.alive && cr.layer === 1 && Math.round(cr.x) === p.x && Math.round(cr.y) === p.y){
        cr.health -= 120;
        if(cr.health <= 0) this.killCreature(cr);
       }
      }
     }
    }
    this.surfaceWorld.senseAt(target.x, target.y, 10);
    this.surfaceWorld.revision++;
   }

   // Damage underground ants directly at strike point (queen is protected by openCells filter)
   for(const a of this.ants){
    if(a.alive && (a.layer || 0) === 0 && Math.round(a.x) === target.x && Math.round(a.y) === target.y && a.type !== 'queen'){
     a.health -= 80;
     if(a.health <= 0) this.kill(a, null, 'lightning');
    }
   }

   if(this.climate){
    this.climate.screenShake = 1.0;
    this.climate.lightningFlash = 1.0;
   }

   const volume=140+Math.floor(this.random.next()*71);
   this.activeInflows.push({x:target.x,y:target.y,totalVolume:volume,remainingVolume:volume,rate:volume/60,duration:60,elapsed:0,isLightning:true});
   this.emit(`DESTRUCTIVE LIGHTNING STRIKE! A permanent surface breach was blasted open at ${target.x}, ${target.y}!`);
   if(AntGame.AudioCoordinator){
    AntGame.AudioCoordinator.play('destructiveLightning');
    AntGame.AudioCoordinator.play('flood');
   }
  }
  updateInflows(dt){
   // Surface World Continuous Hydrology, Runoff & Entrance Spillage
   if(this.surfaceWorld){
    this.surfaceWorld.updateHydrology(this, dt);
   }

   for(let i=this.activeInflows.length-1;i>=0;i--){
    const inflow=this.activeInflows[i];
    inflow.elapsed+=dt;
    const c=this.world.peek(inflow.x,inflow.y);
    if(c&&!c.solid){
     if(inflow.isLightning&&c.water>=7){
      const neighbors=this.world.neighbors(c.x,c.y).filter(n=>!n.solid);
      const canAccept=neighbors.some(n=>(n.water||0)<7);
      if(!canAccept){
       this.activeInflows.splice(i,1);
       continue;
      }
     }
     const amount=Math.min(inflow.rate*dt,inflow.remainingVolume);
     c.water=Math.min(7,(c.water||0)+amount);
     this.world.activeWater.add(key(c.x,c.y));
     if(c.water>1.0)c.isSpreading=true;
     inflow.remainingVolume-=amount;
    }
    if(inflow.remainingVolume<=0.001||inflow.elapsed>=inflow.duration){
     this.activeInflows.splice(i,1);
    }
   }
  }
  triggerCaveIn(source='wind', targetX=null, targetY=null, targetRadius=1){
   if(source === 'wind' && this.surfaceWorld){
    // Surface wind effects: shake ripe berries off bushes and blow away rough dirt piles
    for(const sc of this.surfaceWorld.cells.values()){
     if(sc.zone === 'berry_bush' && sc.hasBerries){
      if(this.random.next() < 0.40){
       sc.hasBerries = false;
       sc.berryReplenishTimer = 0;
       this.resources.push({
        id: `berries-wind-${sc.x},${sc.y}-${Math.round(this.time)}`,
        foodType: 'berries',
        x: sc.x,
        y: sc.y,
        layer: 1,
        remaining: 20,
        initial: 20,
        decay: 0,
        state: 'active'
       });
       this.emit('High winds shook loose ripe berries from surface bushes!');
      }
     }
     if(sc.structure === 'rough_dirt' && this.random.next() < 0.35){
      sc.structure = null;
      sc.zone = 'soil';
      this.emit(`Strong gusts blew away an uncompacted dirt pile at ${sc.x}, ${sc.y}!`);
     }
    }
   }

   let disk, cx, cy;
   if(targetX!==null && targetY!==null){
    cx=targetX;
    cy=targetY;
    disk=hexDisk(cx,cy,targetRadius);
   }else{
    const candidates=this.ants.filter(a=>a.alive&&a.colonyId===1&&a.type!=='queen');
    const anchor=candidates.length?candidates[Math.floor(this.random.next()*candidates.length)]:this.nest;
    cx=anchor.x+(Math.floor(this.random.next()*7)-3);
    cy=anchor.y+(Math.floor(this.random.next()*7)-3);
    disk=hexDisk(cx,cy,1);
   }
   if(this.ants.some(a=>a.alive&&a.type==='queen'&&disk.some(p=>Math.round(a.x)===p.x&&Math.round(a.y)===p.y)))return 0;
   let collapsed=0;
    for(const p of disk){
     const cell=this.world.peek(p.x,p.y);
     if(!cell||cell.solid||cell.rock||cell.zone==='rock'||cell.zone==='compacted-dirt'||cell.structure==='compacted_dirt')continue;
    if(cell.zone==='food-store'&&this.foodStore.tiles>0)this.foodStore.tiles--;
    if(cell.zone==='water-store')this.waterStore.tiles=this.waterStore.tiles.filter(t=>t.x!==cell.x||t.y!==cell.y);
    cell.solid=true;cell.terrain='soil';cell.zone=null;cell.discovered=false;
    this.world.removed=Math.max(0,this.world.removed-1);
    collapsed++;
    for(const a of this.ants){
     if(a.alive&&Math.round(a.x)===p.x&&Math.round(a.y)===p.y){
      a.health-=40;
      if(a.health<=0){this.kill(a);this.emit(`${a.type} ${a.id} was crushed in a cave-in.`);}
      else{a.trapped=true;a.suffocationTimer=25.0;a.state='trapped';a.path=[];}
     }
    }
   }
   if(collapsed>0){
    this.world.revision++;
    this.emit(`CAVE-IN! High winds caused a 3x3 tunnel collapse near ${cx}, ${cy}!`);
    AntGame.AudioCoordinator?.play('caveIn');
    return true;
   }
   return false;
  }
  executeEarthquake(target={x:0,y:0}){
   const angle=this.random.next()*Math.PI*2;
   const dx=Math.cos(angle),dy=Math.sin(angle);
   const px=-dy,py=dx;
   const candidateCells=[];
   for(let l=-7;l<=7;l++){
    for(let w=-2;w<=1;w++){
     candidateCells.push({
      x:Math.round(target.x+l*dx+w*px),
      y:Math.round(target.y+l*dy+w*py)
     });
    }
   }
   const queenCells=new Set(this.ants.filter(a=>a.alive&&a.type==='queen').map(q=>`${Math.round(q.x)},${Math.round(q.y)}`));
   const safeCells=candidateCells.filter(p=>!queenCells.has(`${p.x},${p.y}`));
   let collapsed=0;
   for(const p of safeCells){
    const cell=this.world.peek(p.x,p.y);
    if(!cell||cell.solid||cell.rock||cell.zone==='rock')continue;
    if(cell.zone==='food-store'&&this.foodStore.tiles>0)this.foodStore.tiles--;
    if(cell.zone==='water-store')this.waterStore.tiles=this.waterStore.tiles.filter(t=>t.x!==cell.x||t.y!==cell.y);
    cell.solid=true;cell.terrain='soil';cell.zone=null;cell.discovered=false;
    this.world.removed=Math.max(0,this.world.removed-1);
    collapsed++;
    for(const a of this.ants){
     if(a.alive&&Math.round(a.x)===p.x&&Math.round(a.y)===p.y&&a.type!=='queen'){
      a.trapped=true;a.suffocationTimer=25.0;a.state='trapped';a.path=[];
     }
    }
   }
   this.world.revision++;
   this.emit(`EARTHQUAKE STRIKES! Massive underground collapse near ${target.x}, ${target.y}!`);
  }
  triggerEarthquake(){
   if(this.climate)this.climate.triggerEarthquake();
  }
  updateTrappedEntities(dt){
   for(const a of this.ants){
    if(a.alive&&a.trapped){
     a.suffocationTimer=(a.suffocationTimer||25.0)-dt;
     a.health-=4*dt;
     if(a.suffocationTimer<=0||a.health<=0){
      this.kill(a);
      this.emit(`${a.type} ${a.id} suffocated beneath the collapse.`);
     }
    }
   }
  }
  // SAVE/RESTORE: global area definitions, spoil objects, and climate are first-class save data.
  serialize(){return {version:3,world:this.world.serialize(),surfaceWorld:this.surfaceWorld?.serialize(),activeLayer:this.activeLayer||'underground',randomState:this.random.state,time:this.time,evolution:this.evolution,totalEvolution:this.totalEvolution,traits:this.traits,traitLevels:this.traitLevels,ants:this.ants,eggs:this.eggs,jobs:this.jobs,nextId:this.nextId,resources:this.resources,food:this.food,water:this.water,foodStore:this.foodStore,waterStore:this.waterStore,foodHarvested:this.foodHarvested,foodConsumed:this.foodConsumed,surfaceDump:this.surfaceDump,spoilItems:this.spoilItems,areas:this.areas,zones:this.zones,squads:this.squads,rootAreas:this.rootAreas,nest:this.nest,groups:this.groups,feederId:this.feederId,commandMarkers:this.commandMarkers,waterTarget:this.waterTarget,antFoodNeedRatio:this.antFoodNeedRatio,antWaterNeedRatio:this.antWaterNeedRatio,eggProduction:this.eggProduction,gameOver:this.gameOver,creatures:this.creatures,colonies:this.colonies,drops:this.drops,discoveries:this.discoveries,spiderEggs:this.spiderEggs,castePriorities:this.castePriorities,ecologyTimer:this.ecologyTimer,statusTimer:this.statusTimer,healTimer:this.healTimer,aiEnabled:this.aiEnabled,events:this.events,climate:this.climate?.serialize(),activeInflows:this.activeInflows,broodPoints:this.broodPoints,unlockedBroodCap:this.unlockedBroodCap,broodCapTier:this.broodCapTier,broodHelperUnlocked:this.broodHelperUnlocked,feedUpgradeTier:this.feedUpgradeTier,hatchSpeedTier:this.hatchSpeedTier,mutationEnhancerTier:this.mutationEnhancerTier,casteModifierTier:this.casteModifierTier,customCasteChances:this.customCasteChances};}
    static restore(data){if(data.version!==3||!Array.isArray(data.ants)||!data.world?.cells)throw Error('This save predates hunger, water, and construction. Start a new colony.');const s=Object.create(Simulation.prototype);Object.assign(s,data);s.commandMarkers=s.commandMarkers||[];s.spoilItems=s.spoilItems||[];s.areas=s.areas||{};s.zones=data.zones||{};s.squads=data.squads||Array.from({length:10},(_,i)=>({id:i,name:`Squad ${i}`,zoneId:null,strictBounds:false,role:'auto',priorityOverrides:{}}));s.rootAreas=s.rootAreas||{};s.spiderEggs=s.spiderEggs||[];s.waterTarget=s.waterTarget||'queen';s.antFoodNeedRatio=s.antFoodNeedRatio??(data.antNeedRatio??C.antFoodNeedRatio);s.antWaterNeedRatio=s.antWaterNeedRatio??(data.antNeedRatio??C.antWaterNeedRatio);s.evolution=Number(data.evolution)||0;s.totalEvolution=Number(data.totalEvolution)||0;s.broodPoints=data.broodPoints||0;s.unlockedBroodCap=data.unlockedBroodCap||1;s.broodCapTier=data.broodCapTier||0;s.broodHelperUnlocked=data.broodHelperUnlocked||false;s.feedUpgradeTier=data.feedUpgradeTier||0;s.hatchSpeedTier=data.hatchSpeedTier||0;s.mutationEnhancerTier=data.mutationEnhancerTier||0;s.casteModifierTier=data.casteModifierTier||0;s.customCasteChances=data.customCasteChances||null;s.foodStore.tiles=s.foodStore.tiles||Math.round(C.startingFoodCapacity/C.foodStoragePerTile);s.foodStore.hole=false;s.waterStore.tiles=s.waterStore.tiles||[];s.castePriorities=data.castePriorities||JSON.parse(JSON.stringify(AntGame.DefaultCastePriorities||{}));s.world=World.restore(data.world);s.surfaceWorld=AntGame.SurfaceWorld?(data.surfaceWorld?AntGame.SurfaceWorld.restore(data.surfaceWorld,s.world):new AntGame.SurfaceWorld(s.world.seed,s.world)):null;s.activeLayer=data.activeLayer||'underground';s.random=new Random(data.randomState);s.activeInflows=data.activeInflows||[];s.climate=new (AntGame.Climate||class{constructor(){this.dayProgress=0;this.temperature=17;this.humidity=90;}update(){}serialize(){return null;}restore(){}})(s.world.seed,s);if(data.climate)s.climate.restore(data.climate);s.syncStores();for(const a of s.ants)if(a.destination){if(a.destination.kind==='pit'){a.destination.pit=s.world.pits.find(p=>p.x===a.destination.point?.x&&p.y===a.destination.point?.y)||s.world.pit;a.destination.point=a.destination.pit;}else if(a.destination.kind==='queen')a.destination.point=s.nest;else if(a.destination.kind==='foreign'){const col=s.colonies.find(c=>c.id===a.destination.colonyId);if(col)a.destination.point=col.pit;}}return s;}
  conservation(){return AntGame.Inventory.conservation(this);}
}
AntGame.Simulation=Simulation;
})();
