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
 if(a.broodHelper)return adjustColor('#b589d6',shade);
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
  if(z<1.4||!entity.alive||(entity.health||0)<=0)return;
  const c=this.ctx;
  const inCombat=entity.type!=='queen'&&(entity.state==='attack'||(entity.lastAttacker&&(entity.fleeTimer||0)>0)||entity.threatId);
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
  return{passage:'#62734a88',tunnel:'#62734a88',nest:'#8f7d4288','food-store':'#a87b3288',spoil:'#70464f88','water-store':'#2b668588','hatchery-floor':'#7b529488','hatchery-wall':'#452a5cbb',colony:'#96323288',built:'#4e6e4e88',rock:'#4c524f88',well:'#19476688',root:'#6e4e2988'}[cell.zone];
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
  const c=this.ctx,z=this.camera.zoom,s=C.cellSize*z;this.time=sim.time;this.interpolation=interpolation;this.ecoAlpha = Math.min(1, (sim.ecologyTimer + interpolation * C.step) / C.ecologyInterval);
  const shake=sim.climate?.screenShake||0;
  const shakeX=shake>0?(Math.random()-0.5)*10*shake:0,shakeY=shake>0?(Math.random()-0.5)*10*shake:0;
  c.setTransform(this.dpr,0,0,this.dpr,shakeX*this.dpr,shakeY*this.dpr);
  const isDay=sim.climate?sim.climate.isDay:true;
  c.fillStyle=isDay?'#0a0d0a':'#050706';c.fillRect(-10,-10,this.width+20,this.height+20);
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
    c.fillStyle=isRock?`hsl(${200+(h%12)} ${6+(h%4)}% ${18+(h%5)}%)`:isRoot?'#221b14':cell.zone==='hatchery-wall'?'#2e1f3b':cell.solid?`hsl(${27+(h%5)} ${9+(h%5)}% ${14+(h%5)}%)`:cell.zone==='hatchery-floor'?'#1a1322':cell.zone==='well'?'#040910':pathFloor?'#191c1a':cell.zone==='pit'?'#121310':cell.zone==='water-store'?'#040f13':cell.zone==='food-store'?'#1e1b13':cell.zone==='spoil'?'#181517':cell.zone==='abandoned'?'#121713':'#151816';
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
    if(isDay&&!cell.solid&&(cell.depth===0||cell.isBreach||cell.zone==='surface')){
     const glowRad=s*1.6,grad=c.createRadialGradient(p.x,p.y,s*0.2,p.x,p.y,glowRad);
     grad.addColorStop(0,'rgba(245, 240, 210, 0.45)');
     grad.addColorStop(1,'rgba(245, 240, 210, 0)');
     c.fillStyle=grad;c.beginPath();c.arc(p.x,p.y,glowRad,0,Math.PI*2);c.fill();
    }
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
    let ex=e.x,ey=e.y;
    if(e.carriedBy){
     const carrier=sim.ants.find(a=>a.id===e.carriedBy);
     if(carrier){ex=carrier.x;ey=carrier.y-0.35;}
    }
    const p=this.screen(ex,ey);if(!inView(p.x,p.y,30))continue;
    const progress=Math.max(0,Math.min(1,e.age/e.duration)),w=Math.max(18,13*z);

    if(e.stage==='larva'){
     c.save();
     c.translate(p.x,p.y);
     c.fillStyle='#ebe3b7';
     c.beginPath();
     c.ellipse(0,0,2.6*z,3.8*z,Math.PI*0.12,0,Math.PI*2);
     c.fill();
     c.strokeStyle='#8c7f56';
     c.lineWidth=0.8;
     c.stroke();
     c.strokeStyle='#b5a878';
     c.lineWidth=0.6;
     for(let seg=-2;seg<=2;seg++){
      c.beginPath();
      c.arc(0,seg*z*0.9,1.8*z,0.2,Math.PI-0.2);
      c.stroke();
     }
     c.restore();

     const reqFood=AntGame.Config.brood?.larvaFoodRequired||30;
     const foodRatio=Math.max(0,Math.min(1,(e.foodAccumulated||0)/reqFood));
     const y1=p.y-11*z, y2=p.y-6.5*z;
     c.fillStyle='#221f17';c.fillRect(p.x-w/2,y1,w,3);
     c.fillStyle='#d89632';c.fillRect(p.x-w/2,y1,w*progress,3);
     c.strokeStyle='#8f601b';c.lineWidth=.6;c.strokeRect(p.x-w/2,y1,w,3);
     c.fillStyle='#221f17';c.fillRect(p.x-w/2,y2,w,3);
     c.fillStyle='#5cb85c';c.fillRect(p.x-w/2,y2,w*foodRatio,3);
     c.strokeStyle='#356b35';c.lineWidth=.6;c.strokeRect(p.x-w/2,y2,w,3);
    }else if(e.stage==='pupa'){
     c.save();
     c.translate(p.x,p.y);
     c.fillStyle='#d5c4a5';
     c.beginPath();
     c.ellipse(0,0,2.3*z,4.2*z,Math.PI*0.05,0,Math.PI*2);
     c.fill();
     c.strokeStyle='#7a6b52';
     c.lineWidth=0.8;
     c.stroke();
     c.strokeStyle='#b09e7c';
     c.lineWidth=0.6;
     c.beginPath();c.moveTo(-1.5*z,-1.5*z);c.lineTo(1.5*z,1.5*z);c.stroke();
     c.beginPath();c.moveTo(-1.5*z,0);c.lineTo(1.5*z,-1.5*z);c.stroke();
     c.restore();

     const y=p.y-9*z;
     c.fillStyle='#221f17';c.fillRect(p.x-w/2,y,w,3.5);
     c.fillStyle='#6cb2a0';c.fillRect(p.x-w/2,y,w*progress,3.5);
     c.strokeStyle='#3e7567';c.lineWidth=.7;c.strokeRect(p.x-w/2,y,w,3.5);
    }else{
     const y=p.y-8*z;
     c.fillStyle='#ece7d5';
     c.beginPath();
     c.ellipse(p.x,p.y,2*z,3*z,.35,0,Math.PI*2);
     c.fill();
     c.strokeStyle='#a39b82';
     c.lineWidth=0.7;
     c.stroke();
     c.fillStyle='#ffffff88';
     c.beginPath();
     c.ellipse(p.x-0.6*z,p.y-0.8*z,0.8*z,1.3*z,.35,0,Math.PI*2);
     c.fill();

     c.fillStyle='#221f17';c.fillRect(p.x-w/2,y,w,3.5);
     c.fillStyle='#a89842';c.fillRect(p.x-w/2,y,w*progress,3.5);
     c.strokeStyle='#857835';c.lineWidth=.7;c.strokeRect(p.x-w/2,y,w,3.5);
    }
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
   if(a.trapped){
    c.save();c.strokeStyle='#e67e22';c.lineWidth=2*z;c.setLineDash([4*z,3*z]);
    c.beginPath();c.arc(p.x,p.y,(a.type==='queen'?18:12)*z,0,Math.PI*2);c.stroke();
    c.fillStyle='#e67e22';c.font=`bold ${Math.max(8,Math.round(9*z))}px sans-serif`;c.textAlign='center';
    c.fillText('TRAPPED',p.x,p.y-(a.type==='queen'?20:14)*z);c.restore();
   }
   this.ant(a,p,z,sim.time);this.hp(a,p,z,a.maxHealth||100);
  }
  for(const m of sim.commandMarkers||[]){
   const p=this.screen(m.x,m.y);if(!inView(p.x,p.y,20))continue;
   c.strokeStyle=m.color;c.lineWidth=2;c.beginPath();c.arc(p.x,p.y,7*z,0,Math.PI*2);c.moveTo(p.x-9*z,p.y);c.lineTo(p.x+9*z,p.y);c.moveTo(p.x,p.y-9*z);c.lineTo(p.x,p.y+9*z);c.stroke();
  }
   if(this.inspectedCell){const cell=sim.world.peek(this.inspectedCell.x,this.inspectedCell.y);if(cell){const p=this.screen(cell.x,cell.y);c.strokeStyle='#48a8cf';c.lineWidth=2;this.tile(p,s);c.stroke();}}
    if(this.hover){for(const h of hexDisk(this.hover.x,this.hover.y,this.hoverRadius)){const p=this.screen(h.x,h.y),color=mode==='build'?'#48a8cf':mode==='dig'?'#c5c994':mode==='attack'?'#d84f4f':mode==='harvest'?'#73c887':mode==='carry'?'#e8c96a':mode==='cancel'?'#b8322e':this.colorMap?'#527888':'#7d8e85';c.fillStyle=color+'45';this.tile(p,s);c.fill();c.strokeStyle=color;c.lineWidth=1.2;this.tile(p,s);c.stroke();}}
  if(this.selectionBox){const b=this.selectionBox;c.fillStyle='#48a8cf20';c.strokeStyle='#48a8cf';c.fillRect(b.x,b.y,b.w,b.h);c.strokeRect(b.x,b.y,b.w,b.h);}
  if(sim.climate&&sim.climate.lightningFlash>0){
   c.save();c.setTransform(this.dpr,0,0,this.dpr,0,0);
   c.fillStyle=`rgba(230, 240, 255, ${Math.min(0.75, sim.climate.lightningFlash * 0.85)})`;
   c.fillRect(0,0,this.width,this.height);
   c.restore();
  }
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
  segmentedCreature(cr,z,d){return AntGame.CreatureRenderer.drawSegmented(this,cr,z,d);}
  hercules(cr,moving,scale,z){return AntGame.CreatureRenderer.drawHercules(this,cr,moving,scale,z);}
  weevil(cr,moving,scale,z){return AntGame.CreatureRenderer.drawWeevil(this,cr,moving,scale,z);}
  spider(cr,moving,scale,z,isBaby=false){return AntGame.CreatureRenderer.drawSpider(this,cr,moving,scale,z,isBaby);}
  isopod(cr,moving,scale,z){return AntGame.CreatureRenderer.drawIsopod(this,cr,moving,scale,z);}
  rootAphid(cr,moving,scale,z){return AntGame.CreatureRenderer.drawRootAphid(this,cr,moving,scale,z);}
  mite(cr,moving,scale,z){return AntGame.CreatureRenderer.drawMite(this,cr,moving,scale,z);}
  creature(cr,p,z,d){return AntGame.CreatureRenderer.draw(this,cr,p,z,d);}
}
AntGame.Renderer=Renderer;
})();