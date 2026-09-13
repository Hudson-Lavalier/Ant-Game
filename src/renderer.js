/*
 * UNDERFOOT CANVAS RENDERER
 * Renderer converts axial world coordinates into the top-down flat-top hex view.
 * It does not run gameplay. The same tile() polygon helper is used for terrain,
 * hover overlays, and job overlays so dig/build color fills match a cell exactly.
 *
 * Feature landmarks: screen/world/hexAt are camera transforms; pathTexture marks
 * ordinary dug floor; draw paints terrain, entities, egg progress bars, and tools;
 * ant draws the head-first ant silhouette and carried resources.
 */
(()=>{
const {Config:C,Species,FoodTypes,hash,hexDisk}=AntGame;
function adjustColor(col,factor=1){
 if(factor===1||!col)return col;
 if(col.startsWith('#')&&col.length===7){
  const r=parseInt(col.slice(1,3),16),g=parseInt(col.slice(3,5),16),b=parseInt(col.slice(5,7),16);
  return `rgb(${Math.max(0,Math.min(255,Math.round(r*factor)))},${Math.max(0,Math.min(255,Math.round(g*factor)))},${Math.max(0,Math.min(255,Math.round(b*factor)))})`;
 }
 return col;
}
function antColor(a,shade=1){
 if(a.colonyId!==1)return adjustColor('#b86f64',shade);
 if(a.feeder)return adjustColor('#70d2cf',shade);
 const baseHSL={minor:[42,45,62],worker:[38,36,57],media:[35,38,50],soldier:[18,52,44],major:[28,48,42],supermajor:[12,58,38],drone:[140,12,54],princess:[8,28,65],queen:[40,42,61]}[a.type]||[38,36,57],
 id=a.id||1,
 hOff=((hash(12345,id,1)%31)-15),
 sOff=((hash(12345,id,2)%21)-10),
 lOff=((hash(12345,id,3)%21)-10),
 h=(baseHSL[0]+hOff+360)%360,
 s=Math.max(10,Math.min(90,baseHSL[1]+sOff)),
 baseL=baseHSL[2]+lOff,
 l=Math.max(15,Math.min(85,Math.round(baseL*shade)));
 return `hsl(${h},${s}%,${l}%)`;
}
class Renderer{
 constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.camera={x:1,y:0,zoom:2.4};this.showPaths=false;this.colorMap=false;this.hover=null;this.hoverRadius=0;this.inspectedCell=null;this.selectionBox=null;this.resize();}
 resize(){const r=this.canvas.getBoundingClientRect();this.width=r.width;this.height=r.height;this.dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=Math.max(1,r.width*this.dpr);this.canvas.height=Math.max(1,r.height*this.dpr);}
 origin(){return{x:(this.width-Math.min(277,this.width*.25))/2,y:this.height/2-10};}
 screen(q,r){const o=this.origin(),s=C.cellSize*this.camera.zoom;return{x:o.x+1.5*s*(q-this.camera.x),y:o.y+Math.sqrt(3)*s*((r+q/2)-(this.camera.y+this.camera.x/2))};}
 world(x,y){const o=this.origin(),s=C.cellSize*this.camera.zoom,px=x-o.x+1.5*s*this.camera.x,py=y-o.y+Math.sqrt(3)*s*(this.camera.y+this.camera.x/2),q=px/(1.5*s);return{x:q,y:py/(Math.sqrt(3)*s)-q/2};}
 hexAt(x,y){const p=this.world(x,y),cx=p.x,cz=p.y,cy=-cx-cz;let rx=Math.round(cx),ry=Math.round(cy),rz=Math.round(cz),dx=Math.abs(rx-cx),dy=Math.abs(ry-cy),dz=Math.abs(rz-cz);if(dx>dy&&dx>dz)rx=-ry-rz;else if(dy>dz)ry=-rx-rz;else rz=-rx-ry;return{x:rx,y:rz};}
 poly(x,y,r,rot=0){const c=this.ctx;c.beginPath();for(let i=0;i<6;i++){const a=rot+i*Math.PI/3,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;i?c.lineTo(px,py):c.moveTo(px,py);}c.closePath();}
 tile(p,s){this.poly(p.x,p.y,s*1.01);}
 text(t,x,y,color,size=10){const c=this.ctx;c.fillStyle=color;c.font=`${size}px Segoe UI`;c.textAlign='center';c.fillText(t,x,y);}
 hp(entity,p,z,max){
  if(z<1.4)return;
  const c=this.ctx;
  const inCombat=entity.state==='attack'||(entity.lastAttacker&&(entity.fleeTimer||0)>0)||entity.threatId;
  if(inCombat){
   const cy=p.y-(entity.type==='queen'?22:15)*z;
   c.save();
   const pulse=0.85+Math.sin((this.time||0)*12)*0.15;
   c.translate(p.x,cy);c.scale(z*pulse,z*pulse);
   c.strokeStyle='#ff4444';c.lineWidth=1.4;
   c.beginPath();c.moveTo(-4,-4);c.lineTo(4,4);c.moveTo(4,-4);c.lineTo(-4,4);c.stroke();
   c.fillStyle='#ffe066';c.beginPath();c.arc(0,0,1.2,0,Math.PI*2);c.fill();
   c.restore();
  }
  if(entity.health>=max)return;
  const w=entity.type==='queen'?25*z:15*z,y=p.y-(entity.type==='queen'?14:10)*z;
  c.fillStyle='#190d0d';c.fillRect(p.x-w/2,y,w,2.6*z);
  c.fillStyle='#d84f4f';c.fillRect(p.x-w/2,y,w*Math.max(0,entity.health/max),2.6*z);
 }
 zoneColor(cell){
  if(cell.area)return{territory:'#7b64a888',passage:'#62734a88',food:'#a87b3288',spoil:'#70464f88',water:'#2b668588',enemy:'#96323288',rock:'#4c524f88',well:'#19476688',root:'#6e4e2988'}[cell.area.type];
  return{passage:'#62734a88',tunnel:'#62734a88',nest:'#8f7d4288','food-store':'#a87b3288',spoil:'#70464f88','water-store':'#2b668588',colony:'#96323288',built:'#4e6e4e88',rock:'#4c524f88',well:'#19476688',root:'#6e4e2988'}[cell.zone];
 }
 web(p,s){
  const c=this.ctx;c.save();c.translate(p.x,p.y);
  c.strokeStyle='#b8c5c299';c.lineWidth=Math.max(.45,s*.075);
  for(let i=0;i<6;i++){
   const a=i*Math.PI/3;
   c.beginPath();c.moveTo(0,0);c.lineTo(Math.cos(a)*s*.72,Math.sin(a)*s*.72);c.stroke();
  }
  c.beginPath();c.arc(0,0,s*.38,0,Math.PI*2);c.stroke();
  c.fillStyle='#d8e4e0aa';
  for(let i=0;i<6;i++){
   const a=i*Math.PI/3;
   c.beginPath();c.arc(Math.cos(a)*s*.38,Math.sin(a)*s*.38,Math.max(.5,s*.035),0,Math.PI*2);c.fill();
  }
  c.restore();
 }
 pathTexture(p,h,s){
  const c=this.ctx;
  c.fillStyle='#0f1210';
  for(let i=0;i<3;i++){
   const dx=(((h>>>(i*5))%9)-4)*s*.16,dy=(((h>>>(i*7+3))%9)-4)*s*.16,r=Math.max(.6,s*.12);
   c.fillRect(p.x+dx-r/2,p.y+dy-r/2,r,r);
  }
  c.fillStyle='#363e3b55';
  const mx=(((h>>>12)%7)-3)*s*.18,my=(((h>>>15)%7)-3)*s*.18;
  c.fillRect(p.x+mx,p.y+my,1.0,1.0);
 }
 dirtTexture(p,h,s,z){
  const c=this.ctx;
  c.fillStyle='#07090877';
  for(let i=0;i<3;i++){
   const dx=(((h>>>(i*4))%9)-4)*s*.15,dy=(((h>>>(i*4+2))%9)-4)*s*.15,r=Math.max(.7,s*.11);
   c.beginPath();c.arc(p.x+dx,p.y+dy,r,0,Math.PI*2);c.fill();
  }
  c.fillStyle='#5c686444';
  const mx=(((h>>>13)%9)-4)*s*.17,my=(((h>>>16)%9)-4)*s*.17;
  c.fillRect(p.x+mx-.6,p.y+my-.6,1.2,1.2);
  c.fillStyle='#86949033';
  const kx=(((h>>>20)%9)-4)*s*.18,ky=(((h>>>23)%9)-4)*s*.18;
  c.fillRect(p.x+kx-.5,p.y+ky-.5,1.0,1.0);
  if(z>1.2){
   c.strokeStyle='#05070655';c.lineWidth=.6;
   const sy=p.y+(((h>>>7)%5)-2)*s*.12;
   c.beginPath();c.moveTo(p.x-s*.35,sy);c.lineTo(p.x+s*.35,sy+(((h>>>11)%3)-1)*s*.08);c.stroke();
  }
 }
 rockTexture(p,h,s,z){
  const c=this.ctx;
  c.strokeStyle='#353f3c66';c.lineWidth=.7;
  const fAngle=((h%6)*Math.PI)/3;
  c.beginPath();c.moveTo(p.x-Math.cos(fAngle)*s*.45,p.y-Math.sin(fAngle)*s*.45);c.lineTo(p.x+Math.cos(fAngle)*s*.45,p.y+Math.sin(fAngle)*s*.45);c.stroke();
  if(z>1.1){
   c.fillStyle='#62736e44';c.beginPath();c.arc(p.x+(((h%5)-2)*s*.15),p.y+((((h>>>3)%5)-2)*s*.15),Math.max(.6,z*.35),0,Math.PI*2);c.fill();
   c.fillStyle='#9ab0aa33';c.fillRect(p.x+(((h>>>6)%5)-2)*s*.14,p.y+(((h>>>9)%5)-2)*s*.14,1.2,1.2);
  }
 }
 rootTexture(p,h,s){
  const c=this.ctx;
  c.strokeStyle='#45372b';c.lineWidth=Math.max(.6,s*.14);
  c.beginPath();c.moveTo(p.x-s*.5,p.y+s*.12);c.quadraticCurveTo(p.x,p.y-s*.35,p.x+s*.5,p.y+s*.08);c.stroke();
  c.strokeStyle='#66554499';c.lineWidth=Math.max(.4,s*.05);
  c.beginPath();c.moveTo(p.x-s*.45,p.y+s*.08);c.quadraticCurveTo(p.x+s*.05,p.y-s*.28,p.x+s*.45,p.y+s*.05);c.stroke();
 }
 draw(sim,selection,mode,interpolation=1){
  const c=this.ctx,z=this.camera.zoom,s=C.cellSize*z;this.time=sim.time;this.interpolation=interpolation;this.ecoAlpha = Math.min(1, (sim.ecologyTimer + interpolation * C.step) / C.ecologyInterval);c.setTransform(this.dpr,0,0,this.dpr,0,0);c.fillStyle='#080b09';c.fillRect(0,0,this.width,this.height);
  const jobs=new Map(),sel=id=>selection instanceof Map?selection.get(id):null;for(const j of sim.jobs.filter(j=>j.colonyId===1))jobs.set(`${j.x},${j.y}`,j);
  const pits=new Map();for(const h of sim.world.pits)pits.set(`${h.x},${h.y}`,h);
  const inView=(px,py,rad=40)=>px>=-rad&&py>=-rad&&px<=this.width+rad&&py<=this.height+rad;

   const lodHigh = z >= 2.2, lodMid = z >= 1.4;
   const tileRadius = lodHigh ? s * 1.01 : s * 1.06;

   for(const cell of sim.world.cells.values()){
    const p=this.screen(cell.x,cell.y);
    if(p.x<-s*2||p.y<-s*2||p.x>this.width+s*2||p.y>this.height+s*2)continue;
    const h=hash(sim.world.seed,cell.x,cell.y),job=jobs.get(`${cell.x},${cell.y}`);
    if(!cell.discovered){
     if(job){
      const build=job.type==='build',color=build?(job.status==='available'?'#48a8cf':'#8c2448'):(job.status==='available'?'#c5c994':'#b8322e');
      if(!lodMid){c.fillStyle=color;c.fillRect(p.x-s*.7,p.y-s*.7,s*1.4,s*1.4);continue;}
      c.fillStyle=color+'60';this.poly(p.x,p.y,s*1.01);c.fill();c.strokeStyle=color;c.lineWidth=1.2;this.poly(p.x,p.y,s*1.01);c.stroke();
     }else if(lodMid){
      c.fillStyle='#0c0f0d';this.poly(p.x,p.y,tileRadius);c.fill();
      c.strokeStyle='#070908';c.lineWidth=.4;this.poly(p.x,p.y,s*1.01);c.stroke();
     }
     continue;
    }
    const isRock=cell.solid&&(cell.rock||cell.zone==='rock'),isRoot=cell.solid&&cell.root,pathFloor=!cell.solid&&(cell.zone===null||cell.zone==='nest'||cell.zone==='tunnel'||cell.zone==='passage');
    c.fillStyle=isRock?`hsl(${200+(h%12)} ${6+(h%4)}% ${18+(h%5)}%)`:isRoot?'#221b14':cell.solid?`hsl(${27+(h%5)} ${9+(h%5)}% ${14+(h%5)}%)`:cell.zone==='well'?'#040910':pathFloor?'#191c1a':cell.zone==='pit'?'#121310':cell.zone==='water-store'?'#040f13':cell.zone==='food-store'?'#1e1b13':cell.zone==='spoil'?'#181517':cell.zone==='abandoned'?'#121713':'#151816';
    if(!lodMid){
     const bw=s*1.6,bh=s*1.6;
     c.fillRect(p.x-bw*.5,p.y-bh*.5,bw,bh);
     if(cell.water>0){
      c.fillStyle=cell.isWell?'#12456e':'#1e6878';
      c.fillRect(p.x-s*.6,p.y-s*.6,s*1.2,s*1.2);
     }
     const pit=cell.zone==='pit'?pits.get(`${cell.x},${cell.y}`):null;
     if(pit){
      c.fillStyle=pit.used>=pit.capacity?'#38352d':'#080907';
      c.fillRect(p.x-s*.5,p.y-s*.5,s,s);
     }
     if(job){
      const build=job.type==='build',color=build?(job.status==='available'?'#48a8cf':'#8c2448'):(job.status==='available'?'#c5c994':'#b8322e');
      c.fillStyle=color;
      c.fillRect(p.x-s*.7,p.y-s*.7,s*1.4,s*1.4);
     }
     continue;
    }
    this.poly(p.x,p.y,tileRadius);c.fill();
    if(lodHigh){
     c.strokeStyle=isRock?'#101312':cell.solid?'#090b0a88':'#0f1210';c.lineWidth=isRock?.55:.45;c.stroke();
     if(isRock){this.rockTexture(p,h,s,z);}
     else if(isRoot){this.rootTexture(p,h,s);}
     else if(cell.solid){this.dirtTexture(p,h,s,z);}
     else if(pathFloor){this.pathTexture(p,h,s);}
    }
    if(this.colorMap&&!cell.solid&&this.zoneColor(cell)){c.fillStyle=this.zoneColor(cell);this.poly(p.x,p.y,s*.78,-.08);c.fill();}
    if(cell.water>0){
     if(cell.zone==='well'||cell.isWell){const level=Math.max(1,Math.min(20,Math.ceil(cell.water)));c.fillStyle=`hsla(205,45%,${14+Math.min(18,level)}%,.92)`;this.poly(p.x,p.y,s*.88);c.fill();if(lodHigh){c.strokeStyle='hsla(192,55%,45%,.35)';c.lineWidth=.8;c.stroke();}}
     else{const level=Math.max(1,Math.min(7,Math.ceil(cell.water)));c.fillStyle=`hsla(${192+level*2},${36+level*3}%,${18+level*4}%,${.35+level*.08})`;this.poly(p.x,p.y,s*.9);c.fill();if(lodHigh){c.strokeStyle=`hsla(190,40%,40%,${.15+level*.05})`;c.lineWidth=.5;c.stroke();}}
    }
    if(cell.web&&lodHigh)this.web(p,s);
    const pit=cell.zone==='pit'?pits.get(`${cell.x},${cell.y}`):null;
    if(pit){c.fillStyle=pit.used>=pit.capacity?'#38352d':'#080907';this.poly(p.x,p.y,s*.86);c.fill();if(lodHigh){c.strokeStyle='#4a463c';c.stroke();}}
    if(job){const build=job.type==='build',color=build?(job.status==='available'?'#48a8cf':'#8c2448'):(job.status==='available'?'#c5c994':'#b8322e');c.fillStyle=color+'60';this.tile(p,s);c.fill();c.strokeStyle=color;c.lineWidth=1.2;this.tile(p,s);c.stroke();}
   }
  for(const r of sim.resources){
   const cell=sim.world.peek(r.x,r.y);if(!cell?.discovered||r.remaining<=0)continue;
   const p=this.screen(r.x,r.y);if(!inView(p.x,p.y,s*2))continue;
   const d=FoodTypes[r.foodType],scale=Math.max(.25,r.remaining/r.initial);
   c.fillStyle=d.color;c.beginPath();c.ellipse(p.x,p.y,Math.max(2,s*.65*scale),Math.max(1.5,s*.42*scale),.3,0,Math.PI*2);c.fill();
  }
  for(const d of sim.drops){
   const cell=sim.world.peek(d.x,d.y);if(!cell?.discovered)continue;
   const p=this.screen(d.x,d.y);if(!inView(p.x,p.y,20))continue;
   c.fillStyle=d.load.type==='food'?'#a59750':'#524335';c.beginPath();c.arc(p.x,p.y,2.5*z,0,Math.PI*2);c.fill();
  }
  for(const e of sim.eggs){
   if(e.colonyId!==1&&!sim.world.peek(e.x,e.y)?.discovered)continue;
   const p=this.screen(e.x,e.y);if(!inView(p.x,p.y,25))continue;
   const progress=Math.max(0,Math.min(1,e.age/e.duration)),w=Math.max(18,13*z),y=p.y-8*z;
   c.fillStyle='#d0cbaf';c.beginPath();c.ellipse(p.x,p.y,2*z,3*z,.35,0,Math.PI*2);c.fill();
   c.fillStyle='#221f17';c.fillRect(p.x-w/2,y,w,3.5);
   c.fillStyle='#a89842';c.fillRect(p.x-w/2,y,w*progress,3.5);
   c.strokeStyle='#857835';c.lineWidth=.7;c.strokeRect(p.x-w/2,y,w,3.5);
  }
  for(const egg of sim.spiderEggs||[]){
   if(!sim.world.peek(egg.x,egg.y)?.discovered)continue;
   const p=this.screen(egg.x,egg.y);if(!inView(p.x,p.y,20))continue;
   const progress=Math.min(1,egg.age/egg.duration);
   c.fillStyle='#b8b2a3';c.beginPath();c.arc(p.x,p.y,3*z,0,Math.PI*2);c.fill();
   c.strokeStyle='#48413a';c.stroke();c.fillStyle='#5a4632';c.fillRect(p.x-5*z,p.y-7*z,10*z*progress,1.6*z);
  }
  for(const cr of sim.creatures){
   if(cr.carriedBy)continue;
   if(!sim.world.peek(cr.x,cr.y)?.discovered)continue;
   const x=(cr.prevX??cr.x)+(cr.x-(cr.prevX??cr.x))*this.ecoAlpha,y=(cr.prevY??cr.y)+(cr.y-(cr.prevY??cr.y))*this.ecoAlpha,p=this.screen(x,y);
   if(!inView(p.x,p.y,70*z))continue;
   const d=Species[cr.species];this.creature(cr,p,z,d);this.hp(cr,p,z,cr.maxHealth||d.health);
  }
  for(const a of sim.ants){
   if(a.colonyId!==1&&!sim.world.peek(a.x,a.y)?.discovered)continue;
   const p=this.screen(a.x,a.y);
   if(!inView(p.x,p.y,35*z))continue;
   if(this.showPaths&&a.path.length){c.strokeStyle='#88987088';c.beginPath();c.moveTo(p.x,p.y);for(const step of a.path){const q=this.screen(step.x,step.y);c.lineTo(q.x,q.y);}c.stroke();}
   if(sel(a.id)){c.strokeStyle=sel(a.id);c.lineWidth=1.5;c.beginPath();c.arc(p.x,p.y,(a.type==='queen'?15:9)*z,0,Math.PI*2);c.stroke();}
   this.ant(a,p,z,sim.time);this.hp(a,p,z,a.maxHealth||100);
  }
  for(const m of sim.commandMarkers||[]){
   const p=this.screen(m.x,m.y);if(!inView(p.x,p.y,20))continue;
   c.strokeStyle=m.color;c.lineWidth=2;c.beginPath();c.arc(p.x,p.y,7*z,0,Math.PI*2);c.moveTo(p.x-9*z,p.y);c.lineTo(p.x+9*z,p.y);c.moveTo(p.x,p.y-9*z);c.lineTo(p.x,p.y+9*z);c.stroke();
  }
   if(this.inspectedCell){const cell=sim.world.peek(this.inspectedCell.x,this.inspectedCell.y);if(cell){const p=this.screen(cell.x,cell.y);c.strokeStyle='#48a8cf';c.lineWidth=2;this.tile(p,s);c.stroke();}}
    if(this.hover){for(const h of hexDisk(this.hover.x,this.hover.y,this.hoverRadius)){const p=this.screen(h.x,h.y),color=mode==='build'?'#48a8cf':mode==='dig'?'#c5c994':mode==='attack'?'#d84f4f':mode==='harvest'?'#73c887':mode==='carry'?'#e8c96a':mode==='cancel'?'#b8322e':this.colorMap?'#527888':'#7d8e85';c.fillStyle=color+'45';this.tile(p,s);c.fill();c.strokeStyle=color;c.lineWidth=1.2;this.tile(p,s);c.stroke();}}
  if(this.selectionBox){const b=this.selectionBox;c.fillStyle='#48a8cf20';c.strokeStyle='#48a8cf';c.fillRect(b.x,b.y,b.w,b.h);c.strokeRect(b.x,b.y,b.w,b.h);}
 }
  ant(a,p,z,time){
   const c=this.ctx,t=a.type;
   const isQueen=t==='queen',isPrincess=t==='princess',isDrone=t==='drone',isSoldier=t==='soldier',isSuper=t==='supermajor',isMajor=t==='major',isMedia=t==='media',isMinor=t==='minor';
   const q=isQueen?.82:isSuper?.90:isMajor?.76:isPrincess?.72:isSoldier?.64:isMedia?.54:isDrone?.44:isMinor?.35:.46;
   const shade=a.shade||1,moving=a.alive&&Boolean(a.path?.length||a.isMoving);

   if(z<1.4){
    c.save();c.translate(p.x,p.y);c.rotate(a.angle||0);c.globalAlpha=a.alive?1:.42;
    c.fillStyle=antColor(a,shade);
    c.beginPath();c.ellipse(0,0,Math.max(1.5,4.2*z*q),Math.max(1.1,2.5*z*q),0,0,Math.PI*2);c.fill();
    c.restore();
    return;
   }

   c.save();c.translate(p.x,p.y);c.rotate(a.angle||0);c.scale(z*q,z*q);c.globalAlpha=a.alive?1:.42;
   const baseCol=antColor(a,shade),darkChitin='#15100b',highlight='#ffffff26';

   // 1. LEGS: 6 Articulated Hexapod Legs (Coxa -> Femur -> Spined Tibia -> Tarsus & Claws) on alternating tripod gait
   const legLens=isQueen?[2.8,3.4,2.2]:(isSoldier||isSuper||isMajor)?[2.4,3.0,2.0]:isMinor?[1.6,2.0,1.4]:[2.0,2.5,1.7];
   const legData=[
    {ax:1.2,ay:1.4,dir:1.0,idx:0,femL:legLens[0],tibL:legLens[1],tarL:legLens[2]},
    {ax:-0.6,ay:1.6,dir:0.1,idx:1,femL:legLens[0]*.95,tibL:legLens[1]*.95,tarL:legLens[2]},
    {ax:-2.4,ay:1.5,dir:-1.0,idx:2,femL:legLens[0]*1.1,tibL:legLens[1]*1.15,tarL:legLens[2]*1.05}
   ];
   for(const side of[-1,1]){
    for(const ld of legData){
     const tripodPhase=(ld.idx===1?(side>0?Math.PI:0):(side>0?0:Math.PI));
     const swing=moving?Math.sin(time*16+tripodPhase)*0.9:0;
     const lift=moving?Math.max(0,-Math.cos(time*16+tripodPhase))*0.5:0;
     const kx=ld.ax+ld.dir*(ld.femL*0.6)+swing*0.5,ky=side*(ld.ay+ld.femL*0.75)-side*lift;
     const tx=kx+ld.dir*(ld.tibL*0.5)+swing,ty=ky+side*(ld.tibL*0.65);
     const cx=tx+ld.dir*(ld.tarL*0.5)+swing*0.3,cy=ty+side*(ld.tarL*0.45);

     c.save();
     c.strokeStyle='#1d150e';c.lineWidth=isQueen||isSuper?1.2:0.9;c.beginPath();c.moveTo(ld.ax,side*ld.ay);c.lineTo(kx,ky);c.stroke();
     c.strokeStyle='#271d15';c.lineWidth=isQueen||isSuper?1.0:0.75;c.beginPath();c.moveTo(kx,ky);c.lineTo(tx,ty);c.stroke();
     c.strokeStyle='#120d09';c.lineWidth=0.5;c.beginPath();c.moveTo(kx,ky);c.lineTo(kx+ld.dir*0.6,ky+side*0.7);c.stroke();
     c.strokeStyle='#17110c';c.lineWidth=0.55;c.beginPath();c.moveTo(tx,ty);c.lineTo(cx,cy);c.stroke();
     c.lineWidth=0.45;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+ld.dir*0.5-0.2,cy+side*0.5);c.moveTo(cx,cy);c.lineTo(cx+ld.dir*0.5+0.3,cy+side*0.3);c.stroke();
     c.restore();
    }
   }

   // 2. GASTER (Abdomen with segmental tergite bands and cuticular sheen)
   const gasterX=isQueen?-13.5:isPrincess?-11.0:isDrone?-7.5:(isSuper||isSoldier)?-9.5:isMajor?-8.8:isMinor?-6.2:-7.5;
   const gasterRx=isQueen?8.2:isPrincess?6.5:isDrone?4.2:isSuper?6.0:isMajor?5.2:isSoldier?5.0:isMinor?3.4:4.4;
   const gasterRy=isQueen?6.0:isPrincess?4.5:isDrone?3.0:isSuper?4.6:isMajor?4.0:isSoldier?3.8:isMinor?2.6:3.3;

   c.save();c.fillStyle=baseCol;c.strokeStyle=darkChitin;c.lineWidth=.9;
   c.beginPath();c.ellipse(gasterX,0,gasterRx,gasterRy,0,0,Math.PI*2);c.fill();c.stroke();
   const bandCount=isQueen?5:4;
   c.strokeStyle=darkChitin;c.lineWidth=.6;
   for(let b=1;b<bandCount;b++){
    const frac=b/bandCount,bx=gasterX-gasterRx+frac*gasterRx*2;
    const bw=Math.sqrt(Math.max(0,1-Math.pow((bx-gasterX)/gasterRx,2)))*gasterRy;
    c.beginPath();c.arc(bx,0,bw,-Math.PI*.45,Math.PI*.45);c.stroke();
    if(isQueen||isPrincess){c.strokeStyle='#dfc88833';c.lineWidth=.5;c.beginPath();c.arc(bx+.4,0,bw*.96,-Math.PI*.4,Math.PI*.4);c.stroke();}
   }
   c.strokeStyle=highlight;c.lineWidth=.8;c.beginPath();c.ellipse(gasterX,-gasterRy*.45,gasterRx*.65,gasterRy*.35,-.15,-Math.PI*.8,-Math.PI*.2);c.stroke();
   c.restore();

   // 3. PETIOLE (Raised Formicid Waist Node)
   const petioleX=isQueen?-5.8:isPrincess?-4.8:isDrone?-3.5:(isSuper||isSoldier)?-4.5:isMajor?-4.0:isMinor?-3.0:-3.5;
   const petNodeRx=isQueen?1.5:(isSuper||isSoldier)?1.3:isMajor?1.1:.85;
   const petNodeRy=isQueen?1.6:(isSuper||isSoldier)?1.4:isMajor?1.2:.95;

   c.save();
   c.strokeStyle=darkChitin;c.lineWidth=1.2;c.beginPath();c.moveTo(petioleX+1.2,0);c.lineTo(petioleX-1.2,0);c.stroke();
   c.fillStyle=baseCol;c.beginPath();c.ellipse(petioleX,0,petNodeRx,petNodeRy,0,0,Math.PI*2);c.fill();
   c.strokeStyle=darkChitin;c.lineWidth=.7;c.stroke();
   c.restore();

   // 4. MESOSOMA (Alitrunk / Thorax)
   const mesoX=isQueen?-.2:isPrincess?-.2:isDrone?-.2:(isSuper||isSoldier)?-.2:isMajor?-.2:0;
   const mesoRx=isQueen?4.5:isPrincess?3.8:isDrone?2.6:(isSuper||isSoldier)?3.4:isMajor?3.0:isMinor?2.0:2.5;
   const mesoRy=isQueen?3.4:isPrincess?2.8:isDrone?1.9:(isSuper||isSoldier)?2.5:isMajor?2.3:isMinor?1.5:1.9;

   c.save();c.fillStyle=baseCol;c.strokeStyle=darkChitin;c.lineWidth=.9;
   c.beginPath();c.ellipse(mesoX,0,mesoRx,mesoRy,0,0,Math.PI*2);c.fill();c.stroke();
   c.strokeStyle=darkChitin;c.lineWidth=.5;
   c.beginPath();c.moveTo(mesoX+mesoRx*.3,-mesoRy*.85);c.quadraticCurveTo(mesoX+mesoRx*.1,0,mesoX+mesoRx*.3,mesoRy*.85);
   c.moveTo(mesoX-mesoRx*.4,-mesoRy*.75);c.quadraticCurveTo(mesoX-mesoRx*.2,0,mesoX-mesoRx*.4,mesoRy*.75);c.stroke();
   c.restore();

   // 5. ALATE FOLDED WINGS (Princess and Drone)
   if(isPrincess||isDrone){
    c.save();
    const wingLen=isPrincess?18.0:13.5,wingWidth=isPrincess?3.6:2.6;
    for(const side of[-1,1]){
     c.beginPath();c.moveTo(mesoX+1.0,side*.8);c.quadraticCurveTo(mesoX-wingLen*.5,side*(wingWidth*1.2),mesoX-wingLen,side*.5);
     c.quadraticCurveTo(mesoX-wingLen*.6,0,mesoX+1.0,side*.8);c.closePath();
     c.fillStyle='rgba(215,235,250,0.42)';c.fill();c.strokeStyle='rgba(150,180,205,0.65)';c.lineWidth=.5;c.stroke();
     c.beginPath();c.moveTo(mesoX+.8,side*.8);c.lineTo(mesoX-wingLen*.75,side*(wingWidth*.7));
     c.moveTo(mesoX-wingLen*.3,side*.6);c.lineTo(mesoX-wingLen*.55,side*.3);c.stroke();
    }
    c.restore();
   }

   // 6. CEPHALON (Head Capsule, Compound Eyes & Ocelli)
   const isStriking=(a.lastStrike!==undefined&&(time-a.lastStrike)<0.35);
   const attackCycle=isStriking?Math.sin(((time-a.lastStrike)/0.35)*Math.PI):0;
   const lungeX=isStriking?attackCycle*2.2:0;
   const headX=(isQueen?6.2:isPrincess?5.2:isDrone?3.4:(isSuper||isSoldier)?6.5:isMajor?5.4:isMinor?3.5:4.2)+lungeX;
   const headRx=isQueen?3.2:isPrincess?2.6:isDrone?1.8:isSuper?5.2:isMajor?3.8:isSoldier?4.2:isMinor?1.8:2.2;
   const headRy=isQueen?3.0:isPrincess?2.4:isDrone?1.8:isSuper?4.8:isMajor?3.5:isSoldier?3.8:isMinor?1.7:2.1;

   c.save();c.fillStyle=baseCol;c.strokeStyle=darkChitin;c.lineWidth=.9;
   if(isSuper||isSoldier||isMajor){
    c.beginPath();c.moveTo(headX+headRx*.8,0);c.quadraticCurveTo(headX+headRx*.6,headRy,headX-headRx*.5,headRy);
    c.quadraticCurveTo(headX-headRx,headRy*.6,headX-headRx*.8,0);
    c.quadraticCurveTo(headX-headRx,-headRy*.6,headX-headRx*.5,-headRy);
    c.quadraticCurveTo(headX+headRx*.6,-headRy,headX+headRx*.8,0);c.closePath();c.fill();c.stroke();
    c.strokeStyle=darkChitin;c.lineWidth=.6;c.beginPath();c.moveTo(headX-headRx*.75,0);c.lineTo(headX+headRx*.2,0);c.stroke();
   }else{
    c.beginPath();c.ellipse(headX,0,headRx,headRy,0,0,Math.PI*2);c.fill();c.stroke();
   }
   const eyeX=headX+(isDrone?.2:headRx*.15),eyeY=headRy*(isDrone?.85:.78),eyeRx=isDrone?1.2:.85,eyeRy=isDrone?1.1:.65;
   for(const side of[-1,1]){
    c.fillStyle='#0a0705';c.beginPath();c.ellipse(eyeX,side*eyeY,eyeRx,eyeRy,side*.2,0,Math.PI*2);c.fill();
    c.fillStyle='#ffffffaa';c.beginPath();c.arc(eyeX-.2,side*eyeY-side*.2,.3,0,Math.PI*2);c.fill();
   }
   if(isQueen||isPrincess||isDrone){
    c.fillStyle='#f0c040';const ocX=headX-headRx*.3;
    c.beginPath();c.arc(ocX+.5,0,.38,0,Math.PI*2);c.arc(ocX,-.6,.32,0,Math.PI*2);c.arc(ocX,.6,.32,0,Math.PI*2);c.fill();
   }
   c.restore();

   // 7. GENICULATE (ELBOWED) ANTENNAE
   const antRootX=headX+headRx*.55,antRootY=headRy*.32,antTwitch=a.alive?Math.sin(time*9)*.35:0;
   const scapeLen=isQueen?5.8:(isSoldier||isSuper)?5.2:isMinor?3.4:4.4;
   const funLen=isQueen?6.2:(isSoldier||isSuper)?5.6:isMinor?3.8:4.8;
   c.save();c.strokeStyle='#221911';c.lineWidth=isQueen||isSuper?1.0:.75;
   for(const side of[-1,1]){
    const elbowX=antRootX+scapeLen*.7,elbowY=side*(antRootY+scapeLen*.75)+side*antTwitch*.5;
    const tipX=elbowX+funLen*.75+antTwitch,tipY=elbowY-side*(funLen*.4);
    c.beginPath();c.moveTo(antRootX,side*antRootY);c.lineTo(elbowX,elbowY);c.lineTo(tipX,tipY);c.stroke();
    c.fillStyle='#221911';c.beginPath();c.arc(tipX,tipY,.45,0,Math.PI*2);c.fill();
   }
   c.restore();

   // 8. MANDIBLES & COMBAT ATTACK ANIMATION
   c.save();const mandX=headX+headRx*.8;
   const biteAngle=isStriking?(attackCycle*0.45+0.1):(a.state==='digging'?Math.sin(time*16)*0.2:0);
   if(isSuper||isSoldier){
    const jawLen=isSuper?7.2:5.8;c.strokeStyle='#180e07';c.lineWidth=isSuper?1.6:1.3;c.fillStyle='#2b160a';
    for(const side of[-1,1]){
     c.save();c.translate(mandX,side*(headRy*.45));c.rotate(-side*biteAngle);
     c.beginPath();c.moveTo(0,0);c.quadraticCurveTo(jawLen*.9,side*(headRy*.4),jawLen,-side*.2);c.stroke();
     if(isSuper){c.beginPath();c.moveTo(jawLen*.45,0);c.lineTo(jawLen*.5,side*.2);c.stroke();}
     c.restore();
    }
   }else if(isMajor){
    c.fillStyle='#2b160a';c.strokeStyle='#140c06';c.lineWidth=1.0;
    for(const side of[-1,1]){
     c.save();c.translate(mandX,side*.5);c.rotate(-side*biteAngle);
     c.beginPath();c.moveTo(0,0);c.lineTo(3.8,side*.2);c.lineTo(0,side*(headRy*.4));c.closePath();c.fill();c.stroke();
     c.restore();
    }
   }else{
    const mandLen=isQueen?2.8:isMinor?1.4:2.0;c.fillStyle='#2b160a';c.strokeStyle='#140c06';c.lineWidth=.7;
    for(const side of[-1,1]){
     c.save();c.translate(mandX,side*.4);c.rotate(-side*biteAngle);
     c.beginPath();c.moveTo(0,0);c.lineTo(mandLen,side*.1);c.lineTo(0,side*(headRy*.35));c.closePath();c.fill();c.stroke();
     c.restore();
    }
   }
   if(isStriking&&attackCycle>0.4){
    const sparkLen=isSuper?8.2:isSoldier?6.8:4.2;
    c.strokeStyle='#ffe480';c.lineWidth=1.2;
    c.beginPath();c.arc(mandX+sparkLen,0,3.0,-0.8,0.8);c.stroke();
    c.fillStyle='#ffffff';
    c.beginPath();c.arc(mandX+sparkLen+1.4,-1.0,0.7,0,Math.PI*2);c.arc(mandX+sparkLen+1.1,1.2,0.6,0,Math.PI*2);c.fill();
   }
   c.restore();

   // 9. CARRIED RESOURCE / ENTITY
   if(a.carry){
    const carryX=mandX+(isSuper?6.5:isSoldier?5.5:3.0);
    c.save();
    if(a.carry.type==='water'){
     const wGrd=c.createRadialGradient(carryX-.6,-.6,.3,carryX,0,2.6);
     wGrd.addColorStop(0,'#a5e4f8');wGrd.addColorStop(.5,'#4aa8d8');wGrd.addColorStop(1,'#1b6ea8');
     c.fillStyle=wGrd;c.beginPath();c.arc(carryX,0,2.4,0,Math.PI*2);c.fill();
     c.strokeStyle='#8de0f788';c.lineWidth=.6;c.stroke();
     c.fillStyle='#ffffffbb';c.beginPath();c.arc(carryX-.8,-.8,.7,0,Math.PI*2);c.fill();
    }else if(a.carry.type==='corpse'){
     const cr=a.carry.creature||sim.creatures.find(x=>x.id===a.carry.creatureId);
     const sp=cr?.species||'weevil',d=Species[sp]||{visualScale:1,color:'#815a39'};
     c.translate(carryX,0);c.rotate(Math.PI/2);
     const crScale=(cr?.size||1)*(d.visualScale||1)*0.75;
     c.scale(crScale,crScale);
     c.fillStyle=d.color||'#815a39';c.strokeStyle='#241a14';c.lineWidth=0.7;
     if(sp==='worm'||sp==='grub'){
      c.beginPath();c.ellipse(0,0,5.2,2.6,0,0,Math.PI*2);c.fill();c.stroke();
     }else if(sp==='mite'){
      c.fillStyle='#a6443c';c.beginPath();c.ellipse(0,0,3.2,2.4,0,0,Math.PI*2);c.fill();c.stroke();
     }else if(sp==='isopod'){
      c.fillStyle='#74766b';c.beginPath();c.ellipse(0,0,4.6,3.2,0,0,Math.PI*2);c.fill();c.stroke();
     }else{
      c.beginPath();c.ellipse(0,0,4.2,2.8,0,0,Math.PI*2);c.fill();c.stroke();
     }
    }else if(a.carry.type==='seed'){
     c.translate(carryX,0);c.fillStyle='#c9b965';c.strokeStyle='#6e6328';c.lineWidth=0.7;
     c.beginPath();c.ellipse(0,0,3.2,2.2,0.2,0,Math.PI*2);c.fill();c.stroke();
    }else if(a.carry.type==='food'){
     c.fillStyle='#d2bf68';c.strokeStyle='#7c6d2c';c.lineWidth=.7;c.beginPath();c.ellipse(carryX,0,2.4,1.8,.3,0,Math.PI*2);c.fill();c.stroke();
    }else{
     c.fillStyle='#a06e40';c.strokeStyle='#4e331b';c.lineWidth=.7;c.beginPath();c.ellipse(carryX,0,2.2,1.9,0,0,Math.PI*2);c.fill();c.stroke();
    }
    c.restore();
   }

   // 10. HUNGER / THIRST ALERT
   if(a.colonyId===1&&!isQueen&&(a.foodNeed<=0||a.waterNeed<=0)){c.fillStyle='#ed4545';c.beginPath();c.arc(0,-9,2.4,0,Math.PI*2);c.fill();}
   c.restore();
  }
  segmentedCreature(cr,z,d){
   const c=this.ctx,kind=cr.species,bodyTrail=cr.bodyTrail||[];
   if(bodyTrail.length<2)return;

   const scale=z*(cr.size||1)*(d.visualScale||1),spacing=d.segmentSpacing||.7,count=Math.floor((d.bodyLength||6)/spacing)+1;

   const trailLen=bodyTrail.length,cumDist=new Float32Array(trailLen);
   for(let i=1;i<trailLen;i++){cumDist[i]=cumDist[i-1]+Math.hypot(bodyTrail[i].x-bodyTrail[i-1].x,bodyTrail[i].y-bodyTrail[i-1].y);}
   const maxTrailDist=cumDist[trailLen-1];

   const along=target=>{
    if(target<=0)return bodyTrail[0];
    if(target>=maxTrailDist)return bodyTrail[trailLen-1];
    let low=0,high=trailLen-1;
    while(low<=high){const mid=(low+high)>>1;if(cumDist[mid]<target)low=mid+1;else high=mid-1;}
    const idx=Math.min(trailLen-1,Math.max(1,low)),d0=cumDist[idx-1],d1=cumDist[idx],segLen=d1-d0,t=segLen>.0001?Math.max(0,Math.min(1,(target-d0)/segLen)):0,a=bodyTrail[idx-1],b=bodyTrail[idx];
    return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
   };

   const distMoved=Math.hypot((cr.x??0)-(cr.prevX??cr.x),(cr.y??0)-(cr.prevY??cr.y));
   const dHead=distMoved*(1-Math.min(1,Math.max(0,this.ecoAlpha??1)));

   const moving=cr.alive&&Boolean(cr.path?.length||distMoved>0.001),animTime=moving?this.time*4:0;
   const distances=new Float32Array(count);
   distances[0]=0;
   for(let i=1;i<count;i++){
    const wave=Math.sin(animTime*(kind==='worm'?3.2:2.2)-i*.82),stretch=kind==='worm'?.10:.06;
    distances[i]=distances[i-1]+spacing*(1+wave*stretch);
   }

   const headPt=along(dHead),root=this.screen(headPt.x,headPt.y);
   c.save();c.translate(root.x,root.y);c.globalAlpha=cr.alive?1:.42;

   for(let i=count-1;i>=0;i--){
    const targetDist=dHead+distances[i],at=along(targetDist),p=this.screen(at.x,at.y);
    const pAhead=along(Math.max(0,targetDist-0.12)),pBehind=along(targetDist+0.12);
    const sAhead=this.screen(pAhead.x,pAhead.y),sBehind=this.screen(pBehind.x,pBehind.y);
    const tdx=sAhead.x-sBehind.x,tdy=sAhead.y-sBehind.y;
    const angle=(Math.hypot(tdx,tdy)>0.1)?Math.atan2(tdy,tdx):(cr.angle||0);

    const wave=Math.sin(animTime*(kind==='worm'?3.2:2.2)-i*.82);
    const longScale=1+(kind==='worm'?.16:.08)*wave,thickScale=1-(kind==='worm'?.14:.07)*wave;

    c.save();c.translate(p.x-root.x,p.y-root.y);c.rotate(angle);
    if(kind==='worm'){
     const isClitellum=(i>=2&&i<=4),isHead=(i===0);
     const segLong=(isHead?2.8:isClitellum?2.5:2.2)*scale*longScale;
     const segThick=(isClitellum?3.6:isHead?2.6:2.95)*scale*thickScale;
     c.fillStyle=isClitellum?'#d4a298':(i%2===0?'#b8827a':'#c8958c');
     c.strokeStyle='#2b1e19';c.lineWidth=0.6*scale;
     c.beginPath();c.ellipse(0,0,segLong,segThick,0,0,Math.PI*2);c.fill();c.stroke();
     if(!isClitellum&&!isHead){
      c.strokeStyle='#73443e';c.lineWidth=0.4*scale;
      c.beginPath();c.ellipse(0,0,segLong*0.5,segThick*0.95,0,0,Math.PI*2);c.stroke();
     }
     if(isHead){
      c.strokeStyle='#421a14';c.lineWidth=0.8*scale;
      c.beginPath();c.moveTo(segLong*0.5,0);c.lineTo(segLong*0.95,0);c.stroke();
     }
    }else{
     const isHead=(i===0),isThorax=(i>=1&&i<=3),isRear=(i>=count-2);
     const segLong=(isHead?3.2:2.75)*scale*longScale;
     const segThick=(isHead?4.2:5.6)*scale*thickScale;
     c.fillStyle=isHead?'#662d1b':isRear?'#b0a37c':(i%2===0?'#ded4a8':'#e6dcba');
     c.strokeStyle='#221a14';c.lineWidth=0.7*scale;
     c.beginPath();c.ellipse(0,0,segLong,segThick,0,0,Math.PI*2);c.fill();c.stroke();
     if(isHead){
      c.strokeStyle='#381308';c.lineWidth=0.7*scale;
      c.beginPath();c.moveTo(-segLong*0.6,0);c.lineTo(segLong*0.4,0);c.stroke();
      c.fillStyle='#1c0804';
      for(const side of[-1,1]){
       c.beginPath();c.moveTo(segLong*0.7,side*segThick*0.25);c.lineTo(segLong*1.3,side*segThick*0.1);c.lineTo(segLong*0.7,side*0.5);c.closePath();c.fill();
       c.strokeStyle='#381308';c.lineWidth=0.6*scale;
       c.beginPath();c.moveTo(segLong*0.5,side*segThick*0.7);c.lineTo(segLong*0.9,side*segThick*0.95);c.stroke();
      }
     }else{
      if(i===1||(i>=4&&i<count-1)){
       c.fillStyle='#4c2614';
       for(const side of[-1,1]){c.beginPath();c.arc(0,side*segThick*0.75,0.45*scale,0,Math.PI*2);c.fill();}
      }
      if(isThorax){
       const step=moving?Math.sin(this.time*15+i*2.1)*0.8*scale:0;
       c.strokeStyle='#3a1e12';c.lineWidth=0.9*scale;
       for(const side of[-1,1]){
        const kx=(-1.2+step)*scale,ky=side*(segThick*0.75+2.0*scale);
        const tx=(-1.8+step)*scale,ty=ky+side*1.6*scale;
        c.beginPath();c.moveTo(-0.2*scale,side*segThick*0.5);c.lineTo(kx,ky);c.lineTo(tx,ty);c.stroke();
        c.lineWidth=0.5*scale;c.beginPath();c.moveTo(tx,ty);c.lineTo(tx-0.5*scale,ty+side*0.6*scale);c.stroke();
       }
      }
     }
    }
    c.restore();
   }
   c.restore();
  }
 hercules(cr,moving,scale,z){
  const c=this.ctx,seed=cr.id?Number(String(cr.id).replace(/\D/g,''))||77:77;
  const rnd=i=>{let t=(seed+i*374761393)^(i*668265263);t=Math.imul(t^t>>>15,t|1);return((t^t>>>14)>>>0)/4294967296;};

  // 1. LEGS (6 robust articulated scarab legs with stout femora, spined tibiae, and hooked tarsal claws)
  const leg=(ax,ay,side,dir,idx,femLen=10,tibLen=14,tarLen=8)=>{
   const phase=moving?Math.sin(this.time*14+idx*Math.PI+side)*2.8:0;
   const kx=ax+dir*(femLen*.8)+phase*.5,ky=ay+side*(femLen*1.2);
   const tx=kx+dir*(tibLen*.6)+phase,ty=ky+side*(tibLen*.85);
   const cx=tx+dir*(tarLen*.7)+phase*.2,cy=ty+side*(tarLen*.7);

   c.save();
   // Femur
   c.strokeStyle='#1a130e';c.lineWidth=2.6;c.beginPath();c.moveTo(ax,ay);c.lineTo(kx,ky);c.stroke();
   // Spined Tibia
   c.strokeStyle='#241a12';c.lineWidth=1.9;c.beginPath();c.moveTo(kx,ky);c.lineTo(tx,ty);c.stroke();
   c.lineWidth=.9;c.strokeStyle='#100a06';
   for(let s=.35;s<=.85;s+=.25){
    const sx=kx+(tx-kx)*s,sy=ky+(ty-ky)*s;
    c.beginPath();c.moveTo(sx,sy);c.lineTo(sx+dir*1.8,sy+side*2.2);c.stroke();
   }
   // Tarsus & Hooked Dual Claws
   c.strokeStyle='#120d09';c.lineWidth=1.1;c.beginPath();c.moveTo(tx,ty);c.lineTo(cx,cy);c.stroke();
   c.lineWidth=.7;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+dir*1.5-.5,cy+side*1.8);c.moveTo(cx,cy);c.lineTo(cx+dir*1.5+.8,cy+side*1.2);c.stroke();
   c.restore();
  };

  for(const side of[-1,1]){
   leg(8,side*7,side,1,0,11,14,8);    // Front
   leg(3,side*8.5,side,0,1,10,15,8);   // Mid
   leg(-4,side*8.5,side,-1,2,12,17,9); // Hind
  }

  // 2. ABDOMEN BASE & PYGIDIUM (exposed posterior tip behind elytra)
  c.fillStyle='#1c1510';c.strokeStyle='#0d0906';c.lineWidth=1.0;
  c.beginPath();c.ellipse(-18,0,8,8.5,0,0,Math.PI*2);c.fill();c.stroke();

  // 3. ELYTRA (Wing Covers)
  // Characteristic Dynastes hercules olive-amber carapace with scattered dark spots
  const elYMax=15;
  c.save();
  c.beginPath();
  c.moveTo(2,-elYMax*.9);
  c.quadraticCurveTo(-10,-elYMax*1.15,-23,-elYMax*.3);
  c.quadraticCurveTo(-26,0,-23,elYMax*.3);
  c.quadraticCurveTo(-10,elYMax*1.15,2,elYMax*.9);
  c.quadraticCurveTo(3,0,2,-elYMax*.9);
  c.closePath();

  const elyGrd=c.createLinearGradient(0,-elYMax,0,elYMax);
  elyGrd.addColorStop(0,'#a69854');elyGrd.addColorStop(.18,'#d6c880');elyGrd.addColorStop(.5,'#c4b46a');elyGrd.addColorStop(.82,'#d6c880');elyGrd.addColorStop(1,'#a69854');
  c.fillStyle=elyGrd;c.fill();
  c.strokeStyle='#2a2214';c.lineWidth=1.4;c.stroke();

  // Distinctive dark irregular spots/speckles
  c.fillStyle='#221e14';
  const spots=[[-17,-7,2.2,1.8],[-14,-11,1.8,1.5],[-9,-5,2.4,2.0],[-7,-11,2.0,1.6],[-3,-7,1.9,1.5],[-12,-2,1.7,1.4],[-17,7,2.3,1.9],[-14,10,1.9,1.6],[-9,5,2.2,1.9],[-7,12,1.8,1.5],[-3,8,2.1,1.6],[-12,3,1.6,1.3],[-20,0,1.5,1.2]];
  for(let i=0;i<spots.length;i++){
   const[sx,sy,srx,sry]=spots[i],jx=(rnd(i*3)-.5)*2,jy=(rnd(i*3+1)-.5)*2;
   c.beginPath();c.ellipse(sx+jx,sy+jy,srx,sry,rnd(i*7)*2,0,Math.PI*2);c.fill();
  }

  // Elytral Suture (clean longitudinal midline split)
  c.strokeStyle='#18120c';c.lineWidth=1.3;c.beginPath();c.moveTo(2,0);c.lineTo(-24,0);c.stroke();
  c.strokeStyle='#e8deb044';c.lineWidth=.7;c.beginPath();c.moveTo(2,.7);c.lineTo(-23,.7);c.stroke();
  c.restore();

  // 4. SCUTELLUM (triangular black chitin plate at base of suture)
  c.fillStyle='#140e0a';c.strokeStyle='#090604';c.lineWidth=1.0;
  c.beginPath();c.moveTo(2.5,-3.2);c.lineTo(2.5,3.2);c.lineTo(-2.2,0);c.closePath();c.fill();c.stroke();

  // 5. PRONOTUM (Glossy black/deep mahogany thoracic shield)
  c.save();
  c.beginPath();c.moveTo(1,-12);c.quadraticCurveTo(8,-14,13,-8);c.quadraticCurveTo(14.5,0,13,8);c.quadraticCurveTo(8,14,1,12);c.quadraticCurveTo(2,0,1,-12);c.closePath();
  const proGrd=c.createLinearGradient(1,-13,13,13);
  proGrd.addColorStop(0,'#100c08');proGrd.addColorStop(.3,'#2a1e16');proGrd.addColorStop(.5,'#3a2b20');proGrd.addColorStop(.8,'#1e1510');proGrd.addColorStop(1,'#0c0806');
  c.fillStyle=proGrd;c.fill();c.strokeStyle='#0a0705';c.lineWidth=1.4;c.stroke();
  // Glossy carapace reflection
  c.strokeStyle='#ffffff22';c.lineWidth=1.5;c.beginPath();c.arc(7,-6,5,-.8,1.2);c.stroke();
  c.restore();

  // 6. HEAD CAPSULE & SENSORY ORGANS
  c.fillStyle='#18120d';c.strokeStyle='#0a0705';c.lineWidth=1.2;
  c.beginPath();c.ellipse(15.5,0,4.5,5.8,0,0,Math.PI*2);c.fill();c.stroke();
  // Compound eyes
  for(const side of[-1,1]){
   c.fillStyle='#050302';c.beginPath();c.ellipse(14.5,side*5.2,1.8,1.3,side*.3,0,Math.PI*2);c.fill();
   c.fillStyle='#ffffff66';c.beginPath();c.arc(14.2,side*5.2-.4,.5,0,Math.PI*2);c.fill();
  }
  // Scarab Lamellate Antennae (elbowed with fan clubs)
  for(const side of[-1,1]){
   c.save();c.strokeStyle='#18120d';c.lineWidth=1.1;c.beginPath();c.moveTo(16,side*3.5);c.lineTo(19,side*7.5);c.stroke();
   c.fillStyle='#7a4e28';c.strokeStyle='#3a2010';c.lineWidth=.6;
   for(let l=-1;l<=1;l++){c.beginPath();c.ellipse(19.8+l*.9,side*8.2+l*side*.6,1.5,.7,side*.4,0,Math.PI*2);c.fill();c.stroke();}
   c.restore();
  }
  // Maxillary palps
  c.strokeStyle='#4a2f1b';c.lineWidth=.9;
  for(const side of[-1,1]){c.beginPath();c.moveTo(18,side*1.5);c.lineTo(21,side*2.5);c.stroke();}

  // 7. ICONIC DUAL PINCER HORNS
  // A. Cephalic (Head) Horn (lower horn, curving upward)
  c.save();
  c.beginPath();c.moveTo(18,-2.0);c.quadraticCurveTo(28,-2.4,38,-.6);c.quadraticCurveTo(40.5,-.2,41,-1.8);c.quadraticCurveTo(39,.8,36,1.2);
  c.lineTo(31,1.4);c.lineTo(30,2.4);c.lineTo(28.5,1.4);c.quadraticCurveTo(24,1.8,18,2.0);c.closePath();
  c.fillStyle='#1c140e';c.fill();c.strokeStyle='#080503';c.lineWidth=1.0;c.stroke();
  c.restore();

  // B. Thoracic (Pronotal) Horn (massive overarching top horn)
  c.save();
  c.beginPath();c.moveTo(8,-2.8);c.quadraticCurveTo(20,-3.8,34,-2.6);c.quadraticCurveTo(46,-1.2,50,0);
  c.quadraticCurveTo(51,1.0,48.5,2.2);c.quadraticCurveTo(45.5,1.6,40,.4);
  c.lineTo(36.5,2.0);c.lineTo(35,.2);c.lineTo(28,.2);c.lineTo(26.5,2.6);c.lineTo(25,.3);c.quadraticCurveTo(16,2.2,8,2.8);c.closePath();
  const hornGrd=c.createLinearGradient(8,0,51,0);hornGrd.addColorStop(0,'#2d1e15');hornGrd.addColorStop(.5,'#19110b');hornGrd.addColorStop(1,'#0d0805');
  c.fillStyle=hornGrd;c.fill();c.strokeStyle='#080503';c.lineWidth=1.2;c.stroke();
  // Velvety reddish-amber setae (hairs) along underside
  c.strokeStyle='#b85c1c';c.lineWidth=1.1;c.beginPath();c.moveTo(12,1.0);c.quadraticCurveTo(24,.2,38,-.3);c.stroke();
  c.strokeStyle='#994a14';c.lineWidth=.7;
  for(let hx=13;hx<=37;hx+=2.2){c.beginPath();c.moveTo(hx,.5);c.lineTo(hx-.8,1.8);c.stroke();}
  // Dorsal highlight along horn crest
  c.strokeStyle='#ffffff25';c.lineWidth=1.0;c.beginPath();c.moveTo(10,-2.0);c.quadraticCurveTo(24,-2.8,42,-1.0);c.stroke();
  c.restore();
 }
  weevil(cr,moving,scale,z){
   const c=this.ctx,shade=cr.colorVariation||1,darkChitin='#24140b';

   // 1. LEGS (6 stout, heavily articulated legs with swollen profemora and hooked dual claws)
   const leg=(ax,ay,side,dir,idx,femL=7.5,tibL=8.5,tarL=5.0)=>{
    const phase=moving?Math.sin(this.time*15+idx*Math.PI+side)*1.8:0;
    const kx=ax+dir*(femL*0.6)+phase*0.5,ky=ay+side*(femL*0.9);
    const tx=kx+dir*(tibL*0.55)+phase,ty=ky+side*(tibL*0.85);
    const cx=tx+dir*(tarL*0.6)+phase*0.2,cy=ty+side*(tarL*0.65);

    c.save();
    c.strokeStyle='#321f13';c.lineWidth=(idx===0?2.4:2.0);c.beginPath();c.moveTo(ax,ay);c.lineTo(kx,ky);c.stroke();
    c.strokeStyle='#432a1b';c.lineWidth=1.4;c.beginPath();c.moveTo(kx,ky);c.lineTo(tx,ty);c.stroke();
    c.lineWidth=0.7;c.beginPath();c.moveTo(tx,ty);c.lineTo(tx-dir*0.8,ty+side*1.0);c.stroke();
    c.strokeStyle='#22150d';c.lineWidth=1.0;c.beginPath();c.moveTo(tx,ty);c.lineTo(cx,cy);c.stroke();
    c.lineWidth=0.6;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+dir*1.2-0.4,cy+side*1.3);c.moveTo(cx,cy);c.lineTo(cx+dir*1.2+0.5,cy+side*0.9);c.stroke();
    c.restore();
   };

   for(const side of[-1,1]){
    leg(3.5,side*3.5,side,1,0,7.5,8.5,5.0);
    leg(0.0,side*4.2,side,0,1,7.0,9.0,5.0);
    leg(-4.0,side*4.0,side,-1,2,8.0,10.0,5.5);
   }

   // 2. ABDOMEN BASE / PYGIDIUM
   c.fillStyle='#26170d';c.beginPath();c.ellipse(-11.5,0,3.5,4.0,0,0,Math.PI*2);c.fill();

   // 3. HIGH-DOMED ELYTRA (Carapace with longitudinal punctate striae)
   const elYMax=7.8;
   c.save();
   c.beginPath();
   c.moveTo(1.5,-elYMax*0.85);
   c.quadraticCurveTo(-5.0,-elYMax*1.15,-12.5,-elYMax*0.35);
   c.quadraticCurveTo(-14.0,0,-12.5,elYMax*0.35);
   c.quadraticCurveTo(-5.0,elYMax*1.15,1.5,elYMax*0.85);
   c.quadraticCurveTo(2.0,0,1.5,-elYMax*0.85);
   c.closePath();

   const elyGrd=c.createLinearGradient(0,-elYMax,0,elYMax);
   elyGrd.addColorStop(0,'#5a3821');elyGrd.addColorStop(0.2,'#855938');elyGrd.addColorStop(0.5,'#734a2c');elyGrd.addColorStop(0.8,'#855938');elyGrd.addColorStop(1,'#5a3821');
   c.fillStyle=elyGrd;c.fill();c.strokeStyle=darkChitin;c.lineWidth=1.2;c.stroke();

   // Longitudinal Punctate Striae (sunken puncture rows)
   c.strokeStyle='#3e2413';c.lineWidth=0.7;
   for(const side of[-1,1]){
    for(let s=1;s<=4;s++){
     const sy=side*(s*1.6);
     c.beginPath();c.moveTo(1.2,sy*0.8);c.quadraticCurveTo(-5.0,sy*1.12,-12.0,sy*0.4);c.stroke();
     c.fillStyle='#2a160a';
     for(let px=-10;px<=0;px+=2.4){
      const py=side*(s*1.6*(1+0.12*Math.sin((px+5)*0.3)));
      c.fillRect(px-0.3,py-0.3,0.7,0.7);
     }
    }
   }

   // Elytral Suture
   c.strokeStyle=darkChitin;c.lineWidth=1.1;c.beginPath();c.moveTo(1.5,0);c.lineTo(-13.0,0);c.stroke();
   c.strokeStyle='#ffffff20';c.lineWidth=0.6;c.beginPath();c.moveTo(1.0,0.5);c.lineTo(-12.0,0.5);c.stroke();
   c.restore();

   // 4. SCUTELLUM
   c.fillStyle='#26170d';c.beginPath();c.moveTo(1.8,-1.8);c.lineTo(1.8,1.8);c.lineTo(-0.8,0);c.closePath();c.fill();c.strokeStyle=darkChitin;c.lineWidth=0.7;c.stroke();

   // 5. PRONOTUM (Thoracic shield with micro-punctures)
   c.save();
   c.beginPath();c.moveTo(1.0,-6.0);c.quadraticCurveTo(4.0,-6.8,7.5,-4.2);c.quadraticCurveTo(8.5,0,7.5,4.2);c.quadraticCurveTo(4.0,6.8,1.0,6.0);c.closePath();
   const proGrd=c.createLinearGradient(1,-6,8,6);
   proGrd.addColorStop(0,'#53341e');proGrd.addColorStop(0.5,'#784c2d');proGrd.addColorStop(1,'#482c18');
   c.fillStyle=proGrd;c.fill();c.strokeStyle=darkChitin;c.lineWidth=1.1;c.stroke();
   c.fillStyle='#2c180c';
   for(let i=0;i<8;i++){
    const dotX=2.5+(i%3)*1.8,dotY=(i<4?-2.2-(i%2)*1.6:2.2+(i%2)*1.6);
    c.fillRect(dotX,dotY,0.6,0.6);
   }
   c.restore();

   // 6. HEAD & DOWNWARD-CURVED ROSTRUM (THE ICONIC SNOUT)
   c.save();
   c.fillStyle='#482c18';c.strokeStyle=darkChitin;c.lineWidth=0.9;
   c.beginPath();c.ellipse(8.5,0,2.0,3.2,0,0,Math.PI*2);c.fill();c.stroke();

   for(const side of[-1,1]){
    c.fillStyle='#0a0604';c.beginPath();c.ellipse(8.2,side*2.8,1.2,0.9,side*0.2,0,Math.PI*2);c.fill();
    c.fillStyle='#ffffff88';c.beginPath();c.arc(8.0,side*2.8-side*0.2,0.35,0,Math.PI*2);c.fill();
   }

   // The Long Curved Rostrum
   c.beginPath();c.moveTo(9.5,-1.6);c.quadraticCurveTo(15.0,-1.8,20.5,-0.6);c.lineTo(21.0,0.6);c.quadraticCurveTo(15.0,1.8,9.5,1.6);c.closePath();
   const rosGrd=c.createLinearGradient(9,0,21,0);
   rosGrd.addColorStop(0,'#53341e');rosGrd.addColorStop(0.6,'#6b4327');rosGrd.addColorStop(1,'#341f12');
   c.fillStyle=rosGrd;c.fill();c.strokeStyle=darkChitin;c.lineWidth=0.9;c.stroke();

   // Tiny chewing mouthparts at snout tip
   c.fillStyle='#1c0f08';c.beginPath();c.moveTo(20.8,-0.6);c.lineTo(22.2,0);c.lineTo(20.8,0.6);c.closePath();c.fill();

   // 7. GENICULATE ANTENNAE INSERTED MID-ROSTRUM
   const scrobeX=14.5;
   for(const side of[-1,1]){
    const scapeEndX=scrobeX+2.8,scapeEndY=side*4.8,clubEndX=scapeEndX+3.2,clubEndY=side*3.4;
    c.strokeStyle='#27170c';c.lineWidth=0.8;
    c.beginPath();c.moveTo(scrobeX,side*0.8);c.lineTo(scapeEndX,scapeEndY);c.stroke();
    c.beginPath();c.moveTo(scapeEndX,scapeEndY);c.lineTo(clubEndX,clubEndY);c.stroke();
    c.fillStyle='#482c18';c.strokeStyle='#201108';c.lineWidth=0.5;
    c.beginPath();c.ellipse(clubEndX+0.6,clubEndY,1.4,0.8,side*0.4,0,Math.PI*2);c.fill();c.stroke();
   }
   c.restore();
  }

  spider(cr,moving,scale,z,isBaby){
   const c=this.ctx,shade=cr.colorVariation||1;
   const baseCol=isBaby?adjustColor('#6b5d56',shade):adjustColor('#3d322f',shade);
   const darkCol=isBaby?'#302723':'#181210',highlight='#ffffff20';

   // 1. EIGHT ARTICULATED LEGS on alternating tetrapod gait
   const legAttachments=[
    {ax:7.2,ay:2.8,dir:1.2,span:1.0,idx:0},
    {ax:5.4,ay:4.5,dir:0.6,span:1.2,idx:1},
    {ax:2.8,ay:4.8,dir:-0.4,span:1.25,idx:2},
    {ax:0.5,ay:4.0,dir:-1.3,span:1.4,idx:3}
   ];
   const legBaseLen=isBaby?6.5:12.5;

   for(const side of[-1,1]){
    for(const ld of legAttachments){
     const tetrapod=(ld.idx%2===0?(side>0?0:Math.PI):(side>0?Math.PI:0));
     const swing=moving?Math.sin(this.time*15+tetrapod)*(legBaseLen*0.15):0;
     const lift=moving?Math.max(0,-Math.cos(this.time*15+tetrapod))*1.2:0;
     const L=legBaseLen*ld.span;
     const kx=ld.ax+ld.dir*(L*0.45)+swing*0.5,ky=side*(ld.ay+L*0.55)-side*lift;
     const tx=kx+ld.dir*(L*0.4)+swing,ty=ky+side*(L*0.5);
     const cx=tx+ld.dir*(L*0.25)+swing*0.3,cy=ty+side*(L*0.25);

     c.save();
     c.strokeStyle=darkCol;c.lineWidth=isBaby?1.2:2.0;c.beginPath();c.moveTo(ld.ax,side*ld.ay);c.lineTo(kx,ky);c.stroke();
     c.strokeStyle=baseCol;c.lineWidth=isBaby?0.9:1.4;c.beginPath();c.moveTo(kx,ky);c.lineTo(tx,ty);c.stroke();

     if(!isBaby){
      c.strokeStyle=darkCol;c.lineWidth=0.7;
      for(let sp=0.3;sp<=0.8;sp+=0.25){
       const sx=kx+(tx-kx)*sp,sy=ky+(ty-ky)*sp;
       c.beginPath();c.moveTo(sx,sy);c.lineTo(sx+ld.dir*1.2,sy+side*1.8);c.stroke();
      }
     }

     c.strokeStyle=darkCol;c.lineWidth=isBaby?0.7:1.1;c.beginPath();c.moveTo(tx,ty);c.lineTo(cx,cy);c.stroke();
     c.lineWidth=0.6;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+ld.dir*0.8,cy+side*1.2);c.stroke();
     c.restore();
    }
   }

   // 2. OPISTHOSOMA (Abdomen)
   const opX=isBaby?-5.2:-8.2,opRx=isBaby?5.0:8.2,opRy=isBaby?4.4:7.0;
   c.save();
   c.fillStyle=baseCol;c.strokeStyle=darkCol;c.lineWidth=1.2;
   c.beginPath();c.ellipse(opX,0,opRx,opRy,0,0,Math.PI*2);c.fill();c.stroke();

   // Cardiac mark & chevron patterns
   c.fillStyle=darkCol;
   c.beginPath();c.moveTo(opX+opRx*0.7,0);c.quadraticCurveTo(opX+opRx*0.3,opRy*0.22,opX,0);c.quadraticCurveTo(opX+opRx*0.3,-opRy*0.22,opX+opRx*0.7,0);c.closePath();c.fill();
   c.strokeStyle=darkCol;c.lineWidth=1.0;
   for(let ch=1;ch<=3;ch++){
    const cx=opX-ch*(opRx*0.24);
    c.beginPath();c.moveTo(cx-1.2,-opRy*0.5);c.lineTo(cx+1.2,0);c.lineTo(cx-1.2,opRy*0.5);c.stroke();
   }
   c.strokeStyle=highlight;c.lineWidth=1.0;c.beginPath();c.ellipse(opX,-opRy*0.45,opRx*0.65,opRy*0.35,-0.15,-Math.PI*0.8,-Math.PI*0.2);c.stroke();

   // Spinnerets
   c.fillStyle=darkCol;
   for(const side of[-1,1]){
    c.beginPath();c.moveTo(opX-opRx*0.95,side*1.5);c.lineTo(opX-opRx-(isBaby?1.2:2.2),side*0.8);c.lineTo(opX-opRx*0.95,0);c.closePath();c.fill();
   }
   c.restore();

   // 3. PEDICEL (Waist)
   c.fillStyle=darkCol;c.fillRect(opX+opRx*0.9,-1.2,1.8,2.4);

   // 4. PROSOMA (Cephalothorax)
   const proX=isBaby?2.6:3.8,proRx=isBaby?3.5:5.2,proRy=isBaby?3.1:4.6;
   c.save();
   c.beginPath();
   c.moveTo(proX-proRx*0.8,-proRy*0.6);c.quadraticCurveTo(proX,-proRy*1.05,proX+proRx*0.75,-proRy*0.65);
   c.quadraticCurveTo(proX+proRx,0,proX+proRx*0.75,proRy*0.65);c.quadraticCurveTo(proX,proRy*1.05,proX-proRx*0.8,proRy*0.6);
   c.closePath();
   const proGrd=c.createLinearGradient(proX-proRx,-proRy,proX+proRx,proRy);
   proGrd.addColorStop(0,darkCol);proGrd.addColorStop(0.5,baseCol);proGrd.addColorStop(1,darkCol);
   c.fillStyle=proGrd;c.fill();c.strokeStyle=darkCol;c.lineWidth=1.2;c.stroke();

   // Radial thoracic grooves
   c.strokeStyle=darkCol;c.lineWidth=0.6;
   for(let a=-0.7;a<=0.7;a+=0.35){c.beginPath();c.moveTo(proX,0);c.lineTo(proX+Math.cos(a)*proRx*0.75,Math.sin(a)*proRy*0.85);c.stroke();}
   c.restore();

   // 5. OCULAR CLUSTER (8 Eyes)
   const eyeBaseX=proX+proRx*0.65,ameR=isBaby?0.7:1.1;
   c.save();
   for(const side of[-1,1]){
    c.fillStyle='#050302';c.beginPath();c.arc(eyeBaseX+0.8,side*(isBaby?0.8:1.3),ameR,0,Math.PI*2);c.fill();
    c.fillStyle='#ffffffcc';c.beginPath();c.arc(eyeBaseX+0.6,side*(isBaby?0.8:1.3)-side*0.3,ameR*0.4,0,Math.PI*2);c.fill();
    c.fillStyle='#080503';c.beginPath();c.arc(eyeBaseX+0.3,side*(isBaby?1.8:2.8),ameR*0.75,0,Math.PI*2);c.fill();
    c.fillStyle='#ffffff99';c.beginPath();c.arc(eyeBaseX+0.2,side*(isBaby?1.8:2.8)-side*0.2,ameR*0.3,0,Math.PI*2);c.fill();
    c.fillStyle='#0a0604';c.beginPath();c.arc(eyeBaseX-1.0,side*(isBaby?1.0:1.6),ameR*0.8,0,Math.PI*2);c.fill();
    c.beginPath();c.arc(eyeBaseX-1.4,side*(isBaby?2.2:3.4),ameR*0.75,0,Math.PI*2);c.fill();
   }
   c.restore();

   // 6. CHELICERAE & FANGS
   const chelX=eyeBaseX+1.2;
   c.save();
   for(const side of[-1,1]){
    c.fillStyle=darkCol;c.strokeStyle='#0e0906';c.lineWidth=0.9;
    c.beginPath();c.ellipse(chelX,side*(isBaby?1.2:2.0),isBaby?1.8:3.0,isBaby?1.1:1.8,side*0.15,0,Math.PI*2);c.fill();c.stroke();
    c.strokeStyle='#100604';c.lineWidth=isBaby?0.8:1.4;
    c.beginPath();c.moveTo(chelX+(isBaby?1.2:2.4),side*(isBaby?1.6:2.8));
    c.quadraticCurveTo(chelX+(isBaby?2.5:4.6),side*(isBaby?1.8:3.2),chelX+(isBaby?2.2:4.0),side*0.2);c.stroke();
   }
   c.restore();

   // 7. PEDIPALPS
   const palpRootX=proX+proRx*0.55,palpTwitch=cr.alive?Math.sin(this.time*8)*0.4:0;
   c.save();c.strokeStyle=darkCol;c.lineWidth=isBaby?1.0:1.6;
   for(const side of[-1,1]){
    const p1x=palpRootX+3.0,p1y=side*(isBaby?2.8:4.4),p2x=p1x+(isBaby?2.2:4.0)+palpTwitch,p2y=p1y-side*(isBaby?0.8:1.5);
    c.beginPath();c.moveTo(palpRootX,side*(isBaby?2.0:3.2));c.lineTo(p1x,p1y);c.stroke();
    c.strokeStyle=baseCol;c.lineWidth=isBaby?0.8:1.2;
    c.beginPath();c.moveTo(p1x,p1y);c.lineTo(p2x,p2y);c.stroke();
    c.fillStyle=darkCol;c.beginPath();c.arc(p2x,p2y,isBaby?0.5:0.8,0,Math.PI*2);c.fill();
   }
   c.restore();
  }

  isopod(cr,moving,scale,z){
   const c=this.ctx,shade=cr.colorVariation||1;
   const baseCol=adjustColor('#676a60',shade),darkChitin='#272924',paleBorder='#929688';

   // 1. 14 ARTICULATED LEGS on metachronal ripple wave
   const legXPositions=[5.5,3.8,2.0,0.2,-1.6,-3.4,-5.2];
   for(let i=0;i<legXPositions.length;i++){
    const lx=legXPositions[i];
    const wave=moving?Math.sin(this.time*16-i*0.75)*1.6:0;
    const lift=moving?Math.max(0,-Math.cos(this.time*16-i*0.75))*0.8:0;

    for(const side of[-1,1]){
     const rootY=side*5.4,kneeX=lx+wave*0.6,kneeY=rootY+side*2.5-side*lift;
     const tipX=kneeX+wave*0.4,tipY=kneeY+side*2.2;
     c.save();
     c.strokeStyle='#3e413a';c.lineWidth=1.3;c.beginPath();c.moveTo(lx,rootY);c.lineTo(kneeX,kneeY);c.stroke();
     c.strokeStyle='#5a5e54';c.lineWidth=0.9;c.beginPath();c.moveTo(kneeX,kneeY);c.lineTo(tipX,tipY);c.stroke();
     c.lineWidth=0.6;c.beginPath();c.moveTo(tipX,tipY);c.lineTo(tipX-0.6,tipY+side*0.8);c.stroke();
     c.restore();
    }
   }

   // 2. OVERLAPPING DORSAL ARMOR TERGITES (Pereon 1-7, Pleon, Telson)
   const segWidths=[6.8,7.8,8.4,8.6,8.4,7.8,6.8,5.2,4.2],segX=[6.5,4.6,2.7,0.8,-1.1,-3.0,-4.9,-6.8,-8.6];
   for(let s=segX.length-1;s>=0;s--){
    const sx=segX[s],sw=segWidths[s];
    c.save();
    c.beginPath();
    c.moveTo(sx+1.2,-sw*0.85);c.quadraticCurveTo(sx+1.5,0,sx+1.2,sw*0.85);
    c.lineTo(sx-0.8,sw);c.quadraticCurveTo(sx-0.5,0,sx-0.8,-sw);c.closePath();

    const tGrd=c.createLinearGradient(0,-sw,0,sw);
    tGrd.addColorStop(0,darkChitin);tGrd.addColorStop(0.2,paleBorder);tGrd.addColorStop(0.35,baseCol);tGrd.addColorStop(0.5,'#7b7f73');tGrd.addColorStop(0.65,baseCol);tGrd.addColorStop(0.8,paleBorder);tGrd.addColorStop(1,darkChitin);
    c.fillStyle=tGrd;c.fill();c.strokeStyle=darkChitin;c.lineWidth=0.8;c.stroke();

    c.strokeStyle=paleBorder;c.lineWidth=0.7;
    for(const side of[-1,1]){c.beginPath();c.moveTo(sx+0.8,side*sw*0.85);c.lineTo(sx-0.6,side*sw);c.stroke();}
    c.strokeStyle='#ffffff22';c.lineWidth=0.6;
    c.beginPath();c.moveTo(sx+0.6,-sw*0.4);c.quadraticCurveTo(sx+0.8,0,sx+0.6,sw*0.4);c.stroke();
    c.restore();
   }

   // 3. PLEOTELSON & UROPODS
   c.save();
   c.fillStyle=baseCol;c.strokeStyle=darkChitin;c.lineWidth=0.8;
   c.beginPath();c.moveTo(-8.6,-3.2);c.lineTo(-11.5,0);c.lineTo(-8.6,3.2);c.closePath();c.fill();c.stroke();
   c.fillStyle='#4c4f46';
   for(const side of[-1,1]){
    c.beginPath();c.moveTo(-9.2,side*2.2);c.lineTo(-13.5,side*3.6);c.lineTo(-10.5,side*1.4);c.closePath();c.fill();c.stroke();
   }
   c.restore();

   // 4. CEPHALON (Head recessed into collar)
   c.save();
   c.fillStyle=baseCol;c.strokeStyle=darkChitin;c.lineWidth=0.9;
   c.beginPath();c.ellipse(8.2,0,2.5,4.8,0,0,Math.PI*2);c.fill();c.stroke();
   for(const side of[-1,1]){
    c.fillStyle='#0a0b09';c.beginPath();c.ellipse(8.4,side*3.8,0.9,0.7,side*0.2,0,Math.PI*2);c.fill();
    c.fillStyle='#ffffff66';c.beginPath();c.arc(8.2,side*3.8-side*0.2,0.25,0,Math.PI*2);c.fill();
   }
   c.restore();

   // 5. SECOND ANTENNAE
   const antProbe=cr.alive?Math.sin(this.time*8)*0.5:0;
   c.save();c.strokeStyle='#272924';c.lineWidth=0.9;
   for(const side of[-1,1]){
    const j1x=9.8,j1y=side*2.2,j2x=13.5,j2y=side*5.2+side*antProbe*0.5,j3x=17.5+antProbe,j3y=side*3.8,tipX=21.0+antProbe*1.2,tipY=side*2.0;
    c.beginPath();c.moveTo(j1x,j1y);c.lineTo(j2x,j2y);c.lineTo(j3x,j3y);c.lineTo(tipX,tipY);c.stroke();
    c.fillStyle='#4c4f46';c.beginPath();c.arc(j2x,j2y,0.5,0,Math.PI*2);c.arc(j3x,j3y,0.45,0,Math.PI*2);c.fill();
   }
   c.restore();
  }

  rootAphid(cr,moving,scale,z){
   const c=this.ctx,shade=cr.colorVariation||1;
   const baseCol=adjustColor('#cfb45b',shade),darkChitin='#463c1e';
   const pulse=cr.alive?Math.sin(this.time*3.5)*0.08:0;

   // 1. SIX DELICATE LEGS
   const legData=[
    {ax:3.2,ay:1.8,kx:5.5,ky:4.8,tx:7.2,ty:5.8},
    {ax:0.8,ay:2.4,kx:1.8,ky:5.8,tx:2.5,ty:7.2},
    {ax:-2.2,ay:2.8,kx:-3.8,ky:6.2,tx:-5.5,ty:7.8}
   ];
   for(const side of[-1,1]){
    for(const ld of legData){
     c.save();c.strokeStyle='#8c7a3a';c.lineWidth=0.8;
     c.beginPath();c.moveTo(ld.ax,side*ld.ay);c.lineTo(ld.kx,side*ld.ky);c.lineTo(ld.tx,side*ld.ty);c.stroke();
     c.lineWidth=0.5;c.beginPath();c.moveTo(ld.tx,side*ld.ty);c.lineTo(ld.tx-0.5,side*ld.ty+side*0.6);c.stroke();
     c.restore();
    }
   }

   // 2. TRANSLUCENT PEAR-SHAPED BODY
   c.save();
   const abX=-2.8,abRx=5.2*(1+pulse),abRy=4.2*(1+pulse);
   const bodyGrd=c.createRadialGradient(abX-1.0,-1.0,1.0,abX,0,abRx);
   bodyGrd.addColorStop(0,'#f2e299');bodyGrd.addColorStop(0.4,baseCol);bodyGrd.addColorStop(0.85,'#9e8538');bodyGrd.addColorStop(1,darkChitin);
   c.fillStyle=bodyGrd;c.strokeStyle=darkChitin;c.lineWidth=0.9;
   c.beginPath();
   c.moveTo(3.8,-1.6);c.quadraticCurveTo(1.5,-abRy*0.85,abX,-abRy);
   c.quadraticCurveTo(abX-abRx*0.95,-abRy*0.85,abX-abRx,0);
   c.quadraticCurveTo(abX-abRx*0.95,abRy*0.85,abX,abRy);
   c.quadraticCurveTo(1.5,abRy*0.85,3.8,1.6);
   c.closePath();c.fill();c.stroke();

   // Internal digestive shadow
   c.fillStyle='#7a823544';c.beginPath();c.ellipse(abX-0.5,0,abRx*0.55,abRy*0.45,0,0,Math.PI*2);c.fill();

   // Segmental lines
   c.strokeStyle='#947f3844';c.lineWidth=0.6;
   for(let bx=abX-abRx*0.6;bx<=abX+abRx*0.4;bx+=2.0){
    c.beginPath();c.moveTo(bx,-abRy*0.65);c.quadraticCurveTo(bx+0.6,0,bx,abRy*0.65);c.stroke();
   }
   c.strokeStyle='#ffffff44';c.lineWidth=0.8;
   c.beginPath();c.ellipse(abX,-abRy*0.45,abRx*0.6,abRy*0.3,-0.15,-Math.PI*0.8,-Math.PI*0.2);c.stroke();
   c.restore();

   // 3. SIPHUNCULI / CORNICLES (Paired exhaust tubes)
   c.save();
   for(const side of[-1,1]){
    const cornRootX=abX-abRx*0.4,cornRootY=side*(abRy*0.72),cornTipX=cornRootX-3.2,cornTipY=side*(abRy*0.92);
    c.strokeStyle='#74622a';c.lineWidth=1.3;c.beginPath();c.moveTo(cornRootX,cornRootY);c.lineTo(cornTipX,cornTipY);c.stroke();
    c.fillStyle='#282010';c.beginPath();c.ellipse(cornTipX,cornTipY,0.7,0.4,side*0.3,0,Math.PI*2);c.fill();
   }
   c.restore();

   // 4. CAUDA (Tail)
   c.save();
   c.fillStyle='#a69044';c.strokeStyle=darkChitin;c.lineWidth=0.7;
   c.beginPath();c.moveTo(abX-abRx,-1.0);c.lineTo(abX-abRx-1.8,0);c.lineTo(abX-abRx,1.0);c.closePath();c.fill();c.stroke();
   c.restore();

   // 5. HEAD & SUCKING ROSTRUM
   c.save();
   c.fillStyle=baseCol;c.strokeStyle=darkChitin;c.lineWidth=0.8;
   c.beginPath();c.ellipse(4.2,0,1.8,2.2,0,0,Math.PI*2);c.fill();c.stroke();
   for(const side of[-1,1]){
    c.fillStyle='#5c120c';c.beginPath();c.arc(4.2,side*2.0,0.7,0,Math.PI*2);c.fill();
    c.fillStyle='#ffffff66';c.beginPath();c.arc(4.0,side*2.0-side*0.2,0.25,0,Math.PI*2);c.fill();
   }
   c.strokeStyle='#2b2313';c.lineWidth=0.8;c.beginPath();c.moveTo(4.8,0);c.lineTo(7.0,0);c.stroke();
   c.restore();

   // 6. FILIFORM ANTENNAE
   const antWave=cr.alive?Math.sin(this.time*6)*0.4:0;
   c.save();c.strokeStyle='#5a4d26';c.lineWidth=0.7;
   for(const side of[-1,1]){
    c.beginPath();c.moveTo(4.6,side*1.0);c.quadraticCurveTo(2.0,side*5.0+side*antWave,-3.5,side*5.5+side*antWave*1.5);c.stroke();
   }
   c.restore();
  }

  mite(cr,moving,scale,z){
   const c=this.ctx,shade=cr.colorVariation||1;
   const baseCol=adjustColor('#a6443c',shade),darkChitin='#421612';

   // 1. EIGHT SCURRYING LEGS
   const legConfigs=[
    {ax:2.2,ay:1.8,dir:1.1,len:4.8,idx:0},
    {ax:0.8,ay:2.2,dir:0.4,len:5.2,idx:1},
    {ax:-0.6,ay:2.2,dir:-0.4,len:5.2,idx:2},
    {ax:-1.8,ay:1.8,dir:-1.1,len:4.8,idx:3}
   ];
   for(const side of[-1,1]){
    for(const lc of legConfigs){
     const swing=moving?Math.sin(this.time*22+lc.idx*1.8+side)*1.2:0;
     const kx=lc.ax+lc.dir*(lc.len*0.45)+swing*0.5,ky=side*(lc.ay+lc.len*0.6);
     const tx=kx+lc.dir*(lc.len*0.45)+swing,ty=ky+side*(lc.len*0.5);
     c.save();
     c.strokeStyle='#5e231e';c.lineWidth=0.9;c.beginPath();c.moveTo(lc.ax,side*lc.ay);c.lineTo(kx,ky);c.lineTo(tx,ty);c.stroke();
     c.lineWidth=0.5;c.beginPath();c.moveTo(tx,ty);c.lineTo(tx+lc.dir*0.5,ty+side*0.6);c.stroke();
     c.restore();
    }
   }

   // 2. COMPACT GLOBULAR IDIOSOMA
   c.save();
   const idioRx=3.6,idioRy=3.0;
   const bodyGrd=c.createRadialGradient(-0.8,-0.8,0.5,0,0,idioRx);
   bodyGrd.addColorStop(0,'#d96359');bodyGrd.addColorStop(0.45,baseCol);bodyGrd.addColorStop(0.85,'#7a2822');bodyGrd.addColorStop(1,darkChitin);
   c.fillStyle=bodyGrd;c.strokeStyle=darkChitin;c.lineWidth=0.8;
   c.beginPath();c.ellipse(0,0,idioRx,idioRy,0,0,Math.PI*2);c.fill();c.stroke();

   c.strokeStyle='#ffffff44';c.lineWidth=0.7;
   c.beginPath();c.ellipse(-0.6,-idioRy*0.4,idioRx*0.55,idioRy*0.3,-0.15,-Math.PI*0.8,-Math.PI*0.2);c.stroke();

   // Sensory setae
   c.strokeStyle='#38120e';c.lineWidth=0.5;
   for(const a of[-2.4,-2.8,-3.1,2.8,2.4,-1.2,1.2]){
    const sx=Math.cos(a)*idioRx,sy=Math.sin(a)*idioRy;
    c.beginPath();c.moveTo(sx,sy);c.lineTo(sx+Math.cos(a)*1.4,sy+Math.sin(a)*1.4);c.stroke();
   }
   c.restore();

   // 3. CAPITULUM
   c.save();
   c.fillStyle='#6e241e';c.strokeStyle=darkChitin;c.lineWidth=0.6;
   c.beginPath();c.moveTo(idioRx*0.85,-1.1);c.lineTo(idioRx+1.8,0);c.lineTo(idioRx*0.85,1.1);c.closePath();c.fill();c.stroke();
   c.strokeStyle='#38120e';c.lineWidth=0.6;
   for(const side of[-1,1]){c.beginPath();c.moveTo(idioRx+0.8,side*0.8);c.lineTo(idioRx+2.2,side*1.2);c.stroke();}
   c.restore();
  }

  creature(cr,p,z,d){
   const c=this.ctx,kind=cr.species;
   if(z<1.4){
    const baseCol=adjustColor(d.color||'#815a39',cr.colorVariation||1);
    const rad=Math.max(1.5,(kind==='hercules'?10:kind==='worm'||kind==='spider'?5:kind==='grub'?4:2.5)*z*(cr.size||1));
    c.save();c.translate(p.x,p.y);c.globalAlpha=cr.alive?1:.42;c.fillStyle=baseCol;
    c.beginPath();c.arc(0,0,rad,0,Math.PI*2);c.fill();
    c.restore();
    return;
   }
   if((kind==='worm'||kind==='grub')&&cr.bodyTrail?.length){this.segmentedCreature(cr,z,d);return;}
   const scale=z*(cr.size||1)*(d.visualScale||1),moving=cr.alive&&Boolean(cr.path?.length||cr.x!==cr.prevX||cr.y!==cr.prevY);
   c.save();c.translate(p.x,p.y);c.rotate(cr.angle||0);c.scale(scale,scale);c.globalAlpha=cr.alive?1:.42;
   if(kind==='weevil'||kind==='beetle'){this.weevil(cr,moving,scale,z);}
   else if(kind==='hercules'){this.hercules(cr,moving,scale,z);}
   else if(kind==='spider'){this.spider(cr,moving,scale,z,false);}
   else if(kind==='baby_spider'){this.spider(cr,moving,scale,z,true);}
   else if(kind==='isopod'){this.isopod(cr,moving,scale,z);}
   else if(kind==='root_aphid'){this.rootAphid(cr,moving,scale,z);}
   else if(kind==='mite'){this.mite(cr,moving,scale,z);}
   else{
    const baseCol=adjustColor(d.color,cr.colorVariation||1);
    c.fillStyle=baseCol;c.strokeStyle='#211b17';c.lineWidth=.8;
    c.beginPath();c.ellipse(0,0,4,3,0,0,Math.PI*2);c.fill();c.stroke();
   }
   c.restore();
  }
}
AntGame.Renderer=Renderer;
})();