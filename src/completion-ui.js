/*
 * COMPLETION UI
 * Areas is a planning panel only. Colony Operations lives in the header modal,
 * while the map button remains the one toolbar overlay control.
 */
(()=>{
 // AREA PANEL BOOTSTRAP: place planning beside the persistent Map button.
 const game=window.underfoot,canvas=document.getElementById('world'),toolbar=document.querySelector('.toolbar'),main=document.querySelector('main'),mapButton=document.getElementById('color-map');
 const areaButton=document.createElement('button');areaButton.type='button';areaButton.textContent='Areas';areaButton.title='Create plans and paint revealed floor';toolbar.insertBefore(areaButton,mapButton);
 const panel=document.createElement('section');panel.id='completion-panel';panel.hidden=true;
 panel.innerHTML='<b>AREA PLANNING</b><label>Name <input id="area-name" value="New area" maxlength="24"></label><label>Category <select id="area-type"><option value="territory">Territory</option><option value="passage">Passage</option><option value="food">Food area</option><option value="spoil">Spoil area</option><option value="water">Water area</option><option value="enemy">Enemy area</option></select></label><button id="area-add">Add new area</button><small>Create a saved area, select it below, then paint that plan over any revealed open hexes.</small><label>Saved areas <select id="area-existing"></select></label><div><button id="area-rename">Rename selected</button><button id="area-erase">Erase selected</button></div><div id="area-list"></div><hr><b>COMMAND STATES</b><small>Yellow: reachable dig · red: blocked dig · blue: reachable build · magenta: blocked build · grey: unavailable resources.</small><hr><b>GROUP ROSTER</b><div id="group-roster"></div><hr><b>BROOD QUEUE</b><div id="brood-roster"></div><hr><b>STORAGE</b><div id="storage-roster"></div>';
 main.append(panel);
 let areaMode=false,painting=false,last='',activeAreaId='';
 const closeAreas=()=>{areaMode=false;painting=false;last='';panel.hidden=true;areaButton.classList.remove('active');game.renderer.colorMap=false;mapButton.classList.remove('active');};
 // PANEL VISIBILITY: closing Areas always clears its associated color-map overlay.
 areaButton.onclick=()=>{if(areaMode){closeAreas();return;}areaMode=true;panel.hidden=false;areaButton.classList.add('active');game.renderer.colorMap=true;mapButton.classList.add('active');};
 const previousMapClick=mapButton.onclick;mapButton.onclick=e=>{previousMapClick?.(e);if(!game.renderer.colorMap&&areaMode)closeAreas();};
 const point=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
 // PAINTING: only a deliberately created, currently selected plan can be painted.
 const mark=e=>{const sim=game.simulation,p=point(e),h=game.renderer.hexAt(p.x,p.y);if(!activeAreaId||last===`${h.x},${h.y}`)return;last=`${h.x},${h.y}`;sim.paintArea(h.x,h.y,activeAreaId);};
 const priorDown=canvas.onpointerdown,priorMove=canvas.onpointermove,priorUp=canvas.onpointerup;
 canvas.onpointerdown=e=>{if(!areaMode)return priorDown?.(e);painting=true;last='';mark(e);};
 canvas.onpointermove=e=>{if(!areaMode)return priorMove?.(e);if(painting)mark(e);};
 canvas.onpointerup=e=>{if(!areaMode)return priorUp?.(e);painting=false;last='';};
 // AREA LIFECYCLE: add defines a reusable plan; rename and erase update every painted instance.
 const select=document.getElementById('area-existing'),nameInput=document.getElementById('area-name'),typeInput=document.getElementById('area-type');
 document.getElementById('area-add').onclick=()=>{activeAreaId=game.simulation.createArea(nameInput.value,typeInput.value);select.value=activeAreaId;};
 select.onchange=()=>{activeAreaId=select.value;const area=game.simulation.areas[activeAreaId];if(area){nameInput.value=area.name;typeInput.value=area.type;}};
 document.getElementById('area-rename').onclick=()=>{const next=game.simulation.renameArea(activeAreaId,nameInput.value);if(next)activeAreaId=next;};
 document.getElementById('area-erase').onclick=()=>{if(game.simulation.eraseArea(activeAreaId))activeAreaId='';};

 // STORAGE RENDERING: grains, droplets, and spoil chips are direct representations of stored objects.
 const CELL_SLOTS=7;
 const originalDraw=game.renderer.draw.bind(game.renderer);game.renderer.draw=(sim,selection,mode,interpolation)=>{originalDraw(sim,selection,mode,interpolation);const ctx=game.renderer.ctx,z=game.renderer.camera.zoom;for(const tile of sim.waterStore.tiles){const p=game.renderer.screen(tile.x,tile.y),items=tile.items||[];ctx.fillStyle='#67c7e5';for(let i=0;i<Math.min(CELL_SLOTS,items.length);i++){const a=i*Math.PI*2/CELL_SLOTS;ctx.beginPath();ctx.arc(p.x+Math.cos(a)*3*z,p.y+Math.sin(a)*3*z,1.1*z,0,Math.PI*2);ctx.fill();}}const foodPoint=game.renderer.screen(sim.foodStore.x,sim.foodStore.y);ctx.fillStyle='#d9bd69';for(let i=0;i<Math.min(6,sim.foodStore.items.length);i++)ctx.fillRect(foodPoint.x-4*z+i*1.6*z,foodPoint.y+5*z,1.1*z,1.1*z);for(const item of sim.spoilItems){const p=game.renderer.screen(item.x,item.y);ctx.fillStyle='#8b6b45';ctx.fillRect(p.x-1*z+(item.id.charCodeAt(item.id.length-1)%3)*z,p.y+1*z,1*z,1*z);}};
 // PRINCESS RENDERING: winged reproductive metadata maps to a distinct body silhouette.
 const originalAnt=game.renderer.ant.bind(game.renderer);game.renderer.ant=(ant,p,z,time)=>{originalAnt(ant,p,z,time);if(ant.reproductive?.winged){const ctx=game.renderer.ctx;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(ant.angle);ctx.fillStyle='rgba(244,181,212,.68)';for(const side of[-1,1]){ctx.beginPath();ctx.ellipse(-1*z,side*3*z,4*z,1.6*z,side*.45,0,Math.PI*2);ctx.fill();}ctx.fillStyle='#e28db0';ctx.beginPath();ctx.ellipse(2*z,0,2.4*z,1.7*z,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffe08a';ctx.fillRect(-2*z,-1*z,1*z,1*z);ctx.restore();}};

 // LIVE READOUT: keep planning and storage labels synchronized with saved simulation state.
 setInterval(()=>{const sim=game.simulation,groups=sim.groups.map((ids,index)=>index?`<div>Group ${index}: ${ids.filter(id=>sim.ants.some(a=>a.id===id&&a.alive)).length} ants</div>`:'').join(''),eggs=sim.eggs.filter(e=>e.colonyId===1).sort((a,b)=>a.age-b.age),areas=Object.entries(sim.areas||{}),current=activeAreaId||select.value;document.getElementById('group-roster').innerHTML=groups;document.getElementById('brood-roster').innerHTML=eggs.length?eggs.map(e=>`<div>${e.assignedAntType} · ${Math.ceil(e.duration-e.age)}s</div>`).join(''):'<div>No eggs waiting.</div>';document.getElementById('storage-roster').textContent=`Food slots: ${sim.foodStore.items.length}/${Math.floor(sim.foodCapacity())} · Queen water: ${sim.waterStore.items.length}/${Math.floor(sim.queenWaterCapacity())} · Reservoir droplets: ${sim.reservoirWater().toFixed(0)}`;select.innerHTML=areas.length?areas.map(([id,area])=>`<option value="${id}">${area.name} (${area.type})</option>`).join(''):'<option value="">No saved areas</option>';activeAreaId=areas.some(([id])=>id===current)?current:(areas[0]?.[0]||'');select.value=activeAreaId;document.getElementById('area-list').textContent=areas.length?`${areas.length} saved area${areas.length===1?'':'s'}.`:'Create an area to begin planning.';},200);
})();
