/*
 * UNDERFOOT WORLD AND ROUTING
 * World stores lightweight terrain cells, not independent tile entities. The key
 * landmarks are World.generateCell for seeded terrain, World.found for the opening
 * nest and passage, World.senseAt for discovery, World.removePiece for excavation,
 * and findRoute/pathfind for revealed open-hex travel.
 *
 * Every coordinate in this file is an axial flat-top hex coordinate: x is q and y
 * is r. hexDistance, hexDisk, and hexRound keep drawing, brushes, scanning, and
 * movement aligned to the exact same hex geometry.
 */
(()=>{
const {Config:C,hash}=AntGame,key=(q,r)=>`${q},${r}`,DIRS=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
const hexDistance=(a,b={x:0,y:0})=>{const aq=a.q!==undefined?a.q:a.x,ar=a.q!==undefined?a.r:a.y,bq=b.q!==undefined?b.q:b.x,br=b.q!==undefined?b.r:b.y;return(Math.abs(aq-bq)+Math.abs(ar-br)+Math.abs(aq+ar-bq-br))/2;};
const hexDisk=(q,r,n)=>{const out=[];for(let dq=-n;dq<=n;dq++)for(let dr=Math.max(-n,-dq-n);dr<=Math.min(n,-dq+n);dr++)out.push({x:q+dq,y:r+dr});return out;};
const hexRound=(q,r)=>{const x=q,z=r,y=-x-z;let rx=Math.round(x),ry=Math.round(y),rz=Math.round(z),dx=Math.abs(rx-x),dy=Math.abs(ry-y),dz=Math.abs(rz-z);if(dx>dy&&dx>dz)rx=-ry-rz;else if(dy>dz)ry=-rx-rz;else rz=-rx-ry;return{x:rx,y:rz};};
class World{
 constructor(seed){this.seed=seed;this.cells=new Map();this.chunks=new Map();this.features=[];this.pits=[];this.removed=0;this.revision=0;this.activeWater=new Set();this._featureDefCache=new Map();this.founding=this.foundingLayout();this.ensureChunk(0,0);this.pit={...this.founding.spoilHole,used:0,capacity:C.spoilCapacity,hole:true};this.pits.push(this.pit);this.found();}
 inside(q,r){return hexDistance({x:q,y:r})<=C.chunkRadius;}
 ensureChunk(cx,cy){const id=key(cx,cy);if(this.chunks.has(id))return;const oq=cx*C.chunkStride,or=cy*C.chunkStride,h=hash(this.seed,cx,cy);this.chunks.set(id,{id,cx,cy,x:oq,y:or,seed:h});for(const p of hexDisk(oq,or,C.chunkRadius)){const k=key(p.x,p.y);if(!this.cells.has(k))this.cells.set(k,this.generateCell(p.x,p.y));}for(const f of this.featureDefinitions(cx,cy))if(!this.features.some(a=>a.id===f.id))this.features.push(f);}
 // PROCEDURAL ECOLOGY FEATURES: each chunk keeps its original landmark and may
 // add sparse encounter sites. Their ids are seed-stable, so save/load cannot
 // reshuffle an explored ecosystem.
 featureDefinitions(cx,cy){
  if(!this._featureDefCache)this._featureDefCache=new Map();
  const cacheKey=key(cx,cy);
  if(this._featureDefCache.has(cacheKey))return this._featureDefCache.get(cacheKey);
  const x=cx*C.chunkStride,y=cy*C.chunkStride,h=hash(this.seed,cx,cy),prefix=key(cx,cy);
  if(cx===0&&cy===0){
   const out=[{id:'water-start',type:'water',x:23,y:-16,r:4},{id:'ruin-start',type:'abandoned',x:-23,y:-16,r:4,species:'weevil'},{id:'surface-start',type:'surface',x:0,y:-25,r:2},{id:'food-start',type:'food',x:-22,y:11,r:2,foodType:'seeds'},{id:'cave-start',type:'cavity',x:-18,y:22,r:4}];
   this._featureDefCache.set(cacheKey,out);
   return out;
  }
  const out=[],passDir=DIRS[h%6],spot=(ox,oy)=>({x:x+ox,y:y+oy});
  // 1. INFINITESIMAL TIER (~0.5% per chunk, 1 in 200 chunks): Hercules Beetle lair
  if(((h>>>4)%200)===0){
   const p=spot((h%15)-7,((h>>>5)%15)-7);
   out.push({id:`hercules-cavity-${prefix}`,type:'hercules-cavity',x:p.x,y:p.y,r:6,species:'hercules'});
  }
  // 2. VERY RARE TIER (~3% per chunk, 1 in 33 chunks): Spiders, Roots, Foreign Colonies
  if(((h>>>12)%33)===0){
   const p=spot(((h>>>2)%17)-8,((h>>>7)%17)-8);
   if(hexDistance({x:p.x,y:p.y})>=45){
    out.push({id:`spider-cavity-${prefix}`,type:'spider-cavity',x:p.x,y:p.y,r:4,species:'spider'});
   }
  }
  if(((h>>>16)%33)===0){
   const p=spot(((h>>>3)%17)-8,((h>>>9)%17)-8),d=DIRS[(h>>>20)%6];
   out.push({id:`root-${prefix}`,type:'root-vein',x:p.x,y:p.y,length:8+(h%7),dirX:d[0],dirY:d[1]});
  }
  if((cx===3&&cy===0)||(hexDistance({x,y})>=C.colonyMinDistance&&((h>>>21)%50)===0)){
   out.push({id:`colony-${prefix}`,type:'colony',x,y,r:6,relation:['neutral','tolerant','defensive','hostile'][h%4]});
  }
  // 3. RARE TIER (5% - 10% per chunk): Earthworm burrows, Water aquifers, Deep wells, Medium/Large Caves
  if(((h>>>3)%12)===0){
   const p=spot(((h>>>6)%19)-9,((h>>>11)%19)-9);
   out.push({id:`worm-cavity-${prefix}`,type:'worm-cavity',x:p.x,y:p.y,r:3,species:'worm'});
  }
  if(((h>>>8)%20)===0){
   const fx=x+(h%9)-4,fy=y+((h>>>4)%9)-4,r=1+(h%3);
   out.push({id:`well-${prefix}`,type:'well',x:fx,y:fy,r,dirX:passDir[0],dirY:passDir[1],passageX:fx+passDir[0]*r,passageY:fy+passDir[1]*r});
  }
  if(((h>>>24)%10)===0){
   const p=spot(((h>>>1)%15)-7,((h>>>8)%15)-7);
   out.push({id:`water-${prefix}`,type:'water',x:p.x,y:p.y,r:3+(h%2)});
  }
  if(((h>>>11)%10)===0){
   const fx=x+((h>>>3)%15)-7,fy=y+((h>>>7)%15)-7,r=4+(h%3),type=((h>>>13)%2===0)?'cavity':'abandoned';
   out.push({id:`${type}-large-${prefix}`,type,x:fx,y:fy,r,dirX:passDir[0],dirY:passDir[1],passageX:fx+passDir[0]*r,passageY:fy+passDir[1]*r});
  }
  // 4. UNCOMMON TIER (25% per chunk, 1 in 4 chunks): Seeds sites, Small Caves
  if(((h>>>10)%4)===0){
   const p=spot(((h>>>5)%17)-8,((h>>>13)%17)-8);
   out.push({id:`seed-site-${prefix}`,type:'seed-site',x:p.x,y:p.y,r:2,foodType:'seeds'});
  }
  if(((h>>>7)%4)===0){
   const fx=x+((h>>>2)%15)-7,fy=y+((h>>>9)%15)-7,r=2+(h%2);
   out.push({id:`cavity-small-${prefix}`,type:'cavity',x:fx,y:fy,r,dirX:passDir[0],dirY:passDir[1],passageX:fx+passDir[0]*r,passageY:fy+passDir[1]*r});
  }
  this._featureDefCache.set(cacheKey,out);
  return out;
 }
 rootCells(f){if(f._cachedRootCells)return f._cachedRootCells;const cells=[];for(let i=0;i<f.length;i++){cells.push({x:f.x+f.dirX*i,y:f.y+f.dirY*i});if(i>1&&i<f.length-1&&i%3===0)cells.push({x:f.x+f.dirX*i+f.dirY,y:f.y+f.dirY*i-f.dirX});}f._cachedRootCells=cells;return cells;}
 featureAt(x,y){const cx=Math.round(x/C.chunkStride),cy=Math.round(y/C.chunkStride);for(let j=cy-1;j<=cy+1;j++)for(let i=cx-1;i<=cx+1;i++)for(const f of this.featureDefinitions(i,j)){if(f.type==='root-vein'&&this.rootCells(f).some(p=>p.x===x&&p.y===y))return f;const roomRadius=f.type==='hercules-cavity'?12:f.type==='worm-cavity'?6:f.type==='spider-cavity'?5:f.r,room=hexDistance({x,y},f)<=roomRadius,tunnel=f.type==='abandoned'&&Math.abs(x-f.x)<=11&&Math.abs(y-f.y-Math.round(Math.sin((x-f.x)*.4)*2))<=1,shaft=f.type==='surface'&&Math.abs(x-f.x)<=1&&y-f.y>=-4&&y-f.y<=0;if(room||tunnel||shaft)return f;}return null;}
 generateCell(x,y){const f=this.featureAt(x,y);if(f){if(f.type==='root-vein')return{x,y,solid:true,terrain:'root',hardness:4,woodDurability:C.rootWoodDurability,discovered:false,zone:'root',root:true,feature:f.id,water:0,depth:1,excavations:0};if(f.type==='rock'){return{x,y,solid:true,terrain:'rock',hardness:2,discovered:false,zone:'rock',rock:true,feature:f.id,water:0,depth:1,excavations:0};}if(f.type==='well'){if(x===f.x&&y===f.y){return{x,y,solid:false,terrain:'water',hardness:1,discovered:false,zone:'well',isWell:true,feature:f.id,water:20,depth:1,excavations:0};}const dirX=f.dirX??1,dirY=f.dirY??0,dx=x-f.x,dy=y-f.y;let isPassage=false;for(let k=1;k<=f.r;k++){if(dx===k*dirX&&dy===k*dirY){isPassage=true;break;}}if(isPassage)return{x,y,solid:false,terrain:'soil',hardness:.85,discovered:false,zone:'passage',feature:f.id,water:0,depth:1,excavations:0};return{x,y,solid:true,terrain:'rock',hardness:2,discovered:false,zone:'rock',rock:true,feature:f.id,water:0,depth:1,excavations:0};}return{x,y,solid:false,terrain:'soil',hardness:.85+(hash(this.seed,x,y)%40)/100,discovered:false,zone:f.type,feature:f.id,water:f.type==='water'?7:0,depth:f.type==='surface'?0:1,excavations:0};}const cx=Math.round(x/C.chunkStride),cy=Math.round(y/C.chunkStride),ch=hash(this.seed+888,cx,cy);if((ch%3)===0){const clusterX=cx*C.chunkStride+((ch%21)-10),clusterY=cy*C.chunkStride+(((ch>>>5)%21)-10);if(hexDistance({x,y},{x:clusterX,y:clusterY})<=2)return{x,y,solid:true,terrain:'rock',hardness:2,discovered:false,zone:'rock',rock:true,feature:null,water:0,depth:1,excavations:0};}return{x,y,solid:true,terrain:'soil',hardness:.85+(hash(this.seed,x,y)%40)/100,discovered:false,zone:null,feature:null,water:0,depth:1,excavations:0};}
 get(x,y){x=Math.round(x);y=Math.round(y);if(!this.cells.has(key(x,y))){this.ensureChunk(Math.round(x/C.chunkStride),Math.round(y/C.chunkStride));if(!this.cells.has(key(x,y)))this.cells.set(key(x,y),this.generateCell(x,y));}return this.cells.get(key(x,y));}
 peek(x,y){return this.cells.get(key(Math.round(x),Math.round(y)));}
 open(x,y,zone,discover=true){const c=this.get(x,y);c.solid=false;c.zone=zone;c.discovered=discover;c.rock=false;this.revision++;return c;}
 disk(x,y,r,zone){for(const p of hexDisk(x,y,r))this.open(p.x,p.y,zone);}
 // FOUNDING LAYOUT: every placement is deterministic for this world seed, but changes for a new seed.
 foundingLayout(){const h=hash(this.seed,731,-419),dirs=[{x:1,y:0},{x:1,y:-1},{x:0,y:-1},{x:-1,y:0},{x:-1,y:1},{x:0,y:1}],nest={x:-8+(h%4),y:((h>>>5)%3)-1},direction=dirs[(h>>>10)%dirs.length],distance=11+((h>>>13)%7),spoil={x:nest.x+direction.x*distance,y:nest.y+direction.y*distance},holeDirection=dirs[(h>>>19)%dirs.length],holeDistance=(h>>>22)%3,hole={x:spoil.x+holeDirection.x*holeDistance,y:spoil.y+holeDirection.y*holeDistance},foodIdx=(h>>>17)%dirs.length,foodDirection=dirs[foodIdx],waterDirection=dirs[(foodIdx+3)%dirs.length];return{nest,spoil,spoilHole:hole,foodStore:{x:nest.x+foodDirection.x*2,y:nest.y+foodDirection.y*2},waterStore:{x:nest.x+waterDirection.x*2,y:nest.y+waterDirection.y*2}};}
 // FOUNDING PASSAGE: the changing nest-to-hole route remains connected from the first frame.
 found(){
  const nest=this.founding.nest,spoil=this.founding.spoil;
  for(const p of hexDisk(nest.x,nest.y,6))this.open(p.x,p.y,'nest',true);
  for(const p of hexDisk(spoil.x,spoil.y,3))this.open(p.x,p.y,'spoil',true);
  this.open(this.pit.x,this.pit.y,'pit',true);
  let x=nest.x,y=nest.y;
  while(x!==this.pit.x||y!==this.pit.y){
   if(x!==this.pit.x)x+=Math.sign(this.pit.x-x);else y+=Math.sign(this.pit.y-y);
   for(const p of hexDisk(x,y,1))if(p.x!==this.pit.x||p.y!==this.pit.y)this.open(p.x,p.y,'passage',true);
  }
   // Procedural Starter Hatchery: 5 floor tiles + 3-tile wide entrance into nest,
   // varying in spawn position around the nest perimeter, alcove orientation, and floor shape.
   const hHash = hash(this.seed, 953, 617);
   const rotateHex = (p, turns) => {
    let q = p.x, r = p.y;
    for (let i = 0; i < (((turns % 6) + 6) % 6); i++) {
     const nq = -r, nr = q + r;
     q = nq; r = nr;
    }
    return { x: q, y: r };
   };
   const front = [{ x: 0, y: 0 }, { x: 0, y: -1 }, { x: 0, y: -2 }];
   const entr = [{ x: 1, y: 0 }, { x: 1, y: -1 }, { x: 1, y: -2 }];
   const backVariants = [
    [{ x: -1, y: 0 }, { x: -1, y: -1 }],
    [{ x: -1, y: -1 }, { x: -1, y: -2 }],
    [{ x: -1, y: 0 }, { x: -1, y: -2 }]
   ];
   const variant = Math.abs(hHash % backVariants.length);
   const startRot = Math.abs((hHash >>> 5) % 6);
   const reserved = [this.founding?.foodStore, this.founding?.waterStore, this.founding?.spoil, this.pit, nest].filter(Boolean);
   let chosen = null;
   for (let step = 0; step < 6; step++) {
    const rot = (startRot + step) % 6;
    const dirVector = rotateHex({ x: 1, y: 0 }, rot);
    const anchor = { x: nest.x - dirVector.x * 4, y: nest.y - dirVector.y * 4 };
    const hFloor = front.concat(backVariants[variant]).map(p => {
     const rp = rotateHex(p, rot);
     return { x: anchor.x + rp.x, y: anchor.y + rp.y };
    });
    const hEntrances = entr.map(p => {
     const rp = rotateHex(p, rot);
     return { x: anchor.x + rp.x, y: anchor.y + rp.y };
    });
    const floorKeys = new Set(hFloor.map(p => key(p.x, p.y)));
    const entrKeys = new Set(hEntrances.map(p => key(p.x, p.y)));
    const hWalls = [];
    for (const f of hFloor) {
     for (const [dq, dr] of DIRS) {
      const nx = f.x + dq, ny = f.y + dr, nk = key(nx, ny);
      if (!floorKeys.has(nk) && !entrKeys.has(nk)) hWalls.push({ x: nx, y: ny });
     }
    }
    const allHatchery = hFloor.concat(hEntrances).concat(hWalls);
    const collides = allHatchery.some(pt => {
     const c = this.peek(pt.x, pt.y);
     if (c && (c.zone === 'passage' || c.zone === 'spoil' || c.zone === 'pit')) return true;
     if (this.founding?.foodStore && Math.abs(this.founding.foodStore.x - pt.x) <= 1 && Math.abs(this.founding.foodStore.y - pt.y) <= 1) return true;
     if (this.founding?.waterStore && Math.abs(this.founding.waterStore.x - pt.x) <= 1 && Math.abs(this.founding.waterStore.y - pt.y) <= 1) return true;
     if (pt.x === nest.x && pt.y === nest.y) return true;
     return false;
    });
    if (!collides) {
     chosen = { hFloor, hEntrances };
     break;
    }
   }
   if (!chosen) {
    const rot = startRot;
    const dirVector = rotateHex({ x: 1, y: 0 }, rot);
    const anchor = { x: nest.x - dirVector.x * 4, y: nest.y - dirVector.y * 4 };
    chosen = {
     hFloor: front.concat(backVariants[variant]).map(p => {
      const rp = rotateHex(p, rot);
      return { x: anchor.x + rp.x, y: anchor.y + rp.y };
     }),
     hEntrances: entr.map(p => {
      const rp = rotateHex(p, rot);
      return { x: anchor.x + rp.x, y: anchor.y + rp.y };
     })
    };
   }
   const hFloor = chosen.hFloor;
   const entrances = chosen.hEntrances;
   for (const f of hFloor) {
    const c = this.get(f.x, f.y);
    c.solid = false; c.zone = 'hatchery-floor'; c.structure = 'hatchery_floor'; c.discovered = true;
   }
   const compKeys = new Set(hFloor.map(p => key(p.x, p.y)));
   const entranceKeys = new Set(entrances.map(p => key(p.x, p.y)));
   for (const e of entrances) this.open(e.x, e.y, 'nest', true);
   for (const f of hFloor) {
    for (const [dq, dr] of DIRS) {
     const nx = f.x + dq, ny = f.y + dr, nk = key(nx, ny);
     if (!compKeys.has(nk) && !entranceKeys.has(nk)) {
      const wc = this.get(nx, ny);
      wc.solid = true; wc.zone = 'hatchery-wall'; wc.structure = 'hatchery_wall'; wc.discovered = true;
     }
    }
   }
 }
  getHatcheries(){
   if(AntGame.Brood?.getHatcheries)return AntGame.Brood.getHatcheries(this);
   return [];
  }
 neighbors(x,y){return DIRS.map(([dq,dr])=>this.peek(x+dq,y+dr)).filter(Boolean);}
 faces(c,known=true){return this.neighbors(c.x,c.y).filter(n=>!n.solid&&n.water<6&&!n.waterStorage&&!n.isWell&&n.zone!=='well'&&(!known||n.discovered));}
 senseAt(x,y,r=C.revealRadius){for(const p of hexDisk(Math.round(x),Math.round(y),r)){const c=this.get(p.x,p.y);c.discovered=true;if(c.water>0)this.activeWater.add(key(c.x,c.y));if(c.zone==='pit'&&!this.pits.some(h=>h.x===c.x&&h.y===c.y))this.pits.push({x:c.x,y:c.y,used:0,capacity:C.spoilCapacity,hole:true});}}
 revealAt(x,y,r=C.revealRadius){this.senseAt(x,y,r);}
 // EXCAVATION: root is soil-like but deliberately much slower. It supplies no
 // dirt load after destruction because it is wood consumed by the environment.
 removePiece(c,face){if(!c.solid||!face||face.solid||hexDistance(c,face)!==1)return null;c.solid=false;c.zone='tunnel';c.root=false;c.excavations=(c.excavations||0)+1;this.removed++;this.revision++;return c.terrain==='root'?null:{type:'soil',amount:1,source:{x:c.x,y:c.y}};}
 serialize(){return{seed:this.seed,cells:[...this.cells],chunks:[...this.chunks],features:this.features,pit:this.pit,pits:this.pits,founding:this.founding,removed:this.removed,revision:this.revision,activeWater:[...this.activeWater]};}
 static restore(data){const w=Object.create(World.prototype);Object.assign(w,data);w.cells=new Map(data.cells);w.chunks=new Map(data.chunks);w.activeWater=new Set(data.activeWater);w.pits=data.pits||[data.pit];w._featureDefCache=new Map();w.founding=data.founding||{nest:{...C.queenPosition},spoil:{x:data.pit.x,y:data.pit.y},foodStore:{...C.foodPosition},waterStore:{x:C.queenPosition.x+2,y:C.queenPosition.y}};return w;}
}
function maxContiguousOpenNeighbors(world, x, y){
 const ns = DIRS.map(([dq, dr]) => world.peek(x + dq, y + dr));
 let maxCount = 0, current = 0;
 for (let i = 0; i < 12; i++) {
  const n = ns[i % 6];
  if (n && !n.solid && n.water < 6 && !n.waterStorage && !n.isWell && n.zone !== 'well') {
   current++;
   if (current > maxCount) maxCount = current;
  } else {
   current = 0;
  }
 }
 return Math.min(6, maxCount);
}
// BODY CLEARANCE: small bodies use local contiguous openings. Very broad bodies
// such as Hercules Beetles require an entire radius of open terrain around their
// center, allowing 7-10-block anatomy to exceed the six-neighbor hex count.
function hasBodyClearance(world,x,y,width=1){
 if(width<=1)return true;
 if(!world._clearanceCache||world._clearanceRev!==world.revision){world._clearanceCache=new Map();world._clearanceRev=world.revision;}
 const ck=`${x},${y},${width}`,cached=world._clearanceCache.get(ck);
 if(cached!==undefined)return cached;
 let res;
 if(width<=3)res=maxContiguousOpenNeighbors(world,x,y)>=width;
 else{
  const radius=Math.max(2,Math.ceil(width/2));
  res=hexDisk(x,y,radius).every(p=>{const c=world.peek(p.x,p.y);return c&&!c.solid&&c.water<6&&!c.waterStorage&&!c.isWell&&c.zone!=='well';});
 }
 world._clearanceCache.set(ck,res);
 return res;
}
class FastMinHeap{
 constructor(){this.a=[];}
 push(v){this.a.push(v);let i=this.a.length-1;while(i>0){const p=(i-1)>>1;if(this.a[p].f<=this.a[i].f)break;const t=this.a[p];this.a[p]=this.a[i];this.a[i]=t;i=p;}}
 pop(){if(!this.a.length)return null;const r=this.a[0],b=this.a.pop();if(this.a.length){this.a[0]=b;let i=0;while(true){const l=(i<<1)+1,r2=(i<<1)+2;let s=i;if(l<this.a.length&&this.a[l].f<this.a[s].f)s=l;if(r2<this.a.length&&this.a[r2].f<this.a[s].f)s=r2;if(s===i)break;const t=this.a[i];this.a[i]=this.a[s];this.a[s]=t;i=s;}}return r;}
 get length(){return this.a.length;}
}
function findRoute(world,start,goals,clearanceNeeded=1){
 const sx=Math.round(start.x),sy=Math.round(start.y),sk=key(sx,sy);
 if(!world.peek(sx,sy)||world.peek(sx,sy).solid||!goals.size)return null;
 if(goals.has(sk))return{path:[],goal:goals.get(sk)};
 if(goals.size===1){
  const [goalKey]=goals.keys(),[tx,ty]=goalKey.split(',').map(Number);
  const targetPos={x:tx,y:ty};
  const openSet=new FastMinHeap(),parents=new Map([[sk,null]]),gScore=new Map([[sk,0]]);
  openSet.push({x:sx,y:sy,g:0,f:hexDistance({x:sx,y:sy},targetPos)});
  let steps=0;
  while(openSet.length>0&&steps++<2500){
   const p=openSet.pop(),k=key(p.x,p.y);
   if(p.g>gScore.get(k))continue;
   if(goals.has(k)){
    const path=[];let at=k;
    while(parents.get(at)!==null){const[x,y]=at.split(',').map(Number);path.push({x,y});at=parents.get(at);}
    return{path:path.reverse(),goal:goals.get(k)};
   }
   for(const n of world.neighbors(p.x,p.y)){
    if(n.solid||n.water>=6||n.waterStorage||n.isWell||n.zone==='well')continue;
    const nk=key(n.x,n.y),newG=p.g+1;
    if(gScore.has(nk)&&newG>=gScore.get(nk))continue;
    if(!hasBodyClearance(world,n.x,n.y,clearanceNeeded))continue;
    parents.set(nk,k);
    gScore.set(nk,newG);
    openSet.push({x:n.x,y:n.y,g:newG,f:newG+hexDistance(n,targetPos)});
   }
  }
  return null;
 }
 const queue=[{x:sx,y:sy}],parents=new Map([[sk,null]]);
 for(let i=0;i<queue.length&&i<3000;i++){
  const p=queue[i],k=key(p.x,p.y);
  if(goals.has(k)){
   const path=[];let at=k;
   while(parents.get(at)!==null){const[x,y]=at.split(',').map(Number);path.push({x,y});at=parents.get(at);}
   return{path:path.reverse(),goal:goals.get(k)};
  }
  for(const n of world.neighbors(p.x,p.y)){
   const nk=key(n.x,n.y);
   if(!n.solid&&n.water<6&&!n.waterStorage&&!n.isWell&&n.zone!=='well'&&!parents.has(nk)){
    if(!hasBodyClearance(world,n.x,n.y,clearanceNeeded))continue;
    parents.set(nk,k);
    queue.push(n);
   }
  }
 }
 return null;
}
function pathfind(world,start,target,clearanceNeeded=1){const c=world.peek(target.x,target.y);if(c?.solid!==false||c.water>=6||c.waterStorage||c?.isWell||c?.zone==='well')return null;const antClearance=typeof start==='object'&&start?.clearanceNeeded?start.clearanceNeeded:(typeof clearanceNeeded==='number'?clearanceNeeded:1);return findRoute(world,start,new Map([[key(Math.round(target.x),Math.round(target.y)),target]]),antClearance)?.path??null;}
Object.assign(AntGame,{World,pathfind,findRoute,key,hexDistance,hexDisk,hexRound,HEX_DIRS:DIRS,maxContiguousOpenNeighbors,hasBodyClearance});
})();
