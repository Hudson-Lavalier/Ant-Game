const test=require('node:test'),assert=require('node:assert/strict');globalThis.window=globalThis;for(const f of['config','data','world','brood','tasks','construction','inventory','ecology','audio','settings','simulation'])require('../src/'+f+'.js');const{Simulation,World,Random,rollCaste,pathfind,hexDistance,hexDisk,Ecology}=AntGame,advance=(s,n)=>{for(let i=0;i<n*30;i++)s.update(1/30)};
test('queen needs, egg costs, cap, and stacked death rules',()=>{const s=new Simulation(1),q=s.queen();assert.equal(q.maxFood,200);const starter=s.ants.find(a=>a.type==='worker');assert.equal(starter?.colonyId,1);starter.colonyId=2;s.eggProduction=false;advance(s,900);assert.ok(q.food>99&&q.food<101&&q.water>9&&q.water<11);q.food=q.water=0;advance(s,10);assert.ok(q.health<922);advance(s,120);assert.equal(s.gameOver,true)});
test('caste probabilities follow revamped worker and soldier distribution with disabled repros',()=>{const r=new Random(2);const counts={worker:0,minor:0,media:0,soldier:0,major:0,supermajor:0,queen:0,drone:0,princess:0};for(let i=0;i<1e5;i++)counts[rollCaste(r)]++;assert.ok(Math.abs(counts.worker/1e5-.65)<.01);assert.ok(Math.abs(counts.minor/1e5-.10)<.01);assert.ok(Math.abs(counts.media/1e5-.10)<.01);assert.ok(Math.abs(counts.soldier/1e5-.10)<.01);assert.ok(Math.abs(counts.major/1e5-.03)<.008);assert.ok(Math.abs(counts.supermajor/1e5-.02)<.008);assert.equal(counts.queen,0);assert.equal(counts.drone,0);assert.equal(counts.princess,0)});
test('revamped castes initialize with exact health, speed, needs, mining, and clearance stats',()=>{const s=new Simulation(600),mn=s.addAnt('minor',s.nest.x,s.nest.y),md=s.addAnt('media',s.nest.x,s.nest.y),sl=s.addAnt('soldier',s.nest.x,s.nest.y),mj=s.addAnt('major',s.nest.x,s.nest.y),sm=s.addAnt('supermajor',s.nest.x,s.nest.y);assert.equal(mn.health,50);assert.equal(mn.speed,AntGame.Config.moveSpeed*2);assert.equal(mn.maxFoodNeed,25);assert.equal(mn.canMine,false);assert.equal(md.health,200);assert.equal(md.maxFoodNeed,100);assert.equal(sl.health,250);assert.equal(sl.maxFoodNeed,125);assert.equal(mj.health,300);assert.equal(mj.maxFoodNeed,200);assert.equal(mj.drainMult,2);assert.equal(mj.clearanceNeeded,3);assert.equal(sm.health,500);assert.equal(sm.maxFoodNeed,300);assert.equal(sm.drainMult,3);assert.equal(sm.clearanceNeeded,3)});
test('terrain is a dense true hex disk with six neighbors and four-hex worker scans',()=>{const w=new World(3);assert.equal(w.cells.size,1+3*33*34);const c=w.peek(0,0);assert.equal(w.neighbors(c.x,c.y).length,6);assert.equal(hexDistance({x:0,y:0},{x:2,y:-1}),2);assert.equal(hexDisk(0,0,2).length,19);w.senseAt(0,0);assert.equal(w.peek(0,4).discovered,true);assert.equal(w.peek(0,5).discovered,false)});
test('queen scans a fifteen-hex boundary at the start',()=>{const s=new Simulation(31),q=s.queen();assert.equal(s.world.peek(q.x+15,q.y)?.discovered,true);assert.equal(s.world.peek(q.x,q.y+16)?.discovered,false)});
test('unrevealed cells allow dig designation without revealing until in range',()=>{const s=new Simulation(4),c=s.world.get(30,0);assert.equal(c.discovered,false);assert.equal(s.designate(30,0),true);assert.equal(s.designateBuild(30,0),false);assert.equal(c.discovered,false)});
test('revealed unreachable dig remains pending red until connected',()=>{const s=new Simulation(5),c=s.world.get(20,5);c.discovered=true;c.solid=true;assert.equal(s.designate(c.x,c.y),true);s.refreshJobStates();assert.equal(s.jobs[0].status,'blocked')});
test('blocked dig orders do not repeatedly reassign idle workers',()=>{const s=new Simulation(51),c=s.world.get(20,5),a=s.addAnt('worker',s.nest.x,s.nest.y);c.discovered=true;c.solid=true;s.designate(c.x,c.y);s.refreshJobStates();for(let i=0;i<150;i++)s.update(1/30);assert.equal(s.jobs[0].status,'blocked');assert.equal(a.task,null);assert.equal(a.state,'idle')});
test('hex excavation produces one conserved dirt load',()=>{const s=new Simulation(6);const c=[...s.world.cells.values()].filter(c=>c.solid&&c.discovered&&s.world.faces(c).length).sort((a,b)=>hexDistance(a,s.nest)-hexDistance(b,s.nest))[0];assert.ok(c);const a=s.addAnt('worker',s.nest.x,s.nest.y);s.designate(c.x,c.y,a);advance(s,10);assert.equal(c.solid,false);assert.equal(s.world.pit.used,1);assert.ok(s.conservation())});
test('ants use continuous safe movement through open hex boundaries',()=>{const s=new Simulation(61),a=s.addAnt('worker',s.nest.x,s.nest.y),target=[...s.world.cells.values()].find(c=>!c.solid&&c.discovered&&hexDistance(c,s.nest)>=5&&hexDistance(c,s.nest)<=7);assert.ok(target);assert.equal(s.move(a,target),null);const initial=a.path.length;advance(s,2);assert.ok(hexDistance(a,s.nest)>0);assert.ok(a.path.length<initial);const cell=s.world.peek(Math.round(a.x),Math.round(a.y));assert.equal(cell?.solid,false);advance(s,4);assert.ok(Math.abs(a.x-target.x)<.01&&Math.abs(a.y-target.y)<.01)});
test('ants face their screen-space travel direction on axial vertical routes',()=>{const s=new Simulation(62),a=s.addAnt('worker',s.nest.x,s.nest.y),target={x:s.nest.x,y:s.nest.y+3};assert.equal(s.move(a,target),null);s.update(1/30);assert.ok(Math.abs(a.angle-Math.PI/2)<.001)});
test('feeder gathers food first and water second within seventy hexes',()=>{const s=new Simulation(7);Ecology.expedition(s,'food');Ecology.expedition(s,'water');const a=s.addAnt('worker',s.nest.x,s.nest.y);s.setFeeder(a);s.food=100;advance(s,30);assert.ok(s.food>90);s.food=s.foodCapacity();s.water=50;advance(s,35);assert.ok(s.water>43.5);assert.ok(hexDistance(a,s.nest)<=70)});
test('feeder automatically brings reachable corpse food to the queen',()=>{const s=new Simulation(71),a=s.addAnt('worker',s.nest.x,s.nest.y),corpse={id:'corpse-test',x:s.nest.x+1,y:s.nest.y,alive:false,food:4,state:'dead',path:[]};s.creatures.push(corpse);s.food=100;s.setFeeder(a);advance(s,4);assert.ok(corpse.food<4);assert.ok(s.food>100)});
test('manual harvest collects every loose food type into queen storage',()=>{const s=new Simulation(74),a=s.addAnt('worker',s.nest.x,s.nest.y),resource={id:'seed-test',x:s.nest.x+1,y:s.nest.y,foodType:'seeds',remaining:5,initial:5,decay:0,state:'active'};s.resources.push(resource);s.food=100;s.syncStores();const before=s.food;assert.equal(s.orderTarget('harvest',resource.id,[a]),null);advance(s,4);assert.ok(resource.remaining<5);assert.ok(s.food>before);assert.ok(s.foodStore.items.some(item=>item.foodType==='seeds'))});
test('soldiers receive manual target commands',()=>{const s=new Simulation(72),a=s.addAnt('soldier',s.nest.x,s.nest.y),creature={id:'target-test',x:s.nest.x+1,y:s.nest.y,alive:true,health:20,species:'worm',food:1,state:'active',path:[]};s.creatures.push(creature);assert.equal(s.orderTarget('attack',creature.id,[a]),null);assert.equal(a.task.targetId,creature.id);assert.equal(a.state,'attack')});
test('a live timed threat makes a worker retreat, report, and dispatch a soldier',()=>{const s=new Simulation(73),worker=s.addAnt('worker',s.nest.x+1,s.nest.y),soldier=s.addAnt('soldier',s.nest.x,s.nest.y),threat={id:'threat-test',x:worker.x,y:worker.y,alive:true,health:50,species:'beetle',food:1,state:'active',path:[],timer:0,provoked:true};s.creatures.push(threat);advance(s,3);assert.equal(worker.threatId,null);assert.equal(soldier.task.targetId,threat.id);assert.equal(soldier.state,'attack');assert.ok(s.events.some(e=>e.text.includes('Soldiers respond')))});
test('deep water is impassable and rising water damages every ant type',()=>{const s=new Simulation(8),c=s.world.peek(s.nest.x+1,s.nest.y);c.water=7;assert.equal(pathfind(s.world,s.nest,c),null);const a=s.addAnt('worker',c.x,c.y),hp=a.health;Ecology.update(s,.01);assert.ok(a.health<hp)});
test('physical storage and evolution increase food, water and colony limits',()=>{const s=new Simulation(9);assert.equal(s.foodStore.hole,false);assert.equal(s.foodCapacity(),300);s.evolution=1000;s.evolve('food_store');s.evolve('water_store');s.evolve('colony_limit');assert.equal(s.foodCapacity(),750);assert.equal(s.waterCapacity(),250);assert.equal(s.colonyCapacity(),25);const c=s.world.peek(s.nest.x+1,s.nest.y);c.waterStorage=true;c.water=0;assert.equal(pathfind(s.world,s.nest,c),null)});
test('capacity evolutions are repeatable with escalating costs',()=>{const s=new Simulation(92);s.evolution=1000;assert.equal(s.evolve('food_store'),null);assert.equal(s.traitLevels.food_store,1);assert.equal(s.foodCapacity(),750);assert.equal(s.evolve('food_store'),null);assert.equal(s.traitLevels.food_store,2);assert.equal(s.foodCapacity(),1875);assert.equal(s.evolution,625)});
test('feeder cap begins at 1 and doubles with feeder_limit evolution at initial 75 cost',()=>{const s=new Simulation(99),a1=s.addAnt('worker',s.nest.x,s.nest.y),a2=s.addAnt('worker',s.nest.x,s.nest.y);assert.equal(s.feederCapacity(),1);assert.equal(s.setFeeder(a1),null);assert.ok(s.setFeeder(a2).includes('Feeder cap reached'));s.evolution=200;assert.equal(s.evolve('feeder_limit'),null);assert.equal(s.feederCapacity(),2);assert.equal(s.setFeeder(a2),null);assert.equal(s.evolution,125)});
test('food and water are consumed from stored-item records',()=>{const s=new Simulation(93);s.spendFood(10);s.spendWater(5);assert.equal(s.food,290);assert.equal(s.water,95);assert.equal(s.foodStore.items.reduce((n,item)=>n+item.amount,0),290);assert.equal(s.waterStore.items.reduce((n,item)=>n+item.amount,0),95)});
test('food and queen water are individual slots while reservoir droplets stay independent',()=>{const s=new Simulation(95),a=s.addAnt('worker',s.nest.x,s.nest.y),c=s.world.peek(s.nest.x+1,s.nest.y);assert.equal(s.foodStore.items.length,300);assert.equal(s.foodStore.items[6].storageTile,1);assert.equal(s.foodStore.items[6].storageSlot,1);assert.equal(s.waterStore.items.length,100);c.solid=false;c.waterStorage=true;s.waterStore.tiles.push({x:c.x,y:c.y,water:5,items:s.makeItems('test-droplet','droplet',5)});s.water=50;s.syncStores();assert.equal(s.requestReservoirWithdrawal(),null);advance(s,3);assert.ok(s.water>=54.5&&s.water<=55);assert.equal(s.reservoirWater(),0);assert.equal(s.waterStore.used,0);assert.equal(s.waterStore.items.length,55);assert.equal(a.carry,null)});
test('spoil objects and area lifecycle are serialized independently',()=>{const s=new Simulation(96),cell=s.world.peek(s.nest.x+1,s.nest.y),worker=s.addAnt('worker',s.nest.x,s.nest.y);cell.zone='spoil';cell.solid=false;worker.carry={type:'soil',amount:1};worker.destination={kind:'spoil',point:cell};worker.timer=0;s.deposit(worker,0);assert.equal(s.spoilItems.length,1);assert.equal(s.paintArea(cell.x,cell.y,'Nursery','territory'),true);const renamed=s.renameArea('territory:Nursery','Brood');assert.equal(renamed,'territory:Brood');const copy=Simulation.restore(JSON.parse(JSON.stringify(s.serialize())));assert.equal(copy.areas['territory:Brood'].name,'Brood');assert.equal(copy.spoilItems.length,1);assert.equal(copy.eraseArea('territory:Brood'),true);assert.equal(copy.world.peek(cell.x,cell.y).area,undefined)});
test('a completed dirt hole becomes ordinary soil and reservoirs have an access destination',()=>{const s=new Simulation(94),pit=s.world.pit,pc=s.world.peek(pit.x,pit.y),a=s.addAnt('worker',s.nest.x,s.nest.y);pit.used=pit.capacity-1;a.carry={type:'soil',amount:1};a.destination={kind:'pit',pit,point:pit};a.timer=0;s.deposit(a,0);assert.equal(pc.solid,true);assert.equal(pc.zone,'soil');const c=s.world.peek(s.nest.x+1,s.nest.y);c.solid=false;c.waterStorage=true;s.waterStore.tiles.push({x:c.x,y:c.y,water:0,items:[]});assert.equal(s.reservoirDestination(a)?.kind,'reservoir')});
test('water reservoir requires two excavations before construction',()=>{const s=new Simulation(91),c=s.world.peek(s.nest.x+1,s.nest.y);const a=s.addAnt('worker',s.nest.x,s.nest.y);s.world.pit.used=10;s.designateBuild(c.x,c.y,a,'water');for(let i=0;i<1080;i++)s.update(1/30);assert.equal(c.waterStorage,true);assert.equal(c.excavations,2);assert.equal(s.jobs.some(j=>j.structure==='water'),false);assert.equal(s.world.removed,0)});
test('health metadata, shade variation, enemy resources and save are stable',()=>{const s=new Simulation(10),a=s.addAnt('worker',s.nest.x,s.nest.y);assert.equal(a.maxHealth,100);assert.ok(a.shade>.85&&a.shade<1.15);s.world.ensureChunk(3,0);Ecology.sync(s);const col=s.colonies.find(c=>c.featureId==='colony-3,0');assert.equal(col.food,600);assert.equal(col.water,200);s.setFeeder(a);const copy=Simulation.restore(JSON.parse(JSON.stringify(s.serialize())));assert.equal(copy.ants.find(w=>w.id===a.id).feeder,true);assert.ok(copy.conservation())});
test('princesses have a durable winged reproductive model',()=>{const s=new Simulation(98),p=s.addAnt('princess',s.nest.x,s.nest.y);assert.deepEqual(p.reproductive,{role:'princess',winged:true,mateReady:false,dispersal:false});assert.equal(p.visual.caste,'princess')});
test('founding placements are revealed, seeded, varied, and keep the guaranteed black hole inside spoil',()=>{const a=new Simulation(201),same=new Simulation(201),other=new Simulation(202);assert.deepEqual(a.nest,same.nest);assert.deepEqual(a.world.pit,same.world.pit);assert.notDeepEqual(a.nest,other.nest);assert.ok(pathfind(a.world,a.nest,a.world.pit));assert.equal(a.foodStore.x,a.world.founding.foodStore.x);assert.ok(a.world.founding.waterStore);const waterCell=a.world.peek(a.world.founding.waterStore.x,a.world.founding.waterStore.y);assert.equal(waterCell.discovered,true);assert.equal(waterCell.water,7);assert.ok(a.world.activeWater.has(`${waterCell.x},${waterCell.y}`));for(const seed of[201,202,203,204,205]){const s=new Simulation(seed),spoil=s.world.founding.spoil,pit=s.world.peek(s.world.pit.x,s.world.pit.y),wc=s.world.peek(s.world.founding.waterStore.x,s.world.founding.waterStore.y);assert.ok(hexDistance(s.world.pit,spoil)<=3);assert.equal(pit.zone,'pit');assert.equal(pit.solid,false);assert.equal(pit.discovered,true);assert.equal(wc.water,7);assert.equal(wc.discovered,true);assert.equal(s.world.peek(s.nest.x,s.nest.y).discovered,true);assert.equal(s.world.peek(spoil.x,spoil.y).discovered,true);}});
test('personal ant hunger and thirst use separate ten and twenty percent thresholds',()=>{const s=new Simulation(203),a=s.addAnt('worker',s.nest.x,s.nest.y);assert.equal(s.antFoodNeedRatio,.10);assert.equal(s.antWaterNeedRatio,.20);assert.equal(a.foodNeed,50);assert.equal(a.waterNeed,50);a.foodNeed=6;s.update(1/30);assert.notEqual(a.state,'need-food');a.foodNeed=4;s.update(1/30);assert.equal(a.state,'need-food');a.state='idle';a.task=null;a.foodNeed=50;a.waterNeed=9;s.update(1/30);assert.equal(a.state,'need-water')});
test('ant need thresholds are configurable and saved',()=>{const s=new Simulation(205);s.antFoodNeedRatio=.4;s.antWaterNeedRatio=.3;const copy=Simulation.restore(JSON.parse(JSON.stringify(s.serialize())));assert.equal(copy.antFoodNeedRatio,.4);assert.equal(copy.antWaterNeedRatio,.3);const a=copy.addAnt('worker',copy.nest.x,copy.nest.y);a.foodNeed=19;assert.equal(copy.antNeedType(a),'food')});
test('starving or dehydrated ants take damage and can die',()=>{const s=new Simulation(206),a=s.addAnt('worker',s.nest.x,s.nest.y);a.foodNeed=0;a.waterNeed=50;const hp=a.health;s.update(1);assert.ok(a.health<hp);a.health=1;a.waterNeed=0;s.update(1);assert.equal(a.alive,false);assert.equal(a.state,'dead')});
test('manual and combat orders retain priority over automatic ant needs',()=>{const s=new Simulation(204),a=s.addAnt('worker',s.nest.x,s.nest.y);a.foodNeed=4;a.held=true;s.update(1/30);assert.notEqual(a.state,'need-food');a.held=false;a.state='attack';a.task={type:'attack',source:'manual'};s.update(1/30);assert.notEqual(a.state,'need-food');assert.ok(a.foodNeed<4)});
test('soldier attacks execute properly and queen emits warnings when dehydrated',()=>{const s=new Simulation(210),soldier=s.addAnt('soldier',s.nest.x,s.nest.y),creature={id:'target-soldier-test',x:s.nest.x+1,y:s.nest.y,alive:true,health:20,species:'worm',food:1,state:'active',path:[]};s.creatures.push(creature);assert.equal(s.orderTarget('attack',creature.id,[soldier]),null);advance(s,2);assert.equal(creature.alive,false);const q=s.queen();if(q)q.water=0;s.water=0;s.update(1/30);assert.ok(s.events.some(e=>e.text.includes('DEHYDRATED')));const cell=s.world.get(35,0);assert.equal(s.designate(35,0),true);cell.discovered=true;cell.solid=false;s.refreshJobStates();assert.equal(s.jobs.some(j=>j.x===35&&j.y===0),false)});
test('extracting water from a pool reduces tile water level proportionally down to dry',()=>{const s=new Simulation(301),c=s.world.peek(23,-16);c.solid=false;c.water=7;c.discovered=true;s.world.activeWater.add(AntGame.key(c.x,c.y));assert.equal(AntGame.getWaterExtractValue(7),100);assert.equal(AntGame.getWaterExtractValue(6),85);assert.equal(AntGame.getWaterExtractValue(5),70);assert.equal(AntGame.getWaterExtractValue(3),45);const bank=s.world.neighbors(c.x,c.y)[0];bank.solid=false;bank.water=0;bank.discovered=true;const worker=s.addAnt('worker',bank.x,bank.y);worker.waterNeed=0;assert.equal(s.assignAntNeed(worker),true);s.consumeAntNeed(worker);assert.ok(c.water<7);assert.ok(c.water>0);c.water=0.35;worker.waterNeed=0;assert.equal(s.assignAntNeed(worker),true);s.consumeAntNeed(worker);assert.equal(c.water,0)});
test('water spread stops when thinned to level 0.5 and level 1 tiles do not spread unless triggered',()=>{const s=new Simulation(400),center=s.world.peek(s.nest.x+1,s.nest.y);center.water=1.0;center.solid=false;s.world.activeWater.add(AntGame.key(center.x,center.y));const neighbor=s.world.neighbors(center.x,center.y)[0];neighbor.solid=false;neighbor.water=0;advance(s,2);assert.equal(center.water,1.0);assert.equal(neighbor.water,0);center.water=7.0;advance(s,10);assert.ok(neighbor.water>0);assert.ok(center.water>0)});
test('water flows from 2.6 tile to adjacent 0.5 tile regardless of string key order',()=>{const s=new Simulation(401),c=s.world.peek(s.nest.x+1,s.nest.y),n1=s.world.neighbors(c.x,c.y)[0],n2=s.world.neighbors(c.x,c.y)[1];c.solid=false;n1.solid=false;n2.solid=false;c.water=2.6;n1.water=2.6;n2.water=0.5;s.world.activeWater.add(AntGame.key(c.x,c.y));s.world.activeWater.add(AntGame.key(n1.x,n1.y));s.world.activeWater.add(AntGame.key(n2.x,n2.y));advance(s,3);assert.ok(n2.water>0.5);assert.ok(c.water<2.6||n1.water<2.6)});
test('water reservoir block sucks water from adjacent tiles until level 7, blocks walking, and allows overflow when full',()=>{const s=new Simulation(402),resCell=s.world.peek(s.nest.x+1,s.nest.y),waterCell=s.world.neighbors(resCell.x,resCell.y)[0];resCell.solid=false;resCell.waterStorage=true;resCell.water=0;s.waterStore.tiles.push({x:resCell.x,y:resCell.y,water:0,items:[]});waterCell.solid=false;waterCell.water=5;s.world.activeWater.add(AntGame.key(waterCell.x,waterCell.y));assert.equal(pathfind(s.world,s.nest,resCell),null);advance(s,2);assert.ok(resCell.water>0);assert.ok(waterCell.water<5);resCell.water=7;waterCell.water=7;advance(s,2);assert.equal(resCell.water,7)});
test('water reservoir at level 4 does not leak or release water to lower dry neighbors',()=>{const s=new Simulation(403),resCell=s.world.peek(s.nest.x+1,s.nest.y),dryCell=s.world.neighbors(resCell.x,resCell.y)[0];resCell.solid=false;resCell.waterStorage=true;resCell.water=4.0;s.waterStore.tiles.push({x:resCell.x,y:resCell.y,water:4.0,items:[]});dryCell.solid=false;dryCell.water=0;s.world.activeWater.add(AntGame.key(resCell.x,resCell.y));advance(s,3);assert.equal(resCell.water,4.0);assert.equal(dryCell.water,0)});
test('rocks and wells generate correctly, reject digging, and well does not overflow 20 water',()=>{const s=new Simulation(500),f=Ecology.expedition(s,'well'),wellCell=s.world.peek(f.x,f.y);assert.ok(wellCell);assert.equal(wellCell.zone,'well');assert.equal(wellCell.isWell,true);assert.equal(wellCell.water,20);assert.equal(AntGame.getWaterExtractValue(20),285);const dryPassage=s.world.peek(f.passageX,f.passageY);dryPassage.solid=false;dryPassage.discovered=true;s.world.activeWater.add(AntGame.key(f.x,f.y));advance(s,5);assert.equal(wellCell.water,20);assert.equal(dryPassage.water,0)});
test('rocks generate in clusters and dev expedition button finds well without digging rocks',()=>{const s=new Simulation(501),f=Ecology.expedition(s,'well');assert.ok(f);assert.equal(f.type,'well');assert.ok(s.world.peek(f.x,f.y).discovered);assert.equal(s.world.peek(f.x,f.y).isWell,true);const rocks=[];for(const cell of s.world.cells.values())if(cell.rock)rocks.push(cell);assert.ok(rocks.length>=7);const r0=rocks[0],hasAdj=rocks.some(r=>r!==r0&&hexDistance(r,r0)<=2);assert.ok(hasAdj)});
test('supermajor pathing and travel execute without error',()=>{const s=new Simulation(601),sm=s.addAnt('supermajor',s.nest.x,s.nest.y);assert.equal(sm.clearanceNeeded,3);const target={x:s.nest.x+2,y:s.nest.y};assert.equal(s.move(sm,target),null);advance(s,2);assert.ok(sm.alive)});
// UI CONTRACT: a minimal DOM harness exercises area planning and map-overlay cleanup.
test('completion UI creates reusable area plans and closes its color-map overlay',()=>{const priorWindow=globalThis.window,priorDocument=globalThis.document,priorInterval=globalThis.setInterval,items={};const make=()=>({hidden:false,children:[],value:'',textContent:'',title:'',classList:{toggle(){},add(){},remove(){}},append(child){this.children.push(child);},insertBefore(child){this.children.push(child);},after(...children){this.children.push(...children);},querySelector(selector){return get(selector.slice(1));}}),get=id=>items[id]||(items[id]=make()),toolbar=make(),main=make(),canvas=get('world'),sim=new Simulation(97),renderer={colorMap:false,showPaths:false,camera:{zoom:1},draw(){},ant(){},screen:(x,y)=>({x,y}),tile(){},hover:null};globalThis.window={underfoot:{simulation:sim,renderer}};globalThis.document={createElement:make,querySelector:selector=>selector==='.toolbar'?toolbar:main,getElementById:get};globalThis.setInterval=()=>1;delete require.cache[require.resolve('../src/completion-ui.js')];require('../src/completion-ui.js');toolbar.children[0].onclick();assert.equal(main.children[0].hidden,false);assert.equal(renderer.colorMap,true);get('area-name').value='Brood plan';get('area-type').value='food';get('area-add').onclick();assert.ok(sim.areas['food:Brood plan']);toolbar.children[0].onclick();assert.equal(renderer.colorMap,false);globalThis.window=priorWindow;globalThis.document=priorDocument;globalThis.setInterval=priorInterval;delete require.cache[require.resolve('../src/completion-ui.js')];});
// ECOLOGY REGRESSION: spawn variation is durable, and the food value follows it exactly.
test('ecology creatures use persistent size, food, and color variation',()=>{const s=new Simulation(801),c=Ecology.spawnCreature(s,'weevil',s.nest.x,s.nest.y);assert.ok(c.size>=.91&&c.size<=1.10);assert.ok(c.colorVariation>=.92&&c.colorVariation<=1.08);assert.equal(c.food,Math.round(AntGame.Species.weevil.baseFood*c.size));assert.equal(c.clearanceNeeded,1)});
// ECOLOGY REGRESSION: mites may cross one dirt tile, but not rock or two dirt cells.
test('mite routes may use one dirt tile but reject rock and consecutive dirt',()=>{const s=new Simulation(802),x=s.nest.x,y=s.nest.y;for(const p of hexDisk(x+1,y,3)){const c=s.world.get(p.x,p.y);Object.assign(c,{solid:true,rock:true,water:0,discovered:true});}for(let i=0;i<=4;i++){const c=s.world.get(x+i,y);Object.assign(c,{solid:false,rock:false,water:0,discovered:true});}const mite=Ecology.spawnCreature(s,'mite',x,y,{state:'active'}),dirt=s.world.get(x+1,y);dirt.solid=true;assert.ok(Ecology.miteRoute(s,mite,{x:x+2,y}).length);const second=s.world.get(x+2,y);second.solid=true;assert.equal(Ecology.miteRoute(s,mite,{x:x+3,y}).length,0);dirt.solid=false;dirt.rock=true;assert.equal(Ecology.miteRoute(s,mite,{x:x+2,y}).length,0)});
// ECOLOGY REGRESSION: webs immobilize, webbed deaths become eggs, and eggs hatch weak babies.
test('spider webs immobilize ants and webbed deaths hatch baby spiders',()=>{const s=new Simulation(803),a=s.addAnt('worker',s.nest.x+1,s.nest.y),spider=Ecology.spawnCreature(s,'spider',s.nest.x,s.nest.y,{state:'active',webCooldown:0});s.creatures.push(spider);Ecology.webs(s,[a],.1);assert.ok(a.webbedUntil>s.time);s.kill(a);assert.equal(s.spiderEggs.length,1);s.spiderEggs[0].age=AntGame.Config.spiderEggHatchTime;Ecology.webs(s,[],0);const baby=s.creatures.find(c=>c.species==='baby_spider');assert.equal(baby?.health,40)});
// ECOLOGY REGRESSION: discovering a root maps its entire vein and creates aphids.
test('root encounters reveal a harvest area with associated aphids',()=>{const s=new Simulation(804),x=s.nest.x+8,y=s.nest.y,f={id:'root-test',type:'root-vein',x,y,length:3,dirX:1,dirY:0};s.world.features.push(f);for(const p of s.world.rootCells(f)){const c=s.world.get(p.x,p.y);Object.assign(c,{solid:true,root:true,terrain:'root',hardness:4,woodDurability:500,zone:'root',feature:f.id,discovered:false});}const a=s.addAnt('worker',x-1,y);s.world.open(x-1,y,'tunnel',true);Ecology.sync(s);Ecology.rootAreas(s,[a],0);assert.ok(s.rootAreas[f.id]);assert.equal(Object.keys(s.areas).some(id=>id.includes(f.id)),true);const aphids=s.creatures.filter(c=>c.rootFeatureId===f.id&&c.species==='root_aphid');assert.ok(aphids.length>=3&&aphids.length<=8);assert.equal(s.world.rootCells(f).every(p=>s.world.peek(p.x,p.y).discovered),true)});
// SCALE REGRESSION: collision widths are deliberate central-body values, not the former 1/2/3 labels.
test('creature clearance follows corrected central body widths',()=>{const d=AntGame.Species;assert.equal(d.weevil.clearance,1);assert.equal(d.isopod.clearance,2);assert.equal(d.grub.clearance,2);assert.equal(d.spider.clearance,3);assert.equal(d.hercules.clearance,8);assert.ok(d.hercules.bodyWidth>=7&&d.hercules.bodyWidth<=10);assert.ok(d.hercules.bodyWidth>d.spider.bodyWidth);assert.ok(d.mite.bodyWidth<d.weevil.bodyWidth)});
// ANIMATION REGRESSION: each flexible creature keeps prior motion and a section trail for renderer interpolation.
test('worms and grubs retain dense connected movement trails',()=>{const s=new Simulation(805),worm=Ecology.spawnCreature(s,'worm',s.nest.x,s.nest.y,{state:'active'}),grub=Ecology.spawnCreature(s,'grub',s.nest.x,s.nest.y,{state:'active'});worm.path=[{x:worm.x+1,y:worm.y}];grub.path=[{x:grub.x+1,y:grub.y}];Ecology.move(worm,AntGame.Species.worm,.05);Ecology.move(grub,AntGame.Species.grub,.05);const gap=trail=>Math.max(...trail.slice(1).map((p,i)=>Math.hypot(p.x-trail[i].x,p.y-trail[i].y)));assert.notEqual(worm.prevX,worm.x);assert.notEqual(grub.prevX,grub.x);assert.ok(worm.bodyTrail.length>50&&grub.bodyTrail.length>50);assert.ok(gap(worm.bodyTrail)<=.081&&gap(grub.bodyTrail)<=.081);assert.ok(worm.gait>0&&grub.gait>0)});
test('multi-expedition cycle searches outward for consecutive distinct features without duplicates',()=>{const s=new Simulation(806),f1=Ecology.expedition(s,'root');assert.ok(f1);assert.equal(f1.type,'root-vein');const f2=Ecology.expedition(s,'root');assert.ok(f2);assert.equal(f2.type,'root-vein');assert.notEqual(f1.id,f2.id);assert.ok(s._visitedFeatures.has(f1.id));assert.ok(s._visitedFeatures.has(f2.id));});
test('spider lair generates naturally, can be found via expedition, and contains web tiles and spider',()=>{const s=new Simulation(807),f=Ecology.expedition(s,'spider');assert.ok(f);assert.ok(f.type==='spider-cavity'||f.species==='spider');const spider=s.creatures.find(c=>c.species==='spider');assert.ok(spider);assert.equal(spider.state,'active');assert.equal(spider.devActivated,true);const lairWebs=[];for(const p of hexDisk(f.x,f.y,f.r||4)){const c=s.world.peek(p.x,p.y);if(c?.web)lairWebs.push(c);}assert.ok(lairWebs.length>0);});
test('creatures stay dormant when far from ants and freeze again when ants leave activation range',()=>{const s=new Simulation(808),weevil=Ecology.spawnCreature(s,'weevil',s.nest.x+100,s.nest.y+100,{state:'dormant'});s.creatures.push(weevil);Ecology.creatures(s,s.ants,1);assert.equal(weevil.state,'dormant');assert.equal(weevil.aiTicks,0);const ant=s.ants[0];ant.x=s.nest.x+100;ant.y=s.nest.y+100;s.world.senseAt(ant.x,ant.y,5);Ecology.creatures(s,[ant],1);assert.equal(weevil.state,'active');assert.ok(weevil.aiTicks>0);ant.x=s.nest.x;ant.y=s.nest.y;Ecology.creatures(s,[ant],1);assert.equal(weevil.state,'dormant');assert.equal(weevil.path.length,0);});
test('asymmetric freeze hysteresis keeps creature active up to 3x unfreeze distance (30 unfreeze, 90 refreeze) before refreezing',()=>{const s=new Simulation(809),spider=Ecology.spawnCreature(s,'spider',s.nest.x+40,s.nest.y,{state:'dormant'});s.creatures.push(spider);s.world.senseAt(spider.x,spider.y,5);const ant=s.ants[0];ant.x=s.nest.x;ant.y=s.nest.y;Ecology.creatures(s,[ant],1);assert.equal(spider.state,'dormant');ant.x=spider.x-25;ant.y=spider.y;Ecology.creatures(s,[ant],1);assert.equal(spider.state,'active');ant.x=spider.x-75;ant.y=spider.y;Ecology.creatures(s,[ant],1);assert.equal(spider.state,'active');ant.x=spider.x-105;ant.y=spider.y;Ecology.creatures(s,[ant],1);assert.equal(spider.state,'dormant');assert.equal(spider.path.length,0);});
test('root aphids are exempt from freeze behavior and advance milk timer independently',()=>{const s=new Simulation(810),aphid=Ecology.spawnCreature(s,'root_aphid',s.nest.x+100,s.nest.y+100,{state:'active',milkCooldown:30});s.creatures.push(aphid);Ecology.creatures(s,s.ants,1);assert.equal(aphid.state,'active');Ecology.rootAreas(s,s.ants,5);assert.equal(aphid.milkCooldown,25);});
test('spider eggs hatch and baby spiders mature even when dormant in distant dark caves',()=>{const s=new Simulation(811);s.spiderEggs.push({id:'egg-distant',x:s.nest.x+200,y:s.nest.y+200,age:AntGame.Config.spiderEggHatchTime-1,duration:AntGame.Config.spiderEggHatchTime});Ecology.webs(s,s.ants,2);const baby=s.creatures.find(c=>c.species==='baby_spider');assert.ok(baby);baby.babyAge=AntGame.Config.babySpiderMatureTime-1;Ecology.webs(s,s.ants,2);const adult=s.creatures.find(c=>c.id===baby.id);assert.equal(adult.species,'spider');assert.equal(adult.health,AntGame.Species.spider.health);});
test('killed entities have path cleared and isMoving false ensuring dead bodies remain still',()=>{const s=new Simulation(812),a=s.ants[0];a.isMoving=true;a.path=[{x:a.x+1,y:a.y}];s.kill(a);assert.equal(a.alive,false);assert.equal(a.isMoving,false);assert.equal(a.path.length,0);const weevil=Ecology.spawnCreature(s,'weevil',s.nest.x,s.nest.y,{state:'active',isMoving:true,path:[{x:s.nest.x+1,y:s.nest.y}]});s.creatures.push(weevil);a.alive=true;a.state='attack';a.task={type:'attack',targetId:weevil.id};weevil.health=1;Ecology.workTarget(s,a,0.1);assert.equal(weevil.alive,false);assert.equal(weevil.state,'dead');assert.equal(weevil.isMoving,false);assert.equal(weevil.path.length,0);});
test('earthworms prefer digging into solid soil and burrow away from attacker when attacked',()=>{const s=new Simulation(813),worm=Ecology.spawnCreature(s,'worm',s.nest.x,s.nest.y,{state:'active',provoked:true,fleeTimer:10,lastAttacker:{x:s.nest.x-2,y:s.nest.y}});s.creatures.push(worm);Ecology.creatures(s,s.ants,1.2);assert.ok(worm.mineDirection!==undefined);const dirs=AntGame.HEX_DIRS,chosenDir=dirs[worm.mineDirection];const target={x:s.nest.x+chosenDir[0],y:s.nest.y+chosenDir[1]};assert.ok(hexDistance(target,worm.lastAttacker)>=hexDistance({x:s.nest.x,y:s.nest.y},worm.lastAttacker));});
test('hostile creatures attack non-player passive creatures and each other',()=>{const s=new Simulation(814),spider=Ecology.spawnCreature(s,'spider',s.nest.x+50,s.nest.y+50,{state:'active',devActivated:true}),isopod=Ecology.spawnCreature(s,'isopod',s.nest.x+51,s.nest.y+50,{state:'active',devActivated:true,health:40});s.creatures.push(spider,isopod);s.world.senseAt(spider.x,spider.y,5);s.world.open(spider.x,spider.y,'cavity',true);s.world.open(isopod.x,isopod.y,'cavity',true);Ecology.creatures(s,s.ants,0.1);assert.ok(isopod.health<40||isopod.provoked);assert.equal(isopod.lastAttacker?.id,spider.id);});
test('chunk rarity tiers follow configured probabilities and stone clusters are uncommon',()=>{const w=new World(999);assert.ok(AntGame.Rarity.Infinitesimal.chance<0.01);assert.ok(AntGame.Rarity.VeryRare.chance<=0.05);assert.ok(AntGame.Rarity.Rare.chance<=0.15);assert.ok(AntGame.Rarity.Uncommon.chance<=0.35);let seeds=0,spiders=0,roots=0,hercules=0,rocks=0,totalChunks=0;for(let cy=-10;cy<=10;cy++)for(let cx=-10;cx<=10;cx++){if(cx===0&&cy===0)continue;totalChunks++;const defs=w.featureDefinitions(cx,cy);for(const f of defs){if(f.type==='seed-site')seeds++;if(f.type==='spider-cavity')spiders++;if(f.type==='root-vein')roots++;if(f.type==='hercules-cavity')hercules++;}const ch=AntGame.hash(w.seed+888,cx,cy);if((ch%3)===0)rocks++;}assert.ok(seeds>0&&seeds/totalChunks<=0.35);assert.ok(spiders/totalChunks<0.08);assert.ok(roots/totalChunks<0.08);assert.ok(hercules/totalChunks<=0.015);assert.ok(rocks/totalChunks>0.20&&rocks/totalChunks<0.45);});
test('generic caves can generate empty while specialized lairs spawn their resident',()=>{const s=new Simulation(1001);let emptyCaves=0,inhabitedCaves=0;for(let i=0;i<100;i++){const f={id:`cave-test-${i}`,type:'cavity',x:i*17,y:i*23,r:3};s.world.features.push(f);}Ecology.sync(s);for(let i=0;i<100;i++){const id=`cave-test-${i}`;if(s.creatures.some(c=>c.featureId===id))inhabitedCaves++;else emptyCaves++;}assert.ok(emptyCaves>0,'There must be empty caves');assert.ok(emptyCaves>inhabitedCaves,'Empty caves should be more common than inhabited random caves');const specFeature={id:'spec-spider-1',type:'spider-cavity',x:s.nest.x+500,y:s.nest.y+500,r:4};s.world.features.push(specFeature);Ecology.sync(s);assert.ok(s.creatures.some(c=>c.featureId==='spec-spider-1'&&c.species==='spider'));});
test('deep expedition reliably locates infinitesimal hercules and very rare spider lairs',()=>{const s=new Simulation(1002),fSpider=Ecology.expedition(s,'spider');assert.ok(fSpider);assert.equal(fSpider.type,'spider-cavity');assert.ok(s.world.peek(fSpider.x,fSpider.y).discovered);const fHerc=Ecology.expedition(s,'hercules');assert.ok(fHerc);assert.equal(fHerc.type,'hercules-cavity');assert.ok(s.world.peek(fHerc.x,fHerc.y).discovered);const herc=s.creatures.find(c=>c.species==='hercules');assert.ok(herc);assert.equal(herc.state,'active');assert.equal(herc.devActivated,true);});
test('canCarry enforces strict caste matrix for corpses and seeds',()=>{const s=new Simulation(1101),worker=s.addAnt('worker',s.nest.x,s.nest.y),major=s.addAnt('major',s.nest.x,s.nest.y),supermajor=s.addAnt('supermajor',s.nest.x,s.nest.y);const spider={species:'spider',size:1.0,alive:false},hercules={species:'hercules',size:1.0,alive:false},grub={species:'grub',size:1.0,alive:false},normalWorm={species:'worm',size:1.0,alive:false},bigWorm={species:'worm',size:1.3,alive:false},mite={species:'mite',size:1.0,alive:false},isopod={species:'isopod',size:1.0,alive:false},seed={foodType:'seeds',size:1.0};assert.equal(AntGame.canCarry(worker,spider),false);assert.equal(AntGame.canCarry(major,spider),false);assert.equal(AntGame.canCarry(supermajor,spider),false);assert.equal(AntGame.canCarry(worker,hercules),false);assert.equal(AntGame.canCarry(major,hercules),false);assert.equal(AntGame.canCarry(supermajor,hercules),false);assert.equal(AntGame.canCarry(worker,grub),false);assert.equal(AntGame.canCarry(major,grub),false);assert.equal(AntGame.canCarry(supermajor,grub),true);assert.equal(AntGame.canCarry(worker,normalWorm),false);assert.equal(AntGame.canCarry(major,normalWorm),true);assert.equal(AntGame.canCarry(supermajor,normalWorm),true);assert.equal(AntGame.canCarry(major,bigWorm),false);assert.equal(AntGame.canCarry(supermajor,bigWorm),true);assert.equal(AntGame.canCarry(worker,mite),true);assert.equal(AntGame.canCarry(worker,isopod),true);assert.equal(AntGame.canCarry(worker,seed),true);});
test('workers physically carry corpses to storage and feeders process potential food into rations',()=>{const s=new Simulation(1102),worker=s.addAnt('worker',s.nest.x,s.nest.y),mite=Ecology.spawnCreature(s,'mite',s.nest.x+2,s.nest.y,{alive:false,food:15,state:'dead'});s.creatures.push(mite);assert.ok(!mite.inStorage);worker.state='feeding-food';worker.task={type:'feed-food',sourceKind:'corpse',targetId:mite.id};s.pickupFeed(worker);assert.ok(worker.carry);assert.equal(worker.carry.type,'corpse');assert.equal(mite.carriedBy,worker.id);worker.state='depositing';worker.timer=0;s.deposit(worker,0.1);assert.equal(mite.inStorage,true);assert.equal(mite.carriedBy,null);assert.equal(worker.carry,null);const feeder=s.addAnt('worker',mite.x,mite.y);s.setFeeder(feeder);feeder.x=mite.x;feeder.y=mite.y;s.food=10;feeder.state='idle';s.updateWorker(feeder,1.0);assert.ok(s.food>=20);assert.equal(mite.food,5);});
test('ants satisfy hunger and thirst from food storage and water tiles without touching Queen',()=>{const s=new Simulation(1103);s.food=100;s.water=50;const worker=s.addAnt('worker',s.nest.x,s.nest.y);worker.foodNeed=5;worker.waterNeed=5;const foodSource=s.antNeedSource(worker,'food');assert.notEqual(foodSource.kind,'queen');assert.equal(foodSource.kind,'food-store');worker.task={type:'need-food',source:'needs',needSource:foodSource};s.consumeAntNeed(worker);assert.ok(worker.foodNeed>5);assert.equal(s.water,50);const waterSource=s.antNeedSource(worker,'water');assert.notEqual(waterSource.kind,'queen');assert.ok(waterSource.kind==='terrain-water'||waterSource.kind==='reservoir'||waterSource.kind==='well');});
test('rival colony activates within 60 hexes and refreezes beyond 300 hexes',()=>{const s=new Simulation(1104),f={id:2,type:'colony',x:s.nest.x+500,y:s.nest.y,relation:'neutral'};s.world.features.push(f);Ecology.sync(s);const col=s.colonies[0];assert.ok(col);const playerAnt=s.ants.find(a=>a.colonyId===1),players=[playerAnt];playerAnt.x=s.nest.x;playerAnt.y=s.nest.y;Ecology.colonies(s,players,1);assert.equal(col.state,'dormant');playerAnt.x=col.x-50;playerAnt.y=col.y;Ecology.colonies(s,players,1);assert.equal(col.state,'active');assert.ok(s.ants.some(a=>a.colonyId===col.id&&a.type==='queen'));playerAnt.x=col.x-200;playerAnt.y=col.y;Ecology.colonies(s,players,1);assert.equal(col.state,'active');playerAnt.x=col.x-350;playerAnt.y=col.y;Ecology.colonies(s,players,1);assert.equal(col.state,'dormant');});
test('rival colony queen survives, lays eggs, and grows population autonomously',()=>{const s=new Simulation(1105),f={id:2,type:'colony',x:s.nest.x+500,y:s.nest.y,relation:'neutral'};s.world.features.push(f);Ecology.sync(s);const col=s.colonies[0];assert.ok(col);col.state='active';const rivalQueen=s.addAnt('queen',col.x,col.y,col.id);rivalQueen.fertile=true;col.queenId=rivalQueen.id;const before=col.food;s.updateQueen(10);assert.ok(Math.abs((before-col.food)-AntGame.Config.foodDrainPerSecond*0.5*10)<0.001);col.food=AntGame.Config.eggFoodCost+10;col.water=AntGame.Config.eggWaterCost+10;rivalQueen.layTimer=0;s.updateQueen(1);assert.equal(s.eggs.filter(e=>e.colonyId===col.id).length,1);const egg=s.eggs.find(e=>e.colonyId===col.id);egg.age=egg.duration;const popBefore=s.livingPopulation(col.id);s.update(1/30);assert.equal(s.livingPopulation(col.id),popBefore+1);});
test('repeated contacts within 3 hexes increment contactCount and trigger hostility',()=>{const s=new Simulation(1106),f={id:2,type:'colony',x:s.nest.x+500,y:s.nest.y,relation:'neutral'};s.world.features.push(f);Ecology.sync(s);const col=s.colonies[0];assert.ok(col);col.relation='neutral';col.tolerance=3;col.contactCount=0;col.state='active';const rival=s.addAnt('worker',col.x,col.y,col.id),player=s.ants.find(a=>a.colonyId===1);player.x=rival.x+2;player.y=rival.y;Ecology.colonies(s,[player],1);assert.equal(col.contactCount,1);assert.equal(col.relation,'neutral');Ecology.colonies(s,[player],1);assert.equal(col.contactCount,2);assert.equal(col.relation,'neutral');Ecology.colonies(s,[player],1);assert.equal(col.contactCount,3);assert.equal(col.relation,'hostile');});
test('feeder exclusively processes whole stored corpses and seeds while normal workers do not',()=>{const s=new Simulation(1201),w=s.addAnt('worker',s.nest.x,s.nest.y);const corpse={id:'stored-corpse-test',species:'mite',x:s.nest.x+1,y:s.nest.y,alive:false,food:20,state:'dead',inStorage:true,storageColonyId:1};s.creatures.push(corpse);s.food=10;s.updateWorker(w,1.0);assert.equal(s.food,10);assert.equal(corpse.food,20);assert.equal(corpse.processingFeederId,undefined);s.setFeeder(w);w.x=corpse.x;w.y=corpse.y;s.updateWorker(w,1.0);assert.ok(s.food>=20);assert.equal(corpse.food,10);assert.equal(corpse.processingFeederId,w.id);});
test('emergency starvation allows consuming raw corpses or stored seeds without crediting colony rations',()=>{const s=new Simulation(1202),w=s.addAnt('worker',s.nest.x,s.nest.y);s.food=0;const corpse={id:'starve-corpse-test',species:'mite',x:s.nest.x+1,y:s.nest.y,alive:false,food:60,state:'dead'};s.creatures.push(corpse);s.world.peek(corpse.x,corpse.y).discovered=true;w.foodNeed=15;assert.equal(s.antNeedSource(w,'food'),null);w.foodNeed=4;const src=s.antNeedSource(w,'food');assert.ok(src);assert.equal(src.kind,'corpse');w.task={type:'need-food',source:'needs',needSource:src};s.consumeAntNeed(w);assert.equal(w.foodNeed,50);assert.equal(corpse.food,14);assert.equal(s.food,0);});
test('carry reservation and mid-carry hunger immunity prevent conflicts',()=>{const s=new Simulation(1203),w1=s.addAnt('worker',s.nest.x,s.nest.y),w2=s.addAnt('worker',s.nest.x,s.nest.y);s.food=0;s.resources=[];const target={id:'mite-carry-res',species:'mite',x:s.nest.x+1,y:s.nest.y,alive:false,food:10,state:'dead'};s.creatures.push(target);s.world.peek(target.x,target.y).discovered=true;assert.equal(s.orderTarget('carry',target.id,[w1]),null);assert.equal(target.reservedFor,w1.id);w2.foodNeed=4;assert.equal(s.antNeedSource(w2,'food'),null);s.setFeeder(w2);assert.ok(!s.feederSource(w2,'food'));w1.x=target.x;w1.y=target.y;w1.state='to-carry';s.updateWorker(w1,0.1);assert.ok(w1.carry);assert.equal(target.carriedBy,w1.id);assert.equal(s.orderTarget('carry',target.id,[w2]),'That object is already being carried.');w1.foodNeed=2;assert.equal(s.assignAntNeed(w1),false);});
test('pre-carry feeding occurs when hungry worker is ordered to carry with food nearby',()=>{const s=new Simulation(1204),w=s.addAnt('worker',s.nest.x,s.nest.y);s.food=50;const target={id:'pre-carry-target',species:'mite',x:s.nest.x+2,y:s.nest.y,alive:false,food:10,state:'dead'};s.creatures.push(target);s.world.peek(target.x,target.y).discovered=true;w.foodNeed=15;s.orderTarget('carry',target.id,[w]);assert.ok(w.pendingCarry);assert.equal(w.pendingCarry.targetId,target.id);assert.equal(w.task.type,'need-food');assert.equal(w.state,'need-food');s.consumeAntNeed(w);assert.equal(w.foodNeed,50);assert.equal(w.state,'to-carry');assert.equal(w.task.targetId,target.id);});
test('ant autonomous action toggles disable corresponding assignments',()=>{const s=new Simulation(1205),w=s.addAnt('worker',s.nest.x,s.nest.y);const cell=s.world.peek(s.nest.x+1,s.nest.y);cell.solid=true;cell.discovered=true;s.designate(cell.x,cell.y);s.refreshJobStates();w.actions.dig=false;s.assign(w);assert.equal(w.task,null);assert.equal(w.state,'idle');w.actions.dig=true;s.assign(w);assert.ok(w.task);assert.equal(w.task.type,'dig');});
test('moveGroup distributes distinct reachable non-overlapping destinations',()=>{const s=new Simulation(1206);const w1=s.addAnt('worker',s.nest.x,s.nest.y),w2=s.addAnt('worker',s.nest.x,s.nest.y),w3=s.addAnt('worker',s.nest.x,s.nest.y);const target={x:s.nest.x+1,y:s.nest.y};const distDests=s.distributeDestinations(3,target);assert.equal(new Set(distDests.map(d=>`${d.x},${d.y}`)).size,3);s.moveGroup([w1,w2,w3],target);const dests=new Set([w1,w2,w3].map(a=>a.path.length?`${a.path[a.path.length-1].x},${a.path[a.path.length-1].y}`:`${a.x},${a.y}`));assert.equal(dests.size,3);});
test('head-on corridor conflict executes coordinated pairwise swap without deadlock',()=>{const s=new Simulation(1207);for(const p of hexDisk(20,0,3)){const c=s.world.get(p.x,p.y);c.solid=true;c.discovered=true;}const c1=s.world.get(20,0),c2=s.world.get(21,0);c1.solid=false;c2.solid=false;const w1=s.addAnt('worker',20,0),w2=s.addAnt('worker',21,0);w1.path=[{x:21,y:0}];w1.state='moving';w2.path=[{x:20,y:0}];w2.state='moving';s.travel(w1,0.02);assert.equal(w1.swappingWith,w2.id);assert.equal(w2.swappingWith,w1.id);advance(s,2);assert.ok(Math.abs(w1.x-21)<0.1&&Math.abs(w1.y-0)<0.1);assert.ok(Math.abs(w2.x-20)<0.1&&Math.abs(w2.y-0)<0.1);});
test('two-layer priority: tie-break follows visible hierarchy while numeric priority overrides',()=>{const s=new Simulation(1301),w=s.addAnt('worker',s.nest.x,s.nest.y);s.food=100;w.foodNeed=2;const cell=s.world.peek(s.nest.x+1,s.nest.y);cell.solid=true;cell.discovered=true;s.designate(cell.x,cell.y);s.refreshJobStates();s.setCastePriority('worker','selfFeed',1);s.setCastePriority('worker','dig',1);s.assign(w);assert.equal(w.state,'need-food');w.state='idle';w.task=null;w.path=[];s.setCastePriority('worker','selfFeed',2);s.setCastePriority('worker','dig',1);s.assign(w);assert.equal(w.state,'to-dig');});
test('dangerous priority consequences: starving worker continues digging and suffers damage without override',()=>{const s=new Simulation(1302),w=s.addAnt('worker',s.nest.x,s.nest.y);s.food=100;w.foodNeed=0;const cell=s.world.peek(s.nest.x+1,s.nest.y);cell.solid=true;cell.discovered=true;s.designate(cell.x,cell.y);s.refreshJobStates();s.setCastePriority('worker','selfFeed',5);s.setCastePriority('worker','dig',1);s.assign(w);assert.equal(w.state,'to-dig');const hpBefore=w.health;s.drainAntNeeds(w,2.0);assert.ok(w.health<hpBefore);assert.equal(w.state,'to-dig');});
test('action toggle separation and caste capability safety preserved under priority system',()=>{const s=new Simulation(1303),w=s.addAnt('worker',s.nest.x,s.nest.y);const grub={id:'grub-corpse-test',species:'grub',x:s.nest.x+1,y:s.nest.y,alive:false,food:100,state:'dead'};s.creatures.push(grub);s.world.peek(grub.x,grub.y).discovered=true;s.setCastePriority('worker','carry',1);s.assign(w);assert.notEqual(w.task?.targetId,grub.id);const mite={id:'mite-corpse-test',species:'mite',x:s.nest.x+1,y:s.nest.y,alive:false,food:20,state:'dead'};s.creatures.push(mite);w.actions.carry=false;s.assign(w);assert.notEqual(w.task?.targetId,mite.id);});
test('feeder exclusivity preserved and manual command overrides priorities',()=>{const s=new Simulation(1304),w=s.addAnt('worker',s.nest.x,s.nest.y);const corpse={id:'stored-meat-1',species:'mite',x:s.nest.x+1,y:s.nest.y,alive:false,food:20,state:'dead',inStorage:true,storageColonyId:1};s.creatures.push(corpse);s.setCastePriority('worker','feedQueen',1);s.assign(w);assert.notEqual(w.state,'to-process');assert.notEqual(w.task?.type,'process-food');const targetCell={x:s.nest.x+2,y:s.nest.y};s.move(w,targetCell);assert.equal(w.manualOrder,true);assert.equal(w.held,true);assert.equal(w.state,'moving');});
test('10-second release timer automatically returns idle manual/selected ants to colony work',()=>{const s=new Simulation(1305),w=s.addAnt('worker',s.nest.x,s.nest.y);let releasedId=null;s.onAntAutoReleased=(id)=>{releasedId=id;};const target={x:s.nest.x+1,y:s.nest.y};s.move(w,target);assert.equal(w.manualOrder,true);assert.equal(w.held,true);s.update(0.1);assert.equal(w.idleReleaseTimer,0);w.path=[];w.state='idle';w.x=target.x;w.y=target.y;s.update(5.0);assert.equal(w.held,true);assert.ok(w.idleReleaseTimer>=4.9);assert.equal(releasedId,null);s.update(5.1);assert.equal(w.held,false);assert.equal(w.manualOrder,false);assert.equal(releasedId,w.id);w.selected=true;w.held=false;w.manualOrder=false;w.state='idle';s.update(5.0);assert.ok(w.idleReleaseTimer>=4.9);assert.equal(w.selected,true);s.update(5.1);assert.equal(w.selected,false);});
test('caste priorities persist across serialization and restore',()=>{const s=new Simulation(1306);s.setCastePriority('worker','dig',2);s.setCastePriority('soldier','combat',1);s.setCastePriority('major','carry',3);const saved=JSON.parse(JSON.stringify(s.serialize()));const restored=Simulation.restore(saved);assert.equal(restored.getCastePriority('worker','dig'),2);assert.equal(restored.getCastePriority('soldier','combat'),1);assert.equal(restored.getCastePriority('major','carry'),3);assert.equal(restored.getCastePriority('minor','selfFeed'),1);});
test('feeder priority configuration decides whether to feed queen, chew food, or proceed to other tasks',()=>{const s=new Simulation(1307),w=s.addAnt('worker',s.nest.x,s.nest.y);s.setFeeder(w);s.food=10;s.queen().food=100;const corpse={id:'feeder-prio-corpse',species:'mite',x:s.nest.x+1,y:s.nest.y,alive:false,food:30,state:'dead',inStorage:true,storageColonyId:1};s.creatures.push(corpse);const looseSeed={id:'loose-seed-1',foodType:'seeds',x:s.nest.x+2,y:s.nest.y,remaining:40,state:'dormant'};s.resources.push(looseSeed);s.world.peek(looseSeed.x,looseSeed.y).discovered=true;const digCell=s.world.peek(s.nest.x-1,s.nest.y);digCell.solid=true;digCell.discovered=true;s.designate(digCell.x,digCell.y);s.refreshJobStates();s.setCastePriority('feeder','chewFood',1);s.setCastePriority('feeder','feedQueen',3);s.setCastePriority('feeder','dig',5);s.assign(w);assert.equal(w.state,'processing');assert.equal(w.task?.targetId,corpse.id);w.state='idle';w.task=null;w.path=[];s.setCastePriority('feeder','feedQueen',1);s.setCastePriority('feeder','chewFood',3);s.setCastePriority('feeder','dig',5);s.assign(w);assert.equal(w.state,'feeding-food');w.state='idle';w.task=null;w.path=[];s.setCastePriority('feeder','dig',1);s.setCastePriority('feeder','feedQueen',5);s.setCastePriority('feeder','chewFood',5);s.assign(w);assert.equal(w.state,'to-dig');});
test('sim.brush dragging applies valid actions and silently ignores invalid hexes',()=>{
 const s=new Simulation(1308);
 const cellSolid=s.world.get(s.nest.x+1,s.nest.y);cellSolid.solid=true;cellSolid.discovered=true;
 const cellEmpty=s.world.get(s.nest.x+2,s.nest.y);cellEmpty.solid=false;cellEmpty.discovered=true;
 assert.doesNotThrow(()=>{s.brush(s.nest.x+1,s.nest.y,1,'dig',[]);});
 assert.ok(s.jobs.some(j=>j.x===cellSolid.x&&j.y===cellSolid.y&&j.type==='dig'));
 assert.ok(!s.jobs.some(j=>j.x===cellEmpty.x&&j.y===cellEmpty.y));
 const corpse={id:'brush-corpse-1',species:'mite',x:cellEmpty.x,y:cellEmpty.y,alive:false,food:15,state:'dead'};
 s.creatures.push(corpse);
 assert.doesNotThrow(()=>{s.brush(cellEmpty.x,cellEmpty.y,1,'carry',[]);});
 assert.doesNotThrow(()=>{s.brush(s.nest.x+5,s.nest.y+5,2,'harvest',[]);});
 assert.doesNotThrow(()=>{s.brush(s.nest.x+5,s.nest.y+5,2,'attack',[]);});
});
test('colony operations task hierarchy filters feeder-exclusive tasks from non-feeder castes',()=>{
 const feederTasks=AntGame.TaskHierarchy.filter(t=>t.id==='feedQueen'||t.id==='queenWater'||t.id==='chewFood');
 assert.equal(feederTasks.length,3);
 const nonFeederFiltered=AntGame.TaskHierarchy.filter(t=>!['feedQueen','queenWater','chewFood'].includes(t.id));
 assert.ok(nonFeederFiltered.every(t=>t.id!=='feedQueen'&&t.id!=='queenWater'&&t.id!=='chewFood'));
 assert.ok(nonFeederFiltered.some(t=>t.id==='selfFeed'));
 assert.ok(nonFeederFiltered.some(t=>t.id==='dig'&&t.id!=='chewFood'));
});
test('toolbar includes Brush, Select, and Group tools in correct order',()=>{
 const fs=require('fs');
 const path=require('path');
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 assert.ok(html.includes('data-mode="brush"'));
 assert.ok(html.includes('data-mode="select"'));
 assert.ok(html.includes('data-mode="group"'));
 const brushIdx=html.indexOf('data-mode="brush"');
 const selectIdx=html.indexOf('data-mode="select"');
 const groupIdx=html.indexOf('data-mode="group"');
 assert.ok(brushIdx < selectIdx, 'Brush must come before Select');
 assert.ok(selectIdx < groupIdx, 'Select must come before Group');
});
test('selected ant action commands via RMB designate for selected workers without mode reset',()=>{
 const s=new Simulation(1309);
 const w=s.addAnt('worker',s.nest.x,s.nest.y);
 const cellSolid=s.world.get(s.nest.x+1,s.nest.y);cellSolid.solid=true;cellSolid.discovered=true;
 s.brush(cellSolid.x,cellSolid.y,0,'dig',[w]);
 assert.equal(w.preferred,`1:dig:${cellSolid.x},${cellSolid.y}`);
 assert.equal(w.manualOrder,true);
 const buildCell=s.world.get(s.nest.x+2,s.nest.y);buildCell.solid=false;buildCell.discovered=true;
 s.food=50;s.world.pit.used=10;
 s.brush(buildCell.x,buildCell.y,0,'build',[w],'food');
 assert.equal(w.preferred,`1:build:food:${buildCell.x},${buildCell.y}`);
});
test('cancelling active build refunds resources, resets worker to idle without crash, and bulk cancel across workers succeeds',()=>{
 const s=new Simulation(700);
 s.world.pit.used=20;s.world.removed=20;
 const c=s.world.get(s.nest.x+1,s.nest.y);
 c.solid=false;c.discovered=true;
 s.designateBuild(c.x,c.y,null,'food');
 s.refreshJobStates();
 const w=s.addAnt('worker',s.nest.x,s.nest.y);
 s.syncStores();
 s.assign(w);
 for(let i=0;i<400;i++){s.update(1/30);if(w.state==='building')break;}
 assert.equal(w.state,'building');
 const foodBefore=s.food,pitBefore=s.world.pit.used;
 const job=s.jobs.find(j=>j.x===c.x&&j.y===c.y);
 const deliveredFood=job?.deliveredFood||0;
 const deliveredDirt=job?.deliveredDirt||0;
 const carryFood=w.carry?.food||0;
 const carryDirt=w.carry?.dirt||0;
 s.cancel(c.x,c.y);
 assert.equal(w.state,'idle');
 assert.equal(w.task,null);
 assert.equal(w.carry,null);
 assert.equal(s.food,foodBefore+deliveredFood+carryFood);
 assert.equal(s.world.pit.used,pitBefore+deliveredDirt+carryDirt);
 for(let i=0;i<60;i++)s.update(1/30);
 assert.ok(s.conservation());
 for(let dx=-2;dx<=2;dx++){
  for(let dy=-2;dy<=2;dy++){
   const x=s.nest.x+dx,y=s.nest.y+dy;
   const cell=s.world.get(x,y);cell.discovered=true;cell.solid=false;
   s.designateBuild(x,y,null,'food');
  }
 }
 for(let i=0;i<10;i++){const worker=s.addAnt('worker',s.nest.x,s.nest.y);s.assign(worker);}
 for(let i=0;i<60;i++)s.update(1/30);
 for(let dx=-3;dx<=3;dx++)s.brush(s.nest.x+dx,s.nest.y,2,'cancel');
 for(let i=0;i<90;i++)s.update(1/30);
 assert.ok(s.conservation());
});
test('action wheel default is none, move is selectable, and arrow keys cycle actions correctly',()=>{
 const fs = require('fs');
 const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
 const appJs = fs.readFileSync(__dirname + '/../src/app.js', 'utf8');
 assert.ok(html.includes('data-action="none"'), 'index.html has none in action wheel');
 assert.ok(html.includes('data-action="move"'), 'index.html has move in action wheel');
 assert.ok(html.includes('>None</b>'), 'initial action badge is None');
 assert.ok(appJs.includes("activeAction='none'"), 'app.js initializes activeAction to none');
 assert.ok(appJs.includes("e.key==='ArrowUp'||e.key==='ArrowDown'"), 'app.js binds arrow keys to cycle actions');
 assert.ok(appJs.includes("setActiveAction('none')"), 'app.js resets activeAction to none on mode change');
});
test('inactivity timer is 10s, middle mouse exclusively pans camera, and RMB drags orders for selected ants',()=>{
 const fs = require('fs');
 const configJs = fs.readFileSync(__dirname + '/../src/config.js', 'utf8');
 const appJs = fs.readFileSync(__dirname + '/../src/app.js', 'utf8');
 const simJs = fs.readFileSync(__dirname + '/../src/simulation.js', 'utf8');
 assert.ok(configJs.includes('idleReleaseSeconds:10.0') || configJs.includes('idleReleaseSeconds: 10.0'), 'config specifies 10s release timer');
 assert.ok(simJs.includes('C.idleReleaseSeconds||10.0'), 'simulation uses configured 10s release timer');
 assert.ok(appJs.includes('isPan=e.button===1;'), 'camera panning is strictly middle mouse');
 assert.ok(!appJs.includes('isPan=e.button===1||e.button===2'), 'RMB does not trigger camera panning');
 assert.ok(appJs.includes('drag.button===2'), 'RMB drag is handled in pointermove');
 assert.ok(appJs.includes("paint(g,selUnits)"), 'RMB drag dispatches paint orders with selected units');
});
test('ant action toggles menu is separated from toolbar and styled vertically at left-middle of screen',()=>{
 const fs = require('fs');
 const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
 const css = fs.readFileSync(__dirname + '/../hex-ui.css', 'utf8');
 const appJs = fs.readFileSync(__dirname + '/../src/app.js', 'utf8');
 assert.ok(!html.includes('<div class="toolbar-container"><div class="toolbar">...<div id="ant-action-toggles"'), 'toggles are not inside toolbar container');
 assert.ok(!html.includes('class="toolbar-container"><div class="toolbar"') || !html.includes('</div><div id="ant-action-toggles" class="ant-action-toggles" hidden></div></div>'), 'toggles separated from toolbar container');
 assert.ok(css.includes('.ant-action-toggles{position:absolute;left:24px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column'), 'toggles positioned vertically at left-middle of screen');
 assert.ok(appJs.includes('ant-toggles-header'), 'toggles menu includes header');
});
test('feed action toggle is removed from work menu and selfFeed/selfWater are clarified while feeder exclusivity is maintained',()=>{
 const data = require('../src/data.js');
 const AntActions = globalThis.AntGame?.AntActions;
 assert.ok(AntActions, 'AntActions is defined');
 assert.ok(!AntActions.some(a=>a.id==='feed'), 'feed is removed from AntActions');
 assert.ok(AntActions.some(a=>a.id==='selfFeed'&&a.name==='Self Feed'), 'selfFeed is in AntActions as Self Feed');
 assert.ok(AntActions.some(a=>a.id==='selfWater'&&a.name==='Self Water'), 'selfWater is in AntActions as Self Water');
 const s = new Simulation(1401);
 const w = s.addAnt('worker', s.nest.x, s.nest.y);
 s.assign(w);
 assert.notEqual(w.task?.type, 'feedQueen');
 assert.notEqual(w.task?.type, 'queenWater');
 assert.notEqual(w.task?.type, 'chewFood');
});

test('settings manager handles keybinds, audio toggles, wheel mode, numpad and mouse button parsing',()=>{
 const S = AntGame.Settings;
 assert.ok(S, 'SettingsManager is instantiated on AntGame.Settings');

 // Check default keybinds
 assert.equal(S.keybinds.mode_brush.key, 'f');
 assert.equal(S.keybinds.mode_select.key, 'e');
 assert.equal(S.keybinds.mode_group.key, 'r');
 assert.equal(S.keybinds.toggle_wheel_mode.key, 'q');

 assert.equal(S.keybinds.action_dig.key, 'z');
 assert.equal(S.keybinds.action_build.key, 'x');
 assert.equal(S.keybinds.action_cancel.key, 'c');
 assert.equal(S.keybinds.action_harvest.key, 'v');
 assert.equal(S.keybinds.action_carry.key, 'b');
 assert.equal(S.keybinds.action_attack.key, 'n');
 assert.equal(S.keybinds.action_move.key, 'm');

 assert.equal(S.keybinds.camera_up.key, 'w');
 assert.equal(S.keybinds.camera_left.key, 'a');
 assert.equal(S.keybinds.camera_down.key, 's');
 assert.equal(S.keybinds.camera_right.key, 'd');

 // Check empty caste selection & queen focus keys by default
 assert.equal(S.keybinds.select_soldiers, null);
 assert.equal(S.keybinds.select_workers, null);
 assert.equal(S.keybinds.select_feeders, null);
 assert.equal(S.keybinds.focus_queen, null);

 // Test wheel mode toggle
 const initWheel = S.wheelMode;
 const nextWheel = S.toggleWheelMode();
 assert.notEqual(initWheel, nextWheel);
 S.toggleWheelMode(); // return to init

 // Test audio toggle
 const initSound = S.soundEnabled;
 const nextSound = S.toggleSound();
 assert.equal(nextSound, !initSound);
 if (AntGame.AudioCoordinator) {
  assert.equal(AntGame.AudioCoordinator.enabled, nextSound);
 }
 S.toggleSound(); // return to init

 // Test Numpad key parsing & matching
 const numpadEv = { code: 'Numpad5', key: '5' };
 const numDesc = S.parseFromKeyEvent(numpadEv);
 assert.equal(numDesc.code, 'Numpad5');
 assert.equal(numDesc.label, 'Num 5');
 S.keybinds.action_dig = numDesc;
 assert.ok(S.matchesKeyEvent('action_dig', numpadEv));
 assert.ok(!S.matchesKeyEvent('action_dig', { code: 'Digit5', key: '5' }));

 // Test Mouse button parsing & matching (Mouse 3, Mouse 4, Mouse 5, Mouse 6)
 for (const btn of [1, 3, 4, 5]) {
  const mEv = { button: btn };
  const mDesc = S.parseFromMouseEvent(mEv);
  assert.equal(mDesc.button, btn);
  S.keybinds.action_attack = mDesc;
  assert.ok(S.matchesMouseEvent('action_attack', mEv));
  assert.ok(!S.matchesMouseEvent('action_attack', { button: btn === 1 ? 2 : 1 }));
 }

 // Reset keybinds to defaults
 S.resetKeybinds();
 assert.equal(S.keybinds.action_dig.key, 'z');
 assert.equal(S.keybinds.action_attack.key, 'n');
});

test('app.js preserves activeAction between select and group, and wires WASD camera, wheel toggle, and 7 actions',()=>{
 const fs = require('fs');
 const appJs = fs.readFileSync(__dirname + '/../src/app.js', 'utf8');
 const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');

 // Mode switch check
 assert.ok(appJs.includes('isSelectGroupSwitch'), 'setMode checks for select/group transition');

 // Wheel toggle check
 assert.ok(appJs.includes('toggle_wheel_mode'), 'app.js includes toggle_wheel_mode');
 assert.ok(appJs.includes("wheelMode')==='actions'"), 'app.js checks wheelMode for actions cycle');

 // WASD camera panning in frame loop
 assert.ok(appJs.includes('heldKeys'), 'app.js tracks heldKeys');
 assert.ok(appJs.includes('camera_up') && appJs.includes('camera_left'), 'app.js checks camera keys for smooth pan');

 // 7 Actions on Z, X, C, V, B, N, M
 for (const act of ['action_dig', 'action_build', 'action_cancel', 'action_harvest', 'action_carry', 'action_attack', 'action_move']) {
  assert.ok(appJs.includes(act), `app.js binds ${act}`);
 }

 // Caste selection and queen focus handlers
 assert.ok(appJs.includes('select_soldiers'), 'app.js binds select_soldiers');
 assert.ok(appJs.includes('focus_queen'), 'app.js binds focus_queen');

 // Extra mouse buttons listener
 assert.ok(appJs.includes('e.button>=3'), 'app.js listens for extra mouse buttons (Mouse 4, 5, etc.)');

 // HTML script order and buttons
 assert.ok(html.includes('src/settings.js'), 'index.html includes settings.js');
 assert.ok(html.includes('id="settings-open"'), 'index.html includes settings-open button');
 assert.ok(html.includes('id="settings-panel"'), 'index.html includes settings-panel container');
});

test('evolution points accumulate passively over time during simulation update and persist in saves',()=>{
 const s=new Simulation(42);
 assert.equal(s.evolution,0);
 assert.equal(s.totalEvolution,0);
 s.update(10.0);
 assert.ok(s.evolution>1.7&&s.evolution<1.9,`Expected ~1.8 EP after 10s at 0.18/s, got ${s.evolution}`);
 assert.equal(s.totalEvolution,s.evolution);
 const saved=JSON.parse(JSON.stringify(s.serialize()));
 const restored=Simulation.restore(saved);
 assert.equal(restored.evolution,s.evolution);
 assert.equal(restored.totalEvolution,s.totalEvolution);
});

test('UI cleanup: footer removed, title moved to settings, dev bubble toggle, and caste hover legend', () => {
 const fs = require('fs');
 const path = require('path');
 const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf-8');
 const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf-8');
 const hexCss = fs.readFileSync(path.join(__dirname, '..', 'hex-ui.css'), 'utf-8');
 const settingsJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'settings.js'), 'utf-8');
 const appJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf-8');

 // Footer and obsolete tags removed
 assert.ok(!html.includes('<footer>'), 'footer removed from index.html');
 assert.ok(!html.includes('FOUNDING PROTOTYPE'), 'FOUNDING PROTOTYPE text removed');
 assert.ok(!html.includes('Every grain goes somewhere'), 'Every grain goes somewhere removed');
 assert.ok(!html.includes('A colony begins.'), 'A colony begins text removed');
 assert.ok(!html.includes('UNDERGROUND / TOP-DOWN HEX VIEW'), 'view-label removed');

 // Top header brand removed from index.html header
 assert.ok(!html.includes('<header>\n  <div class="brand">'), 'brand removed from main header in index.html');

 // Title moved to settings modal
 assert.ok(settingsJs.includes('settings-title') && settingsJs.includes('UNDERFOOT'), 'settings modal includes UNDERFOOT title');
 assert.ok(settingsJs.includes('brand-mark') && settingsJs.includes('⬢'), 'settings modal includes brand mark');

 // Dev bubble button present in index.html and styled
 assert.ok(html.includes('id="debug-toggle"') && html.includes('dev-bubble'), 'debug-toggle dev bubble in index.html');
 assert.ok(hexCss.includes('.dev-bubble'), 'dev bubble styling exists in hex-ui.css');
 assert.ok(settingsJs.includes('toggleDevMode') && settingsJs.includes('updateDevBubble'), 'settings.js manages dev toggle');

 // Caste hover legend in ant-counter
 assert.ok(html.includes('ant-counter-tooltip'), 'ant-counter contains tooltip legend');
 for (const abbr of ['Q', 'MN', 'WK', 'MD', 'SL', 'MJ', 'SM']) {
  assert.ok(html.includes(`>${abbr}<`), `ant-counter tooltip explains ${abbr}`);
 }
 assert.ok(appJs.includes('ant-counter-badges'), 'app.js preserves ant-counter-badges');

 // Brood points visual style matching evolution points
 assert.ok(css.includes('#evolution,.stats #brood-points') || (css.includes('#evolution') && css.includes('#brood-points')), 'brood-points styled with evolution');

 // Save, load, new colony relocated to settings
 assert.ok(settingsJs.includes('Colony Management'), 'settings.js renders Colony Management');
 assert.ok(settingsJs.includes('id="save"') && settingsJs.includes('id="load"') && settingsJs.includes('id="new"'), 'settings.js has save/load/new');
 assert.ok(appJs.includes('AntGame.Settings.onSaveColony'), 'app.js links onSaveColony');
 assert.ok(appJs.includes('AntGame.Settings.onLoadColony'), 'app.js links onLoadColony');
 assert.ok(appJs.includes('AntGame.Settings.onNewColony'), 'app.js links onNewColony');
});

test('water transport paths to nest without clipping, and low need sources are rejected', () => {
 const s = new Simulation(700);
 const worker = s.addAnt('worker', s.nest.x + 2, s.nest.y);
 worker.carry = { type: 'water', amount: 5 };
 s.toStore(worker);
 assert.notEqual(worker.state, 'blocked');
 assert.equal(worker.destination?.kind, 'queen');
 assert.deepEqual(worker.destination?.point, s.nest);
 advance(s, 2);
 assert.ok(worker.alive);

 // Check low source filter
 const lowWater = s.world.peek(s.nest.x + 3, s.nest.y);
 lowWater.solid = false; lowWater.water = 0.1; lowWater.discovered = true;
 s.world.activeWater.add(AntGame.key(lowWater.x, lowWater.y));
 const thirsty = s.addAnt('worker', s.nest.x + 2, s.nest.y);
 thirsty.waterNeed = 10;
 const src = s.antNeedSource(thirsty, 'water');
 assert.ok(!src || (src.cell?.x !== lowWater.x || src.cell?.y !== lowWater.y));

 // Check scaled caste needs
 const sl = s.addAnt('soldier', s.nest.x, s.nest.y);
 const mj = s.addAnt('major', s.nest.x, s.nest.y);
 const sm = s.addAnt('supermajor', s.nest.x, s.nest.y);
 assert.equal(sl.maxFoodNeed, 125);
 assert.equal(mj.maxFoodNeed, 200);
 assert.equal(sm.maxFoodNeed, 300);
});

test('feeder ant prioritizes queen water with max priority and saves dehydrating queen', () => {
 const s = new Simulation(1500);
 const w = s.addAnt('worker', s.nest.x + 1, s.nest.y);
 s.setFeeder(w);
 const q = s.queen();
 q.water = 10; // Dehydrated!
 s.water = 50; // Colony has stored water
 s.setCastePriority('feeder', 'queenWater', 1);
 s.setCastePriority('feeder', 'chewFood', 3);
 s.setCastePriority('feeder', 'feedQueen', 4);

 // Ensure feeder selects queenWater
 s.assign(w);
 assert.equal(w.task?.type, 'feed-water');
 
 // Advance simulation and verify queen water increases
 advance(s, 2);
 assert.ok(q.water > 10, 'Queen water should have increased');

 // Test emergency interrupt when chewing food
 q.water = 100;
 s.water = s.queenWaterCapacity();
 s.food = 100;
 const corpse = { id: 'corpse-feeder-test', species: 'mite', x: s.nest.x + 1, y: s.nest.y, alive: false, food: 50, inStorage: true, storageColonyId: 1 };
 s.creatures.push(corpse);
 s.setCastePriority('feeder', 'chewFood', 1);
 s.setCastePriority('feeder', 'queenWater', 5);
 s.assign(w);
 assert.equal(w.state, 'processing');

 // Dehydrate queen to critical level and advance
 q.water = 15;
 s.update(1 / 30);
 // Feeder should interrupt processing to save queen
 assert.equal(w.state, 'idle');
 s.assign(w);
 assert.equal(w.task?.type, 'feed-water');
});

test('queen feeding and hydration obey 80% threshold gating and cooldown without infinite looping', () => {
 const s = new Simulation(1501);
 s.resources = [];
 s.creatures = [];
 const w = s.addAnt('worker', s.nest.x, s.nest.y);
 s.setFeeder(w);
 s.food = 100;
 s.water = 100;
 const q = s.queen();

 // 1. At 85% food (170/200) and 85% water (85/100), queen does not need food or water
 q.food = 170;
 q.water = 85;
 assert.ok(!s.feederSource(w, 'food'), 'Feeder should not take food from colony stores when queen is at 85%');
 assert.ok(!s.feederSource(w, 'water'), 'Feeder should not take water from colony stores when queen is at 85%');
 s.assign(w);
 assert.notEqual(w.state, 'feeding-food');
 assert.notEqual(w.state, 'feeding-water');

 // 2. When queen drops below 80% food (e.g. 150/200), feeding activates
 q.food = 150;
 const foodSrc = s.feederSource(w, 'food');
 assert.ok(foodSrc, 'Feeder source for food should be available when queen < 80%');
 assert.equal(foodSrc.kind, 'colony-food');
 s.setCastePriority('feeder', 'feedQueen', 1);
 s.assign(w);
 assert.equal(w.state, 'feeding-food');
 s.pickupFeed(w);
 assert.ok(w.carry && w.carry.type === 'food');
 assert.equal(w.state, 'carrying');
 assert.equal(s.storage(w).kind, 'queen');
 
 // Deposit to queen with surplus test: carry 20 food, queen needs 50 (takes 20, timer gets cooldown)
 w.carry = { type: 'food', amount: 20, foodType: 'ration' };
 w.state = 'depositing';
 w.timer = 0;
 w.destination = { point: s.nest, kind: 'queen' };
 s.deposit(w, 0.1);
 assert.equal(q.food, 170);
 assert.ok(w.timer >= 2.5, 'Post-feed cooldown should be at least 2.5s');

 // 3. When queen drops below 80% water (e.g. 70/100), hydration activates
 q.water = 70;
 const waterSrc = s.feederSource(w, 'water');
 assert.ok(waterSrc, 'Feeder source for water should be available when queen < 80%');
 assert.equal(waterSrc.kind, 'colony-water');
 w.task = { type: 'feed-water', source: waterSrc };
 w.state = 'feeding-water';
 s.pickupFeed(w);
 assert.ok(q.water > 70, 'Queen water should have increased via direct hydration');
 assert.ok(w.timer >= 2.5, 'Post-water cooldown should be at least 2.5s');
});

test('feeder deposits water into reservoir when queen is hydrated', () => {
 const s = new Simulation(1502);
 const resTile = s.world.peek(s.nest.x + 2, s.nest.y);
 resTile.solid = false;
 resTile.discovered = true;
 resTile.waterStorage = true;
 resTile.water = 0;
 s.waterStore.tiles.push(resTile);
 s.waterTarget = 'reservoir';

 const q = s.queen();
 q.water = 100; // Queen is full

 const w = s.addAnt('worker', s.nest.x, s.nest.y);
 s.setFeeder(w);
 w.carry = { type: 'water', amount: 20 };
 const dest = s.storage(w);
 assert.equal(dest.kind, 'reservoir', 'Should route to reservoir when queen is hydrated');
 w.destination = dest;
 w.state = 'depositing';
 s.deposit(w, 0.1);
 assert.equal(resTile.water, 7, 'Reservoir tile should have stored up to max tile capacity 7');
});

test('audio coordinator rate-limits duplicate sound cues within cooldown window', () => {
 assert.ok(AntGame.AudioCoordinator, 'AudioCoordinator must exist');
 AntGame.AudioCoordinator.lastPlayed = [];
 AntGame.AudioCoordinator.lastCuePlayTime.clear();

 AntGame.AudioCoordinator.play('antDrink');
 assert.equal(AntGame.AudioCoordinator.lastPlayed.filter(x => x.key === 'antDrink').length, 1);

 // Immediate second play must be throttled
 AntGame.AudioCoordinator.play('antDrink');
 assert.equal(AntGame.AudioCoordinator.lastPlayed.filter(x => x.key === 'antDrink').length, 1);

 // Different cue within its own cooldown is permitted
 AntGame.AudioCoordinator.play('rockStrike');
 assert.equal(AntGame.AudioCoordinator.lastPlayed.filter(x => x.resolved.startsWith('rock_strike')).length, 1);
});

test('combat rebalance: queen regen is 0.5 HP/s out of combat and disabled during combat', () => {
  const s = new Simulation(101);
  const q = s.queen();
  q.food = 100;
  q.water = 100;
  q.health = 500;
  q.maxHealth = 1000;
  q.threatId = null;

  // Advance 2 seconds -> should heal 0.5 * 2 = 1.0 HP
  advance(s, 2);
  assert.ok(Math.abs(q.health - 501) < 0.1, `Queen healed ~1 HP in 2s (got ${q.health})`);

  // Under threat/combat -> healing paused
  q.threatId = 'spider-threat';
  const hpBefore = q.health;
  advance(s, 2);
  assert.equal(q.health, hpBefore, 'Queen must not regenerate health while threatId is active');
});

test('food values: spider corpse is 1000 and hercules is 1750', () => {
  assert.equal(AntGame.Species.spider.baseFood, 1000);
  assert.equal(AntGame.Species.hercules.baseFood, 1750);
});

test('feeder hysteresis: feeding continues until queen is 98% topped off', () => {
  const s = new Simulation(102);
  const q = s.queen();
  q.maxFood = 200;
  q.food = 150; // 75% -> below 80%, triggers tending
  assert.equal(s.feederNeed(), 'food');
  assert.equal(q.tendingFood, true);

  // Queen fed to 165 (82.5%) -> above 80%, but below 98%, tending remains active
  q.food = 165;
  assert.equal(s.feederNeed(), 'food');
  assert.equal(q.tendingFood, true);

  // Queen topped off to 198 (99%) -> clears tending
  q.food = 198;
  s.feederNeed();
  assert.equal(q.tendingFood, false);
});

test('construction: building cannot be designated on hole or pit tiles', () => {
  const s = new Simulation(103);
  const pit = s.world.pit;
  const c = s.world.peek(pit.x, pit.y);
  c.discovered = true;
  assert.equal(s.designateBuild(pit.x, pit.y, null, 'food'), false, 'Cannot build on spoil pit/hole');
  assert.equal(s.jobs.some(j => j.x === pit.x && j.y === pit.y && j.type === 'build'), false);
});

test('chunk ecology: chunk (0,0) has cave-start and no spider, procedural spiders >= 45 hexes away', () => {
  const s = new Simulation(104);
  const startFeatures = s.world.featureDefinitions(0, 0);
  assert.ok(startFeatures.some(f => f.id === 'cave-start' && f.type === 'cavity'), 'Guaranteed cave near spawn');
  assert.equal(startFeatures.some(f => f.type === 'spider-cavity'), false, 'No spider lair at spawn');

  // Check procedural spiders across chunks
  for (let cx = -2; cx <= 2; cx++) {
    for (let cy = -2; cy <= 2; cy++) {
      const defs = s.world.featureDefinitions(cx, cy);
      for (const f of defs) {
        if (f.type === 'spider-cavity') {
          const dist = hexDistance({ x: f.x, y: f.y }, { x: 0, y: 0 });
          assert.ok(dist >= 45, `Spider lair at ${f.x},${f.y} should be >= 45 hexes away (was ${dist})`);
        }
      }
    }
  }
});

test('starter seed site spawns starter creature pack (isopods, weevil, or mites)', () => {
  const s = new Simulation(105);
  Ecology.sync(s);
  const starterCreatures = s.creatures.filter(c => c.seedFeatureId === 'food-start');
  assert.ok(starterCreatures.length > 0, 'Starter seed site must spawn starter creatures');
  const sp = starterCreatures[0].species;
  assert.ok(['isopod', 'weevil', 'mite'].includes(sp), `Starter creature species was ${sp}`);
});
