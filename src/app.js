/*
 * UNDERFOOT BROWSER CONTROLLER
 * This file connects the Canvas, toolbar, keyboard shortcuts, selection state,
 * UI counters, browser saves, and fixed-step animation frame to Simulation.
 * It is intentionally the only runtime module that reads pointer/keyboard events.
 *
 * Feature landmarks: grid/paint translate pointer input into exact hex brushes;
 * setMode and selectionMap drive action and group colors; updateUI refreshes visible
 * colony information; frame advances fixed simulation steps then requests drawing.
 */
(()=>{
const {Config:C,Simulation,Renderer,Traits,Species,FoodTypes,Ecology,hexDistance,hexDisk}=AntGame,$=id=>document.getElementById(id),canvas=$('world'),renderer=new Renderer(canvas),colors=['#62d6e5','#ef8f62','#9f7be5','#73c887','#e46d9d','#e8c96a','#60b5c9','#d48bda','#b6d46a','#e9955e'];
let sim=new Simulation(crypto.getRandomValues(new Uint32Array(1))[0]),selected=new Set(),group=null,inspectedTile=null,mode='brush',activeAction='none',radius=0,speed=1,paused=false,acc=0,last=performance.now(),uiAt=0,drag=null,lastBrush=null,lastEvents=0,toastTimer;
const isWorkerMorph=t=>['worker','minor','media','major','supermajor'].includes(t);
const isCommandable=t=>['worker','minor','media','soldier','major','supermajor'].includes(t);
const point=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}},grid=e=>{const p=point(e),h=renderer.hexAt(p.x,p.y);return{...h,p}},workers=()=>sim.ants.filter(a=>selected.has(a.id)&&a.alive&&a.colonyId===1&&isWorkerMorph(a.type)),units=()=>sim.ants.filter(a=>selected.has(a.id)&&a.alive&&a.colonyId===1&&isCommandable(a.type)),entity=()=>{const id=[...selected][0];return sim.ants.find(a=>a.id===id)||sim.eggs.find(a=>a.id===id)||sim.creatures.find(a=>a.id===id)||sim.resources.find(a=>a.id===id)},setSelection=(ids,g=null)=>{selected=new Set(ids);group=g;inspectedTile=null;renderer.inspectedCell=null;for(const a of sim.ants)a.selected=selected.has(a.id);for(const b of sim.eggs)b.selected=selected.has(b.id);renderActionToggles();};
function toast(t){if(!t)return;$('toast').textContent=t;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500);}
function selectionMap(){const m=new Map(),c=group===null?colors[0]:colors[group];for(const id of selected)m.set(id,c);return m;}
const ACTIONS=['none','dig','build','cancel','harvest','carry','attack','move'];
function setMode(m,resetAction=true){
 const prevMode=mode;
 const changed=mode!==m;
 mode=m;
 document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===m));
 if(changed&&resetAction){
  const isSelectGroupSwitch=(prevMode==='select'&&m==='group')||(prevMode==='group'&&m==='select');
  if(!isSelectGroupSwitch){
   setActiveAction('none');
   if(m==='brush')setSelection([]);
  }
 }
}
function setActiveAction(act,showToast=true){
 activeAction=act;
 const nameEl=$('current-action-name');
 if(nameEl)nameEl.textContent=act.charAt(0).toUpperCase()+act.slice(1);
 document.querySelectorAll('[data-action]').forEach(b=>b.classList.toggle('active',b.dataset.action===act));
 const overlay=$('actions-wheel-overlay');
 if(overlay)overlay.hidden=true;
 if(act!=='none'&&!units().length&&mode!=='select'&&mode!=='group'&&mode!=='brush')setMode('brush',false);
 if(showToast)toast(`Action: ${act.charAt(0).toUpperCase()+act.slice(1)}`);
}
function renderActionToggles(){
 const container=$('ant-action-toggles');
 if(!container)return;
 const selAnts=sim.ants.filter(a=>selected.has(a.id)&&a.alive&&a.colonyId===1);
 if(!selAnts.length){container.hidden=true;container.innerHTML='';return;}
 container.hidden=false;
 const actionsList=AntGame.AntActions||[
  {id:'dig',name:'Dig'},{id:'build',name:'Build'},{id:'harvest',name:'Harvest'},
  {id:'carry',name:'Carry'},{id:'haulSoil',name:'Haul Soil'},{id:'combat',name:'Combat'},
  {id:'selfFeed',name:'Self Feed'},{id:'selfWater',name:'Self Water'}
 ];
 container.innerHTML=`<div class="ant-toggles-header">Work Toggles</div>`+actionsList.map(act=>{
  const onCount=selAnts.filter(a=>{
   if(!a.actions)return true;
   if(act.id==='selfFeed')return a.actions.selfFeed!==false&&a.actions.gatherFood!==false;
   if(act.id==='selfWater')return a.actions.selfWater!==false&&a.actions.gatherWater!==false;
   return a.actions[act.id]!==false;
  }).length;
  const cls=onCount===selAnts.length?'ant-toggle-btn on':onCount>0?'ant-toggle-btn mixed':'ant-toggle-btn';
  return `<button class="${cls}" data-ant-action="${act.id}" type="button" title="${act.desc||act.name}">${act.name}</button>`;
 }).join('');
 container.querySelectorAll('[data-ant-action]').forEach(btn=>{
  btn.onclick=e=>{
   e.stopPropagation();
   const actId=btn.dataset.antAction;
   const anyOn=selAnts.some(a=>{
    if(!a.actions)return true;
    if(actId==='selfFeed')return a.actions.selfFeed!==false&&a.actions.gatherFood!==false;
    if(actId==='selfWater')return a.actions.selfWater!==false&&a.actions.gatherWater!==false;
    return a.actions[actId]!==false;
   });
   const newState=!anyOn;
   for(const a of selAnts){
    if(!a.actions)a.actions={};
    a.actions[actId]=newState;
    if(actId==='selfFeed')a.actions.gatherFood=newState;
    if(actId==='selfWater')a.actions.gatherWater=newState;
   }
   toast(`${btn.textContent}: ${newState?'ON':'OFF'} for ${selAnts.length} ant(s)`);
   renderActionToggles();
  };
  btn.onpointerdown=e=>e.stopPropagation();
  btn.onpointerup=e=>e.stopPropagation();
  btn.onmousedown=e=>e.stopPropagation();
 });
}
// SELECT VISIBILITY: creatures and loose resources are selectable only after an ant has revealed them.
function hits(h){return[...sim.ants,...sim.eggs,...sim.creatures,...sim.resources].filter(a=>(a.colonyId===1||sim.world.peek(Math.round(a.x),Math.round(a.y))?.discovered)&&hexDistance(a,h)<=1).sort((a,b)=>hexDistance(a,h)-hexDistance(b,h));}
// ROOM SUMMARY: connected cells with the same usable zone form one room; a one-cell gap splits it.
function roomSummary(start){const first=sim.world.peek(start.x,start.y);if(!first)return null;if(!first.discovered)return{title:'Unknown terrain',body:'This hex has not been revealed by an ant.'};if(first.rock||first.zone==='rock')return{title:'Solid Rock',body:`Hex ${start.x}, ${start.y}<br>Solid unexcavable rock.<br><b>Cannot be dug through.</b>`};if(first.zone==='hatchery-wall'||first.structure==='hatchery_wall')return{title:'Hatchery Wall',body:`Hex ${start.x}, ${start.y}<br>Fortified boundary wall enclosing the hatchery chamber.<br><b>Solid barrier (blocks movement and seals room).</b>`};if(first.solid)return{title:'Solid terrain',body:`Hex ${start.x}, ${start.y} · material has not been excavated.`};if(first.zone==='hatchery-floor'||first.structure==='hatchery_floor'){const hatcheries=(sim.world.getHatcheries?sim.world.getHatcheries():[]);const myH=hatcheries.find(h=>h.tiles.some(t=>t.x===start.x&&t.y===start.y));const eggsInside=sim.eggs.filter(e=>myH&&myH.tiles.some(t=>t.x===Math.round(e.x)&&t.y===Math.round(e.y)));const eggsCount=eggsInside.filter(e=>e.stage==='egg').length;const larvaeCount=eggsInside.filter(e=>e.stage==='larva').length;const pupaeCount=eggsInside.filter(e=>e.stage==='pupa').length;const status=myH?.isValid?'Enclosed (1 entrance)':'Invalid (missing walls or extra holes)';const cap=myH?.capacity||0;return{title:'Hatchery Chamber',body:`Hex ${start.x}, ${start.y}<br>Status: <b>${status}</b><br>Floor Tiles: <b>${myH?.tileCount||1}</b><br>Room Capacity: <b>${cap} egg${cap===1?'':'s'}</b> (1 per 3 tiles)<br>Effective Colony Cap: <b>${sim.effectiveBroodCap()}</b><br><br>Brood inside: ${eggsCount} eggs · ${larvaeCount} larvae · ${pupaeCount} pupae`};}if(first.zone==='colony'||first.area?.type==='enemy')return{title:'Enemy territory',body:'Zone details are hidden until the colony claims or clears this location.'};if(first.zone==='well'||first.isWell){const extractVal=AntGame.getWaterExtractValue(first.water);return{title:'Deep Well',body:`Hex ${start.x}, ${start.y}<br>Water level: <b>${first.water.toFixed(1)} / 20</b><br>Extractable water: <b>${extractVal}</b><br><br>A natural deep well enclosed by solid rock. Does not overflow.`};}if(first.zone==='water-store'||first.waterStorage){const waterTile=sim.waterStore.tiles.find(t=>t.x===start.x&&t.y===start.y);const droplets=(waterTile?.items||[]).length;return{title:first.area?.name||'Water Reservoir',body:`Hex ${start.x}, ${start.y}<br>Stored water: <b>${first.water.toFixed(1)} / 7</b><br>Stored droplets: <b>${droplets}</b><br><br>A constructed reservoir for water storage. Does not flood.`};}if(first.zone==='water'||first.water>0){const extractVal=AntGame.getWaterExtractValue(first.water),cells=[],seen=new Set(),queue=[first];while(queue.length){const cell=queue.shift(),id=`${cell.x},${cell.y}`;if(seen.has(id))continue;seen.add(id);if(cell.solid||cell.water<=0)continue;cells.push(cell);for(const next of sim.world.neighbors(cell.x,cell.y))if(next.discovered)queue.push(next);}const totalExtract=cells.reduce((sum,c)=>sum+AntGame.getWaterExtractValue(c.water),0),title=first.water<=0?'Dried Water Source':(first.zone==='water'?'Water Pool':'Flooded Floor');let body=`Hex ${start.x}, ${start.y}<br>Water level: <b>${first.water.toFixed(1)} / 7</b><br>Extractable water: <b>${extractVal}</b>`;if(cells.length>1)body+=`<br><br>Connected water tiles: <b>${cells.length}</b><br>Total pool extractable water: <b>${totalExtract}</b>`;return{title,body};}const roomKey=first.zone?`zone:${first.zone}`:first.area?`area:${first.area.id}`:null;if(!roomKey)return{title:'Undesignated floor',body:`Hex ${start.x}, ${start.y} · open path with no room designation.`};const cells=[],seen=new Set(),queue=[first];while(queue.length){const cell=queue.shift(),id=`${cell.x},${cell.y}`;if(seen.has(id))continue;seen.add(id);const k=cell.zone?`zone:${cell.zone}`:cell.area?`area:${cell.area.id}`:null;if(k!==roomKey||cell.solid)continue;cells.push(cell);for(const next of sim.world.neighbors(cell.x,cell.y))if(next.discovered)queue.push(next);}const cellKeys=new Set(cells.map(c=>`${c.x},${c.y}`)),ants=sim.ants.filter(a=>a.alive&&cellKeys.has(`${Math.round(a.x)},${Math.round(a.y)}`)),creatures=sim.creatures.filter(a=>a.alive&&cellKeys.has(`${Math.round(a.x)},${Math.round(a.y)}`)&&sim.world.peek(Math.round(a.x),Math.round(a.y))?.discovered);if(first.zone==='food-store'){const storedCorpses=sim.creatures.filter(c=>!c.alive&&c.inStorage&&cellKeys.has(`${Math.round(c.x)},${Math.round(c.y)}`)),storedSeeds=sim.resources.filter(r=>r.inStorage&&cellKeys.has(`${Math.round(r.x)},${Math.round(r.y)}`)),col=first.colonyId?sim.colonies.find(c=>c.id===first.colonyId):null,processedFood=Math.floor(col?col.food:sim.food),corpseVal=storedCorpses.reduce((sum,c)=>sum+(c.food||0),0),seedVal=storedSeeds.reduce((sum,r)=>sum+(r.remaining||0),0),totalPotential=processedFood+Math.ceil(corpseVal+seedVal),sourceList=[];for(const c of storedCorpses){const name=Species[c.species]?.name||c.variantName||c.species||'Corpse';sourceList.push(`${name}: ${Math.ceil(c.food)}`);}for(const r of storedSeeds){const name=FoodTypes[r.foodType]?.name||r.name||'Seed';sourceList.push(`${name}: ${Math.ceil(r.remaining)}`);}let body=`${cells.length} connected tile${cells.length===1?'':'s'} · ${ants.length} ant${ants.length===1?'':'s'} inside<br>Processed Food: <b>${processedFood}</b><br>Stored Bodies / Food Sources: ${sourceList.length?sourceList.join(', '):'None'}<br>Total Food Potential: <b>${totalPotential}</b>`;return{title:first.area?.name||'Food Store',body};}const waterTiles=sim.waterStore.tiles.filter(tile=>cellKeys.has(`${tile.x},${tile.y}`)),spoil=sim.spoilItems.filter(item=>cellKeys.has(`${item.x},${item.y}`)),parts=[`${cells.length} connected tile${cells.length===1?'':'s'}`,`${ants.length} ant${ants.length===1?'':'s'} inside`,`${creatures.length} visible creature${creatures.length===1?'':'s'}`];if(first.zone==='water-store')parts.push(`${waterTiles.reduce((n,t)=>n+(t.items||[]).length,0)} reservoir droplet${waterTiles.reduce((n,t)=>n+(t.items||[]).length,0)===1?'':'s'} stored`);if(first.zone==='spoil')parts.push(`${spoil.length} spoil object${spoil.length===1?'':'s'} stored`);return{title:first.area?.name||String(first.zone).replaceAll('-',' '),body:parts.join(' · ')};}
function paint(to,selUnits=units()){
 if(activeAction==='none')return;
 if(selUnits.length){
  if(activeAction==='dig'&&!selUnits.some(a=>isWorkerMorph(a.type)&&a.canMine!==false)){toast('Selected ants cannot dig.');return;}
  if(activeAction==='build'&&!selUnits.some(a=>isWorkerMorph(a.type)&&a.canBuild!==false)){toast('Selected ants cannot build.');return;}
 }
 const from=lastBrush||to,steps=Math.max(1,hexDistance(from,to));
 for(let i=0;i<=steps;i++){
  const x=Math.round(from.x+(to.x-from.x)*i/steps),y=Math.round(from.y+(to.y-from.y)*i/steps);
  const painted=sim.brush(x,y,radius,activeAction,selUnits,$('build-type').value);
  if(painted&&selUnits.length){
   const color=activeAction==='dig'?(group===null?colors[0]:colors[group]):
               activeAction==='build'?'#48a8cf':
               activeAction==='cancel'?'#b8322e':
               activeAction==='attack'?'#ff4444':
               activeAction==='harvest'?'#73c887':
               activeAction==='carry'?'#e8c96a':colors[0];
   sim.commandMarkers.push({x,y,color,life:2});
  }
 }
 lastBrush=to;
}
function box(p){const x=Math.min(drag.start.x,p.x),y=Math.min(drag.start.y,p.y);renderer.selectionBox={x,y,w:Math.abs(p.x-drag.start.x),h:Math.abs(p.y-drag.start.y)};}
canvas.onpointerdown=e=>{
 canvas.setPointerCapture(e.pointerId);
 const g=grid(e),isPan=e.button===1;
 drag={x:g.p.x,y:g.p.y,start:g.p,button:e.button,pan:isPan,moved:false};
 lastBrush=null;
 if(e.button===0){
  if(mode==='group')box(g.p);
  else if(mode==='brush')paint(g);
 }else if(e.button===2){
  const selUnits=units();
  if(selUnits.length&&activeAction!=='none'&&['dig','build','cancel','harvest','carry','attack'].includes(activeAction)){
   paint(g,selUnits);
  }
 }
};
canvas.onpointermove=e=>{
 const g=grid(e);
 renderer.hover=(mode==='brush'||(units().length>0&&activeAction!=='none'))?{x:g.x,y:g.y}:null;
 renderer.hoverRadius=radius;
 if(!drag)return;
 const dx=g.p.x-drag.x,dy=g.p.y-drag.y;
 if(Math.abs(dx)+Math.abs(dy)>2)drag.moved=true;
 if(drag.pan){
  const a=renderer.world(drag.x,drag.y),b=renderer.world(g.p.x,g.p.y);
  renderer.camera.x+=a.x-b.x;
  renderer.camera.y+=a.y-b.y;
  drag.x=g.p.x;
  drag.y=g.p.y;
 }else if(drag.button===0){
  if(mode==='group')box(g.p);
  else if(mode==='brush')paint(g);
 }else if(drag.button===2){
  const selUnits=units();
  if(selUnits.length&&activeAction!=='none'&&['dig','build','cancel','harvest','carry','attack'].includes(activeAction)){
   paint(g,selUnits);
  }
 }
};
// POINTER RELEASE: LMB selects/inspects (Select) or box-selects (Group) or finishes brush (Brush); RMB commands selected units.
canvas.onpointerup=e=>{
 if(!drag)return;
 const g=grid(e);
 if(drag.button===0&&!drag.pan){
  if(mode==='group'){
   const b=renderer.selectionBox;
   if(b){
    const p=sim.ants.filter(a=>a.alive&&a.colonyId===1).filter(a=>{const q=renderer.screen(a.x,a.y);return q.x>=b.x&&q.x<=b.x+b.w&&q.y>=b.y&&q.y<=b.y+b.h;});
    setSelection(p.map(a=>a.id));
    renderer.selectionBox=null;
   }
  }else if(mode==='select'&&!drag.moved){
   const t=hits(g)[0];
   if(t){
    if(e.shiftKey){
     selected.has(t.id)?selected.delete(t.id):selected.add(t.id);
     group=null;inspectedTile=null;renderer.inspectedCell=null;
     renderActionToggles();
    }else setSelection([t.id]);
   }else{
    setSelection([]);
    inspectedTile={x:g.x,y:g.y};
    renderer.inspectedCell=inspectedTile;
   }
  }
 }else if(drag.button===2&&!drag.pan){
  const selUnits=units();
  const queue=Boolean(e.shiftKey);
  if(selUnits.length){
   if(activeAction==='none'){
   }else if(activeAction==='move'){
    const t=hits(g)[0];
    if(t&&t.colonyId!==1&&t.alive){
     const err=sim.orderTarget('attack',t.id,selUnits,queue);
     if(err)toast(err);
     else sim.commandMarkers.push({x:g.x,y:g.y,color:'#ff4444',life:4});
    }else if(t&&!t.alive&&t.food>0){
     const err=sim.orderTarget('carry',t.id,selUnits,queue);
     if(err)toast(err);
     else sim.commandMarkers.push({x:g.x,y:g.y,color:'#e8c96a',life:4});
    }else if(t&&(t.species==='root_aphid'||t.remaining>0)){
     const err=sim.orderTarget('harvest',t.id,selUnits,queue);
     if(err)toast(err);
     else sim.commandMarkers.push({x:g.x,y:g.y,color:'#73c887',life:4});
    }else if(!renderer.colorMap){
     const err=sim.moveGroup(selUnits,g,queue);
     if(!err)sim.commandMarkers.push({x:g.x,y:g.y,color:group===null?colors[0]:colors[group],life:4});
     else toast(err);
    }
   }else if(['dig','build','cancel','harvest','carry','attack'].includes(activeAction)){
    if(!drag.moved){
     paint(g,selUnits);
    }
   }
  }else if(activeAction!=='none'&&!drag.moved){
   toast('Select living ants first to control.');
  }
 }
 drag=null;lastBrush=null;renderActionToggles();
};
const toolbarEl=document.querySelector('.toolbar'),togglesEl=$('ant-action-toggles'),containerEl=document.querySelector('.toolbar-container');
const stopBubble=e=>{e.stopPropagation();};
[toolbarEl,togglesEl,containerEl].forEach(el=>{
 if(el){
  el.addEventListener('pointerdown',stopBubble);
  el.addEventListener('pointerup',stopBubble);
  el.addEventListener('mousedown',stopBubble);
  el.addEventListener('mouseup',stopBubble);
  el.addEventListener('click',stopBubble);
 }
});
canvas.onpointercancel=()=>{drag=null;renderer.selectionBox=null};canvas.oncontextmenu=e=>e.preventDefault();canvas.onmouseleave=()=>renderer.hover=null;
function zoom(f,p=renderer.origin()){const a=renderer.world(p.x,p.y);renderer.camera.zoom=Math.max(.35,Math.min(8,renderer.camera.zoom*f));const b=renderer.world(p.x,p.y);renderer.camera.x+=a.x-b.x;renderer.camera.y+=a.y-b.y;}
canvas.onwheel=e=>{
 e.preventDefault();
 if(AntGame.Settings?.get('wheelMode')==='actions'){
  let idx=ACTIONS.indexOf(activeAction);
  if(idx===-1)idx=0;
  const dir=e.deltaY>0?1:-1;
  idx=(idx+dir+ACTIONS.length)%ACTIONS.length;
  setActiveAction(ACTIONS[idx]);
 }else{
  zoom(Math.exp(-e.deltaY*.001),point(e));
 }
};
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));document.querySelectorAll('.selector-size').forEach(b=>b.onclick=()=>{radius=Number(b.dataset.radius);document.querySelectorAll('.selector-size').forEach(x=>x.classList.toggle('active',x===b));renderer.hoverRadius=radius;});
if($('btn-actions'))$('btn-actions').onclick=()=>{const o=$('actions-wheel-overlay');if(o)o.hidden=!o.hidden;};
if($('actions-wheel-overlay')){$('actions-wheel-overlay').onclick=e=>{if(e.target===$('actions-wheel-overlay'))$('actions-wheel-overlay').hidden=true;};document.querySelectorAll('[data-action]').forEach(b=>{b.onclick=e=>{e.stopPropagation();setActiveAction(b.dataset.action);};});}
$('home').onclick=()=>{renderer.camera.x=1;renderer.camera.y=0};$('zoom-in').onclick=()=>zoom(1.2);$('zoom-out').onclick=()=>zoom(1/1.2);$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'▶':'Ⅱ'};$('speed').onclick=()=>{speed=speed===1?2: speed===2?4:1;$('speed').textContent=speed+'×'};$('color-map').onclick=()=>{renderer.colorMap=!renderer.colorMap;$('color-map').classList.toggle('active',renderer.colorMap);if(!renderer.colorMap){inspectedTile=null;renderer.inspectedCell=null;}};$('operations').onclick=()=>{renderColonyOperationsPriorities(activeCasteTab);$('operations-panel').hidden=false;};$('operations-close').onclick=()=>{$('operations-panel').hidden=true;};if($('settings-open'))$('settings-open').onclick=()=>AntGame.Settings?.openModal(toast);
$('feeder').onclick=()=>toast(sim.setFeeder(workers()[0]));$('release').onclick=()=>{workers().forEach(a=>sim.release(a));setSelection([]);toast('Workers released to colony work.')};$('nickname').onclick=()=>{const a=entity(),name=prompt('Ant nickname:',a?.nickname||'');if(a&&name!==null){a.nickname=name.trim().slice(0,24);updateUI();}};$('egg-toggle').onclick=()=>{sim.eggProduction=!sim.eggProduction;toast('Egg production '+(sim.eggProduction?'enabled.':'paused.'));};$('operation-food-need').onchange=e=>{sim.antFoodNeedRatio=Math.max(0,Math.min(1,Number(e.target.value)/100));e.target.value=Math.round(sim.antFoodNeedRatio*100);};$('operation-water-need').onchange=e=>{sim.antWaterNeedRatio=Math.max(0,Math.min(1,Number(e.target.value)/100));e.target.value=Math.round(sim.antWaterNeedRatio*100);};$('operation-counter').onclick=()=>{$('ant-counter').hidden=!$('ant-counter').hidden};$('operation-paths').onclick=()=>renderer.showPaths=!renderer.showPaths;$('operation-water-target').onclick=()=>{sim.waterTarget=sim.waterTarget==='queen'?'reservoir':'queen';$('operation-water-target').textContent=`Water target: ${sim.waterTarget==='queen'?'Queen':'Reservoir'}`};$('operation-withdraw-water').onclick=()=>toast(sim.requestReservoirWithdrawal());

let activeCasteTab='worker';
function renderColonyOperationsPriorities(caste=activeCasteTab){
 activeCasteTab=caste;
 AntGame.UIModals.renderColonyOperationsPriorities(sim,caste);
}

document.querySelectorAll('.caste-tab-btn').forEach(btn=>{
 btn.onclick=()=>{renderColonyOperationsPriorities(btn.dataset.caste);};
});
if($('btn-reset-caste-priority'))$('btn-reset-caste-priority').onclick=()=>{
 sim.resetCastePriorities(activeCasteTab);
 renderColonyOperationsPriorities(activeCasteTab);
 toast(`Reset ${activeCasteTab} priorities to default.`);
};
if($('btn-reset-all-priorities'))$('btn-reset-all-priorities').onclick=()=>{
 sim.resetCastePriorities();
 renderColonyOperationsPriorities(activeCasteTab);
 toast('Reset all caste priorities to defaults.');
};

function attachSimListeners(s){
 s.onAntAutoReleased=id=>{
  if(selected.has(id)){
   selected.delete(id);
   renderActionToggles();
   updateUI();
  }
 };
}
attachSimListeners(sim);

function traits(){AntGame.UIModals.renderTraits(sim,toast);}
function openEvolutionShop(){AntGame.UIModals.openEvolutionShop(sim,toast);}$('evolution').onclick=openEvolutionShop;$('evolve-open').onclick=openEvolutionShop;document.querySelector('.modal .close').onclick=()=>{$('evolution-panel').hidden=true};

function renderBroodShop(){AntGame.UIModals.renderBroodShop(sim,toast,updateUI);}
function openBroodShop(){AntGame.UIModals.openBroodShop(sim,toast,updateUI);}
if($('brood-points'))$('brood-points').onclick=openBroodShop;
if($('brood-shop-open'))$('brood-shop-open').onclick=openBroodShop;
if($('brood-shop-close'))$('brood-shop-close').onclick=()=>{if($('brood-shop-panel'))$('brood-shop-panel').hidden=true;};
if($('brood-helper'))$('brood-helper').onclick=()=>{
 const w=workers()[0];
 if(!w)return;
 if(w.broodHelper){
  sim.setBroodHelper(w,false);
  toast(`Worker ${w.id} removed from Brood Helper role.`);
 }else{
  const err=sim.setBroodHelper(w,true);
  if(err)toast(err);
  else toast(`Worker ${w.id} assigned as Colony Brood Helper.`);
 }
 updateUI();
};
const saveGame=()=>{localStorage.setItem('underfoot-save-v3',JSON.stringify(sim.serialize()));toast('Colony saved.');};
const loadGame=()=>{try{sim=Simulation.restore(JSON.parse(localStorage.getItem('underfoot-save-v3')));attachSimListeners(sim);setSelection([]);renderColonyOperationsPriorities(activeCasteTab);toast('Colony restored.');AntGame.Settings?.closeModal();}catch{toast('No compatible save found.');}};
const newGame=()=>{if(confirm('Start a new colony?')){sim=new Simulation(crypto.getRandomValues(new Uint32Array(1))[0]);attachSimListeners(sim);setSelection([]);renderColonyOperationsPriorities(activeCasteTab);AntGame.Settings?.closeModal();toast('New colony founded.');}};
if(AntGame.Settings){AntGame.Settings.onSaveColony=saveGame;AntGame.Settings.onLoadColony=loadGame;AntGame.Settings.onNewColony=newGame;AntGame.Settings.updateDevBubble();}
if($('save'))$('save').onclick=saveGame;if($('load'))$('load').onclick=loadGame;if($('new'))$('new').onclick=newGame;
// DEV CREATURE SPAWNER: first looks for a revealed floor area large enough for
// the selected model. If the current colony has no such area, it opens a visible
// test chamber around the chosen point. This keeps a 7-10-block Hercules body,
function spawnDebugCreature(choice){const species=choice==='woodlouse'?'isopod':choice,d=Species[species],stageRadius=species==='hercules'?12:species==='worm'?6:species==='grub'||species==='spider'?4:species==='isopod'?2:1,nearby=[...sim.world.cells.values()].filter(c=>c.discovered&&!c.solid&&!c.water&&!c.isWell&&hexDistance(c,sim.nest)>=3&&hexDistance(c,sim.nest)<=10),fits=c=>hexDisk(c.x,c.y,stageRadius).every(p=>{const tile=sim.world.peek(p.x,p.y);return tile?.discovered&&!tile.solid&&!tile.water&&!tile.isWell;}),ready=nearby.filter(fits),cell=ready[Math.floor(sim.random.next()*ready.length)]||nearby[Math.floor(sim.random.next()*nearby.length)]||sim.world.peek(sim.nest.x+2,sim.nest.y),spawnPoint={x:cell.x,y:cell.y},extra={state:'active'};if(!fits(cell))for(const p of hexDisk(cell.x,cell.y,stageRadius))sim.world.open(p.x,p.y,'cavity',true);if(choice==='woodlouse')extra.variantName='Woodlouse';if(species==='root_aphid'){const f={id:`dev-root-${sim.nextId}`,type:'root-vein',x:cell.x,y:cell.y,length:1,dirX:1,dirY:0};sim.world.features.push(f);const root=sim.world.get(cell.x,cell.y);Object.assign(root,{solid:true,root:true,terrain:'root',hardness:4,woodDurability:C.rootWoodDurability,zone:'root',feature:f.id,discovered:true});const perch=sim.world.neighbors(cell.x,cell.y).find(n=>!n.solid);extra.rootFeatureId=f.id;extra.milkCooldown=0;extra.biteTimer=C.rootAphidBiteInterval;if(perch){spawnPoint.x=perch.x;spawnPoint.y=perch.y;}}const creature=Ecology.spawnCreature(sim,species,spawnPoint.x,spawnPoint.y,extra);sim.creatures.push(creature);renderer.camera.x=spawnPoint.x;renderer.camera.y=spawnPoint.y;toast(`Developer: ${creature.variantName||d.name} spawned.`);}
$('debug-toggle').onclick=()=>$('debug').hidden=!$('debug').hidden;$('debug-close').onclick=()=>{$('debug').hidden=true;};$('spawn').onclick=()=>{const caste=$('spawn-caste')?.value||'worker';sim.addAnt(caste,sim.nest.x+2,sim.nest.y);toast(`Developer: ${caste} spawned.`);};$('spawn-creature-button').onclick=()=>spawnDebugCreature($('spawn-creature').value);$('paths').onclick=()=>{renderer.showPaths=!renderer.showPaths;toast(`Paths ${renderer.showPaths?'shown':'hidden'}.`);};$('ai').onclick=()=>{sim.aiEnabled=!sim.aiEnabled;toast(`AI ${sim.aiEnabled?'enabled':'paused'}.`);};document.querySelectorAll('[data-expedition]').forEach(b=>b.onclick=()=>{const f=Ecology.expedition(sim,b.dataset.expedition);if(f){renderer.camera.x=f.x;renderer.camera.y=f.y;toast(`Found and routed to ${f.type} at ${f.x}, ${f.y}.`);}else toast(`No ${b.dataset.expedition} found.`);});
if($('dev-force-clear'))$('dev-force-clear').onclick=()=>{sim.climate?.forceWeather('clear');toast('Dev: Weather set to Clear.');};
if($('dev-force-rain'))$('dev-force-rain').onclick=()=>{sim.climate?.forceWeather('rain');toast('Dev: Weather set to Rain.');};
if($('dev-force-wind'))$('dev-force-wind').onclick=()=>{sim.climate?.forceWeather('heavy_wind');toast('Dev: Weather set to Heavy Wind.');};
if($('dev-force-storm'))$('dev-force-storm').onclick=()=>{sim.climate?.forceWeather('thunderstorm');toast('Dev: Weather set to Thunderstorm.');};
if($('dev-trigger-quake'))$('dev-trigger-quake').onclick=()=>{sim.triggerEarthquake();toast('Dev: Earthquake triggered.');};
if($('dev-trigger-lightning'))$('dev-trigger-lightning').onclick=()=>{sim.triggerLightningStrike();toast('Dev: Lightning strike triggered.');};
if($('dev-trigger-cavein'))$('dev-trigger-cavein').onclick=()=>{sim.triggerCaveIn();toast('Dev: Cave-in triggered.');};
const heldKeys=new Set();
window.addEventListener('keydown',e=>{
 if(!e.target.matches('input,textarea,select')){
  heldKeys.add(e.code);
  if(e.key)heldKeys.add(e.key.toLowerCase());
 }
});
window.addEventListener('keyup',e=>{
 heldKeys.delete(e.code);
 if(e.key)heldKeys.delete(e.key.toLowerCase());
});
window.addEventListener('blur',()=>heldKeys.clear());

window.addEventListener('pointerdown',e=>{
 if(e.button>=3&&!e.target.matches('input,textarea,select')){
  const S=AntGame.Settings;
  if(!S||S.rebindingActionId)return;
  e.preventDefault();
  for(const act of ['action_dig','action_build','action_cancel','action_harvest','action_carry','action_attack','action_move']){
   if(S.matchesMouseEvent(act,e)){
    setActiveAction(act.replace('action_',''));
    return;
   }
  }
  if(S.matchesMouseEvent('toggle_wheel_mode',e)){
   const m=S.toggleWheelMode();
   toast(`Scroll wheel: ${m==='actions'?'Cycle Actions':'Zoom Camera'}`);
   return;
  }
  if(S.matchesMouseEvent('mode_brush',e)){setMode('brush');return;}
  if(S.matchesMouseEvent('mode_select',e)){setMode('select');return;}
  if(S.matchesMouseEvent('mode_group',e)){setMode('group');return;}
  if(S.matchesMouseEvent('focus_queen',e)){
   const q=sim.queen();
   if(q){renderer.camera.x=q.x;renderer.camera.y=q.y;toast('Camera focused on Queen.');}
   return;
  }
 }
});

document.onkeydown=e=>{
 if(e.target.matches('input,textarea,select'))return;
 if(AntGame.Settings?.rebindingActionId)return;
 const S=AntGame.Settings;

 if(S?S.matchesKeyEvent('toggle_wheel_mode',e):(e.key==='q'||e.code==='KeyQ')){
  e.preventDefault();
  const m=S?S.toggleWheelMode():'actions';
  toast(`Scroll wheel: ${m==='actions'?'Cycle Actions':'Zoom Camera'}`);
  return;
 }
 if(S?S.matchesKeyEvent('pause_game',e):e.code==='Space'){
  e.preventDefault();
  $('pause').click();
  return;
 }
 if(e.key==='ArrowUp'||e.key==='ArrowDown'){
  e.preventDefault();
  let idx=ACTIONS.indexOf(activeAction);
  if(idx===-1)idx=0;
  const dir=e.key==='ArrowDown'?1:-1;
  idx=(idx+dir+ACTIONS.length)%ACTIONS.length;
  setActiveAction(ACTIONS[idx]);
  return;
 }

 // Modes: f = brush, e = select, r = group
 if(S?S.matchesKeyEvent('mode_brush',e):(e.key==='f'||e.code==='KeyF')){setMode('brush');return;}
 if(S?S.matchesKeyEvent('mode_select',e):(e.key==='e'||e.code==='KeyE')){setMode('select');return;}
 if(S?S.matchesKeyEvent('mode_group',e):(e.key==='r'||e.code==='KeyR')){setMode('group');return;}

 // 7 Actions: z, x, c, v, b, n, m
 if(S?S.matchesKeyEvent('action_dig',e):(e.key==='z'||e.code==='KeyZ')){setActiveAction('dig');return;}
 if(S?S.matchesKeyEvent('action_build',e):(e.key==='x'||e.code==='KeyX')){setActiveAction('build');return;}
 if(S?S.matchesKeyEvent('action_cancel',e):(e.key==='c'||e.code==='KeyC')){setActiveAction('cancel');return;}
 if(S?S.matchesKeyEvent('action_harvest',e):(e.key==='v'||e.code==='KeyV')){setActiveAction('harvest');return;}
 if(S?S.matchesKeyEvent('action_carry',e):(e.key==='b'||e.code==='KeyB')){setActiveAction('carry');return;}
 if(S?S.matchesKeyEvent('action_attack',e):(e.key==='n'||e.code==='KeyN')){setActiveAction('attack');return;}
 if(S?S.matchesKeyEvent('action_move',e):(e.key==='m'||e.code==='KeyM')){setActiveAction('move');return;}

 // Caste selection
 const selectCasteGroup=(filterFn,label)=>{
  const matching=sim.ants.filter(a=>a.alive&&a.colonyId===1&&filterFn(a)).map(a=>a.id);
  if(matching.length){
   setSelection(matching);
   setMode('group',false);
   toast(`Selected ${matching.length} ${label}.`);
  }else{
   toast(`No living ${label} found.`);
  }
 };
 if(S?.matchesKeyEvent('select_soldiers',e)){selectCasteGroup(a=>a.type==='soldier','soldiers');return;}
 if(S?.matchesKeyEvent('select_workers',e)){selectCasteGroup(a=>a.type==='worker','workers');return;}
 if(S?.matchesKeyEvent('select_minors',e)){selectCasteGroup(a=>a.type==='minor','minors');return;}
 if(S?.matchesKeyEvent('select_media',e)){selectCasteGroup(a=>a.type==='media','media');return;}
 if(S?.matchesKeyEvent('select_majors',e)){selectCasteGroup(a=>a.type==='major','majors');return;}
 if(S?.matchesKeyEvent('select_supermajors',e)){selectCasteGroup(a=>a.type==='supermajor','supermajors');return;}
 if(S?.matchesKeyEvent('select_feeders',e)){selectCasteGroup(a=>a.feeder,'feeders');return;}
 if(S?.matchesKeyEvent('select_brood_helpers',e)){selectCasteGroup(a=>a.broodHelper,'brood helpers');return;}
 if(S?.matchesKeyEvent('focus_queen',e)){
  const q=sim.queen();
  if(q){renderer.camera.x=q.x;renderer.camera.y=q.y;toast('Camera focused on Queen.');}
  return;
 }

 if(/^[1-9]$/.test(e.key)){
  const n=Number(e.key);
  if(e.ctrlKey){
   e.preventDefault();
   sim.groups[n]=[...selected].filter(id=>sim.ants.some(a=>a.id===id&&a.alive&&a.colonyId===1));
   group=n;
   toast(`Saved ${sim.groups[n].length} ants to group ${n}.`);
  }else{
   const ids=(sim.groups[n]||[]).filter(id=>sim.ants.some(a=>a.id===id&&a.alive));
   setSelection(e.shiftKey?[...new Set([...selected,...ids])]:ids,n);
   setMode('group',false);
  }
 }else if(e.key==='0'&&!e.ctrlKey){
  setSelection(sim.ants.filter(a=>a.alive&&a.colonyId===1).map(a=>a.id),0);
  setMode('group',false);
 }
 if(e.key==='Escape'){
  const settingsPanel=$('settings-panel');
  if(settingsPanel&&!settingsPanel.hidden){
   S?.closeModal();
   return;
  }
  let closedModal=false;
  for(const id of ['evolution-panel','brood-shop-panel','operations-panel','debug','actions-wheel-overlay']){
   const el=$(id);
   if(el&&!el.hidden){
    el.hidden=true;
    closedModal=true;
   }
  }
  if(!closedModal){
   S?.openModal(toast);
  }
  return;
 }
 if(S?S.matchesKeyEvent('camera_home',e):e.key==='Home')$('home').click();
};window.onresize=()=>renderer.resize();
// INSPECTOR READOUT: entity identity wins; otherwise a selected terrain hex reports its connected room.
function syncHeaderAndInspector(){const queen=sim.queen();$('queen-health').textContent=queen?`${Math.ceil(queen.health)} / ${queen.maxHealth} (F:${Math.round(queen.food||0)} W:${Math.round(queen.water||0)})`:'0 / 0';const hasInspection=Boolean(entity()||inspectedTile||selected.size);$('inspector').hidden=!hasInspection;}setInterval(syncHeaderAndInspector,150);
function updateUI(){const own=sim.ants.filter(a=>a.alive&&a.colonyId===1),q=sim.queen(),e=entity(),counts=t=>own.filter(a=>a.type===t).length;$('population').textContent=`${own.length} / ${sim.colonyCapacity()}`;$('food').textContent=`${sim.food.toFixed(0)} / ${sim.foodCapacity().toFixed(0)}`;$('water').textContent=`${sim.water.toFixed(0)} / ${sim.waterCapacity().toFixed(0)}`;$('spoil').textContent=`${sim.world.pits.reduce((n,p)=>n+p.used,0)} / ${sim.world.pits.reduce((n,p)=>n+p.capacity,0)}`;$('egg-toggle').textContent=`Egg production: ${sim.eggProduction?'ON':'OFF'}`;$('operation-water-target').textContent=`Water target: ${sim.waterTarget==='queen'?'Queen':'Reservoir'}`;$('evolution').textContent=sim.evolution.toFixed(1)+' EP';if($('brood-points'))$('brood-points').textContent=`${sim.broodPoints||0} BP`;$('time').textContent=`${String(Math.floor(sim.time/60)).padStart(2,'0')}:${String(Math.floor(sim.time%60)).padStart(2,'0')}`;$('seed').textContent='SEED '+sim.world.seed;const antCounterStr=`Q ${counts('queen')} · MN ${counts('minor')} · WK ${counts('worker')} · MD ${counts('media')} · SL ${counts('soldier')} · MJ ${counts('major')} · SM ${counts('supermajor')}`;if($('ant-counter-badges'))$('ant-counter-badges').textContent=antCounterStr;else if($('ant-counter'))$('ant-counter').textContent=antCounterStr;if(sim.climate){const c=sim.climate;if($('climate-date'))$('climate-date').textContent=`${c.dateFormatted} · ${c.timeOfDayFormatted} · ${c.seasonName}`;if($('climate-summary')){const wIcon={clear:'☀',overcast:'☁',rain:'🌧',heavy_wind:'💨',thunderstorm:'⛈'}[c.weather]||'☀';const wName={clear:'Clear',overcast:'Overcast',rain:'Rain',heavy_wind:'Heavy Wind',thunderstorm:'Thunderstorm'}[c.weather]||c.weather;$('climate-summary').textContent=`${wIcon} ${wName} · ${c.temperature.toFixed(0)}°C · ${c.humidity.toFixed(0)}% RH`;$('climate-summary').title=`Season: ${c.seasonName} (${c.seasonPhase})\nInfiltration Risk: ${(c.infiltrationChance*100).toFixed(1)}%\nDay Progress: ${Math.round(c.dayProgress*100)}%`;}}const alert=[];if(sim.gameOver)alert.push('THE COLONY IS DEAD');else{if(q&&(q.food<=0.01))alert.push('QUEEN IS STARVING');if(q&&(q.water<=0.01))alert.push('QUEEN IS DEHYDRATED');}const banner=$('critical-alert');banner.hidden=!alert.length;banner.textContent=alert.join(' · ');$('feeder').hidden=!(workers().length===1&&!workers()[0].feeder);const selW=workers();if($('brood-helper')){if(selW.length===1&&sim.broodHelperUnlocked){$('brood-helper').hidden=false;$('brood-helper').textContent=selW[0].broodHelper?'Remove brood helper':'Assign brood helper';}else{$('brood-helper').hidden=true;}}$('nickname').hidden=!(e?.type&&e.colonyId===1);$('release').hidden=!workers().some(a=>a.held||a.preferred);const insp=AntGame.UIModals.formatEntityInspection(e,sim,inspectedTile,roomSummary,selected.size);$('selection-title').textContent=insp.title;$('selection-body').innerHTML=insp.body;if(sim.events.length>lastEvents){toast(sim.events.at(-1).text);lastEvents=sim.events.length;}$('debug-info').textContent=`${sim.world.cells.size} hexes · ${sim.jobs.length} jobs · soil ${sim.conservation()?'conserved':'ERROR'}`;if(!$('evolution-panel').hidden){document.querySelectorAll('#traits [data-trait]').forEach(b=>{const t=AntGame.Traits.find(tr=>tr.id===b.dataset.trait);if(t){const level=sim.traitLevels?.[t.id]||0,cost=Math.ceil(t.cost*(1.5**level)),repeatable=new Set(['food_store','water_store','colony_limit','feeder_limit']),locked=sim.traits.includes(t.id)&&!repeatable.has(t.id);b.disabled=locked||sim.evolution<cost;}});}}
// ANT NEED READOUT: selected workers, soldiers, drones, and princesses expose their personal supplies.
function updateAntNeedInspector(){const a=entity();$('operation-food-need').value=Math.round(sim.antFoodNeedRatio*100);$('operation-water-need').value=Math.round(sim.antWaterNeedRatio*100);if(a?.type&&a.type!=='queen'){const fCap=a.maxFoodNeed||C.antFoodCapacity,wCap=a.maxWaterNeed||C.antWaterCapacity;$('selection-body').innerHTML+=`<br>Food ${Math.ceil(a.foodNeed??fCap)} / ${fCap} · Water ${Math.ceil(a.waterNeed??wCap)} / ${wCap}`;}}
function frame(now){
 const dt=Math.min((now-last)/1000,.1);
 acc+=dt*(paused?0:speed);
 last=now;

 // Smooth WASD camera navigation
 if(!document.activeElement?.matches('input,textarea,select')){
  let camX=0,camY=0;
  const S=AntGame.Settings;
  const isUp=S?(S.keybinds.camera_up&&((heldKeys.has(S.keybinds.camera_up.code))||(heldKeys.has(S.keybinds.camera_up.key)))) : (heldKeys.has('KeyW')||heldKeys.has('w'));
  const isDown=S?(S.keybinds.camera_down&&((heldKeys.has(S.keybinds.camera_down.code))||(heldKeys.has(S.keybinds.camera_down.key)))) : (heldKeys.has('KeyS')||heldKeys.has('s'));
  const isLeft=S?(S.keybinds.camera_left&&((heldKeys.has(S.keybinds.camera_left.code))||(heldKeys.has(S.keybinds.camera_left.key)))) : (heldKeys.has('KeyA')||heldKeys.has('a'));
  const isRight=S?(S.keybinds.camera_right&&((heldKeys.has(S.keybinds.camera_right.code))||(heldKeys.has(S.keybinds.camera_right.key)))) : (heldKeys.has('KeyD')||heldKeys.has('d'));

  if(isUp)camY-=1;
  if(isDown)camY+=1;
  if(isLeft)camX-=1;
  if(isRight)camX+=1;

  if(camX!==0||camY!==0){
   const len=Math.hypot(camX,camY);
   const speedPx=700*dt;
   const dx=(camX/len)*speedPx,dy=(camY/len)*speedPx;
   const o=renderer.origin();
   const a=renderer.world(o.x,o.y),b=renderer.world(o.x+dx,o.y+dy);
   renderer.camera.x+=b.x-a.x;
   renderer.camera.y+=b.y-a.y;
  }
 }

 while(acc>=C.step){sim.update(C.step);acc-=C.step;}
 for(const m of sim.commandMarkers)m.life-=Math.min(.2,(now-uiAt)/1000);
 sim.commandMarkers=sim.commandMarkers.filter(m=>m.life>0);
 renderer.draw(sim,selectionMap(),activeAction,acc/C.step);
 if(AntGame.AudioCoordinator)AntGame.AudioCoordinator.updateAntActivity(sim);
 if(now-uiAt>150){
  updateUI();
  updateAntNeedInspector();
  if(AntGame.AudioCoordinator){AntGame.AudioCoordinator.update(sim.climate,renderer.camera,sim);}
  uiAt=now;
 }
 requestAnimationFrame(frame);
}
window.underfoot={get simulation(){return sim},renderer};updateUI();requestAnimationFrame(frame);
})();
