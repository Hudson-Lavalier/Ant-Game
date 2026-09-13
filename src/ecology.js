/*
 * UNDERFOOT ECOLOGY, CREATURES, AND FOREIGN COLONIES
 * This runtime module advances systems outside the player worker loop: procedural
 * features become resources/creatures/colonies, water flows between fine terrain
 * cells, creatures fight or wander, and activated foreign colonies expand.
 *
 * Navigation landmarks: Ecology.sync creates feature entities, Ecology.water moves
 * water conservatively, Ecology.workTarget resolves attack/harvest actions, and
 * Ecology.update is the periodic entry point called by Simulation.update.
 */
(()=>{
const {Config:C,Species,FoodTypes,pathfind,key,hash,hexDistance}=AntGame;
const distance=(a,b)=>hexDistance(a,b);
class Ecology {
 // CREATURE SPAWN: all individual variation is generated once, persisted in the
 // creature object, and used by both food calculation and renderer shading.
 static initialBodyTrail(d,species,x,y){if(!['worm','grub'].includes(species))return null;const step=.08,length=d.bodyLength||6,radius=species==='worm'?5:1.5,out=[];for(let arc=0;arc<=length+step;arc+=step){const angle=arc/radius;out.push({x:x-radius*Math.sin(angle),y:y+radius*(1-Math.cos(angle))});}return out;}
 static spawnCreature(s,species,x,y,extra={}){const d=Species[species],size=C.creatureSizeMin+s.random.next()*(C.creatureSizeMax-C.creatureSizeMin),food=Math.round((d.baseFood||0)*size),trail=Ecology.initialBodyTrail(d,species,x,y);const n=s.nextId++;return{id:`creature-${n}`,species,x,y,prevX:x,prevY:y,health:d.health,maxHealth:d.health,alive:true,state:'dormant',food,size,colorVariation:.92+s.random.next()*.16,clearanceNeeded:d.clearance||1,bodyTrail:trail,gait:0,decay:0,timer:0,path:[],provoked:false,aiTicks:0,home:{x,y},...extra};}
 static rootFeatureCells(s,f){return s.world.rootCells(f).map(p=>s.world.get(p.x,p.y)).filter(c=>c.feature===f.id&&c.root&&c.solid);}
 static sync(s){
  for(const f of s.world.features){
   // Encounter chambers hold one intentional resident or remain quiet empty caves.
   if(['abandoned','cavity','worm-cavity','hercules-cavity','spider-cavity'].includes(f.type)&&!s.creatures.some(c=>c.featureId===f.id)){
    const isSpecial=['worm-cavity','hercules-cavity','spider-cavity'].includes(f.type);
    if(isSpecial){
     const species=f.type==='spider-cavity'?'spider':f.type==='worm-cavity'?'worm':'hercules';
     s.creatures.push(Ecology.spawnCreature(s,species,f.x,f.y,{featureId:f.id}));
     if(species==='spider'){
      for(const p of AntGame.hexDisk(f.x,f.y,f.r||4)){
       const tile=s.world.peek(p.x,p.y);
       if(tile&&!tile.solid&&!tile.water&&s.random.next()<0.45)tile.web=true;
      }
     }
    }else{
     // Generic cave chambers: ~65% empty, ~35% inhabited by a solitary scavenger
     const inhabitRoll=Math.abs(hash(s.world.seed,f.x,f.y))%100;
     if(inhabitRoll<35||f.species){
      const species=f.species||['weevil','isopod','grub'][Math.abs(hash(s.world.seed+1,f.x,f.y))%3];
      s.creatures.push(Ecology.spawnCreature(s,species,f.x,f.y,{featureId:f.id}));
     }
    }
   }
   // Seed sites are visible resource nodes with the requested mite swarm and isopod group.
   if((f.type==='food'||f.type==='seed-site')&&!s.resources.some(r=>r.featureId===f.id)){const foodType=f.foodType||'meat',def=FoodTypes[foodType],remaining=def.value*12;s.resources.push({id:`food-${f.id}`,featureId:f.id,foodType,x:f.x,y:f.y,remaining,initial:remaining,decay:0,state:'dormant'});}
   if(f.type==='seed-site'&&!s.creatures.some(c=>c.seedFeatureId===f.id)){
    const mites=1+Math.floor(s.random.next()*2),isopods=1;
    for(let i=0;i<mites;i++){const p=AntGame.hexDisk(f.x,f.y,2)[Math.floor(s.random.next()*AntGame.hexDisk(f.x,f.y,2).length)];s.creatures.push(Ecology.spawnCreature(s,'mite',p.x,p.y,{seedFeatureId:f.id}));}
    for(let i=0;i<isopods;i++){const p=AntGame.hexDisk(f.x,f.y,2)[Math.floor(s.random.next()*AntGame.hexDisk(f.x,f.y,2).length)];s.creatures.push(Ecology.spawnCreature(s,'isopod',p.x,p.y,{seedFeatureId:f.id}));}
   }
   // A root encounter binds its aphids and optional Woodlouse to this particular vein.
   if(f.type==='root-vein'&&!s.creatures.some(c=>c.rootFeatureId===f.id)){const cells=Ecology.rootFeatureCells(s,f),count=3+Math.floor(s.random.next()*3);for(let i=0;i<count&&cells.length;i++){const p=cells[i%cells.length];s.creatures.push(Ecology.spawnCreature(s,'root_aphid',p.x,p.y,{rootFeatureId:f.id,milkCooldown:0,biteTimer:C.rootAphidBiteInterval}));}if(s.random.next()<.4&&cells.length){const p=cells[0];s.creatures.push(Ecology.spawnCreature(s,'isopod',p.x,p.y,{rootFeatureId:f.id,variantName:'Woodlouse'}));}}
    if(f.type==='colony'&&!s.colonies.some(c=>c.featureId===f.id)){
     const tolerances={hostile:1,defensive:3,neutral:6,tolerant:10};
     s.colonies.push({id:f.id,featureId:f.id,x:f.x,y:f.y,state:'dormant',relation:f.relation,contact:false,timer:0,aiTicks:0,food:C.startingFood*2,water:C.startingWater*2,foodCapacity:800,waterCapacity:400,capacity:C.startingColonyCap,tolerance:tolerances[f.relation]||5,contactCount:0,contactCooldown:0,pit:{x:f.x,y:f.y+2,used:0,capacity:400}});
    }
  }
 }
 static water(s,dt){
  const changes=new Map(),active=[...s.world.activeWater];
  const add=(k,v)=>changes.set(k,(changes.get(k)||0)+v);
  for(const k of active){
   const c=s.world.cells.get(k);
   if(!c||c.solid||c.isWell||c.zone==='well'||c.staticWater)continue;
   if(c.waterStorage){
    if(c.water<7){
     const openNeighbors=s.world.neighbors(c.x,c.y).filter(n=>!n.solid&&!n.waterStorage&&n.water>0);
     const space=7-c.water;
     if(space>0.0001&&openNeighbors.length>0){
      for(const n of openNeighbors){
       const nk=key(n.x,n.y);
       const pull=Math.min(n.water,space/openNeighbors.length,Math.min(.4,C.waterFlowRate*dt*4)*4);
       if(pull>0.0001){
        add(nk,-pull);
        add(k,pull);
       }
      }
     }
    }else{
     const lowerNeighbors=s.world.neighbors(c.x,c.y).filter(n=>!n.solid&&n.water<c.water);
     for(const n of lowerNeighbors){
      const nk=key(n.x,n.y);
      const diff=c.water-n.water;
      const flow=Math.min(diff*.5,Math.min(.4,C.waterFlowRate*dt*4));
      if(flow>0.0001){
       add(k,-flow);
       add(nk,flow);
       n.isSpreading=true;
      }
     }
    }
   }else{
    if(c.water<=0)continue;
    const openNeighbors=s.world.neighbors(c.x,c.y).filter(n=>!n.solid);
    const lowerNeighbors=openNeighbors.filter(n=>{
     if(n.waterStorage)return (n.water||0)<7;
     return n.water<c.water;
    });
    if(!lowerNeighbors.length)continue;
    const isSpreading=c.isSpreading||c.water>1.0;
    if(!isSpreading)continue;
    const maxAvailable=Math.max(0,c.water-.5);
    if(maxAvailable<=0.0001)continue;
    for(const n of lowerNeighbors){
     const nk=key(n.x,n.y);
     if(n.waterStorage){
      const space=Math.max(0,7-(n.water||0));
      const pull=Math.min(c.water,maxAvailable,space,Math.min(.4,C.waterFlowRate*dt*4)*4);
      if(pull>0.0001){
       add(k,-pull);
       add(nk,pull);
      }
     }else{
      const diff=c.water-n.water;
      const flowRate=diff*Math.min(.4,C.waterFlowRate*dt*4);
      const maxFlowFromSource=maxAvailable/lowerNeighbors.length;
      const maxFlowToEqualize=diff/2;
      const actualFlow=Math.min(flowRate,maxFlowFromSource,maxFlowToEqualize);
      if(actualFlow>0.0001){
       add(k,-actualFlow);
       add(nk,actualFlow);
       c.isSpreading=true;
       n.isSpreading=true;
      }
     }
    }
   }
  }
  for(const [k,delta] of changes){
   const c=s.world.cells.get(k);if(!c)continue;
   c.water=Math.max(0,Math.min(7,c.water+delta));
   if(c.waterStorage){
    const tile=s.waterStore.tiles.find(t=>t.x===c.x&&t.y===c.y);
    if(tile)tile.water=c.water;
   }
   if(c.water>1.0)c.isSpreading=true;
   else if(c.water<0.499)c.isSpreading=false;
   if(c.water>0.0001)s.world.activeWater.add(k);
   else s.world.activeWater.delete(k);
  }
 }
 static damage(s,a,amount){a.health-=amount*(a.colonyId===1?s.effect('armor'):1);if(a.health<=0)s.kill(a);}
 static workTarget(s,a,dt){
  const t=s.target(a.task?.targetId);
    const aphid=t?.species==='root_aphid';
    if(!t||(!t.alive&&a.state==='attack')||(a.state==='harvest'&&!aphid&&((t.remaining===undefined&&(!t.food||t.alive))||(t.remaining!==undefined&&t.remaining<=0)))||(aphid&&t.milkCooldown>0)){a.state='idle';a.task=null;return;}
  a.timer-=dt;
  if(distance(a,t)>1.7){
   if(!a.path.length){
    const p=pathfind(s.world,a,{x:Math.round(t.x),y:Math.round(t.y)});
    if(p===null){a.state='idle';a.task=null;if(a.colonyId===1)s.emit('Target blocked: no accessible route.');}
    else s.setPath(a,p,a.state);
   }
   return;
  }
  a.angle=Math.atan2(t.y-a.y,t.x-a.x);
  if(a.timer>0)return;
   if(a.state==='attack'){
    a.timer=.8;
    a.lastStrike=s.time;
    const baseDmg=(a.type==='soldier'||a.type==='major'||a.type==='supermajor')?10:8;
    const damage=baseDmg*(a.colonyId===1?s.effect('attackRate'):1);
    if(t.colonyId){Ecology.damage(s,t,damage);return;}
    t.provoked=true;t.lastAttacker={x:a.x,y:a.y,id:a.id};t.fleeTimer=20;t.fleeDelay=0;t.health-=damage;
    if(t.health<=0){t.health=0;t.alive=false;t.path=[];t.isMoving=false;t.prevX=t.x;t.prevY=t.y;t.state='dead';t.decay=0;s.emit(`${t.variantName||Species[t.species].name} defeated. Its remains can be harvested.`);a.state='idle';a.task=null;}
    }else{
     a.timer=C.harvestSeconds;
     if(!aphid&&t.species&&!t.alive&&t.food>0&&AntGame.canCarry(a,t)){
      t.carriedBy=a.id;
      a.carry={type:'corpse',creature:t,creatureId:t.id,amount:t.food,foodType:'meat'};
      s.toStore(a);
      return;
     }
     const maxCap=a.maxCarry||C.carryCapacity;
     const amount=aphid?15:(t.remaining!==undefined?Math.min(maxCap,t.remaining):Math.min(maxCap,t.food));
     if(aphid)t.milkCooldown=C.rootAphidMilkCooldown;
     else if(t.remaining!==undefined){t.remaining-=amount;t.decay=0;}
     else t.food-=amount;
     a.carry={type:'food',amount,foodType:t.foodType||'meat',source:t.id};
     s.toStore(a);
   }
 }
 // CREATURE MOVEMENT: animals steer through continuous world positions, while
 // their destinations remain cells. This preserves the non-grid movement used by ants.
 // BODY TRAIL: samples never exceed 0.08 world units and are capped by arc
 // length. A fast tick therefore adds intermediate points instead of stretching
 // one Worm or Grub section toward a distant tile.
 static recordBodyTrail(c,d,fromX,fromY){
  if(!c.bodyTrail?.length)return;
  const dx=c.x-fromX,dy=c.y-fromY,distanceMoved=Math.hypot(dx,dy);
  if(distanceMoved<=0.0001)return;
  const steps=Math.max(1,Math.ceil(distanceMoved/.08));
  for(let i=1;i<=steps;i++)c.bodyTrail.unshift({x:fromX+dx*i/steps,y:fromY+dy*i/steps});
  const limit=(d.bodyLength||6)+1;
  let arc=0,keepCount=c.bodyTrail.length;
  for(let i=1;i<c.bodyTrail.length;i++){
   arc+=Math.hypot(c.bodyTrail[i].x-c.bodyTrail[i-1].x,c.bodyTrail[i].y-c.bodyTrail[i-1].y);
   if(arc>limit){keepCount=i+1;break;}
  }
  if(c.bodyTrail.length>keepCount)c.bodyTrail.length=keepCount;
 }
 // SMOOTH CREATURE MOTION: retain the last simulation point for renderer
 // interpolation. All anatomy reads this one root position and orientation.
 static move(c,d,dt){if(!c.alive||!c.path?.length){c.prevX=c.x;c.prevY=c.y;return;}const p=c.path[0],dx=p.x-c.x,dy=p.y-c.y,len=Math.hypot(dx,dy),step=d.speed*dt,fromX=c.x,fromY=c.y;c.prevX=fromX;c.prevY=fromY;c.angle=Math.atan2(Math.sqrt(3)*(dy+dx/2),1.5*dx);if(len<=step){c.x=p.x;c.y=p.y;c.path.shift();}else{c.x+=dx/len*step;c.y+=dy/len*step;}c.gait=(c.gait||0)+d.speed*dt;Ecology.recordBodyTrail(c,d,fromX,fromY);}
 static chooseOpen(s,c,d){const here={x:Math.round(c.x),y:Math.round(c.y)},options=s.world.neighbors(here.x,here.y).filter(n=>!n.solid&&n.water<6&&!n.isWell&&n.zone!=='well'&&AntGame.hasBodyClearance(s.world,n.x,n.y,d.clearance||1));if(options.length)c.path=[options[Math.floor(s.random.next()*options.length)]];}
 static excavate(s,c,d,dt,fleeFrom=null){
  // EXCAVATION CROSS-SECTION: clearance is already derived from rendered body
  // width, so this removes precisely the required body-width band of dirt.
  const dirs=AntGame.HEX_DIRS,from={x:Math.round(c.x),y:Math.round(c.y)};
  if(fleeFrom){
   const rankedDirs=dirs.map((dir,idx)=>({idx,dist:distance({x:from.x+dir[0],y:from.y+dir[1]},fleeFrom)})).sort((a,b)=>b.dist-a.dist);
   c.mineDirection=rankedDirs[0].idx;
  }else if(c.mineDirection===undefined||c.mineDirection===null||(c.mineTimer||0)<=-2){
   // Bias towards solid soil (negative valence to open spaces)
   const rankedDirs=dirs.map((dir,idx)=>{
    const p={x:from.x+dir[0],y:from.y+dir[1]};
    const cell=s.world.get(p.x,p.y);
    const isSolid=cell&&cell.solid&&!cell.rock&&cell.zone!=='rock';
    return {idx,score:(isSolid?12:1)+s.random.next()*3};
   }).sort((a,b)=>b.score-a.score);
   c.mineDirection=rankedDirs[0].idx;
  }
  const [dq,dr]=dirs[c.mineDirection],front={x:from.x+dq,y:from.y+dr},targets=[front],width=d.clearance||1;
  if(width>1)targets.push({x:front.x+dr,y:front.y-dq});
  if(width>2)targets.push({x:front.x-dr,y:front.y+dq});
  for(let i=3;i<width;i++)targets.push({x:front.x+dr*(i-1),y:front.y-dr*(i-1)});
  const cells=targets.map(p=>s.world.get(p.x,p.y));
  if(cells.some(cell=>cell.rock||cell.water>0)){
   c.mineDirection=(c.mineDirection+1+Math.floor(s.random.next()*5))%6;
   c.mineTimer=0;
   return;
  }
  const blocked=cells.filter(cell=>cell.solid);
  if(blocked.length){
   c.mineTimer=(c.mineTimer||0)+dt;
   if(c.mineTimer>=d.mineTime){
    for(const cell of blocked){
     cell.solid=false;
     cell.zone='tunnel';
     cell.excavations=(cell.excavations||0)+1;
     s.world.revision++;
    }
    c.mineTimer=0;
    c.path=[front];
   }
   return;
  }
  c.path=[front];
  c.mineTimer=0;
 }
 static miteRoute(s,c,target){const start={x:Math.round(c.x),y:Math.round(c.y)},goal={x:Math.round(target.x),y:Math.round(target.y)},queue=[{...start,dirt:0}],parents=new Map([[`${start.x},${start.y},0`,null]]),goalKeys=new Set();for(let i=0;i<queue.length&&i<180;i++){const p=queue[i];if(p.x===goal.x&&p.y===goal.y){let at=`${p.x},${p.y},${p.dirt}`,out=[];while(parents.get(at)!==null){const [x,y]=at.split(',').map(Number);out.push({x,y});at=parents.get(at);}return out.reverse();}for(const n of s.world.neighbors(p.x,p.y)){if(n.rock||n.water>0||n.isWell||n.zone==='well')continue;const dirt=n.solid?1:0;if(dirt&&p.dirt)continue;const id=`${n.x},${n.y},${dirt}`;if(parents.has(id))continue;parents.set(id,`${p.x},${p.y},${p.dirt}`);queue.push({x:n.x,y:n.y,dirt});}}return[];}
 static rootAreas(s,players,dt){
  for(const f of s.world.features.filter(f=>f.type==='root-vein')){const cells=Ecology.rootFeatureCells(s,f),near=players.some(a=>cells.some(c=>distance(a,c)<=1));if(near&&!s.rootAreas[f.id]){for(const c of cells)c.discovered=true;const id=`root-area-${f.id}`;s.rootAreas[f.id]={id,featureId:f.id,cells:cells.map(c=>({x:c.x,y:c.y})),name:'Rotted Root Harvest Area'};s.areas[id]={id,name:'Rotted Root Harvest Area',type:'root',cells:cells.map(c=>({x:c.x,y:c.y}))};s.emit('Rotted Root discovered. A harvest area has been mapped.');}const area=s.rootAreas[f.id];if(area){const live=Ecology.rootFeatureCells(s,f);area.cells=live.map(c=>({x:c.x,y:c.y}));if(s.areas[area.id])s.areas[area.id].cells=area.cells;if(!live.length){delete s.areas[area.id];delete s.rootAreas[f.id];}}}
  for(const c of s.creatures.filter(c=>c.alive&&c.species==='root_aphid')){c.milkCooldown=Math.max(0,(c.milkCooldown||0)-dt);const f=s.world.features.find(f=>f.id===c.rootFeatureId),roots=f&&Ecology.rootFeatureCells(s,f);if(!roots?.length){c.starveTimer=(c.starveTimer||0)+dt;if(c.starveTimer>60){c.alive=false;c.state='dead';}continue;}c.biteTimer=(c.biteTimer??C.rootAphidBiteInterval)-dt;if(c.biteTimer<=0){const root=roots[Math.floor(s.random.next()*roots.length)];root.woodDurability-=1;c.biteTimer+=C.rootAphidBiteInterval;if(root.woodDurability<=0){root.solid=false;root.root=false;root.zone='tunnel';s.world.revision++;}}}
 }
 static webs(s,players,dt){
  for(const c of s.creatures.filter(c=>c.alive&&c.species==='spider')){
   if(c.state==='dormant')continue;
   c.webTimer=(c.webTimer||0)+dt;c.webCooldown=Math.max(0,(c.webCooldown||0)-dt);if(c.webTimer>=C.spiderWebInterval){c.webTimer=0;const nearby=s.world.neighbors(Math.round(c.x),Math.round(c.y)).filter(n=>n.web).length;if(nearby<5&&s.random.next()<C.spiderWebChance){for(const n of s.world.neighbors(Math.round(c.x),Math.round(c.y)).filter(n=>!n.solid&&!n.water).sort(()=>s.random.next()-.5).slice(0,3))n.web=true;}}
   let target=null,tMinD=10;
   for(let i=0;i<players.length;i++){const p=players[i];if(!p.alive)continue;const d=distance(p,c);if(d<=tMinD){tMinD=d;target=p;}}
   for(let i=0;i<s.creatures.length;i++){const other=s.creatures[i];if(!other.alive||other.id===c.id||other.species==='spider'||other.species==='baby_spider')continue;const d=distance(other,c);if(d<tMinD){tMinD=d;target=other;}}
   if(target&&c.webCooldown<=0){
    const tile=s.world.get(Math.round(target.x),Math.round(target.y));
    tile.web=true;
    target.webbedUntil=s.time+C.spiderWebDuration;
    c.webCooldown=C.spiderWebAttackCooldown;
    if(target.colonyId===1)s.emit('A spider has webbed an ant.');
   }
  }
  for(const a of players){const tile=s.world.peek(Math.round(a.x),Math.round(a.y));if(tile?.web)a.webbedUntil=Math.max(a.webbedUntil||0,s.time+C.spiderWebDuration);}
  for(const egg of s.spiderEggs){egg.age+=dt;if(egg.age>=egg.duration&&!egg.hatched){const baby=Ecology.spawnCreature(s,'baby_spider',egg.x,egg.y,{state:'dormant',babyAge:0});s.creatures.push(baby);egg.hatched=true;}}s.spiderEggs=s.spiderEggs.filter(e=>!e.hatched);
  for(const baby of s.creatures.filter(c=>c.alive&&c.species==='baby_spider')){baby.babyAge=(baby.babyAge||0)+dt;if(baby.babyAge>=C.babySpiderMatureTime){const d=Species.spider;baby.species='spider';baby.health=d.health;baby.maxHealth=d.health;baby.clearanceNeeded=d.clearance;s.emit('A baby spider has matured.');}}
 }
 static creatures(s,players,dt){
  for(const c of s.creatures){const d=Species[c.species];if(!d)continue;if(!c.prevX&&c.prevX!==0)c.prevX=c.x;if(!c.prevY&&c.prevY!==0)c.prevY=c.y;if(['worm','grub'].includes(c.species)&&!c.bodyTrail?.length)c.bodyTrail=Ecology.initialBodyTrail(d,c.species,c.x,c.y);
   if(!c.alive){c.path=[];c.prevX=c.x;c.prevY=c.y;c.decay+=dt;if(c.decay>=C.decaySeconds)c.food=0;continue;}
   const unfreezeDist=d.activation||C.activationRadius,refreezeDist=d.deactivation||(unfreezeDist*3);
   const cell=s.world.peek(Math.round(c.x),Math.round(c.y));
   const distToNearestAnt=players.length?players.reduce((min,a)=>Math.min(min,distance(a,c)),Infinity):Infinity;
   if(c.species==='root_aphid'||d.freezeExempt){
    c.state='active';
   }else if(!c.devActivated){
    if(c.state==='dormant'){
     if(!cell?.discovered||distToNearestAnt>unfreezeDist)continue;
     c.state='active';
    }else if(distToNearestAnt>refreezeDist){
     c.state='dormant';
     c.path=[];
     c.prevX=c.x;
     c.prevY=c.y;
     continue;
    }
   }
   if(!s.aiEnabled||d.behavior==='anchored')continue;
   c.aiTicks++;c.timer=(c.timer||0)-dt;c.fleeTimer=Math.max(0,(c.fleeTimer||0)-dt);c.fleeDelay=Math.max(0,(c.fleeDelay||0)-dt);

   // Target Detection: Aggressive creatures acquire ants or other living creatures within 14 hexes
   let near=null,minD=14;
   for(let i=0;i<s.ants.length;i++){
    const p=s.ants[i];if(!p.alive)continue;
    const dist=distance(p,c);
    if(dist<minD){minD=dist;near=p;}
   }
   for(let i=0;i<s.creatures.length;i++){
    const other=s.creatures[i];
    if(!other.alive||other.id===c.id)continue;
    if(other.species===c.species)continue;
    if((c.species==='spider'&&other.species==='baby_spider')||(c.species==='baby_spider'&&other.species==='spider'))continue;
    const dist=distance(other,c);
    if(dist<minD){minD=dist;near=other;}
   }

   // EXCAVATORS (Worms & Grubs): Fossorial soil-lovers with negative valence to open spaces
   if(d.excavator){
    if(c.provoked&&c.fleeDelay>0){
     /* brief reaction */
    }else if(c.provoked&&c.fleeTimer>0&&c.lastAttacker){
     // Run and burrow directly away from attacker
     Ecology.excavate(s,c,d,dt,c.lastAttacker);
    }else if(!c.path.length||s.world.peek(Math.round(c.x),Math.round(c.y))?.solid===false){
     // Negative valence to open space: burrow into nearest solid soil
     Ecology.excavate(s,c,d,dt,null);
    }
    Ecology.move(c,d,dt);
    continue;
   }

   if(near&&(d.behavior==='aggressive'||(d.behavior==='defensive'&&c.provoked))){
    const reach=d.reach||1.8;
    if(distance(near,c)<reach){
     if(c.timer<=0){
      if(near.colonyId){
       if(near.type!=='soldier'&&s.ants.some(a=>a.alive&&a.colonyId===1&&a.type==='soldier')){
        near.threatId=c.id;near.task=null;near.held=true;
        s.route(near,s.nest,'moving');
        s.emit(`Worker ${near.id} is retreating to report a threat.`);
       }
       Ecology.damage(s,near,d.damage);
      }else{
       near.provoked=true;
       near.lastAttacker={x:c.x,y:c.y,id:c.id};
       near.fleeTimer=20;
       near.fleeDelay=0;
       near.health-=d.damage;
       if(near.health<=0){
        near.health=0;
        near.alive=false;
        near.path=[];
        near.isMoving=false;
        near.prevX=near.x;
        near.prevY=near.y;
        near.state='dead';
        near.decay=0;
        s.emit(`${near.variantName||Species[near.species].name} was slain by a ${Species[c.species].name}.`);
       }
      }
      c.timer=1;
     }
     c.path=[];
    }else if(c.timer<=0){
     c.path=c.species==='mite'?Ecology.miteRoute(s,c,near):(pathfind(s.world,c,{x:Math.round(near.x),y:Math.round(near.y)},d.clearance)||[]);
     c.timer=.6;
    }
   }else if(d.behavior==='flee'){
    const threat=(near&&distance(near,c)<=8)?near:(c.provoked&&c.fleeTimer>0&&c.lastAttacker)?c.lastAttacker:null;
    if(threat){
     const threatPos={x:threat.x,y:threat.y};
     if(!c.path.length||(c.timer||0)<=0){
      const here={x:Math.round(c.x),y:Math.round(c.y)};
      const opts=s.world.neighbors(here.x,here.y).filter(n=>!n.solid&&n.water<6&&!n.isWell&&n.zone!=='well'&&AntGame.hasBodyClearance(s.world,n.x,n.y,d.clearance||1));
      if(opts.length){
       const ranked=opts.sort((a,b)=>distance(b,threatPos)-distance(a,threatPos));
       const best=ranked[0];
       const escapePath=[best];
       const nextOpts=s.world.neighbors(best.x,best.y).filter(n=>!n.solid&&n.water<6&&!n.isWell&&n.zone!=='well'&&(n.x!==here.x||n.y!==here.y)&&AntGame.hasBodyClearance(s.world,n.x,n.y,d.clearance||1));
       if(nextOpts.length){
        const nextBest=nextOpts.sort((a,b)=>distance(b,threatPos)-distance(a,threatPos))[0];
        escapePath.push(nextBest);
       }
       c.path=escapePath;
       c.timer=0.35;
      }
     }
    }else if(c.timer<=0&&!c.path.length){
     Ecology.chooseOpen(s,c,d);
     c.timer=1+s.random.next()*2;
    }
   }else if(c.timer<=0&&!c.path.length){
    Ecology.chooseOpen(s,c,d);
    c.timer=1+s.random.next()*2;
   }
   Ecology.move(c,d,dt);
  }
 }
 // THREAT RESPONSE: a patrol is interrupted as readily as an idle soldier; a
 // reported live predator must not be ignored merely because guards are walking.
  static reportThreat(s,a){if(!a.threatId)return;const threat=s.creatures.find(c=>c.id===a.threatId&&c.alive);a.threatId=null;a.held=false;if(!threat)return;const soldiers=s.ants.filter(b=>b.alive&&b.colonyId===1&&b.type==='soldier');for(const soldier of soldiers){if(soldier.task?.targetId!==threat.id){soldier.path=[];soldier.task={type:'attack',targetId:threat.id,source:'threat-report'};soldier.state='attack';soldier.timer=0;}}if(soldiers.length)s.emit(`Soldiers respond to the reported threat.`);}
  static colonies(s,players,dt){
   for(const col of s.colonies){
    const locals=s.ants.filter(a=>a.alive&&a.colonyId===col.id);
    let minDist=Infinity;
    if(!locals.length){
     for(const p of players)minDist=Math.min(minDist,distance(p,col));
    }else{
     for(const p of players)for(const a of locals)minDist=Math.min(minDist,distance(p,a));
    }

    if(col.state==='dormant'){
     if(minDist<=60){
      col.state='active';
      if(!locals.some(a=>a.type==='queen')){
       const queen=s.addAnt('queen',col.x,col.y,col.id);queen.fertile=true;
       col.queenId=queen.id;col.foodStore={x:col.x+1,y:col.y};col.waterStore={x:col.x-1,y:col.y};
       for(let i=0;i<3;i++)s.addAnt('worker',col.x+i-1,col.y+1,col.id);
       s.emit(`A neighboring colony is active. Its disposition is ${col.relation}.`);
      }
     }else{
      continue;
     }
    }else if(col.state==='active'){
     if(!locals.length){col.state='abandoned';continue;}
     if(minDist>300){col.state='dormant';continue;}
    }else{
     continue;
    }

    if(!s.aiEnabled)continue;
    col.aiTicks++;col.timer=(col.timer||0)-dt;col.contactCooldown=Math.max(0,(col.contactCooldown||0)-dt);

    // Contact and Aggressiveness Counter: contact within 3 blocks
    for(const a of locals){
     const nearEnemy=players.find(p=>p.alive&&distance(a,p)<=3);
     if(nearEnemy){
      if(!col.contact){col.contact=true;s.emit(`Ants met a ${col.relation} neighboring colony.`);}
      if(col.contactCooldown<=0){
       col.contactCount=(col.contactCount||0)+1;col.contactCooldown=1.0;
       if(col.contactCount>=col.tolerance&&col.relation!=='hostile'){
        col.relation='hostile';
        s.emit(`Rival colony ${col.id} turned hostile after repeated close encounters.`);
       }
      }
      if(col.relation==='hostile'&&!a.carry){a.task={type:'attack',targetId:nearEnemy.id};a.state='attack';}
     }
    }

    const idleWorkers=locals.filter(a=>['worker','minor','media','major','supermajor'].includes(a.type)&&a.state==='idle'&&!a.held&&!a.carry);
    const q=locals.find(a=>a.type==='queen');

    // 1. Queen Support: provision queen if reserves/supplies run low
    if(q&&idleWorkers.length){
     if(col.food>=10&&(col.food<60)){
      const w=idleWorkers.shift();col.food-=10;w.carry={type:'food',amount:10,foodType:'meat'};w.destination={point:{x:q.x,y:q.y},kind:'queen',colonyId:col.id};s.route(w,{x:q.x,y:q.y},'carrying');
     }else if(col.water>=10&&(col.water<60)&&idleWorkers.length){
      const w=idleWorkers.shift();col.water-=10;w.carry={type:'water',amount:10};w.destination={point:{x:q.x,y:q.y},kind:'queen',colonyId:col.id};s.route(w,{x:q.x,y:q.y},'carrying');
     }
    }

    // 2. Resource Gathering: discover and harvest nearby corpses or loose food within 25 hexes
    if(col.food<(col.foodCapacity||800)&&idleWorkers.length){
     const nearbyFood=s.creatures.filter(c=>!c.alive&&c.food>0&&!c.inStorage&&!c.carriedBy&&distance(c,col)<=25).concat(s.resources.filter(r=>r.remaining>0&&!r.inStorage&&distance(r,col)<=25));
     for(const foodItem of nearbyFood){
      if(!idleWorkers.length)break;
      const w=idleWorkers.find(worker=>pathfind(s.world,worker,{x:Math.round(foodItem.x),y:Math.round(foodItem.y)})!==null);
      if(w){
       idleWorkers.splice(idleWorkers.indexOf(w),1);
       w.task={type:'harvest',targetId:foodItem.id};
       s.route(w,{x:Math.round(foodItem.x),y:Math.round(foodItem.y)},'harvest');
      }
     }
    }

    // 3. Water Gathering: gather water from nearby water sources within 25 hexes
    if(col.water<(col.waterCapacity||400)*.6&&idleWorkers.length){
     const nearbyWater=[...s.world.activeWater].map(k=>s.world.cells.get(k)).filter(c=>c&&c.water>.01&&!c.waterStorage&&distance(c,col)<=25);
     for(const wc of nearbyWater){
      if(!idleWorkers.length)break;
      const w=idleWorkers.find(worker=>pathfind(s.world,worker,wc)!==null);
      if(w){
       idleWorkers.splice(idleWorkers.indexOf(w),1);
       w.task={type:'feed-water',targetId:key(wc.x,wc.y),source:wc};
       s.route(w,wc,'feeding-water');
      }
     }
    }

    // 4. Feeder Processing: process stored corpses in colony food storage
    if(col.food<(col.foodCapacity||800)&&idleWorkers.length){
     const storedCorpse=s.creatures.find(c=>!c.alive&&c.inStorage&&c.storageColonyId===col.id&&c.food>0);
     if(storedCorpse){
      const w=idleWorkers.shift();
      w.feeder=true;
     }
    }

    // 5. Digging and Expansion: autonomous excavation
    if(col.timer<=0){
     col.timer=3;
     if(s.jobs.filter(j=>j.colonyId===col.id).length<6){
      const frontier=new Map();
      for(const a of locals){
       for(let dy=-6;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){
        const x=Math.round(a.x)+dx,y=Math.round(a.y)+dy,c=s.world.peek(x,y);
        if(c&&c.solid&&!c.rock&&c.zone!=='rock'&&s.world.faces(c,false).length)frontier.set(key(x,y),c);
       }
      }
      const choices=[...frontier.values()].sort((a,b)=>distance(a,col)-distance(b,col));
      for(const c of choices.slice(0,3))s.designate(c.x,c.y,null,col.id);
     }
    }
   }
  }
 static resources(s,dt){for(const r of s.resources){const cell=s.world.peek(Math.round(r.x),Math.round(r.y));if(!cell?.discovered||r.remaining<=0)continue;r.state='active';r.decay+=dt;if(r.decay>=FoodTypes[r.foodType].decay)r.remaining=0;}}
 static update(s,dt){
  Ecology.sync(s);const players=s.ants.filter(a=>a.alive&&a.colonyId===1);
  for(const a of players){
   const k=key(Math.round(a.x),Math.round(a.y));
   const radius=(a.type==='queen'?C.queenRevealRadius:C.revealRadius)+s.effect('vision');
   if(a.lastReveal!==k||a.lastVision!==radius){s.world.senseAt(Math.round(a.x),Math.round(a.y),radius);a.lastReveal=k;a.lastVision=radius;}
  }
  for(const f of s.world.features)if(!s.discoveries.includes(f.id)&&s.world.peek(f.x,f.y)?.discovered){
   s.discoveries.push(f.id);const message=({water:'Water discovered. Deep flooding can injure ants.',surface:'Daylight! A surface shaft can receive dirt when the pit is full.',abandoned:'An abandoned tunnel has been discovered.',cavity:'A natural cavity has been discovered.',food:'Food discovered. Assign a feeder to gather it.',colony:'Another colony lies beyond this tunnel.','worm-cavity':'An Earthworm cavity has been discovered.','hercules-cavity':'A vast beetle cavity has been discovered.','spider-cavity':'A dark spider lair has been uncovered.','seed-site':'A seed site is crawling with small creatures.','root-vein':'Rotted Root discovered.'})[f.type];if(message)s.emit(message);
  }
  Ecology.water(s,dt);
  for(const a of s.ants)if(a.alive){const c=s.world.peek(Math.round(a.x),Math.round(a.y));if(c?.water>=C.waterDangerDepth)Ecology.damage(s,a,C.drowningDamage*dt);}
  s.eggs=s.eggs.filter(e=>(s.world.peek(Math.round(e.x),Math.round(e.y))?.water||0)<C.waterDangerDepth);
  // ROOTS AND WEBS run before creature decisions so their immobilization and
  // habitat changes are visible to AI during the same simulation tick.
  Ecology.rootAreas(s,players,dt);Ecology.webs(s,players,dt);Ecology.creatures(s,players,dt);Ecology.colonies(s,players,dt);Ecology.resources(s,dt);
  for(const a of players){
   if(a.type==='soldier'&&a.state==='idle'&&!a.held){
    a.patrolTimer=(a.patrolTimer||0)-dt;
    if(a.patrolTimer<=0){
     a.patrolTimer=2+s.random.next()*3;
     const choices=[];
     for(let dy=-12;dy<=12;dy++)for(let dx=-12;dx<=12;dx++){
      const cx=Math.round(a.x)+dx,cy=Math.round(a.y)+dy,cell=s.world.peek(cx,cy);
      if(cell&&!cell.solid&&cell.discovered&&cell.water<6){
       const weight=cell.excavations>0?4:1;
       for(let w=0;w<weight;w++)choices.push({x:cx,y:cy});
      }
     }
     if(choices.length){
      const target=choices[Math.floor(s.random.next()*choices.length)];
      s.route(a,target,'patrol');
     }
    }
   }
  }
  s.healTimer+=dt;if(s.healTimer>=10){s.healTimer=0;const injured=players.find(a=>a.alive&&a.type!=='queen'&&a.health<100);if(injured&&s.food>=1){s.spendFood(1);injured.health=Math.min(100,injured.health+15);}}
 }
  // Debug expedition searches surrounding chunk rings until finding the natural
  // seeded feature, then builds a navigable corridor back to the nest.
  static expedition(s,type){
   s._visitedFeatures = s._visitedFeatures || new Set();
   const matchType=(f,t)=>{
    if(t==='root'||t==='root-vein')return f.type==='root-vein'||f.type==='root';
    if(t==='worm'||t==='worm-cavity')return f.type==='worm-cavity'||f.species==='worm';
    if(t==='hercules'||t==='hercules-cavity')return f.type==='hercules-cavity'||f.species==='hercules';
    if(t==='spider'||t==='spider-cavity')return f.type==='spider-cavity'||f.species==='spider';
    if(t==='seed'||t==='seed-site')return f.type==='seed-site';
    if(t==='food')return f.type==='food'||f.type==='seed-site';
    if(t==='water')return f.type==='water';
    if(t==='well')return f.type==='well';
    if(t==='abandoned'||t==='ruins')return f.type==='abandoned';
    if(t==='surface')return f.type==='surface';
    if(t==='colony')return f.type==='colony';
    return f.type===t||f.species===t;
   };
   if(type==='colony')s.world.ensureChunk(3,0);
   let f=s.world.features.find(x=>matchType(x,type)&&!s._visitedFeatures.has(x.id));
   for(let r=1;r<=45&&!f;r++){
    for(let dy=-r;dy<=r&&!f;dy++){
     for(let dx=-r;dx<=r&&!f;dx++){
      if(Math.max(Math.abs(dx),Math.abs(dy),Math.abs(dx+dy))!==r)continue;
      s.world.ensureChunk(dx,dy);
      f=s.world.features.find(x=>matchType(x,type)&&!s._visitedFeatures.has(x.id));
     }
    }
   }
   if(!f)return null;
   s._visitedFeatures.add(f.id);
   const from=s.nest;let x=from.x,y=from.y;
   const targetX=f.passageX!==undefined?f.passageX:f.x;
   const targetY=f.passageY!==undefined?f.passageY:f.y;
   const carve=(px,py)=>{for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const c=s.world.get(px+dx,py+dy);if(c.solid&&!c.rock&&c.zone!=='rock'){c.solid=false;c.zone='tunnel';s.world.removed++;s.surfaceDump++;s.world.revision++;}c.discovered=true;}};
   while(x!==targetX||y!==targetY){carve(x,y);if(x!==targetX)x+=Math.sign(targetX-x);else y+=Math.sign(targetY-y);}
   carve(targetX,targetY);
   if(f.type==='root-vein'){
    for(const rc of s.world.rootCells(f)){
     const c=s.world.get(rc.x,rc.y);c.discovered=true;
     for(const n of s.world.neighbors(rc.x,rc.y))if(!n.rock&&n.zone!=='rock'){n.solid=false;n.zone='tunnel';n.discovered=true;}
    }
   }else{
    const revealRadius=f.type==='hercules-cavity'?14:f.type==='worm-cavity'?8:f.type==='spider-cavity'?6:(f.r||3)+2;
    s.world.revealAt(f.x,f.y,revealRadius);
   }
   s.world.revealAt(targetX,targetY,3);
   Ecology.sync(s);
   for(const c of s.creatures){
    if(c.featureId===f.id||c.rootFeatureId===f.id||c.seedFeatureId===f.id||distance(c,f)<=((f.r||4)+2)){
     c.devActivated=true;
     c.state='active';
    }
   }
   return f;
  }
}
AntGame.Ecology=Ecology;
})();