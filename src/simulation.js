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
const {Config:C,Random,World,pathfind,findRoute,key,rollCaste,FoodTypes,hexDistance,hexDisk,hexRound,canCarry}=AntGame;
const dist=(a,b)=>hexDistance(a,b);
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
  this.nest={...this.world.founding.nest};this.foodStore={...this.world.founding.foodStore,used:this.food,capacity:C.startingFoodCapacity,hole:false,tiles:40,items:[]};this.foodStore.items=this.makeFoodItems(this.food,'ration','starting-ration');
  const waterPos=this.world.founding.waterStore||{x:this.nest.x+2,y:this.nest.y};
  const waterCell=this.world.get(waterPos.x,waterPos.y);
  waterCell.solid=false;waterCell.zone='water';waterCell.water=7;waterCell.staticWater=true;waterCell.discovered=true;
  this.waterStore={used:0,capacity:0,items:this.makeItems('starting-water','water',this.water),tiles:[]};
  this.world.activeWater.add(key(waterPos.x,waterPos.y));
  this.spoilItems=[];this.areas={};this.groups=Array.from({length:10},()=>[]);this.feederId=null;this.commandMarkers=[];this.waterTarget='queen';this.antFoodNeedRatio=C.antFoodNeedRatio;this.antWaterNeedRatio=C.antWaterNeedRatio;
  this.eggProduction=true;this.gameOver=false;this.creatures=[];this.colonies=[];this.drops=[];this.discoveries=[];this.spiderEggs=[];this.rootAreas={};
  this.castePriorities=JSON.parse(JSON.stringify(AntGame.DefaultCastePriorities||{}));
  this.ecologyTimer=0;this.statusTimer=0;this.healTimer=0;this.aiEnabled=true;
  for(const p of hexDisk(this.nest.x,this.nest.y,3))if((p.x!==this.nest.x||p.y!==this.nest.y)&&(p.x!==waterPos.x||p.y!==waterPos.y))this.world.open(p.x,p.y,'food-store');
  const queen=this.addAnt('queen',this.nest.x,this.nest.y);queen.fertile=true;queen.layTimer=C.firstEggTime;queen.health=C.queenHealth;this.addAnt('worker',this.nest.x+1,this.nest.y);this.world.senseAt(queen.x,queen.y,C.queenRevealRadius);
  AntGame.Ecology.sync(this);
 }
 emit(text){this.events.push({time:this.time,text});if(this.events.length>24)this.events.shift();}
 effect(name){let result=name==='vision'?0:1;for(const t of AntGame.Traits)if(this.traits.includes(t.id)&&t.effects[name]!==undefined){const level=this.traitLevels?.[t.id]||1;if(name==='vision')result+=t.effects[name]*level;else result*=t.effects[name]**level;}return result;}
 foodCapacity(){return this.foodStore.tiles*C.foodStoragePerTile*this.effect('foodCap');}
 // INVENTORY HELPERS: a whole unit is a distinct object so storage slots are inspectable.
 makeItems(prefix,type,value,typeKey='type'){const items=[];let remaining=Math.max(0,value),index=0;while(remaining>.0001){const amount=Math.min(1,remaining),item={id:`${prefix}-${this.nextId++}`,amount};item[typeKey]=type;items.push(item);remaining-=amount;index++;}return items;}
 // FOOD SLOTS: a food object records both its chamber tile and its one-of-five slot.
 makeFoodItems(value,foodType='ration',prefix='food'){const start=this.foodStore?.items?.length||0;return this.makeItems(prefix,foodType,value,'foodType').map((item,index)=>({...item,storageTile:Math.floor((start+index)/C.foodStoragePerTile),storageSlot:(start+index)%C.foodStoragePerTile}));}
 itemTotal(items=[]){return items.reduce((total,item)=>total+(item.amount||0),0);}
 queenWaterCapacity(){return C.startingWaterCapacity*this.effect('waterCap');}
 waterCapacity(){return (C.startingWaterCapacity+this.waterStore.tiles.length*C.waterStoragePerTile)*this.effect('waterCap');}
 colonyCapacity(){return Math.floor(C.startingColonyCap*this.effect('colonyCap'));}
 feederCapacity(){return Math.floor(1*this.effect('feederCap'));}
 getCastePriority(caste,task){return this.castePriorities?.[caste]?.[task]??AntGame.DefaultCastePriorities?.[caste]?.[task]??5;}
 setCastePriority(caste,task,val){if(!this.castePriorities)this.castePriorities=JSON.parse(JSON.stringify(AntGame.DefaultCastePriorities||{}));if(!this.castePriorities[caste])this.castePriorities[caste]={...AntGame.DefaultCastePriorities[caste]};this.castePriorities[caste][task]=Math.max(1,Math.min(10,Math.round(Number(val)||5)));}
 resetCastePriorities(caste=null){if(caste){if(AntGame.DefaultCastePriorities?.[caste])this.castePriorities[caste]={...AntGame.DefaultCastePriorities[caste]};}else{this.castePriorities=JSON.parse(JSON.stringify(AntGame.DefaultCastePriorities||{}));}}
 // SYNCHRONIZATION: accepts debug/save edits while preserving existing individual items.
 syncStores(){this.food=Math.max(0,Math.min(this.food,this.foodCapacity()));this.water=Math.max(0,Math.min(this.water,this.queenWaterCapacity()));this.foodStore.items=this.foodStore.items||[];this.waterStore.items=this.waterStore.items||[];this.foodStore.items.forEach((item,index)=>{item.storageTile??=Math.floor(index/C.foodStoragePerTile);item.storageSlot??=index%C.foodStoragePerTile;});const foodDelta=this.food-this.itemTotal(this.foodStore.items),waterDelta=this.water-this.itemTotal(this.waterStore.items);if(foodDelta>.0001)this.foodStore.items.push(...this.makeFoodItems(foodDelta,'ration','restored-ration'));else if(foodDelta<-.0001)this.takeItems(this.foodStore.items,-foodDelta);if(waterDelta>.0001)this.waterStore.items.push(...this.makeItems('restored-water','water',waterDelta));else if(waterDelta<-.0001)this.takeItems(this.waterStore.items,-waterDelta);this.foodStore.used=this.itemTotal(this.foodStore.items);this.foodStore.capacity=this.foodCapacity();this.waterStore.used=this.reservoirWater();this.waterStore.capacity=this.waterStore.tiles.length*C.waterStoragePerTile*this.effect('waterCap');}
 takeItems(items,value){let left=Math.max(0,value);for(const item of items){const taken=Math.min(left,item.amount);item.amount-=taken;left-=taken;if(left<=.0001)break;}for(let i=items.length-1;i>=0;i--)if(items[i].amount<=.0001)items.splice(i,1);return value-left;}
 addFood(value,foodType='ration'){const accepted=Math.max(0,Math.min(value,this.foodCapacity()-this.food));if(!accepted)return 0;this.food+=accepted;this.foodStore.items.push(...this.makeFoodItems(accepted,foodType));this.foodHarvested+=accepted;this.syncStores();return accepted;}
 spendFood(value){const previous=this.food;this.food=Math.max(0,this.food-value);const spent=previous-this.food;this.takeItems(this.foodStore.items,value);this.foodConsumed+=spent;this.syncStores();return spent;}
 addWater(value){const accepted=Math.max(0,Math.min(value,this.queenWaterCapacity()-this.water));if(!accepted)return 0;this.water+=accepted;this.waterStore.items.push(...this.makeItems('water','water',accepted));this.syncStores();return accepted;}
 spendWater(value){const previous=this.water;this.water=Math.max(0,this.water-value);const spent=previous-this.water;this.takeItems(this.waterStore.items,value);this.syncStores();return spent;}
 reservoirDestination(a){for(const tile of this.waterStore.tiles){if((tile.water||0)>=C.waterStoragePerTile)continue;const cell=this.world.peek(tile.x,tile.y),face=this.world.faces(cell).find(n=>pathfind(this.world,a,n)!==null);if(face)return{kind:'reservoir',tile,point:face};}return null;}
 reservoirWater(){return this.waterStore.tiles.reduce((sum,tile)=>sum+(tile.water||0),0);}
 // RESERVOIR WITHDRAWAL: a worker physically carries stored droplets back to the queen.
 reservoirSource(a){for(const tile of this.waterStore.tiles){if((tile.water||0)<=0)continue;const cell=this.world.peek(tile.x,tile.y),face=this.world.faces(cell).find(n=>pathfind(this.world,a,n)!==null);if(face)return{tile,point:face};}return null;}
 requestReservoirWithdrawal(){const worker=this.ants.find(a=>a.alive&&a.colonyId===1&&isWorkerMorph(a.type)&&!a.feeder&&!a.held&&a.state==='idle');if(!worker)return 'No idle worker is available to collect stored water.';const source=this.reservoirSource(worker);if(!source)return 'No reachable stored water is available.';worker.task={type:'withdraw-water',tile:source.tile};this.route(worker,source.point,'withdraw-water');this.emit(`Worker ${worker.id} is retrieving reservoir water.`);return null;}
 pickupReservoir(a){const tile=a.task?.tile;if(!tile||tile.water<=0){a.state='idle';return;}const take=Math.min(C.waterDropValue,tile.water);tile.water-=take;this.takeItems(tile.items||[],take);a.carry={type:'water',amount:take};a.destination={point:this.nest,kind:'queen'};this.route(a,this.nest,'carrying');}
 queen(){return this.ants.find(a=>a.colonyId===1&&a.type==='queen'&&a.fertile);}
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
   health=250; speed=C.moveSpeed; maxFoodNeed=50; maxWaterNeed=50; attackDamage=20; canMine=false; canBuild=false; maxCarry=5;
  }else if(type==='major'){
   health=300; speed=C.moveSpeed; maxFoodNeed=50; maxWaterNeed=50; digRate=3.0; attackDamage=24; maxCarry=15; drainMult=2; clearanceNeeded=3;
  }else if(type==='supermajor'){
   health=500; speed=C.moveSpeed; maxFoodNeed=50; maxWaterNeed=50; digRate=5.0; attackDamage=40; maxCarry=25; drainMult=3; clearanceNeeded=3;
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
  const a={id:this.nextId++,colonyId,type,x,y,health,maxHealth:health,alive:true,age:0,speed,angle:0,state:'idle',path:[],task:null,carry:null,timer:0,held:false,preferred:null,fertile:false,feeder:false,nickname:null,roleName:null,shade,layTimer:C.eggInterval,foodNeed:isQ?null:maxFoodNeed,waterNeed:isQ?null:maxWaterNeed,maxFoodNeed,maxWaterNeed,canMine,canBuild,digRate,attackDamage,maxCarry,drainMult,clearanceNeeded,actions,visual:{sprite:null,animationSet:null,frame:0,scale:1,offset:[0,0],caste:type},reproductive:type==='princess'?{role:'princess',winged:true,mateReady:false,dispersal:false}:null,modifiers:{}};
  this.ants.push(a);return a;
 }
 livingPopulation(colonyId=1){return this.ants.filter(a=>a.alive&&a.colonyId===colonyId).length;}
 canLay(q){return q.colonyId!==1||(!this.gameOver&&this.eggProduction&&this.livingPopulation(1)+this.eggs.filter(e=>e.colonyId===1).length<this.colonyCapacity()&&this.food>=this.foodCapacity()*C.foodCriticalRatio&&this.water>=this.waterCapacity()*C.waterCriticalRatio&&this.food>=C.eggFoodCost&&this.water>=C.eggWaterCost);}
 layEgg(q){
  if(!this.canLay(q))return false;
  if(q.colonyId===1){this.spendFood(C.eggFoodCost);this.spendWater(C.eggWaterCost);}
  const assignedAntType=rollCaste(this.random),angle=this.random.next()*Math.PI*2,r=1+this.random.next()*2;let x=q.x+Math.cos(angle)*r,y=q.y+Math.sin(angle)*r;
  if(this.world.peek(Math.round(x),Math.round(y))?.solid!==false){x=q.x;y=q.y;}
  this.eggs.push({id:this.nextId++,x,y,assignedAntType,stage:'egg',age:0,duration:C.hatchTime,colonyId:q.colonyId});if(q.colonyId===1)this.emit('The queen laid an egg. Food and water were consumed.');return true;
 }
 setPath(a,path,state){const center={x:Math.round(a.x),y:Math.round(a.y)};if(Math.hypot(a.x-center.x,a.y-center.y)>.001)path.unshift(center);a.path=path;a.state=state;}
 route(a,target,state){const p=pathfind(this.world,a,target,a.clearanceNeeded||1);if(p===null)return false;this.setPath(a,p,state);return true;}
  release(a,unassignFeeder=false){
   if(a.task?.targetId){
    const t=this.target(a.task.targetId);
    if(t?.reservedFor===a.id)t.reservedFor=null;
    if(t?.processingFeederId===a.id)t.processingFeederId=null;
   }
   a.held=false;a.preferred=null;a.task=null;a.manualOrder=false;a.idleReleaseTimer=0;a.selected=false;
   if(unassignFeeder)a.feeder=false;
   if(!a.carry){a.path=[];a.state='idle';a.timer=0;}
  }
 setFeeder(a){if(!a||!isWorkerMorph(a.type)||a.colonyId!==1||!a.alive)return 'Select a living worker to assign as feeder.';if(a.feeder)return 'That ant is already a feeder.';const currentFeeders=this.ants.filter(w=>w.alive&&w.colonyId===1&&w.feeder);if(currentFeeders.length>=this.feederCapacity())return `Feeder cap reached (${currentFeeders.length}/${this.feederCapacity()}). Evolve Feeder specialization to assign more feeders.`;const names=['Antdrew','Antony','BatholANTmuel','Anthondis','Crumb','Teedle','Dale','Carmen','Huuuuucha','Antromeda'];a.feeder=true;a.actions.feed=true;a.roleName=a.nickname||names[Math.floor(this.random.next()*names.length)];a.held=false;a.task=null;a.path=[];a.state='idle';this.emit(`${a.roleName} is now a colony feeder.`);return null;}
 distributeDestinations(count,center){
  const results=[];
  const seen=new Set();
  const queue=[{x:center.x,y:center.y}];
  seen.add(key(center.x,center.y));
  while(queue.length&&results.length<count){
   const p=queue.shift();
   const c=this.world.peek(p.x,p.y);
   if(c&&c.discovered&&!c.solid&&!c.rock&&c.zone!=='rock'&&!c.isWell&&c.zone!=='well'&&(c.water||0)<6){
    if(pathfind(this.world,center,p)!==null){
     results.push({x:p.x,y:p.y});
    }
   }
   for(const n of this.world.neighbors(p.x,p.y)){
    const k=key(n.x,n.y);
    if(!seen.has(k)){
     seen.add(k);
     queue.push({x:n.x,y:n.y});
    }
   }
  }
  while(results.length<count)results.push({x:center.x,y:center.y});
  return results;
 }
 moveGroup(units,target){
  if(!units||!units.length)return null;
  if(units.length===1)return this.move(units[0],target);
  const dests=this.distributeDestinations(units.length,target);
  let ok=false,lastErr=null;
  for(let i=0;i<units.length;i++){
   const err=this.move(units[i],dests[i]);
   if(!err)ok=true;else lastErr=err;
  }
  return ok?null:lastErr;
 }
 move(a,target){if(!a.alive||a.colonyId!==1)return 'You can order only living ants in your colony.';const c=this.world.peek(target.x,target.y);if(!c?.discovered||c.solid||c.water>=6||pathfind(this.world,a,target,a.clearanceNeeded||1)===null)return 'No accessible revealed route to that location.';a.task=null;a.preferred=null;a.held=true;a.manualOrder=true;a.idleReleaseTimer=0;a.pendingTask=null;a.path=[];if(a.carry){a.pendingMove={...target};this.toStore(a);}else this.route(a,target,'moving');return null;}
 designate(x,y,ant=null,colonyId=1){const c=this.world.peek(x,y);if(c&&c.discovered){if(c.rock||c.zone==='rock')return false;if(!c.solid)return false;}const id=`${colonyId}:dig:${key(x,y)}`;if(!this.jobs.some(j=>j.id===id)){let status='unknown';const nestPos=colonyId===1?this.nest:(this.colonies.find(cl=>cl.id===colonyId)?.pit||{x,y});if(c&&(c.discovered||colonyId!==1)){const faces=this.world.faces(c,colonyId===1);status=faces.some(f=>pathfind(this.world,nestPos,f)!==null)?'available':'blocked';}this.jobs.push({id,type:'dig',x,y,colonyId,priority:1,status});}if(ant&&isWorkerMorph(ant.type)&&ant.canMine!==false&&ant.alive&&ant.colonyId===colonyId){ant.preferred=id;ant.held=false;ant.manualOrder=true;ant.idleReleaseTimer=0;}return true;}
 designateBuild(x,y,ant=null,structure='food'){const c=this.world.peek(x,y);if(!c?.discovered)return false;const id=`1:build:${structure}:${key(x,y)}`;if(!this.jobs.some(j=>j.id===id)){const excNeeded=structure==='water'?2:0;let status='blocked';if(c.solid||(c.excavations||0)<excNeeded){status='undug';}else{status=pathfind(this.world,this.nest,c)?(this.food>=C.buildFoodCost&&this.world.pit.used>=C.buildDirtCost?'available':'resources'):'blocked';}this.jobs.push({id,type:'build',structure,x,y,colonyId:1,priority:2,status,food:C.buildFoodCost,dirt:C.buildDirtCost,excavations:excNeeded});}const build=this.jobs.find(j=>j.id===id);if(c.solid){this.designate(x,y,ant);const excavation=this.jobs.find(j=>j.type==='dig'&&j.x===c.x&&j.y===c.y);if(excavation)excavation.buildId=id;}else if(build.excavations>(c.excavations||0))this.ensureExcavationJob(build,c);if(ant&&isWorkerMorph(ant.type)&&ant.canBuild!==false&&ant.alive){ant.preferred=id;ant.held=false;ant.manualOrder=true;ant.idleReleaseTimer=0;}return true;}
 ensureExcavationJob(build,c){if((c.excavations||0)>=build.excavations)return;const excJobId=`${build.id}:excavate:${(c.excavations||0)+1}`;if(!this.jobs.some(j=>j.id===excJobId)){const faces=this.world.faces(c,true);const status=faces.some(f=>pathfind(this.world,this.nest,f)!==null)?'available':'blocked';this.jobs.push({id:excJobId,type:'dig',buildId:build.id,x:c.x,y:c.y,colonyId:build.colonyId,priority:build.priority,status});}}
 brush(x,y,r,mode='dig',ants=[],structure='food'){
  let count=0;
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
    const t=this.resources.find(res=>res.remaining>0&&Math.round(res.x)===p.x&&Math.round(res.y)===p.y)||
            this.creatures.find(cr=>cr.alive&&cr.species==='root_aphid'&&Math.round(cr.x)===p.x&&Math.round(cr.y)===p.y);
    if(t&&(!t.reservedFor||(a&&t.reservedFor===a.id))){
     this.orderTarget('harvest',t.id,ants);
     count++;
    }
   }else if(mode==='carry'){
    const t=this.creatures.find(cr=>!cr.alive&&cr.food>0&&!cr.inStorage&&Math.round(cr.x)===p.x&&Math.round(cr.y)===p.y)||
            this.resources.find(res=>res.remaining>0&&!res.inStorage&&Math.round(res.x)===p.x&&Math.round(res.y)===p.y);
    if(t&&!t.carriedBy&&(!t.reservedFor||(a&&t.reservedFor===a.id))){
     this.orderTarget('carry',t.id,ants);
     count++;
    }
   }else if(mode==='attack'){
    const t=this.creatures.find(cr=>cr.alive&&cr.colonyId!==1&&Math.round(cr.x)===p.x&&Math.round(cr.y)===p.y);
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
 paintArea(x,y,nameOrId='Unnamed area',type='territory'){const cell=this.world.peek(x,y);if(!cell?.discovered||cell.solid)return false;const id=this.areas[nameOrId]?nameOrId:this.createArea(nameOrId,type),area=this.areas[id];cell.area={id,name:area.name,type:area.type};this.world.revision++;return true;}
 renameArea(id,name){const area=this.areas[id],cleanName=(name||'').trim().slice(0,24);if(!area||!cleanName)return false;const nextId=`${area.type}:${cleanName}`;for(const cell of this.world.cells.values())if(cell.area?.id===id)cell.area={id:nextId,name:cleanName,type:area.type};delete this.areas[id];this.areas[nextId]={name:cleanName,type:area.type};this.world.revision++;return nextId;}
 eraseArea(id){if(!this.areas[id])return false;for(const cell of this.world.cells.values())if(cell.area?.id===id)delete cell.area;delete this.areas[id];this.world.revision++;return true;}
 cancel(x,y){this.jobs=this.jobs.filter(j=>j.colonyId!==1||j.x!==x||j.y!==y);for(const a of this.ants)if(a.colonyId===1&&a.task&&(a.task.x===x&&a.task.y===y)){a.task=null;if(!a.carry){a.path=[];a.state='idle';}}}
  target(id){return this.resources.find(r=>r.id===id)||this.creatures.find(c=>c.id===id)||this.ants.find(a=>a.id===id);}
  orderTarget(kind,id,ants=[]){
   const t=this.target(id);
   if(!t||!this.world.peek(Math.round(t.x),Math.round(t.y))?.discovered)return 'No visible target.';
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
    const carrier=commandable.find(a=>canCarry(a,t)&&pathfind(this.world,a,{x:Math.round(t.x),y:Math.round(t.y)},a.clearanceNeeded||1)!==null);
    if(!carrier)return 'None of the selected ants are strong enough or have a clear path to carry that object.';
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
    this.route(carrier,{x:Math.round(t.x),y:Math.round(t.y)},'to-carry');
    return null;
   }
   let orders=0;
   for(const a of commandable){
    if(pathfind(this.world,a,{x:Math.round(t.x),y:Math.round(t.y)},a.clearanceNeeded||1)===null)continue;
    const order={type:kind,targetId:id,source:'manual'};
    a.held=false;a.preferred=null;a.manualOrder=true;a.idleReleaseTimer=0;
    if(a.carry){a.pendingTask=order;this.toStore(a);}
    else{a.path=[];a.task=order;a.state=kind;a.timer=0;}
    orders++;
   }
   if(!orders)return 'Target blocked: open a tunnel to it first.';
   if(kind==='attack'&&t.colonyId){const col=this.colonies.find(c=>c.id===t.colonyId);if(col)col.relation='hostile';}
   return null;
  }
 storage(a){
  if(a.carry?.type==='food'||a.carry?.type==='corpse'||a.carry?.type==='seed'){
   if(a.colonyId===1){
    const fs=[...this.world.cells.values()].find(c=>c.zone==='food-store'&&!c.solid&&c.discovered&&pathfind(this.world,a,c)!==null);
    return {point:fs||this.world.founding.foodStore||this.nest,kind:'food-store'};
   }else{
    const col=this.colonies.find(c=>c.id===a.colonyId);
    return col?{point:col.foodStore||{x:col.x+1,y:col.y},kind:'food-store',colonyId:col.id}:null;
   }
  }
  if(a.carry?.type==='water'){
   if(a.colonyId===1){
    if(this.waterTarget==='reservoir'){const r=this.reservoirDestination(a);if(r)return r;}
    return {point:this.world.founding.waterStore||this.nest,kind:'queen'};
   }else{
    const col=this.colonies.find(c=>c.id===a.colonyId);
    return col?{point:col.waterStore||{x:col.x-1,y:col.y},kind:'water-store',colonyId:col.id}:null;
   }
  }
  if(a.colonyId!==1){const col=this.colonies.find(c=>c.id===a.colonyId);return col?{point:col.pit,kind:'foreign',colonyId:col.id}:null;}
  for(const pit of this.world.pits)if(pit.used<pit.capacity&&pathfind(this.world,a,pit)!==null)return {point:pit,kind:'pit',pit};
  const spoil=[...this.world.cells.values()].find(c=>c.zone==='spoil'&&!c.solid&&this.spoilItems.filter(item=>item.x===c.x&&item.y===c.y).reduce((total,item)=>total+item.amount,0)<C.spoilStoragePerTile&&pathfind(this.world,a,c)!==null);return spoil?{point:spoil,kind:'spoil'}:null;
 }
 toStore(a){const dest=this.storage(a);a.destination=dest;if(!dest||!this.route(a,dest.point,'carrying')){a.state='blocked';a.timer=1;}}
 routeToBuildSupply(a){if(this.food<C.buildFoodCost||this.world.pit.used<C.buildDirtCost){a.state='build-no-resources';a.timer=2;return;}if(!this.route(a,this.nest,'to-build-supply')){a.state='blocked';a.timer=1;}}
 routeToBuild(a){if(!this.route(a,{x:a.task.x,y:a.task.y},'building')){a.state='build-blocked';a.timer=2;}}
 refreshJobStates(){
  for(const j of [...this.jobs]){
   const c=this.world.peek(j.x,j.y);
   const nestPos=j.colonyId===1?this.nest:(this.colonies.find(cl=>cl.id===j.colonyId)?.pit||{x:j.x,y:j.y});
   if(!c||(!c.discovered&&j.colonyId===1)){j.status='unknown';continue;}
   if(c.rock||c.zone==='rock'){this.jobs=this.jobs.filter(job=>job!==j);continue;}
   if(j.type==='dig'&&!c.solid&&!j.buildId){this.jobs=this.jobs.filter(job=>job!==j);continue;}
   if(j.type==='build'){
    if(c.solid||(c.excavations||0)<j.excavations){
     j.status='undug';
     if(!c.solid)this.ensureExcavationJob(j,c);
     continue;
    }
    j.status=pathfind(this.world,nestPos,c)?(this.food>=j.food&&this.world.pit.used>=j.dirt?'available':'resources'):'blocked';
    continue;
   }
   const faces=this.world.faces(c,j.colonyId===1);
   j.status=faces.some(f=>pathfind(this.world,nestPos,f)!==null)?'available':'blocked';
  }
 }
  findAvailableCarryTarget(a){
   const reachable=pt=>pathfind(this.world,a,pt,a.clearanceNeeded||1)!==null;
   const candidates=[];
   for(const c of this.creatures){
    if(!c.alive&&c.food>0&&!c.inStorage&&!c.carriedBy&&(!c.reservedFor||c.reservedFor===a.id)&&AntGame.canCarry(a,c)){
     const pt={x:Math.round(c.x),y:Math.round(c.y)};
     if(this.world.peek(pt.x,pt.y)?.discovered&&reachable(pt))candidates.push({target:c,point:pt,dist:dist(a,c)});
    }
   }
   for(const r of this.resources){
    if(r.remaining>0&&!r.inStorage&&!r.carriedBy&&(!r.reservedFor||r.reservedFor===a.id)&&AntGame.canCarry(a,r)){
     const pt={x:Math.round(r.x),y:Math.round(r.y)};
     if(this.world.peek(pt.x,pt.y)?.discovered&&reachable(pt))candidates.push({target:r,point:pt,dist:dist(a,r)});
    }
   }
   candidates.sort((x,y)=>x.dist-y.dist);
   return candidates[0]?.target||null;
  }
  findAvailableHarvestTarget(a){
   const reachable=pt=>pathfind(this.world,a,pt,a.clearanceNeeded||1)!==null;
   const candidates=[];
   for(const r of this.resources){
    if(r.remaining>0&&!r.inStorage&&!r.carriedBy&&(!r.reservedFor||r.reservedFor===a.id)){
     const pt={x:Math.round(r.x),y:Math.round(r.y)};
     if(this.world.peek(pt.x,pt.y)?.discovered&&reachable(pt))candidates.push({target:r,point:pt,dist:dist(a,r)});
    }
   }
   for(const c of this.creatures){
    if(c.alive&&c.species==='root_aphid'&&c.milkCooldown<=0){
     const pt={x:Math.round(c.x),y:Math.round(c.y)};
     if(this.world.peek(pt.x,pt.y)?.discovered&&reachable(pt))candidates.push({target:c,point:pt,dist:dist(a,c)});
    }
   }
   candidates.sort((x,y)=>x.dist-y.dist);
   return candidates[0]?.target||null;
  }
  findAvailableJobs(a,type){
   return this.jobs.filter(j=>j.colonyId===a.colonyId&&j.type===type&&j.status==='available'&&!this.ants.some(b=>b.id!==a.id&&b.task?.id===j.id));
  }
  dispatchJob(a,jobs,type){
   const goals=new Map();
   for(const j of jobs){
    const c=this.world.peek(j.x,j.y);
    if(!c)continue;
    if(j.type==='build'&&!c.solid){goals.set(key(c.x,c.y),{job:j,face:c});continue;}
    if(j.type==='dig'&&j.buildId&&!c.solid){goals.set(key(c.x,c.y),{job:j,face:c});continue;}
    if(j.type==='dig'&&c.solid)for(const face of this.world.faces(c,a.colonyId===1)){
     const k=key(face.x,face.y);if(!goals.has(k))goals.set(k,{job:j,face});
    }
   }
   const result=findRoute(this.world,a,goals,a.clearanceNeeded||1);
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
  executeChosenTask(a,chosen){
   if(chosen.type==='selfFeed'||chosen.type==='selfWater'){
    const needType=chosen.type==='selfFeed'?'food':'water';
    a.task={type:`need-${needType}`,source:'needs',needSource:chosen.source};
    if(!this.route(a,chosen.source.point,`need-${needType}`)){a.task=null;a.timer=1;a.state='idle';}
    return;
   }
   if(chosen.type==='combat'){
    a.task={type:'attack',targetId:chosen.enemy.id,source:'auto-guard'};
    a.state='attack';a.timer=0;
    this.route(a,{x:Math.round(chosen.enemy.x),y:Math.round(chosen.enemy.y)},'attack');
    return;
   }
   if(chosen.type==='feedQueen'&&chosen.source){
    const p=chosen.source.point||{x:Math.round(chosen.source.x),y:Math.round(chosen.source.y)};
    a.task={type:'feed-food',targetId:chosen.source.id||key(chosen.source.x,chosen.source.y),sourceKind:chosen.source.feedKind,source:chosen.source};
    this.route(a,p,'feeding-food');
    return;
   }
   if(chosen.type==='queenWater'&&chosen.source){
    const p=chosen.source.point||{x:Math.round(chosen.source.x),y:Math.round(chosen.source.y)};
    a.task={type:'feed-water',targetId:chosen.source.id||key(chosen.source.x,chosen.source.y),sourceKind:chosen.source.feedKind,source:chosen.source};
    this.route(a,p,'feeding-water');
    return;
   }
   if(chosen.type==='chewFood'&&chosen.processObj){
    const targetObj=chosen.processObj;
    targetObj.processingFeederId=a.id;
    const distToObj=dist(a,targetObj);
    a.task={type:'process-food',targetId:targetObj.id,source:targetObj};
    if(distToObj>1.2){
     this.route(a,{x:Math.round(targetObj.x),y:Math.round(targetObj.y)},'to-process');
    }else{
     a.state='processing';a.timer=0;
    }
    return;
   }
   if(chosen.type==='carry'&&chosen.target){
    chosen.target.reservedFor=a.id;
    a.task={type:'carry',targetId:chosen.target.id,source:'colony'};
    this.route(a,{x:Math.round(chosen.target.x),y:Math.round(chosen.target.y)},'to-carry');
    return;
   }
   if(chosen.type==='harvest'&&chosen.target){
    a.task={type:'harvest',targetId:chosen.target.id,source:'colony'};
    this.route(a,{x:Math.round(chosen.target.x),y:Math.round(chosen.target.y)},'harvest');
    return;
   }
   if(chosen.type==='build'){
    if(!this.dispatchJob(a,chosen.jobs,'build')){a.timer=1;a.state='idle';}
    return;
   }
   if(chosen.type==='dig'){
    if(!this.dispatchJob(a,chosen.jobs,'dig')){a.timer=1;a.state='idle';}
    return;
   }
   if(chosen.type==='haulSoil'){
    if(!this.dispatchDrop(a,chosen.drops)){a.timer=1;a.state='idle';}
    return;
   }
   a.timer=1;a.state='idle';
  }
  assign(a){
   if(!a.alive||a.held)return;
   if(a.preferred){
    const prefJob=this.jobs.find(j=>j.id===a.preferred&&j.status==='available');
    if(prefJob){
     if(prefJob.type==='build')this.dispatchJob(a,[prefJob],'build');
     else this.dispatchJob(a,[prefJob],'dig');
     return;
    }
    a.preferred=null;
   }

   const candidates=[];

   // 1. Self Feed
   if(a.actions?.gatherFood!==false){
    const fCap=a.maxFoodNeed||C.antFoodCapacity;
    if((a.foodNeed??fCap)<fCap*this.antFoodNeedRatio){
     const src=this.antNeedSource(a,'food');
     if(src)candidates.push({type:'selfFeed',source:src});
    }
   }

   // 2. Self Water
   if(a.actions?.gatherWater!==false){
    const wCap=a.maxWaterNeed||C.antWaterCapacity;
    if((a.waterNeed??wCap)<wCap*this.antWaterNeedRatio){
     const src=this.antNeedSource(a,'water');
     if(src)candidates.push({type:'selfWater',source:src});
    }
   }

   // 3. Combat
   if(a.actions?.combat!==false&&['soldier','major','supermajor'].includes(a.type)){
    const enemy=this.creatures.find(c=>c.alive&&(AntGame.Species[c.species]?.behavior==='aggressive'||c.provoked)&&hexDistance(a,c)<=6);
    if(enemy&&pathfind(this.world,a,enemy,a.clearanceNeeded||1)!==null)candidates.push({type:'combat',enemy});
   }

   // 4. Feed Queen
   if(a.feeder&&a.actions?.feed!==false){
    if(this.feederNeed()==='food'){
     const src=this.feederSource(a,'food');
     if(src){
      const p=src.point||{x:Math.round(src.x),y:Math.round(src.y)};
      if(pathfind(this.world,a,p)!==null)candidates.push({type:'feedQueen',source:src});
     }
    }
   }

   // 5. Queen Water
   if(a.feeder&&a.actions?.feed!==false){
    if(this.feederNeed()==='water'){
     const src=this.feederSource(a,'water');
     if(src){
      const p=src.point||{x:Math.round(src.x),y:Math.round(src.y)};
      if(pathfind(this.world,a,p)!==null)candidates.push({type:'queenWater',source:src});
     }
    }
   }

   // 6. Chew Food (Process Stored Whole Food)
   if(a.feeder&&a.actions?.feed!==false){
    const colId=a.colonyId||1,colFood=colId===1?this.food:(this.colonies.find(c=>c.id===colId)?.food||0),colCap=colId===1?this.foodCapacity():800;
    if(colFood<colCap){
     const storedCorpse=this.creatures.find(c=>!c.alive&&c.inStorage&&c.storageColonyId===colId&&c.food>0&&(!c.processingFeederId||c.processingFeederId===a.id));
     const storedSeed=!storedCorpse?this.resources.find(r=>r.inStorage&&r.storageColonyId===colId&&r.remaining>0&&(!r.processingFeederId||r.processingFeederId===a.id)):null;
     const processObj=storedCorpse||storedSeed;
     if(processObj)candidates.push({type:'chewFood',processObj});
    }
   }

   // 7. Carry
   if(a.actions?.carry!==false&&isWorkerMorph(a.type)){
    const target=this.findAvailableCarryTarget(a);
    if(target)candidates.push({type:'carry',target});
   }

   // 8. Harvest
   if(a.actions?.harvest!==false&&isWorkerMorph(a.type)){
    const target=this.findAvailableHarvestTarget(a);
    if(target)candidates.push({type:'harvest',target});
   }

   // 9. Build
   if(a.actions?.build!==false&&a.canBuild!==false){
    const builds=this.findAvailableJobs(a,'build');
    if(builds.length){
     const goals=new Map();
     for(const j of builds){const c=this.world.peek(j.x,j.y);if(c&&!c.solid)goals.set(key(c.x,c.y),{job:j,face:c});}
     if(goals.size&&findRoute(this.world,a,goals,a.clearanceNeeded||1))candidates.push({type:'build',jobs:builds});
    }
   }

   // 10. Dig
   if(a.actions?.dig!==false&&a.canMine!==false){
    const digs=this.findAvailableJobs(a,'dig');
    if(digs.length){
     const goals=new Map();
     for(const j of digs){
      const c=this.world.peek(j.x,j.y);if(!c)continue;
      if(j.buildId&&!c.solid){goals.set(key(c.x,c.y),{job:j,face:c});continue;}
      if(c.solid)for(const face of this.world.faces(c,a.colonyId===1)){const k=key(face.x,face.y);if(!goals.has(k))goals.set(k,{job:j,face});}
     }
     if(goals.size&&findRoute(this.world,a,goals,a.clearanceNeeded||1))candidates.push({type:'dig',jobs:digs});
    }
   }

   // 11. Haul Soil
   if(a.actions?.haulSoil!==false){
    const drops=this.drops.filter(d=>!d.claimed);
    if(drops.length){
     const goals=new Map();
     for(const drop of drops){const c=this.world.peek(drop.x,drop.y);if(c&&!c.solid)goals.set(key(drop.x,drop.y),{drop});}
     if(goals.size&&findRoute(this.world,a,goals,a.clearanceNeeded||1))candidates.push({type:'haulSoil',drops});
    }
   }

   if(!candidates.length){
    a.timer=0.5;a.state='idle';return;
   }

   candidates.sort((t1,t2)=>{
    const role=a.feeder?'feeder':a.type;
    const p1=this.getCastePriority(role,t1.type);
    const p2=this.getCastePriority(role,t2.type);
    if(p1!==p2)return p1-p2;
    const r1=AntGame.TaskHierarchy.findIndex(th=>th.id===t1.type);
    const r2=AntGame.TaskHierarchy.findIndex(th=>th.id===t2.type);
    return r1-r2;
   });

   const chosen=candidates[0];
   this.executeChosenTask(a,chosen);
  }
 feederNeed(){if(this.food<this.foodCapacity()*C.feederNeedRatio)return 'food';if(this.waterTarget==='reservoir'&&this.reservoirWater()<this.waterStore.tiles.length*C.waterStoragePerTile)return 'water';if(this.water<this.waterCapacity()*C.feederNeedRatio)return 'water';return null;}
 // FEEDER TARGETING: food sources include discovered loose food and edible corpses.
 feederSource(a,need){
  if(need==='food'){
   if(a.actions?.gatherFood===false)return null;
   const visible=r=>this.world.peek(Math.round(r.x),Math.round(r.y))?.discovered&&dist(a,r)<=C.feederRange;
   const looseFood=this.resources.filter(r=>r.remaining>0&&!r.inStorage&&!r.carriedBy&&(!r.reservedFor||r.reservedFor===a.id)&&visible(r)).map(r=>({...r,feedKind:'resource'}));
   const corpses=this.creatures.filter(c=>!c.alive&&c.food>0&&!c.inStorage&&!c.carriedBy&&(!c.reservedFor||c.reservedFor===a.id)&&visible(c)).map(c=>({...c,feedKind:'corpse'}));
   return [...looseFood,...corpses].sort((x,y)=>dist(a,x)-dist(a,y))[0];
  }
  if(a.actions?.gatherWater===false)return null;
  const cells=[...this.world.activeWater].map(k=>this.world.cells.get(k)).filter(c=>c&&c.discovered&&c.water>.01&&!c.waterStorage&&dist(a,c)<=C.feederRange);
  for(const cell of cells){
   const point=pathfind(this.world,a,cell)?cell:(this.world.faces(cell).find(n=>pathfind(this.world,a,n)!=null)||cell);
   if(pathfind(this.world,a,point)!=null)return {...cell,point};
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
  if(damage){a.health-=damage*dt;if(a.health<=0)this.kill(a);}
 }
 antNeedType(a){const foodCap=a.maxFoodNeed||C.antFoodCapacity,waterCap=a.maxWaterNeed||C.antWaterCapacity;const foodThreshold=Math.max(0,Math.min(1,this.antFoodNeedRatio)),waterThreshold=Math.max(0,Math.min(1,this.antWaterNeedRatio));if(a.foodNeed<foodCap*foodThreshold)return 'food';if(a.waterNeed<waterCap*waterThreshold)return 'water';return null;}
 antNeedProtected(a){return a.held||a.state==='attack'||a.threatId||a.task?.source==='manual'||a.task?.source==='defense'||a.task?.source==='threat-report';}
 // NEED SOURCES: colony stores, discovered loose food/corpses, reservoirs, and safe terrain water. Ants never take from the Queen.
 antNeedSource(a,type){
  const reachable=point=>pathfind(this.world,a,point,a.clearanceNeeded||1)!==null;
  if(type==='food'){
   const isStarving=a.foodNeed<=0||a.foodNeed<(a.maxFoodNeed||C.antFoodCapacity)*0.1;
   const choices=[];
   if(a.colonyId===1){
    if(this.food>0){
     const foodCells=[...this.world.cells.values()].filter(c=>c.zone==='food-store'&&!c.solid&&c.discovered&&reachable(c));
     if(foodCells.length){
      const pt=foodCells.sort((x,y)=>dist(a,x)-dist(a,y))[0];
      choices.push({kind:'food-store',point:pt,distance:dist(a,pt)});
      }else if(reachable(this.world.founding.foodStore)){
       choices.push({kind:'food-store',point:this.world.founding.foodStore,distance:dist(a,this.world.founding.foodStore)});
     }else if(reachable(this.nest)){
      choices.push({kind:'food-store',point:this.nest,distance:dist(a,this.nest)});
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
    if(resource.remaining>0&&!resource.inStorage&&!resource.carriedBy&&(!resource.reservedFor||resource.reservedFor===a.id)&&this.world.peek(Math.round(resource.x),Math.round(resource.y))?.discovered&&reachable(resource)){
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
     if(!creature.alive&&creature.food>0&&!creature.carriedBy&&(!creature.reservedFor||creature.reservedFor===a.id)&&this.world.peek(Math.round(creature.x),Math.round(creature.y))?.discovered&&reachable(creature)){
      rawChoices.push({kind:'corpse',creature,point:{x:Math.round(creature.x),y:Math.round(creature.y)},distance:dist(a,creature)});
     }
    }
    for(const resource of this.resources){
     if(resource.remaining>0&&resource.inStorage&&!resource.carriedBy&&(!resource.reservedFor||resource.reservedFor===a.id)&&reachable(resource)){
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
   for(const tile of this.waterStore.tiles){
    const source=this.reservoirSource(a);
    if(source)choices.push({kind:'reservoir',tile:source.tile,point:source.point,distance:dist(a,source.point)});
    break;
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
   if(cell&&(cell.discovered||a.colonyId!==1)&&cell.water>.01&&!cell.waterStorage){
    const point=reachable(cell)?cell:this.world.faces(cell,a.colonyId!==1).find(n=>reachable(n));
    if(point)choices.push({kind:'terrain-water',cell,point,distance:dist(a,point)});
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
    const col=this.colonies.find(c=>c.id===source.colonyId);amount=Math.min(gap,col?.water||0);if(col)col.water-=amount;
   }else if(source.kind==='reservoir'){
    amount=Math.min(gap,source.tile.water);source.tile.water-=amount;this.takeItems(source.tile.items||[],amount);
   }else if(source.kind==='terrain-water'||source.kind==='well'){
    const avail=(source.cell.water/(source.cell.isWell?20:7))*100;amount=Math.min(gap,avail);
    if(amount>0){source.cell.water=Math.max(0,source.cell.water-(amount/100)*(source.cell.isWell?20:7));if(source.cell.water<=.0001){source.cell.water=0;this.world.activeWater.delete(key(source.cell.x,source.cell.y));}}
   }
  }
  if(type==='food')a.foodNeed=Math.min(capacity,a.foodNeed+amount);
  else a.waterNeed=Math.min(capacity,a.waterNeed+amount);
  a.task=null;a.state='idle';
  if(a.pendingCarry){
   const pc=a.pendingCarry;delete a.pendingCarry;
   a.task=pc;a.state='to-carry';
   const t=this.target(pc.targetId);
   if(t)this.route(a,{x:Math.round(t.x),y:Math.round(t.y)},'to-carry');
  }
 }
 // DEATH IN WEB: the corpse is recorded as an independently timed spider egg.
 kill(a){if(!a.alive)return;a.alive=false;a.health=0;a.path=[];a.isMoving=false;a.state='dead';if((a.webbedUntil||0)>this.time){this.spiderEggs.push({id:`spider-egg-${this.nextId++}`,x:Math.round(a.x),y:Math.round(a.y),age:0,duration:C.spiderEggHatchTime});}if(a.carry)this.drops.push({id:this.nextId++,x:Math.round(a.x),y:Math.round(a.y),load:a.carry,claimed:null});a.carry=null;for(const d of this.drops)if(d.claimed===a.id)d.claimed=null;if(a.colonyId===1)this.emit(a.type==='queen'?'The queen has died. The colony is dead.':`Worker ${a.id} has died.`);if(a.type==='queen'&&a.colonyId===1)this.gameOver=true;}
 canTravelDirect(a,target){const steps=Math.max(2,Math.ceil(hexDistance(a,target)*4));for(let i=1;i<=steps;i++){const t=i/steps,p=hexRound(a.x+(target.x-a.x)*t,a.y+(target.y-a.y)*t),c=this.world.peek(p.x,p.y);if(!c||c.solid||c.water>=6||c.waterStorage||c.isWell||c.zone==='well')return false;if(!AntGame.hasBodyClearance(this.world,p.x,p.y,a.clearanceNeeded||1)&&hexDistance(p,target)>0)return false;}return true;}
 // WEB IMMOBILIZATION: a webbed ant retains its order but cannot advance until
 // its individual webbedUntil clock expires.
  travel(a,dt){
   if((a.webbedUntil||0)>this.time)return true;
   if(a.state==='idle'||!a.path.length){a.path=[];a.waitTimer=0;return false;}

   const currHex=hexRound(a.x,a.y);
   const nextHex=a.path[0];

   if(nextHex&&(nextHex.x!==currHex.x||nextHex.y!==currHex.y)){
    const occupant=this.ants.find(b=>b.alive&&b.id!==a.id&&b.type!=='queen'&&hexRound(b.x,b.y).x===nextHex.x&&hexRound(b.x,b.y).y===nextHex.y);
    if(occupant){
     const occNext=occupant.path&&occupant.path[0];
     const isHeadOn=occNext&&(occNext.x===currHex.x&&occNext.y===currHex.y);
     if(isHeadOn){
      a.swappingWith=occupant.id;
      occupant.swappingWith=a.id;
      a.waitTimer=0;
     }else if(a.swappingWith===occupant.id){
      // swap underway
     }else{
      const isCorridor=this.world.neighbors(currHex.x,currHex.y).filter(n=>!n.solid).length<=2||this.world.neighbors(nextHex.x,nextHex.y).filter(n=>!n.solid).length<=2;
      const dToOcc=Math.hypot(occupant.x-a.x,occupant.y-a.y);
      if(isCorridor&&dToOcc<0.75){
       a.waitTimer=(a.waitTimer||0)+dt;
       if(a.waitTimer>1.2){
        const targetGoal=a.path[a.path.length-1];
        const tempSolid=this.world.peek(nextHex.x,nextHex.y);
        let altPath=null;
        if(tempSolid){
         const oldSolid=tempSolid.solid;
         tempSolid.solid=true;
         altPath=pathfind(this.world,currHex,targetGoal,a.clearanceNeeded||1);
         tempSolid.solid=oldSolid;
        }
        if(altPath&&altPath.length){
         this.setPath(a,altPath,a.state);
         a.waitTimer=0;
        }else{
         a.waitTimer=0.6;
        }
       }
       return true;
      }
     }
    }else{
     a.swappingWith=null;
     a.waitTimer=0;
    }
   }

   let index=0;
   for(let i=Math.min(a.path.length-1,7);i>0;i--)if(this.canTravelDirect(a,a.path[i])){index=i;break;}
   const p=a.path[index];
   if(this.world.peek(p.x,p.y)?.solid!==false){a.path=[];a.state='idle';return false;}
   const dx=p.x-a.x,dy=p.y-a.y,d=Math.hypot(dx,dy),cell=this.world.peek(hexRound(a.x,a.y).x,hexRound(a.x,a.y).y),water=cell?.water||0,step=a.speed*dt*(a.colonyId===1?this.effect('moveRate'):1)/(1+water*.4);
   a.angle=heading(dx,dy);
   if(d<=step){
    a.x=p.x;a.y=p.y;a.path.splice(0,index+1);
    if(a.swappingWith){
     const occ=this.ants.find(b=>b.id===a.swappingWith);
     if(!occ||(hexRound(occ.x,occ.y).x===currHex.x&&hexRound(occ.x,occ.y).y===currHex.y)){
      a.swappingWith=null;
     }
    }
   }else{
    a.x+=dx/d*step;a.y+=dy/d*step;
   }
   if(a.carry?.creature){a.carry.creature.x=a.x;a.carry.creature.y=a.y;a.carry.creature.angle=a.angle;}
   if(a.carry?.resource){a.carry.resource.x=a.x;a.carry.resource.y=a.y;}
   return true;
  }
  // DEPOSIT: whole corpses and whole seeds enter food storage as potential food.
  deposit(a,dt){
   a.timer-=dt;if(a.timer>0)return;
   const dest=a.destination,load=a.carry;
   if(!load){a.state='idle';return;}
   const pit=dest?.kind==='foreign'?this.colonies.find(c=>c.id===dest.colonyId)?.pit:dest?.pit;
   if((dest?.kind==='pit'||dest?.kind==='foreign')&&pit.used+load.amount>pit.capacity){a.state='storage-full';a.timer=1;return;}
   if(load.type==='corpse'){
    const cr=load.creature||this.creatures.find(c=>c.id===load.creatureId);
    if(cr){
     cr.x=dest.point.x;cr.y=dest.point.y;cr.carriedBy=null;cr.inStorage=true;cr.storageColonyId=a.colonyId||1;cr.path=[];cr.isMoving=false;
    }
    if(a.colonyId===1)this.emit(`Carried corpse stored in food storage.`);
   }else if(load.type==='seed'){
    const r=load.resource||this.resources.find(x=>x.id===load.resourceId);
    if(r){r.x=dest.point.x;r.y=dest.point.y;r.carriedBy=null;r.inStorage=true;r.storageColonyId=a.colonyId||1;}
   }else if(dest.kind==='queen'||dest.kind==='food-store'||dest.kind==='water-store'){
    if(dest.colonyId&&dest.colonyId!==1){
     const col=this.colonies.find(c=>c.id===dest.colonyId);
     if(col){
      if(load.type==='food')col.food=Math.min(col.foodCapacity||800,(col.food||0)+load.amount);
      else if(load.type==='water')col.water=Math.min(col.waterCapacity||400,(col.water||0)+load.amount);
     }
    }else{
     if(load.type==='food')this.addFood(load.amount,load.foodType);
     else if(load.type==='water')this.addWater(load.amount);
    }
   }else if(dest.kind==='reservoir'){
    const stored=Math.min(load.amount,C.waterStoragePerTile-(dest.tile.water||0));
    dest.tile.water=(dest.tile.water||0)+stored;
    dest.tile.items=(dest.tile.items||[]).concat(this.makeItems('reservoir-water','droplet',stored));
   }else if(dest.kind==='spoil'){
    const c=this.world.peek(dest.point.x,dest.point.y);
    this.spoilItems.push(...this.makeItems(`spoil-${c.x}-${c.y}`,'soil',load.amount).map(item=>({...item,x:c.x,y:c.y})));
   }else{
    pit.used+=load.amount;
    if(pit.used>=pit.capacity&&pit.hole){
     const cell=this.world.peek(pit.x,pit.y);
     if(cell){cell.solid=true;cell.zone='soil';cell.filledHole=true;}
     pit.filled=true;
    }
   }
   a.carry=null;a.state='idle';a.timer=0;this.syncStores();
   if(a.pendingMove){const p=a.pendingMove;delete a.pendingMove;this.route(a,p,'moving');}
   else if(a.pendingTask){a.task=a.pendingTask;delete a.pendingTask;a.state=a.task.type;}
   else if(a.task?.type==='harvest')a.state='harvest';
  }
  pickupFeed(a){
   const t=a.task?.source;const maxCap=a.maxCarry||C.carryCapacity;
   if(a.task?.type==='feed-food'){
    const corpse=a.task.sourceKind==='corpse'?this.creatures.find(x=>x.id===a.task.targetId):null,r=corpse||this.resources.find(x=>x.id===a.task.targetId),remaining=corpse?.food??r?.remaining;
    if(!r||remaining<=0){a.state='idle';return;}
    if(corpse&&corpse.species&&canCarry(a,corpse)){
     corpse.carriedBy=a.id;
     a.carry={type:'corpse',creature:corpse,creatureId:corpse.id,amount:corpse.food,foodType:'meat'};
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
    targetObj.processingFeederId=a.id;
    a.timer=(a.timer||0)+dt;
    if(a.timer>=1.0){
     a.timer=0;
     const remainingVal=targetObj.food!==undefined?targetObj.food:targetObj.remaining;
     const take=Math.min(10,remainingVal);
     if(targetObj.food!==undefined)targetObj.food-=take;
     else{targetObj.remaining-=take;targetObj.decay=0;}
     if(colId===1){this.addFood(take,targetObj.food!==undefined?'meat':'seeds');this.emit('Feeder processed stored food into edible colony food.');}
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
     }else{
      a.carry={type:'seed',resource:t,resourceId:t.id,amount:t.remaining,foodType:'seeds'};
     }
     this.toStore(a);
     return;
    }
    if(!a.path.length){
     if(!this.route(a,{x:Math.round(t.x),y:Math.round(t.y)},'to-carry')){
      if(t.reservedFor===a.id)t.reservedFor=null;
      a.state='idle';a.task=null;
     }
    }
    return;
   }
   if(a.state==='carrying'){a.state='depositing';a.timer=C.depositSeconds;}if(a.state==='depositing'){this.deposit(a,dt);return;}if(a.state==='storage-full'||a.state==='blocked'||a.state==='build-no-resources'||a.state==='build-blocked'){a.timer-=dt;if(a.timer<=0){if(a.carry)this.toStore(a);else a.state='idle';a.timer=1;}return;}
   if(a.state==='feeding-food'||a.state==='feeding-water'){this.pickupFeed(a);return;}
   if(a.state==='withdraw-water'){this.pickupReservoir(a);return;}
   if(a.state==='to-build-supply'){if(this.food<C.buildFoodCost||this.world.pit.used<C.buildDirtCost){a.state='build-no-resources';return;}this.spendFood(C.buildFoodCost);this.world.pit.used-=C.buildDirtCost;this.syncStores();a.carry={type:'construction',food:C.buildFoodCost,dirt:C.buildDirtCost};this.routeToBuild(a);return;}
   if(a.state==='building'){a.timer+=dt;if(a.timer>=C.buildSeconds){const c=this.world.get(a.task.x,a.task.y),kind=a.task.structure||'food';c.zone=kind==='water'?'water-store':kind==='spoil'?'spoil':'food-store';c.structure=kind;c.builtDirt=a.carry?.dirt||0;c.discovered=true;if(kind==='water'){c.waterStorage=true;c.water=0;c.excavations=2;this.waterStore.tiles.push({x:c.x,y:c.y,water:0,items:[]});}else if(kind==='food')this.foodStore.tiles++;a.carry=null;this.jobs=this.jobs.filter(j=>j.id!==a.task.id);this.world.revision++;this.emit(`A ${kind} chamber tile was built.`);a.task=null;a.state='idle';a.timer=0;this.syncStores();}return;}
    if(a.state==='recover'){const drop=this.drops.find(d=>d.id===a.task?.dropId);if(drop){a.carry=drop.load;this.drops.splice(this.drops.indexOf(drop),1);this.toStore(a);}else a.state='idle';return;}if(a.state==='attack'||a.state==='harvest'){AntGame.Ecology.workTarget(this,a,dt);return;}if(a.state==='to-dig'){a.state='digging';a.timer=0;}if(a.state==='digging'){const task=a.task,c=task&&this.world.peek(task.x,task.y);if(!c||(!c.solid&&!task.buildId)||c.rock||c.zone==='rock'||!this.jobs.some(j=>j.id===task.id)){a.state='idle';a.task=null;return;}a.angle=heading(c.x-a.x,c.y-a.y);a.timer+=dt*(a.colonyId===1?this.effect('digRate'):1)*(a.digRate||1);if(a.timer>=C.digSeconds*c.hardness){a.carry=c.solid?this.world.removePiece(c,this.world.peek(task.face.x,task.face.y)):null;if(!c.solid)c.excavations=(c.excavations||0)+1;a.timer=0;this.jobs=this.jobs.filter(j=>j.id!==task.id);const build=task.buildId&&this.jobs.find(j=>j.id===task.buildId);if(build){if((c.excavations||0)>=build.excavations){build.status=pathfind(this.world,this.nest,c)?(this.food>=build.food&&this.world.pit.used>=build.dirt?'available':'resources'):'blocked';}else{this.ensureExcavationJob(build,c);}}let extraMined=0;const maxBlocks=a.type==='supermajor'?3:a.type==='major'?2:1;if(maxBlocks>1){const adjJobs=this.jobs.filter(j=>j.type==='dig'&&j.colonyId===a.colonyId&&hexDistance(j,c)===1);for(const aj of adjJobs){if(extraMined>=maxBlocks-1)break;const ac=this.world.peek(aj.x,aj.y);if(ac&&ac.solid&&!ac.rock&&ac.zone!=='rock'){this.world.removePiece(ac,c);this.jobs=this.jobs.filter(j=>j.id!==aj.id);extraMined++;}}}    if(a.carry&&extraMined>0)a.carry.amount+=extraMined;if(a.carry)this.toStore(a);else a.state='idle';}return;}if(a.state==='idle'&&!a.held&&!a.manualOrder){a.timer=(a.timer||0)-dt;if(a.timer<=0||(!a.task&&this.antNeedType(a)))this.assign(a);if(a.state==='processing'){this.updateWorker(a,dt);}}}
  updateQueen(dt){
   if(this.gameOver)return;
   const livingQueens=this.ants.filter(a=>a.alive&&a.type==='queen'&&a.fertile);
   for(const q of livingQueens){
    const isPlayer=q.colonyId===1;
    const col=isPlayer?null:this.colonies.find(c=>c.id===q.colonyId);
    if(isPlayer){
     this.spendFood(C.foodDrainPerSecond*dt);
     this.spendWater(C.waterDrainPerSecond*dt);
     let damage=0;
     if(this.food<=0.01){
      damage+=3;this.warnStarvingTimer=(this.warnStarvingTimer||0)-dt;
      if(this.warnStarvingTimer<=0){this.emit('QUEEN IS STARVING! Queen health is dropping!');this.warnStarvingTimer=8;}
     }else{this.warnStarvingTimer=0;}
     if(this.water<=0.01){
      damage+=5;this.warnDehydratedTimer=(this.warnDehydratedTimer||0)-dt;
      if(this.warnDehydratedTimer<=0){this.emit('QUEEN IS DEHYDRATED! Queen health is dropping!');this.warnDehydratedTimer=8;}
     }else{this.warnDehydratedTimer=0;}
     if(damage){q.health-=damage*dt;if(q.health<=0){this.kill(q);return;}}
     q.layTimer-=dt;
     if(q.layTimer<=0){if(this.layEgg(q))q.layTimer+=C.eggInterval;else q.layTimer=Math.min(5,C.eggInterval);}
    }else if(col&&col.state==='active'){
     // Rival Queen: 2x slower depletion, 2x larger storage
     col.food=Math.max(0,(col.food||0)-C.foodDrainPerSecond*0.5*dt);
     col.water=Math.max(0,(col.water||0)-C.waterDrainPerSecond*0.5*dt);
     let damage=0;
     if(col.food<=0.01)damage+=3;
     if(col.water<=0.01)damage+=5;
     if(damage){q.health-=damage*dt;if(q.health<=0){this.kill(q);col.state='abandoned';this.emit(`Rival colony ${col.id} queen died.`);continue;}}
     q.layTimer-=dt;
     if(q.layTimer<=0){
      const pop=this.ants.filter(a=>a.alive&&a.colonyId===col.id).length;
      const eggCount=this.eggs.filter(e=>e.colonyId===col.id).length;
      const cap=col.capacity||C.startingColonyCap;
      if(pop+eggCount<cap&&col.food>=C.eggFoodCost&&col.water>=C.eggWaterCost){
       col.food-=C.eggFoodCost;col.water-=C.eggWaterCost;
       const assignedAntType=rollCaste(this.random);
       const angle=this.random.next()*Math.PI*2,r=1+this.random.next()*2;
       let x=col.x+Math.cos(angle)*r,y=col.y+Math.sin(angle)*r;
       this.eggs.push({id:this.nextId++,x,y,assignedAntType,stage:'egg',age:0,duration:C.hatchTime,colonyId:col.id});
      }
      q.layTimer=Math.min(5,C.eggInterval);
     }
    }
   }
  }
  update(dt){
   this.time+=dt;
   this.updateQueen(dt);
   for(const a of this.ants)if(a.alive)this.drainAntNeeds(a,dt);
   const cap=this.colonyCapacity();
   for(let i=this.eggs.length-1;i>=0;i--){
    const e=this.eggs[i];
    e.age+=dt;
    if(e.age>=e.duration){
     const cap=e.colonyId===1?this.colonyCapacity():(this.colonies.find(c=>c.id===e.colonyId)?.capacity||C.startingColonyCap);
     if(this.livingPopulation(e.colonyId)<cap)this.addAnt(e.assignedAntType,Math.round(e.x),Math.round(e.y),e.colonyId);
     this.eggs.splice(this.eggs.indexOf(e),1);
     if(e.colonyId===1)this.emit('An egg hatched.');
    }
   }
   for(const a of this.ants){
    if(!a.alive)continue;
    if(a.colonyId===1&&(a.held||a.manualOrder||a.selected)){
     const isBusy=(a.carry!=null)||
      (a.path&&a.path.length>0)||
      ['digging','to-dig','building','to-build-supply','to-carry','to-process','processing','depositing','recover','need-food','need-water'].includes(a.state)||
      (a.state==='attack'&&this.target(a.task?.targetId)?.alive)||
      (a.state==='harvest'&&((this.target(a.task?.targetId)?.remaining||0)>0||(this.target(a.task?.targetId)?.species==='root_aphid'&&this.target(a.task?.targetId)?.milkCooldown<=0)));
     if(isBusy){
      a.idleReleaseTimer=0;
     }else if(a.state==='idle'){
      a.idleReleaseTimer=(a.idleReleaseTimer||0)+dt;
      if(a.idleReleaseTimer>=5.0){
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
    if(a.state==='moving'||a.state==='patrol'){a.state=a.threatId?'protective':'idle';if(a.threatId)AntGame.Ecology.reportThreat(this,a);continue;}
    if(a.state==='need-food'||a.state==='need-water'){this.consumeAntNeed(a);continue;}
    if(isCommandable(a.type))this.updateWorker(a,dt);
   }
   this.statusTimer+=dt;if(this.statusTimer>=1){this.refreshJobStates();this.statusTimer=0;}
   this.ecologyTimer+=dt;if(this.ecologyTimer>=C.ecologyInterval){AntGame.Ecology.update(this,this.ecologyTimer);this.ecologyTimer=0;}
  }
  // SAVE/RESTORE: global area definitions and discrete spoil objects are first-class save data.
  serialize(){return {version:3,world:this.world.serialize(),randomState:this.random.state,time:this.time,evolution:this.evolution,totalEvolution:this.totalEvolution,traits:this.traits,traitLevels:this.traitLevels,ants:this.ants,eggs:this.eggs,jobs:this.jobs,nextId:this.nextId,resources:this.resources,food:this.food,water:this.water,foodStore:this.foodStore,waterStore:this.waterStore,foodHarvested:this.foodHarvested,foodConsumed:this.foodConsumed,surfaceDump:this.surfaceDump,spoilItems:this.spoilItems,areas:this.areas,rootAreas:this.rootAreas,nest:this.nest,groups:this.groups,feederId:this.feederId,commandMarkers:this.commandMarkers,waterTarget:this.waterTarget,antFoodNeedRatio:this.antFoodNeedRatio,antWaterNeedRatio:this.antWaterNeedRatio,eggProduction:this.eggProduction,gameOver:this.gameOver,creatures:this.creatures,colonies:this.colonies,drops:this.drops,discoveries:this.discoveries,spiderEggs:this.spiderEggs,castePriorities:this.castePriorities,ecologyTimer:this.ecologyTimer,statusTimer:this.statusTimer,healTimer:this.healTimer,aiEnabled:this.aiEnabled,events:this.events};}
  static restore(data){if(data.version!==3||!Array.isArray(data.ants)||!data.world?.cells)throw Error('This save predates hunger, water, and construction. Start a new colony.');const s=Object.create(Simulation.prototype);Object.assign(s,data);s.commandMarkers=s.commandMarkers||[];s.spoilItems=s.spoilItems||[];s.areas=s.areas||{};s.rootAreas=s.rootAreas||{};s.spiderEggs=s.spiderEggs||[];s.waterTarget=s.waterTarget||'queen';s.antFoodNeedRatio=s.antFoodNeedRatio??(data.antNeedRatio??C.antFoodNeedRatio);s.antWaterNeedRatio=s.antWaterNeedRatio??(data.antNeedRatio??C.antWaterNeedRatio);s.foodStore.tiles=s.foodStore.tiles||40;s.foodStore.hole=false;s.waterStore.tiles=s.waterStore.tiles||[];s.castePriorities=data.castePriorities||JSON.parse(JSON.stringify(AntGame.DefaultCastePriorities||{}));s.world=World.restore(data.world);s.random=new Random(data.randomState);s.syncStores();for(const a of s.ants)if(a.destination){if(a.destination.kind==='pit'){a.destination.pit=s.world.pits.find(p=>p.x===a.destination.point?.x&&p.y===a.destination.point?.y)||s.world.pit;a.destination.point=a.destination.pit;}else if(a.destination.kind==='queen')a.destination.point=s.nest;else if(a.destination.kind==='foreign'){const col=s.colonies.find(c=>c.id===a.destination.colonyId);if(col)a.destination.point=col.pit;}}return s;}
  conservation(){return this.world.removed===this.world.pits.reduce((n,p)=>n+p.used,0)+this.surfaceDump+this.colonies.reduce((n,c)=>n+c.pit.used,0)+this.spoilItems.reduce((n,item)=>n+(item.amount||0),0)+[...this.world.cells.values()].reduce((n,c)=>n+(c.builtDirt||0)+(c.relocatedDirt||0),0)+this.ants.reduce((n,a)=>n+(a.carry?.type==='soil'?a.carry.amount:a.carry?.type==='construction'?a.carry.dirt:0),0)+this.drops.reduce((n,d)=>n+(d.load.type==='soil'?d.load.amount:d.load.type==='construction'?d.load.dirt:0),0);}
}
AntGame.Simulation=Simulation;
})();
