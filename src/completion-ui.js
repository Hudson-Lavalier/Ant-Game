/*
 * COMPLETION UI
 * Areas is a planning panel only. Colony Operations lives in the header modal,
 * while the map button remains the one toolbar overlay control.
 */
(()=>{
  // AREA & ZONE PANEL BOOTSTRAP: place dedicated Areas and Zones buttons beside the persistent Map button.
  const game=window.underfoot,canvas=document.getElementById('world'),toolbar=document.querySelector('.toolbar'),main=document.querySelector('main'),mapButton=document.getElementById('color-map');
  const areaButton=document.createElement('button');areaButton.type='button';areaButton.id='btn-areas';areaButton.textContent='Areas';areaButton.title='Architectural blueprint areas and walkways';toolbar.insertBefore(areaButton,mapButton);
  const zoneButton=document.createElement('button');zoneButton.type='button';zoneButton.id='btn-zones';zoneButton.textContent='Zones';zoneButton.title='Behavioral zones, stockpiles, and squad bounds';toolbar.insertBefore(zoneButton,mapButton);

  // AREAS PANEL: Architectural planning only. Has no effect on gameplay or squads.
  const areasPanel=document.createElement('section');areasPanel.id='completion-panel';areasPanel.hidden=true;
  areasPanel.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;border-bottom:1px solid #273324;padding-bottom:6px;"><b style="border:none;margin:0;padding:0;">AREA PLANNING</b><button type="button" id="area-close-btn" style="background:none;border:none;color:#8f9a86;font-size:16px;cursor:pointer;line-height:1;padding:0 4px;">&times;</button></div><small>Architectural layout and walkway planning. Has no effect on ant behaviors or squad logistics.</small><label>Name <input id="area-name" value="New area" maxlength="24"></label><label>Category <select id="area-type"><option value="territory">Territory</option><option value="passage">Passage</option><option value="food">Food area</option><option value="spoil">Spoil area</option><option value="water">Water area</option><option value="enemy">Enemy area</option></select></label><button id="area-add">Add new area</button><small>Create an architectural area, select it below, then drag to paint over open hexes.</small><label>Saved areas <select id="area-existing"></select></label><div><button id="area-rename">Rename selected</button><button id="area-erase">Erase selected</button></div><div id="area-list"></div><hr><b>COMMAND STATES</b><small>Yellow: reachable dig · red: blocked dig · blue: reachable build · magenta: blocked build · grey: unavailable resources.</small><hr><b>COLONY STATUS</b><div id="storage-roster"></div><div id="brood-roster" style="margin-top:4px;"></div>';
  main.append(areasPanel);

  // ZONES PANEL: Behavioral territories and squad boundaries.
  const zonesPanel=document.createElement('section');zonesPanel.id='zones-panel';zonesPanel.hidden=true;
  zonesPanel.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;border-bottom:1px solid #273324;padding-bottom:6px;"><b style="border:none;margin:0;padding:0;">BEHAVIORAL ZONING &amp; SQUADS</b><button type="button" id="zone-close-btn" style="background:none;border:none;color:#8f9a86;font-size:16px;cursor:pointer;line-height:1;padding:0 4px;">&times;</button></div><small>Operational bounds for foraging, hunting, spoil-locked stockpiles, excavation mining, and squad boundaries.</small><label>Zone Name <input id="zone-name" value="New zone" maxlength="24"></label><label>Type <select id="zone-type"><option value="foraging">Foraging Zone</option><option value="hunting">Hunting Zone</option><option value="stockpile">Stockpile Zone</option><option value="excavation">Excavation Zone</option></select></label><div id="stockpile-config" style="display:none;background:#201c14;padding:6px;border:1px solid #5a4820;margin:6px 0;border-radius:4px;"><label>Stockpile Priority <select id="stockpile-priority"><option value="1">Low</option><option value="2" selected>Normal</option><option value="3">Preferred</option><option value="4">Critical</option></select></label><div style="display:flex;gap:8px;font-size:11px;margin-top:4px;"><label style="display:inline-flex;align-items:center;gap:3px;margin:0;"><input type="checkbox" id="stockpile-corpses" checked> Corpses</label><label style="display:inline-flex;align-items:center;gap:3px;margin:0;"><input type="checkbox" id="stockpile-seeds" checked> Seeds</label><label style="display:inline-flex;align-items:center;gap:3px;margin:0;"><input type="checkbox" id="stockpile-soil" checked> Soil</label></div><small style="color:#d4a040;display:block;margin-top:4px;">* Stockpiles can only be designated on excavated spoil tiles.</small></div><button id="zone-add">Add new zone</button><small>Select a zone below, then drag to paint operational bounds.</small><label>Saved zones <select id="zone-existing"></select></label><div><button id="zone-rename">Rename zone</button><button id="zone-erase">Erase zone</button></div><div id="zone-list"></div><hr><b>SQUAD ROSTER &amp; BOUNDS</b><small>Map Groups 1–9 to zones, assign squad roles, or set strict boundaries.</small><div id="group-roster"></div>';
  main.append(zonesPanel);

  let activeMode=null,painting=false,last='',activeAreaId='',activeZoneId='';

  const closeAll=()=>{
   activeMode=null;painting=false;last='';
   areasPanel.hidden=true;zonesPanel.hidden=true;
   areaButton.classList.remove('active');zoneButton.classList.remove('active');
   game.renderer.colorMap=false;game.renderer.overlayMode='none';
   mapButton.classList.remove('active');
  };

  const openAreas=()=>{
   activeMode='areas';painting=false;last='';
   zonesPanel.hidden=true;zoneButton.classList.remove('active');
   areasPanel.hidden=false;areaButton.classList.add('active');
   game.renderer.colorMap=true;game.renderer.overlayMode='areas';
   mapButton.classList.add('active');
  };

  const openZones=()=>{
   activeMode='zones';painting=false;last='';
   areasPanel.hidden=true;areaButton.classList.remove('active');
   zonesPanel.hidden=false;zoneButton.classList.add('active');
   game.renderer.colorMap=true;game.renderer.overlayMode='zones';
   mapButton.classList.add('active');
  };

  areaButton.onclick=()=>{if(activeMode==='areas'){closeAll();return;}openAreas();};
  zoneButton.onclick=()=>{if(activeMode==='zones'){closeAll();return;}openZones();};

  const areaCloseBtn=document.getElementById('area-close-btn');if(areaCloseBtn)areaCloseBtn.onclick=closeAll;
  const zoneCloseBtn=document.getElementById('zone-close-btn');if(zoneCloseBtn)zoneCloseBtn.onclick=closeAll;

  const previousMapClick=mapButton.onclick;
  mapButton.onclick=e=>{
   previousMapClick?.(e);
   if(!game.renderer.colorMap&&activeMode){closeAll();}
   else if(game.renderer.colorMap&&!activeMode){game.renderer.overlayMode='areas';}
  };

  const { hexDistance, hexDisk } = AntGame;
  const point=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};

  // INDEPENDENT PAINTING: dragging in Areas mode paints ONLY areas; in Zones mode paints ONLY zones.
  // Painting respects the active brush radius (1 hex, 7 hexes, 19 hexes) with smooth drag interpolation.
  let lastPoint=null;
  const mark=e=>{
   const sim=game.simulation,p=point(e),h=game.renderer.hexAt(p.x,p.y);
   const r=game.renderer.hoverRadius||Number(document.querySelector('.selector-size.active')?.dataset?.radius)||0;
   const from=lastPoint||h,dist=hexDistance(from,h);
   if(dist===0&&last===`${h.x},${h.y}`)return;
   last=`${h.x},${h.y}`;
   const steps=Math.max(1,dist);
   let lastErr=null;
   for(let i=0;i<=steps;i++){
    const x=Math.round(from.x+(h.x-from.x)*i/steps),y=Math.round(from.y+(h.y-from.y)*i/steps);
    if(activeMode==='zones'){
     if(!activeZoneId)return;
     const res=sim.paintZone(x,y,activeZoneId,undefined,undefined,r);
     if(res&&!res.ok&&res.error&&!lastErr)lastErr=res.error;
    }else if(activeMode==='areas'){
     if(!activeAreaId)return;
     sim.paintArea(x,y,activeAreaId,undefined,r);
    }
   }
   lastPoint=h;
   if(lastErr&&window.toast){window.toast(lastErr);}
  };

  const priorDown=canvas.onpointerdown,priorMove=canvas.onpointermove,priorUp=canvas.onpointerup;
  canvas.onpointerdown=e=>{if(!activeMode)return priorDown?.(e);painting=true;last='';lastPoint=null;mark(e);};
  canvas.onpointermove=e=>{if(!activeMode)return priorMove?.(e);if(painting)mark(e);};
  canvas.onpointerup=e=>{if(!activeMode)return priorUp?.(e);painting=false;last='';lastPoint=null;};

  // AREA LIFECYCLE: add defines a reusable plan; rename and erase update every painted instance.
  const select=document.getElementById('area-existing'),nameInput=document.getElementById('area-name'),typeInput=document.getElementById('area-type');
  document.getElementById('area-add').onclick=()=>{activeAreaId=game.simulation.createArea(nameInput.value,typeInput.value);select.value=activeAreaId;};
  select.onchange=()=>{activeAreaId=select.value;const area=game.simulation.areas[activeAreaId];if(area){nameInput.value=area.name;typeInput.value=area.type;}};
  document.getElementById('area-rename').onclick=()=>{const next=game.simulation.renameArea(activeAreaId,nameInput.value);if(next)activeAreaId=next;};
  document.getElementById('area-erase').onclick=()=>{if(game.simulation.eraseArea(activeAreaId))activeAreaId='';};

  // ZONE LIFECYCLE: create, configure, rename, erase behavioral zones
  const zoneSelect=document.getElementById('zone-existing'),zoneNameInput=document.getElementById('zone-name'),zoneTypeInput=document.getElementById('zone-type');
  const spConfig=document.getElementById('stockpile-config'),spPriority=document.getElementById('stockpile-priority');
  const spCorpses=document.getElementById('stockpile-corpses'),spSeeds=document.getElementById('stockpile-seeds'),spSoil=document.getElementById('stockpile-soil');

  const updateZoneConfigUI=()=>{
   const zType=zoneTypeInput?.value;
   if(spConfig){spConfig.style=spConfig.style||{};spConfig.style.display=zType==='stockpile'?'block':'none';}
  };
  if(zoneTypeInput)zoneTypeInput.onchange=updateZoneConfigUI;

  document.getElementById('zone-add').onclick=()=>{
   const sim=game.simulation;
   const opts={
    priority:Number(spPriority?.value)||2,
    filters:{corpses:Boolean(spCorpses?.checked),seeds:Boolean(spSeeds?.checked),soil:Boolean(spSoil?.checked)}
   };
   activeZoneId=sim.createZone(zoneNameInput.value,zoneTypeInput.value,opts);
   if(zoneSelect)zoneSelect.value=activeZoneId;
  };
  zoneSelect.onchange=()=>{
   activeZoneId=zoneSelect.value;
   const zone=game.simulation.getZone(activeZoneId);
   if(zone){
    zoneNameInput.value=zone.name;zoneTypeInput.value=zone.type;updateZoneConfigUI();
    if(zone.type==='stockpile'&&spPriority){
     spPriority.value=String(zone.priority||2);
     if(spCorpses)spCorpses.checked=zone.filters?.corpses!==false;
     if(spSeeds)spSeeds.checked=zone.filters?.seeds!==false;
     if(spSoil)spSoil.checked=zone.filters?.soil!==false;
    }
   }
  };
  document.getElementById('zone-rename').onclick=()=>{const next=game.simulation.renameZone(activeZoneId,zoneNameInput.value);if(next)activeZoneId=next;};
  document.getElementById('zone-erase').onclick=()=>{if(game.simulation.eraseZone(activeZoneId))activeZoneId='';};

 // STORAGE RENDERING: grains, droplets, and spoil chips are direct representations of stored objects.
 const CELL_SLOTS=7;
 const originalDraw=game.renderer.draw.bind(game.renderer);game.renderer.draw=(sim,selection,mode,interpolation)=>{originalDraw(sim,selection,mode,interpolation);const ctx=game.renderer.ctx,z=game.renderer.camera.zoom;for(const tile of sim.waterStore.tiles){const p=game.renderer.screen(tile.x,tile.y),items=tile.items||[];ctx.fillStyle='#67c7e5';for(let i=0;i<Math.min(CELL_SLOTS,items.length);i++){const a=i*Math.PI*2/CELL_SLOTS;ctx.beginPath();ctx.arc(p.x+Math.cos(a)*3*z,p.y+Math.sin(a)*3*z,1.1*z,0,Math.PI*2);ctx.fill();}}const foodPoint=game.renderer.screen(sim.foodStore.x,sim.foodStore.y);ctx.fillStyle='#d9bd69';for(let i=0;i<Math.min(6,sim.foodStore.items.length);i++)ctx.fillRect(foodPoint.x-4*z+i*1.6*z,foodPoint.y+5*z,1.1*z,1.1*z);for(const item of sim.spoilItems){const p=game.renderer.screen(item.x,item.y);ctx.fillStyle='#8b6b45';ctx.fillRect(p.x-1*z+(item.id.charCodeAt(item.id.length-1)%3)*z,p.y+1*z,1*z,1*z);}};
 // PRINCESS RENDERING: winged reproductive metadata maps to a distinct body silhouette.
 const originalAnt=game.renderer.ant.bind(game.renderer);game.renderer.ant=(ant,p,z,time)=>{originalAnt(ant,p,z,time);if(ant.reproductive?.winged){const ctx=game.renderer.ctx;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(ant.angle);ctx.fillStyle='rgba(244,181,212,.68)';for(const side of[-1,1]){ctx.beginPath();ctx.ellipse(-1*z,side*3*z,4*z,1.6*z,side*.45,0,Math.PI*2);ctx.fill();}ctx.fillStyle='#e28db0';ctx.beginPath();ctx.ellipse(2*z,0,2.4*z,1.7*z,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffe08a';ctx.fillRect(-2*z,-1*z,1*z,1*z);ctx.restore();}};

  // LIVE READOUT: keep planning, zoning, and storage labels synchronized with saved simulation state.
  let lastSquadSync='';
  const syncSquadRoster=()=>{
   const sim=game.simulation;
   const zones=Object.entries(sim.zones||{});
   const squadStateKey=sim.squads.map(s=>`${s.id}-${s.zoneId}-${s.strictBounds}-${s.role}`).join('|')+'::'+zones.map(([id])=>id).join(',')+'::'+sim.groups.map(g=>g.length).join(',');
   if(squadStateKey===lastSquadSync)return;
   lastSquadSync=squadStateKey;
   const container=document.getElementById('group-roster');
   if(!container)return;
   container.innerHTML=sim.groups.map((ids,index)=>{
    if(!index)return '';
    const squad=sim.squads[index]||{zoneId:null,strictBounds:false,role:'auto'};
    const living=ids.filter(id=>sim.ants.some(a=>a.id===id&&a.alive)).length;
    const zoneOptions=['<option value="">[Unrestricted]</option>'].concat(zones.map(([zid,z])=>`<option value="${zid}" ${squad.zoneId===zid?'selected':''}>${z.name} (${z.type})</option>`)).join('');
    const roles=['auto','forager','hunter','hauler','guard','digger'];
    const roleOptions=roles.map(r=>`<option value="${r}" ${squad.role===r?'selected':''}>${r[0].toUpperCase()+r.slice(1)}</option>`).join('');
    return `<div style="border-bottom:1px solid #333;padding:4px 0;" data-squad="${index}"><b>Squad ${index}</b>: ${living} ants<div style="font-size:11px;display:flex;flex-wrap:wrap;gap:4px;margin-top:2px;"><label>Zone: <select class="sq-zone">${zoneOptions}</select></label><label><input type="checkbox" class="sq-strict" ${squad.strictBounds?'checked':''}> Strict</label><label>Role: <select class="sq-role">${roleOptions}</select></label></div></div>`;
   }).join('');
   container.querySelectorAll('[data-squad]').forEach(row=>{
    const sqId=Number(row.dataset.squad);
    const zSel=row.querySelector('.sq-zone');
    const stChk=row.querySelector('.sq-strict');
    const rSel=row.querySelector('.sq-role');
    if(zSel)zSel.onchange=()=>{sim.squads[sqId].zoneId=zSel.value||null;lastSquadSync='';};
    if(stChk)stChk.onchange=()=>{sim.squads[sqId].strictBounds=stChk.checked;lastSquadSync='';};
    if(rSel)rSel.onchange=()=>{sim.squads[sqId].role=rSel.value;lastSquadSync='';};
   });
  };

  setInterval(()=>{
   const sim=game.simulation;
   syncSquadRoster();
   const eggs=sim.eggs.filter(e=>e.colonyId===1).sort((a,b)=>a.age-b.age);
   const areas=Object.entries(sim.areas||{}),current=activeAreaId||select.value;
   const zones=Object.entries(sim.zones||{}),currentZ=activeZoneId||(zoneSelect?zoneSelect.value:'');
   document.getElementById('brood-roster').innerHTML=eggs.length?eggs.map(e=>`<div>${e.assignedAntType} · ${Math.ceil(e.duration-e.age)}s</div>`).join(''):'<div>No eggs waiting.</div>';
   document.getElementById('storage-roster').textContent=`Food slots: ${sim.foodStore.items.length}/${Math.floor(sim.foodCapacity())} · Queen water: ${sim.waterStore.items.length}/${Math.floor(sim.queenWaterCapacity())} · Reservoir droplets: ${sim.reservoirWater().toFixed(0)}`;
   select.innerHTML=areas.length?areas.map(([id,area])=>`<option value="${id}">${area.name} (${area.type})</option>`).join(''):'<option value="">No saved areas</option>';
   activeAreaId=areas.some(([id])=>id===current)?current:(areas[0]?.[0]||'');
   select.value=activeAreaId;
   document.getElementById('area-list').textContent=areas.length?`${areas.length} saved area${areas.length===1?'':'s'}.`:'Create an area to begin planning.';
   if(zoneSelect){
    const zoneOpts=zones.length?zones.map(([id,z])=>`<option value="${id}">${z.name} (${z.type})</option>`).join(''):'<option value="">No saved zones</option>';
    if(zoneSelect.innerHTML!==zoneOpts){
     zoneSelect.innerHTML=zoneOpts;
     activeZoneId=zones.some(([id])=>id===currentZ)?currentZ:(zones[0]?.[0]||'');
     zoneSelect.value=activeZoneId;
    }
   }
   const zList=document.getElementById('zone-list');
   if(zList)zList.textContent=zones.length?`${zones.length} active zone${zones.length===1?'':'s'}.`:'Create a zone to assign squad bounds.';
  },200);
})();
