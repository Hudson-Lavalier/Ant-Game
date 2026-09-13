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
let sim=new Simulation(crypto.getRandomValues(new Uint32Array(1))[0]),selected=new Set(),group=null,inspectedTile=null,mode='brush',activeAction='dig',radius=0,speed=1,paused=false,acc=0,last=performance.now(),uiAt=0,drag=null,lastBrush=null,lastEvents=0,toastTimer;
const isWorkerMorph=t=>['worker','minor','media','major','supermajor'].includes(t);
const isCommandable=t=>['worker','minor','media','soldier','major','supermajor'].includes(t);
const point=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}},grid=e=>{const p=point(e),h=renderer.hexAt(p.x,p.y);return{...h,p}},workers=()=>sim.ants.filter(a=>selected.has(a.id)&&a.alive&&a.colonyId===1&&isWorkerMorph(a.type)),units=()=>sim.ants.filter(a=>selected.has(a.id)&&a.alive&&a.colonyId===1&&isCommandable(a.type)),entity=()=>{const id=[...selected][0];return sim.ants.find(a=>a.id===id)||sim.creatures.find(a=>a.id===id)||sim.resources.find(a=>a.id===id)},setSelection=(ids,g=null)=>{selected=new Set(ids);group=g;inspectedTile=null;renderer.inspectedCell=null;for(const a of sim.ants)a.selected=selected.has(a.id);renderActionToggles();};
function toast(t){if(!t)return;$('toast').textContent=t;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500);}
function selectionMap(){const m=new Map(),c=group===null?colors[0]:colors[group];for(const id of selected)m.set(id,c);return m;}
function setMode(m){mode=m;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===m));}
function setActiveAction(act){
 activeAction=act;
 const nameEl=$('current-action-name');
 if(nameEl)nameEl.textContent=act.charAt(0).toUpperCase()+act.slice(1);
 const overlay=$('actions-wheel-overlay');
 if(overlay)overlay.hidden=true;
 if(!units().length&&mode!=='select'&&mode!=='group')setMode('brush');
 toast(`Action: ${act.charAt(0).toUpperCase()+act.slice(1)}`);
}
function renderActionToggles(){
 const container=$('ant-action-toggles');
 if(!container)return;
 const selAnts=sim.ants.filter(a=>selected.has(a.id)&&a.alive&&a.colonyId===1);
 if(!selAnts.length){container.hidden=true;container.innerHTML='';return;}
 container.hidden=false;
 const actionsList=AntGame.AntActions||[
  {id:'dig',name:'Dig'},{id:'carry',name:'Carry'},{id:'harvest',name:'Harvest'},
  {id:'feed',name:'Feed'},{id:'gatherFood',name:'Gather Food'},{id:'gatherWater',name:'Gather Water'},
  {id:'build',name:'Build'},{id:'haulSoil',name:'Haul Soil'},{id:'combat',name:'Combat'}
 ];
 container.innerHTML=actionsList.map(act=>{
  const onCount=selAnts.filter(a=>a.actions&&a.actions[act.id]!==false).length;
  const cls=onCount===selAnts.length?'ant-toggle-btn on':onCount>0?'ant-toggle-btn mixed':'ant-toggle-btn';
  return `<button class="${cls}" data-ant-action="${act.id}" type="button" title="${act.desc||act.name}">${act.name}</button>`;
 }).join('');
 container.querySelectorAll('[data-ant-action]').forEach(btn=>{
  btn.onclick=e=>{
   e.stopPropagation();
   const actId=btn.dataset.antAction;
   const anyOn=selAnts.some(a=>a.actions&&a.actions[actId]!==false);
   const newState=!anyOn;
   for(const a of selAnts){if(!a.actions)a.actions={};a.actions[actId]=newState;}
   toast(`${btn.textContent}: ${newState?'ON':'OFF'} for ${selAnts.length} ant(s)`);
   renderActionToggles();
  };
  btn.onpointerdown=e=>e.stopPropagation();
  btn.onpointerup=e=>e.stopPropagation();
  btn.onmousedown=e=>e.stopPropagation();
 });
}
// SELECT VISIBILITY: creatures and loose resources are selectable only after an ant has revealed them.
function hits(h){return[...sim.ants,...sim.creatures,...sim.resources].filter(a=>(a.colonyId===1||sim.world.peek(Math.round(a.x),Math.round(a.y))?.discovered)&&hexDistance(a,h)<=1).sort((a,b)=>hexDistance(a,h)-hexDistance(b,h));}
// ROOM SUMMARY: connected cells with the same usable zone form one room; a one-cell gap splits it.
function roomSummary(start){const first=sim.world.peek(start.x,start.y);if(!first)return null;if(!first.discovered)return{title:'Unknown terrain',body:'This hex has not been revealed by an ant.'};if(first.rock||first.zone==='rock')return{title:'Solid Rock',body:`Hex ${start.x}, ${start.y}<br>Solid unexcavable rock.<br><b>Cannot be dug through.</b>`};if(first.solid)return{title:'Solid terrain',body:`Hex ${start.x}, ${start.y} · material has not been excavated.`};if(first.zone==='colony'||first.area?.type==='enemy')return{title:'Enemy territory',body:'Zone details are hidden until the colony claims or clears this location.'};if(first.zone==='well'||first.isWell){const extractVal=AntGame.getWaterExtractValue(first.water);return{title:'Deep Well',body:`Hex ${start.x}, ${start.y}<br>Water level: <b>${first.water.toFixed(1)} / 20</b><br>Extractable water: <b>${extractVal}</b><br><br>A natural deep well enclosed by solid rock. Does not overflow.`};}if(first.zone==='water'||first.water>0){const extractVal=AntGame.getWaterExtractValue(first.water),cells=[],seen=new Set(),queue=[first];while(queue.length){const cell=queue.shift(),id=`${cell.x},${cell.y}`;if(seen.has(id))continue;seen.add(id);if(cell.solid||cell.water<=0)continue;cells.push(cell);for(const next of sim.world.neighbors(cell.x,cell.y))if(next.discovered)queue.push(next);}const totalExtract=cells.reduce((sum,c)=>sum+AntGame.getWaterExtractValue(c.water),0),title=first.water<=0?'Dried Water Source':(first.zone==='water'?'Water Pool':'Flooded Floor');let body=`Hex ${start.x}, ${start.y}<br>Water level: <b>${first.water.toFixed(1)} / 7</b><br>Extractable water: <b>${extractVal}</b>`;if(cells.length>1)body+=`<br><br>Connected water tiles: <b>${cells.length}</b><br>Total pool extractable water: <b>${totalExtract}</b>`;return{title,body};}const roomKey=first.zone?`zone:${first.zone}`:first.area?`area:${first.area.id}`:null;if(!roomKey)return{title:'Undesignated floor',body:`Hex ${start.x}, ${start.y} · open path with no room designation.`};const cells=[],seen=new Set(),queue=[first];while(queue.length){const cell=queue.shift(),id=`${cell.x},${cell.y}`;if(seen.has(id))continue;seen.add(id);const k=cell.zone?`zone:${cell.zone}`:cell.area?`area:${cell.area.id}`:null;if(k!==roomKey||cell.solid)continue;cells.push(cell);for(const next of sim.world.neighbors(cell.x,cell.y))if(next.discovered)queue.push(next);}const cellKeys=new Set(cells.map(c=>`${c.x},${c.y}`)),ants=sim.ants.filter(a=>a.alive&&cellKeys.has(`${Math.round(a.x)},${Math.round(a.y)}`)),creatures=sim.creatures.filter(a=>a.alive&&cellKeys.has(`${Math.round(a.x)},${Math.round(a.y)}`)&&sim.world.peek(Math.round(a.x),Math.round(a.y))?.discovered);if(first.zone==='food-store'){const storedCorpses=sim.creatures.filter(c=>!c.alive&&c.inStorage&&cellKeys.has(`${Math.round(c.x)},${Math.round(c.y)}`)),storedSeeds=sim.resources.filter(r=>r.inStorage&&cellKeys.has(`${Math.round(r.x)},${Math.round(r.y)}`)),col=first.colonyId?sim.colonies.find(c=>c.id===first.colonyId):null,processedFood=Math.floor(col?col.food:sim.food),corpseVal=storedCorpses.reduce((sum,c)=>sum+(c.food||0),0),seedVal=storedSeeds.reduce((sum,r)=>sum+(r.remaining||0),0),totalPotential=processedFood+Math.ceil(corpseVal+seedVal),sourceList=[];for(const c of storedCorpses){const name=Species[c.species]?.name||c.variantName||c.species||'Corpse';sourceList.push(`${name}: ${Math.ceil(c.food)}`);}for(const r of storedSeeds){const name=FoodTypes[r.foodType]?.name||r.name||'Seed';sourceList.push(`${name}: ${Math.ceil(r.remaining)}`);}let body=`${cells.length} connected tile${cells.length===1?'':'s'} · ${ants.length} ant${ants.length===1?'':'s'} inside<br>Processed Food: <b>${processedFood}</b><br>Stored Bodies / Food Sources: ${sourceList.length?sourceList.join(', '):'None'}<br>Total Food Potential: <b>${totalPotential}</b>`;return{title:first.area?.name||'Food Store',body};}const waterTiles=sim.waterStore.tiles.filter(tile=>cellKeys.has(`${tile.x},${tile.y}`)),spoil=sim.spoilItems.filter(item=>cellKeys.has(`${item.x},${item.y}`)),parts=[`${cells.length} connected tile${cells.length===1?'':'s'}`,`${ants.length} ant${ants.length===1?'':'s'} inside`,`${creatures.length} visible creature${creatures.length===1?'':'s'}`];if(first.zone==='water-store')parts.push(`${waterTiles.reduce((n,t)=>n+(t.items||[]).length,0)} reservoir droplet${waterTiles.reduce((n,t)=>n+(t.items||[]).length,0)===1?'':'s'} stored`);if(first.zone==='spoil')parts.push(`${spoil.length} spoil object${spoil.length===1?'':'s'} stored`);return{title:first.area?.name||String(first.zone).replaceAll('-',' '),body:parts.join(' · ')};}
function paint(to){const from=lastBrush||to,steps=Math.max(1,hexDistance(from,to));for(let i=0;i<=steps;i++){const x=Math.round(from.x+(to.x-from.x)*i/steps),y=Math.round(from.y+(to.y-from.y)*i/steps);sim.brush(x,y,radius,activeAction,units(),$('build-type').value);}lastBrush=to;}
function box(p){const x=Math.min(drag.start.x,p.x),y=Math.min(drag.start.y,p.y);renderer.selectionBox={x,y,w:Math.abs(p.x-drag.start.x),h:Math.abs(p.y-drag.start.y)};}
canvas.onpointerdown=e=>{
 canvas.setPointerCapture(e.pointerId);
 const g=grid(e),isPan=e.button===1||e.button===2;
 drag={x:g.p.x,y:g.p.y,start:g.p,button:e.button,pan:isPan,moved:false};
 lastBrush=null;
 if(e.button===0){
  if(mode==='group')box(g.p);
  else if(mode==='brush')paint(g);
 }
};
canvas.onpointermove=e=>{
 const g=grid(e);
 renderer.hover=mode==='brush'?{x:g.x,y:g.y}:null;
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
 }else if(drag.button===2&&!drag.moved){
  const t=hits(g)[0],selUnits=units(),selWorkers=workers();
  if(selUnits.length){
   if(activeAction==='dig'){
    if(selWorkers.length){
     const painted=sim.brush(g.x,g.y,radius,'dig',selWorkers,$('build-type').value);
     if(painted)sim.commandMarkers.push({x:g.x,y:g.y,color:group===null?colors[0]:colors[group],life:4});
     else toast('Cannot dig that tile.');
    }else toast('Selected ants cannot dig.');
   }else if(activeAction==='build'){
    if(selWorkers.length){
     const painted=sim.brush(g.x,g.y,radius,'build',selWorkers,$('build-type').value);
     if(painted)sim.commandMarkers.push({x:g.x,y:g.y,color:'#48a8cf',life:4});
     else toast('Cannot build there.');
    }else toast('Selected ants cannot build.');
   }else if(activeAction==='cancel'){
    sim.brush(g.x,g.y,radius,'cancel',selWorkers);
   }else if(activeAction==='attack'){
    if(t&&t.colonyId!==1&&t.alive){
     const err=sim.orderTarget('attack',t.id,selUnits);
     if(err)toast(err);
     else sim.commandMarkers.push({x:g.x,y:g.y,color:'#ff4444',life:4});
    }else{
     const err=sim.moveGroup(selUnits,g);
     if(!err)sim.commandMarkers.push({x:g.x,y:g.y,color:'#ff4444',life:4});
     else toast(err);
    }
   }else if(activeAction==='harvest'){
    if(t&&(t.species==='root_aphid'||t.remaining>0)){
     const err=sim.orderTarget('harvest',t.id,selUnits);
     if(err)toast(err);
     else sim.commandMarkers.push({x:g.x,y:g.y,color:'#73c887',life:4});
    }else toast('Choose a visible food source or aphid to harvest.');
   }else if(activeAction==='carry'){
    if(t&&!t.alive&&t.food>0){
     const err=sim.orderTarget('carry',t.id,selUnits);
     if(err)toast(err);
     else sim.commandMarkers.push({x:g.x,y:g.y,color:'#e8c96a',life:4});
    }else toast('Choose a carryable corpse or seed.');
   }else{
    if(t&&t.colonyId!==1&&t.alive){
     const err=sim.orderTarget('attack',t.id,selUnits);
     if(err)toast(err);
    }else if(t&&!t.alive&&t.food>0){
     const err=sim.orderTarget('carry',t.id,selUnits);
     if(err)toast(err);
    }else if(t&&(t.species==='root_aphid'||t.remaining>0)){
     const err=sim.orderTarget('harvest',t.id,selUnits);
     if(err)toast(err);
    }else if(!renderer.colorMap){
     const err=sim.moveGroup(selUnits,g);
     if(!err)sim.commandMarkers.push({x:g.x,y:g.y,color:group===null?colors[0]:colors[group],life:4});
     else toast(err);
    }
   }
  }else{
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
function zoom(f,p=renderer.origin()){const a=renderer.world(p.x,p.y);renderer.camera.zoom=Math.max(.35,Math.min(8,renderer.camera.zoom*f));const b=renderer.world(p.x,p.y);renderer.camera.x+=a.x-b.x;renderer.camera.y+=a.y-b.y;}canvas.onwheel=e=>{e.preventDefault();zoom(Math.exp(-e.deltaY*.001),point(e));};
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));document.querySelectorAll('.selector-size').forEach(b=>b.onclick=()=>{radius=Number(b.dataset.radius);document.querySelectorAll('.selector-size').forEach(x=>x.classList.toggle('active',x===b));renderer.hoverRadius=radius;});
if($('btn-actions'))$('btn-actions').onclick=()=>{const o=$('actions-wheel-overlay');if(o)o.hidden=!o.hidden;};
if($('actions-wheel-overlay')){$('actions-wheel-overlay').onclick=e=>{if(e.target===$('actions-wheel-overlay'))$('actions-wheel-overlay').hidden=true;};document.querySelectorAll('[data-action]').forEach(b=>{b.onclick=e=>{e.stopPropagation();setActiveAction(b.dataset.action);};});}
$('home').onclick=()=>{renderer.camera.x=1;renderer.camera.y=0};$('zoom-in').onclick=()=>zoom(1.2);$('zoom-out').onclick=()=>zoom(1/1.2);$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'▶':'Ⅱ'};$('speed').onclick=()=>{speed=speed===1?2: speed===2?4:1;$('speed').textContent=speed+'×'};$('color-map').onclick=()=>{renderer.colorMap=!renderer.colorMap;$('color-map').classList.toggle('active',renderer.colorMap);if(!renderer.colorMap){inspectedTile=null;renderer.inspectedCell=null;}};$('operations').onclick=()=>{renderColonyOperationsPriorities(activeCasteTab);$('operations-panel').hidden=false;};$('operations-close').onclick=()=>{$('operations-panel').hidden=true;};
$('feeder').onclick=()=>toast(sim.setFeeder(workers()[0]));$('release').onclick=()=>{workers().forEach(a=>sim.release(a));toast('Workers released to colony work.')};$('nickname').onclick=()=>{const a=entity(),name=prompt('Ant nickname:',a?.nickname||'');if(a&&name!==null){a.nickname=name.trim().slice(0,24);updateUI();}};$('egg-toggle').onclick=()=>{sim.eggProduction=!sim.eggProduction;toast('Egg production '+(sim.eggProduction?'enabled.':'paused.'));};$('operation-food-need').onchange=e=>{sim.antFoodNeedRatio=Math.max(0,Math.min(1,Number(e.target.value)/100));e.target.value=Math.round(sim.antFoodNeedRatio*100);};$('operation-water-need').onchange=e=>{sim.antWaterNeedRatio=Math.max(0,Math.min(1,Number(e.target.value)/100));e.target.value=Math.round(sim.antWaterNeedRatio*100);};$('operation-counter').onclick=()=>{$('ant-counter').hidden=!$('ant-counter').hidden};$('operation-paths').onclick=()=>renderer.showPaths=!renderer.showPaths;$('operation-water-target').onclick=()=>{sim.waterTarget=sim.waterTarget==='queen'?'reservoir':'queen';$('operation-water-target').textContent=`Water target: ${sim.waterTarget==='queen'?'Queen':'Reservoir'}`};$('operation-withdraw-water').onclick=()=>toast(sim.requestReservoirWithdrawal());

let activeCasteTab='worker';
function getTaskEligibility(caste,task){
 if(caste==='feeder'){
  if(task.id==='feedQueen'||task.id==='queenWater')return {text:'Feeder Core Role',type:'combat'};
  if(task.id==='chewFood')return {text:'Chews Stored Food',type:'combat'};
  if(task.id==='carry'||task.id==='harvest')return {text:'Secondary Labor',type:'restricted'};
  if(task.id==='dig'||task.id==='build')return {text:'Fallback Labor',type:'restricted'};
 }
 if(task.id==='selfFeed'||task.id==='selfWater')return {text:'Emergency / Survival',type:'combat'};
 if(task.id==='feedQueen'||task.id==='queenWater'||task.id==='chewFood')return {text:'Feeder role only',type:'role-only'};
 if(task.id==='dig'){
  if(caste==='minor')return {text:'Not Capable (Minor)',type:'ineligible'};
  if(caste==='soldier')return {text:'Not Capable (Soldier)',type:'ineligible'};
 }
 if(task.id==='build'){
  if(caste==='minor')return {text:'Not Capable (Minor)',type:'ineligible'};
  if(caste==='soldier')return {text:'Not Capable (Soldier)',type:'ineligible'};
 }
 if(task.id==='combat'){
  if(['soldier','major','supermajor'].includes(caste))return {text:'Guard Capable',type:'combat'};
  return {text:'Defense Only',type:'restricted'};
 }
 if(task.id==='carry'){
  if(caste==='supermajor')return {text:'Carries All Bodies & Seeds',type:'restricted'};
  if(caste==='major')return {text:'Max: Weevil, Spider, Aphid',type:'restricted'};
  if(caste==='media')return {text:'Max: Spider, Worm, Aphid',type:'restricted'};
  if(caste==='worker'||caste==='minor')return {text:'Max: Worm, Aphid, Seeds',type:'restricted'};
 }
 return null;
}

function renderColonyOperationsPriorities(caste=activeCasteTab){
 activeCasteTab=caste;
 document.querySelectorAll('.caste-tab-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.caste===caste));
 const dangerList=$('danger-priority-list'),laborList=$('labor-priority-list');
 if(!dangerList||!laborList)return;
 const isFeeder=caste==='feeder';
 const tasks=(AntGame.TaskHierarchy||[]).filter(t=>{
  if(!isFeeder&&(t.id==='feedQueen'||t.id==='queenWater'||t.id==='chewFood'))return false;
  return true;
 });
 let dangerHtml='',laborHtml='';
 tasks.forEach((t,index)=>{
  const rank=index+1;
  const prioVal=sim.getCastePriority(caste,t.id);
  const elig=getTaskEligibility(caste,t);
  const badgeHtml=`<span class="priority-badge">#${rank}</span>`;
  const eligHtml=elig?`<span class="priority-eligibility ${elig.type}">${elig.text}</span>`:'';
  const rowHtml=`<div class="priority-row" data-task-id="${t.id}"><div class="priority-info">${badgeHtml}<div class="priority-details"><div class="priority-title-wrap"><span class="priority-name">${t.name}</span>${eligHtml}</div><span class="priority-desc-text" title="${t.desc}">${t.desc}</span></div></div><div class="priority-control"><span class="priority-label">Priority</span><input type="number" min="1" max="10" step="1" class="priority-input" data-caste="${caste}" data-task="${t.id}" value="${prioVal}"></div></div>`;
  if(t.category==='danger')dangerHtml+=rowHtml;
  else laborHtml+=rowHtml;
 });
 dangerList.innerHTML=dangerHtml;
 laborList.innerHTML=laborHtml;
 const bindInputs=container=>{
  container.querySelectorAll('.priority-input').forEach(inp=>{
   inp.onchange=e=>{
    let val=parseInt(e.target.value,10);
    if(isNaN(val))val=5;
    val=Math.max(1,Math.min(10,val));
    e.target.value=val;
    sim.setCastePriority(e.target.dataset.caste,e.target.dataset.task,val);
   };
  });
 };
 bindInputs(dangerList);
 bindInputs(laborList);
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

function traits(){const cap=`${sim.foodCapacity()} food · ${sim.waterCapacity()} water · ${sim.colonyCapacity()} ants · ${sim.feederCapacity()} feeders`,repeatable=new Set(['food_store','water_store','colony_limit','feeder_limit']);$('traits').innerHTML=Traits.map(t=>{const level=sim.traitLevels?.[t.id]||0,cost=Math.ceil(t.cost*(1.5**level)),locked=sim.traits.includes(t.id)&&!repeatable.has(t.id);return `<div class="trait"><b>${t.name}${level?` · Tier ${level}`:''}</b><small>${cost} EP</small><p>${t.description}${repeatable.has(t.id)?' Each tier multiplies capacity by 2×; the next tier costs 1.5× more.':''}</p><button data-trait="${t.id}" ${locked||sim.evolution<cost?'disabled':''}>${locked?'Evolved':level?'Upgrade':'Evolve'}</button></div>`;}).join('')+`<p>${cap}</p>`;document.querySelectorAll('[data-trait]').forEach(b=>b.onclick=()=>{toast(sim.evolve(b.dataset.trait));traits()});}
function openEvolutionShop(){traits();$('evolution-panel').hidden=false;}$('evolution').onclick=openEvolutionShop;$('evolve-open').onclick=openEvolutionShop;document.querySelector('.modal .close').onclick=()=>{$('evolution-panel').hidden=true};
$('save').onclick=()=>{localStorage.setItem('underfoot-save-v3',JSON.stringify(sim.serialize()));toast('Colony saved.')};$('load').onclick=()=>{try{sim=Simulation.restore(JSON.parse(localStorage.getItem('underfoot-save-v3')));attachSimListeners(sim);setSelection([]);renderColonyOperationsPriorities(activeCasteTab);toast('Colony restored.')}catch{toast('No compatible save found.')}};$('new').onclick=()=>{if(confirm('Start a new colony?')){sim=new Simulation(crypto.getRandomValues(new Uint32Array(1))[0]);attachSimListeners(sim);setSelection([]);renderColonyOperationsPriorities(activeCasteTab);}};
// DEV CREATURE SPAWNER: first looks for a revealed floor area large enough for
// the selected model. If the current colony has no such area, it opens a visible
// test chamber around the chosen point. This keeps a 7-10-block Hercules body,
function spawnDebugCreature(choice){const species=choice==='woodlouse'?'isopod':choice,d=Species[species],stageRadius=species==='hercules'?12:species==='worm'?6:species==='grub'||species==='spider'?4:species==='isopod'?2:1,nearby=[...sim.world.cells.values()].filter(c=>c.discovered&&!c.solid&&!c.water&&!c.isWell&&hexDistance(c,sim.nest)>=3&&hexDistance(c,sim.nest)<=10),fits=c=>hexDisk(c.x,c.y,stageRadius).every(p=>{const tile=sim.world.peek(p.x,p.y);return tile?.discovered&&!tile.solid&&!tile.water&&!tile.isWell;}),ready=nearby.filter(fits),cell=ready[Math.floor(sim.random.next()*ready.length)]||nearby[Math.floor(sim.random.next()*nearby.length)]||sim.world.peek(sim.nest.x+2,sim.nest.y),spawnPoint={x:cell.x,y:cell.y},extra={state:'active'};if(!fits(cell))for(const p of hexDisk(cell.x,cell.y,stageRadius))sim.world.open(p.x,p.y,'cavity',true);if(choice==='woodlouse')extra.variantName='Woodlouse';if(species==='root_aphid'){const f={id:`dev-root-${sim.nextId}`,type:'root-vein',x:cell.x,y:cell.y,length:1,dirX:1,dirY:0};sim.world.features.push(f);const root=sim.world.get(cell.x,cell.y);Object.assign(root,{solid:true,root:true,terrain:'root',hardness:4,woodDurability:C.rootWoodDurability,zone:'root',feature:f.id,discovered:true});const perch=sim.world.neighbors(cell.x,cell.y).find(n=>!n.solid);extra.rootFeatureId=f.id;extra.milkCooldown=0;extra.biteTimer=C.rootAphidBiteInterval;if(perch){spawnPoint.x=perch.x;spawnPoint.y=perch.y;}}const creature=Ecology.spawnCreature(sim,species,spawnPoint.x,spawnPoint.y,extra);sim.creatures.push(creature);renderer.camera.x=spawnPoint.x;renderer.camera.y=spawnPoint.y;toast(`Developer: ${creature.variantName||d.name} spawned.`);}
$('debug-toggle').onclick=()=>$('debug').hidden=!$('debug').hidden;$('debug-close').onclick=()=>{$('debug').hidden=true;};$('spawn').onclick=()=>{const caste=$('spawn-caste')?.value||'worker';sim.addAnt(caste,sim.nest.x+2,sim.nest.y);toast(`Developer: ${caste} spawned.`);};$('spawn-creature-button').onclick=()=>spawnDebugCreature($('spawn-creature').value);$('paths').onclick=()=>{renderer.showPaths=!renderer.showPaths;toast(`Paths ${renderer.showPaths?'shown':'hidden'}.`);};$('ai').onclick=()=>{sim.aiEnabled=!sim.aiEnabled;toast(`AI ${sim.aiEnabled?'enabled':'paused'}.`);};document.querySelectorAll('[data-expedition]').forEach(b=>b.onclick=()=>{const f=Ecology.expedition(sim,b.dataset.expedition);if(f){renderer.camera.x=f.x;renderer.camera.y=f.y;toast(`Found and routed to ${f.type} at ${f.x}, ${f.y}.`);}else toast(`No ${b.dataset.expedition} found.`);});
document.onkeydown=e=>{
 if(e.target.matches('input,textarea,select'))return;
 if(e.code==='Space'){e.preventDefault();$('pause').click();return;}
 const key=e.key.toLowerCase();
 if(!e.ctrlKey){
  if(key==='b')setMode('brush');
  else if(key==='v')setMode('select');
  else if(key==='g'||key==='f')setMode('group');
  else if(key==='d')setActiveAction('dig');
  else if(key==='u'||key==='e')setActiveAction('build');
  else if(key==='x')setActiveAction('cancel');
  else if(key==='a')setActiveAction('attack');
  else if(key==='h')setActiveAction('harvest');
  else if(key==='c')setActiveAction('carry');
  else if(key==='m')setActiveAction('move');
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
   setMode('group');
  }
 }else if(e.key==='0'&&!e.ctrlKey){
  setSelection(sim.ants.filter(a=>a.alive&&a.colonyId===1).map(a=>a.id),0);
  setMode('group');
 }
 if(e.key==='Escape'){setSelection([]);setMode('brush');$('evolution-panel').hidden=true;if($('actions-wheel-overlay'))$('actions-wheel-overlay').hidden=true;}
 if(e.key==='Home')$('home').click();
};window.onresize=()=>renderer.resize();
// INSPECTOR READOUT: entity identity wins; otherwise a selected terrain hex reports its connected room.
function syncHeaderAndInspector(){const queen=sim.queen();$('queen-health').textContent=queen?`${Math.ceil(queen.health)} / ${queen.maxHealth}`:'0 / 0';const hasInspection=Boolean(entity()||inspectedTile||selected.size);$('inspector').hidden=!hasInspection;}setInterval(syncHeaderAndInspector,150);
function updateUI(){const own=sim.ants.filter(a=>a.alive&&a.colonyId===1),q=sim.queen(),e=entity(),counts=t=>own.filter(a=>a.type===t).length;$('population').textContent=`${own.length} / ${sim.colonyCapacity()}`;$('food').textContent=`${sim.food.toFixed(0)} / ${sim.foodCapacity().toFixed(0)}`;$('water').textContent=`${sim.water.toFixed(0)} / ${sim.waterCapacity().toFixed(0)}`;$('spoil').textContent=`${sim.world.pits.reduce((n,p)=>n+p.used,0)} / ${sim.world.pits.reduce((n,p)=>n+p.capacity,0)}`;$('egg-toggle').textContent=`Egg production: ${sim.eggProduction?'ON':'OFF'}`;$('operation-water-target').textContent=`Water target: ${sim.waterTarget==='queen'?'Queen':'Reservoir'}`;$('evolution').textContent=sim.evolution.toFixed(1)+' EP';$('time').textContent=`${String(Math.floor(sim.time/60)).padStart(2,'0')}:${String(Math.floor(sim.time%60)).padStart(2,'0')}`;$('seed').textContent='SEED '+sim.world.seed;$('ant-counter').textContent=`Q ${counts('queen')} · MN ${counts('minor')} · WK ${counts('worker')} · MD ${counts('media')} · SL ${counts('soldier')} · MJ ${counts('major')} · SM ${counts('supermajor')}`;const alert=[];if(sim.gameOver)alert.push('THE COLONY IS DEAD');else{if(sim.food<=0)alert.push('QUEEN IS STARVING');if(sim.water<=0)alert.push('QUEEN IS DEHYDRATED');}const banner=$('critical-alert');banner.hidden=!alert.length;banner.textContent=alert.join(' · ');$('feeder').hidden=!(workers().length===1&&!workers()[0].feeder);$('nickname').hidden=!(e?.type&&e.colonyId===1);$('release').hidden=!workers().some(a=>a.held||a.preferred);if(e?.foodType){const d=FoodTypes[e.foodType];$('selection-title').textContent=d.name;$('selection-body').innerHTML=`Value <b>${d.value}</b> · remaining <b>${Math.ceil(e.remaining)}</b>`;}else if(e?.species){$('selection-title').textContent=Species[e.species].name;$('selection-body').innerHTML=`${e.state} · ${Math.ceil(e.health)} HP · corpse food ${e.food}`;}else if(e?.type){$('selection-title').textContent=e.nickname||e.roleName||`${e.type} ${e.id}`;$('selection-body').innerHTML=`${Math.ceil(e.health)} / ${e.maxHealth||100} HP<br>${e.state.replaceAll('-',' ')}${e.feeder?'<br><b>Colony feeder</b>':''}`;}else if(inspectedTile){const room=roomSummary(inspectedTile);$('selection-title').textContent=room.title;$('selection-body').innerHTML=room.body;}else{$('selection-title').textContent=selected.size?selected.size+' ants selected':'Your colony';$('selection-body').innerHTML=`Queen ${q?Math.ceil(q.health):0} HP · ${sim.jobs.length} orders<br>Food rooms: ${sim.foodStore.tiles} tiles · Water reservoirs: ${sim.waterStore.tiles.length}`;}if(sim.events.length>lastEvents){toast(sim.events.at(-1).text);lastEvents=sim.events.length;}$('debug-info').textContent=`${sim.world.cells.size} hexes · ${sim.jobs.length} jobs · soil ${sim.conservation()?'conserved':'ERROR'}`;}
// ANT NEED READOUT: selected workers, soldiers, drones, and princesses expose their personal supplies.
function updateAntNeedInspector(){const a=entity();$('operation-food-need').value=Math.round(sim.antFoodNeedRatio*100);$('operation-water-need').value=Math.round(sim.antWaterNeedRatio*100);if(a?.type&&a.type!=='queen'){const fCap=a.maxFoodNeed||C.antFoodCapacity,wCap=a.maxWaterNeed||C.antWaterCapacity;$('selection-body').innerHTML+=`<br>Food ${Math.ceil(a.foodNeed??fCap)} / ${fCap} · Water ${Math.ceil(a.waterNeed??wCap)} / ${wCap}`;}}
function frame(now){acc+=Math.min((now-last)/1000,.2)*(paused?0:speed);last=now;while(acc>=C.step){sim.update(C.step);acc-=C.step;}for(const m of sim.commandMarkers)m.life-=Math.min(.2,(now-uiAt)/1000);sim.commandMarkers=sim.commandMarkers.filter(m=>m.life>0);renderer.draw(sim,selectionMap(),activeAction,acc/C.step);if(now-uiAt>150){updateUI();updateAntNeedInspector();uiAt=now;}requestAnimationFrame(frame);}window.underfoot={get simulation(){return sim},renderer};updateUI();requestAnimationFrame(frame);
})();
