/*
 * UNDERFOOT CREATURE PROCEDURAL RENDERING & KINEMATICS
 * Handles multi-segmented kinematic body trails (earthworms, beetle grubs)
 * and detailed procedural rendering for all fauna species (hercules beetle,
 * bull weevil, funnel-web spider, baby spider, isopod, root aphid, red mite).
 */
(()=>{
function adjustColor(col,factor=1){
 if(factor===1||!col)return col;
 if(col.startsWith('#')&&col.length===7){
  const r=parseInt(col.slice(1,3),16),g=parseInt(col.slice(3,5),16),b=parseInt(col.slice(5,7),16);
  return 'rgb(' + Math.max(0,Math.min(255,Math.round(r*factor))) + ',' + Math.max(0,Math.min(255,Math.round(g*factor))) + ',' + Math.max(0,Math.min(255,Math.round(b*factor))) + ')';
 }
 return col;
}

class CreatureRenderer {
 static adjustColor(col, factor) { return adjustColor(col, factor); }
 static drawSegmented(renderer,cr,z,d){

   const c=renderer.ctx,kind=cr.species,bodyTrail=cr.bodyTrail||[];
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
   const dHead=distMoved*(1-Math.min(1,Math.max(0,renderer.ecoAlpha??1)));

   const moving=cr.alive&&Boolean(cr.path?.length||distMoved>0.001),animTime=moving?renderer.time*4:0;
   const distances=new Float32Array(count);
   distances[0]=0;
   for(let i=1;i<count;i++){
    const wave=Math.sin(animTime*(kind==='worm'?3.2:2.2)-i*.82),stretch=kind==='worm'?.10:.06;
    distances[i]=distances[i-1]+spacing*(1+wave*stretch);
   }

   const headPt=along(dHead),root=renderer.screen(headPt.x,headPt.y);
   c.save();c.translate(root.x,root.y);c.globalAlpha=cr.alive?1:.42;

   for(let i=count-1;i>=0;i--){
    const targetDist=dHead+distances[i],at=along(targetDist),p=renderer.screen(at.x,at.y);
    const pAhead=along(Math.max(0,targetDist-0.12)),pBehind=along(targetDist+0.12);
    const sAhead=renderer.screen(pAhead.x,pAhead.y),sBehind=renderer.screen(pBehind.x,pBehind.y);
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
       const step=moving?Math.sin(renderer.time*15+i*2.1)*0.8*scale:0;
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
 static drawHercules(renderer,cr,moving,scale,z){
  const c=renderer.ctx,seed=cr.id?Number(String(cr.id).replace(/\D/g,''))||77:77;
  const rnd=i=>{let t=(seed+i*374761393)^(i*668265263);t=Math.imul(t^t>>>15,t|1);return((t^t>>>14)>>>0)/4294967296;};

  // 1. LEGS (6 robust articulated scarab legs with stout femora, spined tibiae, and hooked tarsal claws)
  const leg=(ax,ay,side,dir,idx,femLen=10,tibLen=14,tarLen=8)=>{
   const phase=moving?Math.sin(renderer.time*14+idx*Math.PI+side)*2.8:0;
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
 static drawWeevil(renderer,cr,moving,scale,z){

   const c=renderer.ctx,shade=cr.colorVariation||1,darkChitin='#24140b';

   // 1. LEGS (6 stout, heavily articulated legs with swollen profemora and hooked dual claws)
   const leg=(ax,ay,side,dir,idx,femL=7.5,tibL=8.5,tarL=5.0)=>{
    const phase=moving?Math.sin(renderer.time*15+idx*Math.PI+side)*1.8:0;
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

 static drawSpider(renderer,cr,moving,scale,z,isBaby=false){

   const c=renderer.ctx,shade=cr.colorVariation||1;
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
     const swing=moving?Math.sin(renderer.time*15+tetrapod)*(legBaseLen*0.15):0;
     const lift=moving?Math.max(0,-Math.cos(renderer.time*15+tetrapod))*1.2:0;
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
   const palpRootX=proX+proRx*0.55,palpTwitch=cr.alive?Math.sin(renderer.time*8)*0.4:0;
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

 static drawIsopod(renderer,cr,moving,scale,z){

   const c=renderer.ctx,shade=cr.colorVariation||1;
   const baseCol=adjustColor('#676a60',shade),darkChitin='#272924',paleBorder='#929688';

   // 1. 14 ARTICULATED LEGS on metachronal ripple wave
   const legXPositions=[5.5,3.8,2.0,0.2,-1.6,-3.4,-5.2];
   for(let i=0;i<legXPositions.length;i++){
    const lx=legXPositions[i];
    const wave=moving?Math.sin(renderer.time*16-i*0.75)*1.6:0;
    const lift=moving?Math.max(0,-Math.cos(renderer.time*16-i*0.75))*0.8:0;

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
   const antProbe=cr.alive?Math.sin(renderer.time*8)*0.5:0;
   c.save();c.strokeStyle='#272924';c.lineWidth=0.9;
   for(const side of[-1,1]){
    const j1x=9.8,j1y=side*2.2,j2x=13.5,j2y=side*5.2+side*antProbe*0.5,j3x=17.5+antProbe,j3y=side*3.8,tipX=21.0+antProbe*1.2,tipY=side*2.0;
    c.beginPath();c.moveTo(j1x,j1y);c.lineTo(j2x,j2y);c.lineTo(j3x,j3y);c.lineTo(tipX,tipY);c.stroke();
    c.fillStyle='#4c4f46';c.beginPath();c.arc(j2x,j2y,0.5,0,Math.PI*2);c.arc(j3x,j3y,0.45,0,Math.PI*2);c.fill();
   }
   c.restore();
  }

 static drawRootAphid(renderer,cr,moving,scale,z){

   const c=renderer.ctx,shade=cr.colorVariation||1;
   const baseCol=adjustColor('#cfb45b',shade),darkChitin='#463c1e';
   const pulse=cr.alive?Math.sin(renderer.time*3.5)*0.08:0;

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
   const antWave=cr.alive?Math.sin(renderer.time*6)*0.4:0;
   c.save();c.strokeStyle='#5a4d26';c.lineWidth=0.7;
   for(const side of[-1,1]){
    c.beginPath();c.moveTo(4.6,side*1.0);c.quadraticCurveTo(2.0,side*5.0+side*antWave,-3.5,side*5.5+side*antWave*1.5);c.stroke();
   }
   c.restore();
  }

 static drawMite(renderer,cr,moving,scale,z){

   const c=renderer.ctx,shade=cr.colorVariation||1;
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
     const swing=moving?Math.sin(renderer.time*22+lc.idx*1.8+side)*1.2:0;
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

 static draw(renderer,cr,p,z,d){

   const c=renderer.ctx,kind=cr.species;
   if(z<1.4){
    const baseCol=adjustColor(d.color||'#815a39',cr.colorVariation||1);
    const rad=Math.max(1.5,(kind==='hercules'?10:kind==='worm'||kind==='spider'?5:kind==='grub'?4:2.5)*z*(cr.size||1));
    c.save();c.translate(p.x,p.y);c.globalAlpha=cr.alive?1:.42;c.fillStyle=baseCol;
    c.beginPath();c.arc(0,0,rad,0,Math.PI*2);c.fill();
    c.restore();
    return;
   }
   if((kind==='worm'||kind==='grub')&&cr.bodyTrail?.length){this.drawSegmented(renderer,cr,z,d);return;}
   const scale=z*(cr.size||1)*(d.visualScale||1),moving=cr.alive&&Boolean(cr.path?.length||cr.x!==cr.prevX||cr.y!==cr.prevY);
   c.save();c.translate(p.x,p.y);c.rotate(cr.angle||0);c.scale(scale,scale);c.globalAlpha=cr.alive?1:.42;
   if(kind==='weevil'||kind==='beetle'){this.drawWeevil(renderer,cr,moving,scale,z);}
   else if(kind==='hercules'){this.drawHercules(renderer,cr,moving,scale,z);}
   else if(kind==='spider'){this.drawSpider(renderer,cr,moving,scale,z,false);}
   else if(kind==='baby_spider'){this.drawSpider(renderer,cr,moving,scale,z,true);}
   else if(kind==='isopod'){this.drawIsopod(renderer,cr,moving,scale,z);}
   else if(kind==='root_aphid'){this.drawRootAphid(renderer,cr,moving,scale,z);}
   else if(kind==='mite'){this.drawMite(renderer,cr,moving,scale,z);}
   else{
    const baseCol=adjustColor(d.color,cr.colorVariation||1);
    c.fillStyle=baseCol;c.strokeStyle='#211b17';c.lineWidth=.8;
    c.beginPath();c.ellipse(0,0,4,3,0,0,Math.PI*2);c.fill();c.stroke();
   }
   c.restore();
  }

}

AntGame.adjustColor = adjustColor;
AntGame.CreatureRenderer = CreatureRenderer;
})();
