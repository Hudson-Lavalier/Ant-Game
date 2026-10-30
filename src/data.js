/*
 * UNDERFOOT GAME DATA CATALOGUE
 * This file holds declarative content used by gameplay, rather than simulation
 * logic. Traits feed the Evolution panel, FoodTypes define carried-food value and
 * decay, and Species describes creature behavior, health, speed, damage, and meat.
 * Add a new content type here first, then teach simulation/rendering how to use it.
 */
// Prototype traits: real biological categories, with temporary costs and effects.
AntGame.Traits = [
 {id:'mandibles',name:'Robust mandibles',category:'Mandibular specialization',cost:144,prerequisites:[],description:'Stronger digging apparatus. Excavate 35% faster.',effects:{digRate:1.35}},
 {id:'legs',name:'Longer legs',category:'Mobility',cost:192,prerequisites:[],description:'Travel 20% faster through the nest.',effects:{moveRate:1.2}},
 {id:'cuticle',name:'Thicker cuticle',category:'Defensive morphology',cost:240,prerequisites:[],description:'Reduce damage from attacks by 30%.',effects:{armor:0.7}},
 {id:'bite',name:'Serrated mandibles',category:'Mandibular specialization',cost:288,prerequisites:['mandibles'],description:'Mandible attacks deal 50% more damage.',effects:{attackRate:1.5}},
 {id:'senses',name:'Sensitive antennae',category:'Sensory biology',cost:216,prerequisites:[],description:'Reveal terrain two cells farther from your ants.',effects:{vision:2}}
  ,{id:'food_store',name:'Expanded crop',category:'Food storage and distribution',cost:150,prerequisites:[],description:'Increase food storage capacity to 2.5× its current biological limit.',effects:{foodCap:2.5}}
  ,{id:'water_store',name:'Water reservoir',category:'Environmental adaptation',cost:100,prerequisites:[],description:'Increase water storage capacity to 2.5× its current biological limit.',effects:{waterCap:2.5}}
  ,{id:'colony_limit',name:'Brood capacity',category:'Colony demography',cost:50,prerequisites:[],description:'Increase the colony population limit to 2.5× its current biological limit.',effects:{colonyCap:2.5}}
  ,{id:'feeder_limit',name:'Feeder specialization',category:'Food storage and distribution',cost:75,prerequisites:[],description:'Increase the maximum number of assigned feeder ants (doubles per tier).',effects:{feederCap:2}}
  ,{id:'smooth_floor',name:'Subterranean Highway',category:'Civil engineering',cost:160,prerequisites:[],description:'Enables construction of polished Smooth Dirt Floors that accelerate colony traffic.',effects:{smoothFloor:true}}
];
AntGame.BuildTypes = {
 food: { id: 'food', name: 'Food room', food: 3, dirt: 1, excavations: 0, solid: false },
 water: { id: 'water', name: 'Water reservoir', food: 5, dirt: 2, excavations: 2, solid: false },
 spoil: { id: 'spoil', name: 'Spoilroom', food: 0, dirt: 1, excavations: 0, solid: false },
 hatchery_floor: { id: 'hatchery_floor', name: 'Hatchery floor', food: 5, dirt: 3, excavations: 0, solid: false },
 hatchery_wall: { id: 'hatchery_wall', name: 'Hatchery wall', food: 5, dirt: 3, excavations: 0, solid: true },
 dirt: { id: 'dirt', name: 'Plain dirt', food: 0, dirt: 1, excavations: 0, solid: true },
 rough_dirt: { id: 'rough_dirt', name: 'Rough dirt', food: 0, dirt: 1, excavations: 0, solid: false },
 compacted_dirt: { id: 'compacted_dirt', name: 'Compacted dirt wall', food: 0, dirt: 5, excavations: 0, solid: true, hardness: 3.5 },
 trench: { id: 'trench', name: 'Trench', food: 0, dirt: 0, excavations: 1, solid: false },
 smooth_floor: { id: 'smooth_floor', name: 'Smooth dirt floor', food: 1, dirt: 4, excavations: 0, solid: false, unlockTrait: 'smooth_floor', requiresTrait: 'smooth_floor' }
};
AntGame.FoodTypes = {
 meat:{name:'Meat',value:1,color:'#b67b6b',decay:900},
 large_meat:{name:'Large meat chunk',value:12,color:'#c28a70',decay:1200},
 huge_meat:{name:'Huge meat chunk',value:30,color:'#a95d55',decay:1500},
 seeds:{name:'Seeds',value:5,color:'#c9b965',decay:1800},
 berries:{name:'Berries',value:20,color:'#8b2252',decay:2400},
 pupae:{name:'Pupae',value:8,color:'#e2d7a2',decay:1100}
};
// CREATURE CATALOGUE: baseFood is multiplied by the deterministic individual
// size at spawn. clearance is the real number of open adjacent cells required
// by routing, so large animals cannot squeeze through worker-sized tunnels.
AntGame.Species = {
 // BODY SCALE: one map block is 0.85 worker lengths. clearance comes from
 // central-body width after that conversion; horns, snouts, legs, and length do not widen it.
 worm:{name:'Earthworm',health:28,speed:9,damage:0,behavior:'flee',baseFood:120,color:'#b9837b',clearance:1,excavator:true,mineTime:1.1,activation:30,deactivation:90,visualScale:1,bodyWidth:1.0,bodyLength:8,segmentSpacing:.72},
 grub:{name:'Beetle Grub',health:80,speed:3.2,damage:7,behavior:'defensive',baseFood:240,color:'#d8ca98',clearance:2,excavator:true,mineTime:1.8,activation:30,deactivation:90,visualScale:1,bodyWidth:1.9,bodyLength:5.8,segmentSpacing:.62},
 weevil:{name:'Bull Weevil',health:55,speed:3.8,damage:6,behavior:'defensive',baseFood:85,color:'#815a39',clearance:1,activation:30,deactivation:90,visualScale:.30,bodyWidth:.56,bodyLength:1.5},
 hercules:{name:'Hercules Beetle',health:650,speed:2.6,damage:30,behavior:'aggressive',baseFood:1750,color:'#c7b87b',clearance:8,reach:3.3,visualScale:1.05,activation:30,deactivation:90,bodyWidth:7.7,bodyLength:17.3},
 mite:{name:'Mite',health:5,speed:4.5,damage:2,behavior:'aggressive',baseFood:8,color:'#a54c45',clearance:1,activation:30,deactivation:90,visualScale:.45,bodyWidth:.32,bodyLength:.48},
 isopod:{name:'Isopod',health:40,speed:2.8,damage:0,behavior:'flee',baseFood:45,color:'#74766b',clearance:2,activation:30,deactivation:90,visualScale:.60,bodyWidth:1.18,bodyLength:2.4},
 spider:{name:'Spider',health:500,speed:3.4,damage:22,behavior:'aggressive',baseFood:1000,color:'#443936',clearance:3,visualScale:.95,activation:30,deactivation:90,bodyWidth:2.9,bodyLength:5.35},
 night_spider:{name:'Night Spider',health:450,speed:4.2,damage:26,behavior:'aggressive',baseFood:900,color:'#251d2e',clearance:2,visualScale:.90,activation:40,deactivation:100,bodyWidth:2.6,bodyLength:5.0},
 baby_spider:{name:'Baby Spider',health:40,speed:2.8,damage:6,behavior:'aggressive',baseFood:15,color:'#7c6c61',clearance:1,visualScale:.38,activation:30,deactivation:90,bodyWidth:1.05},
 root_aphid:{name:'Root Aphid',health:12,speed:0,damage:0,behavior:'anchored',baseFood:0,color:'#c8a957',clearance:1,activation:0,deactivation:Infinity,freezeExempt:true,visualScale:.35,bodyWidth:.47}
 ,// SAVE COMPATIBILITY: pre-cleanup saves may still name this former entry.
 beetle:{name:'Bull Weevil',health:55,speed:0,damage:6,behavior:'aggressive',baseFood:85,color:'#815a39',clearance:1,activation:30,deactivation:90}
};
// CHUNK RARITY TIERS: defines the distribution and chance per render chunk (~3367 hex tiles)
AntGame.Rarity = Object.freeze({
 Common:{name:'Common',chance:0.70},
 Uncommon:{name:'Uncommon',chance:0.25,types:{stone:0.33,seeds:0.25,small_cave:0.25}},
 Rare:{name:'Rare',chance:0.10,types:{medium_cave:0.10,water:0.10,worm:0.08,well:0.05}},
 VeryRare:{name:'Very Rare',chance:0.03,types:{spider:0.03,root:0.03,colony:0.02}},
 Infinitesimal:{name:'Infinitesimal',chance:0.005,types:{hercules:0.005}}
});

// CARRYING ELIGIBILITY: strict physical caste and body size evaluation.
// Spiders and Hercules Beetles are uncarryable by any caste. Grubs require Supermajors.
// Worms require Majors or Supermajors. Smaller creatures depend on caste size and creature variation.
AntGame.canCarry = function(ant, obj){
 if(!ant||!ant.alive||!obj)return false;
 const caste=ant.type;
 if(obj.species){
  const sp=obj.species,size=obj.size||1.0;
  if(sp==='spider'||sp==='hercules')return false;
  if(sp==='grub')return caste==='supermajor';
  if(sp==='worm'){
   if(size>1.25)return caste==='supermajor';
   return caste==='major'||caste==='supermajor';
  }
  if(sp==='isopod'||sp==='weevil'||sp==='beetle'){
   if(size>1.35)return caste==='major'||caste==='supermajor';
   if(size>1.15)return ['worker','media','soldier','major','supermajor'].includes(caste);
   return ['minor','worker','media','soldier','major','supermajor'].includes(caste);
  }
  return ['minor','worker','media','soldier','major','supermajor'].includes(caste);
 }
 if(obj.foodType==='berries'||obj.structure==='berry_bush'){
  return false;
 }
 if(obj.foodType==='seeds'||obj.type==='seeds'){
  return ['minor','worker','media','soldier','major','supermajor'].includes(caste);
 }
 return true;
};

AntGame.AntActions = [
 {id:'dig',name:'Dig',desc:'Autonomous digging and tunnel excavation'},
 {id:'build',name:'Build',desc:'Autonomous chamber construction'},
 {id:'harvest',name:'Harvest',desc:'Autonomous food gathering and aphid milking'},
 {id:'carry',name:'Carry',desc:'Autonomous hauling of insect corpses and seeds to storage'},
 {id:'haulSoil',name:'Haul Soil',desc:'Autonomous soil transport to spoil pits'},
 {id:'combat',name:'Combat',desc:'Autonomous guard duty and threat defense'},
 {id:'transportBrood',name:'Transport Brood',desc:'Autonomous transport of brood to safe hatchery rooms'},
 {id:'feedLarvae',name:'Feed Larvae',desc:'Autonomous feeding of developing larvae with food rations'},
 {id:'selfFeed',name:'Self Feed',desc:'Satisfy personal hunger: seek and eat food when hungry'},
 {id:'selfWater',name:'Self Water',desc:'Satisfy personal thirst: seek and drink water when thirsty'}
];

AntGame.TaskHierarchy = [
 {id:'selfFeed',name:'Self Feed',category:'danger',desc:'Satisfy personal hunger; emergency eating of stored or raw food when starving'},
 {id:'selfWater',name:'Self Water',category:'danger',desc:'Satisfy personal thirst from reservoirs, wells, or terrain pools'},
 {id:'combat',name:'Combat',category:'labor',desc:'Auto-guard territory and engage aggressive enemies'},
 {id:'feedQueen',name:'Feed Queen',category:'labor',desc:'Deliver food to Queen from loose rations or food stores (Feeder only)'},
 {id:'queenWater',name:'Queen Water',category:'labor',desc:'Deliver water to Queen or reservoirs (Feeder only)'},
 {id:'chewFood',name:'Chew Food',category:'labor',desc:'Chew and process stored whole corpses and seeds into edible food (Feeder only)'},
 {id:'feedLarvae',name:'Feed Larvae',category:'labor',desc:'Deliver food rations to growing larvae (Brood Helper / Feeder)'},
 {id:'transportBrood',name:'Transport Brood',category:'labor',desc:'Relocate misplaced or vulnerable brood to designated hatcheries (Brood Helper / Feeder)'},
 {id:'carry',name:'Carry',category:'labor',desc:'Transport whole corpses and seeds to food storage'},
 {id:'harvest',name:'Harvest',category:'labor',desc:'Gather loose food resources and milk root aphids'},
 {id:'build',name:'Build',category:'labor',desc:'Construct designated chamber infrastructure'},
 {id:'dig',name:'Dig',category:'labor',desc:'Excavate designated soil tiles'},
 {id:'haulSoil',name:'Haul Soil',category:'labor',desc:'Recover dropped soil and haul dirt to pits or spoil'}
];

AntGame.DefaultCastePriorities = {
 brood_helper:{selfFeed:1,selfWater:1,combat:9,feedLarvae:2,transportBrood:3,chewFood:5,feedQueen:6,queenWater:6,carry:7,harvest:7,build:8,dig:8,haulSoil:9},
 feeder:     {selfFeed:1,selfWater:1,combat:9,chewFood:2,feedQueen:3,queenWater:3,feedLarvae:4,transportBrood:4,carry:5,harvest:5,build:8,dig:8,haulSoil:7},
 worker:     {selfFeed:1,selfWater:1,combat:8,feedQueen:3,queenWater:3,chewFood:10,feedLarvae:10,transportBrood:10,carry:4,harvest:4,build:5,dig:5,haulSoil:6},
 minor:      {selfFeed:1,selfWater:1,combat:9,feedQueen:4,queenWater:4,chewFood:10,feedLarvae:10,transportBrood:10,carry:5,harvest:3,build:10,dig:10,haulSoil:4},
 media:      {selfFeed:1,selfWater:1,combat:6,feedQueen:3,queenWater:3,chewFood:10,feedLarvae:10,transportBrood:10,carry:4,harvest:4,build:5,dig:5,haulSoil:6},
 major:      {selfFeed:1,selfWater:1,combat:3,feedQueen:5,queenWater:5,chewFood:10,feedLarvae:10,transportBrood:10,carry:4,harvest:5,build:6,dig:4,haulSoil:7},
 soldier:    {selfFeed:1,selfWater:1,combat:1,feedQueen:8,queenWater:8,chewFood:10,feedLarvae:10,transportBrood:10,carry:7,harvest:7,build:10,dig:10,haulSoil:8},
 supermajor: {selfFeed:1,selfWater:1,combat:2,feedQueen:6,queenWater:6,chewFood:10,feedLarvae:10,transportBrood:10,carry:3,harvest:6,build:6,dig:4,haulSoil:7},
 queen:      {selfFeed:1,selfWater:1,combat:10,feedQueen:10,queenWater:10,chewFood:10,feedLarvae:10,transportBrood:10,carry:10,harvest:10,build:10,dig:10,haulSoil:10},
 princess:   {selfFeed:1,selfWater:1,combat:10,feedQueen:10,queenWater:10,chewFood:10,feedLarvae:10,transportBrood:10,carry:10,harvest:10,build:10,dig:10,haulSoil:10},
 drone:      {selfFeed:1,selfWater:1,combat:10,feedQueen:10,queenWater:10,chewFood:10,feedLarvae:10,transportBrood:10,carry:10,harvest:10,build:10,dig:10,haulSoil:10}
};

// BEHAVIORAL ZONING & SQUADS SPECIFICATIONS
AntGame.ZoneTypes = {
 foraging:   { id: 'foraging', name: 'Foraging Zone', color: '#3d7a3a88', desc: 'Designated resource harvesting grounds (seeds, aphids, loose food)' },
 hunting:    { id: 'hunting', name: 'Hunting Zone', color: '#96323288', desc: 'Designated hunting & security perimeter for combat squads' },
 stockpile:  { id: 'stockpile', name: 'Stockpile Zone', color: '#b5890088', desc: 'Configurable item storage locked strictly to spoil tiles' },
 excavation: { id: 'excavation', name: 'Excavation Zone', color: '#c59b2788', desc: 'Automated mining bounds: ants clear all dirt tiles in the region' }
};

AntGame.StockpilePriorities = {
 1: { level: 1, name: 'Low', desc: 'Lowest storage priority' },
 2: { level: 2, name: 'Normal', desc: 'Standard storage priority' },
 3: { level: 3, name: 'Preferred', desc: 'High priority depot' },
 4: { level: 4, name: 'Critical', desc: 'Highest priority destination' }
};

AntGame.ZoneTileConstraints = {
 stockpile: {
  allowedZoneTypes: ['spoil'],
  validate: cell => cell && cell.zone === 'spoil' && !cell.solid,
  errorMsg: 'Stockpiles can only be designated on excavated spoil tiles.'
 },
 foraging: {
  allowedZoneTypes: null,
  validate: cell => cell && !cell.solid && cell.discovered,
  errorMsg: 'Foraging zones can only be placed on discovered open ground.'
 },
 hunting: {
  allowedZoneTypes: null,
  validate: cell => cell && !cell.solid && cell.discovered,
  errorMsg: 'Hunting zones can only be placed on discovered open ground.'
 },
 excavation: {
  allowedZoneTypes: null,
  validate: cell => cell && cell.discovered && !cell.rock && cell.zone !== 'rock' && !cell.isWell && cell.zone !== 'well' && cell.terrain !== 'hole' && cell.zone !== 'hole' && cell.structure !== 'hole' && cell.zone !== 'pit' && !cell.hole,
  errorMsg: 'Excavation zones cannot be placed on unbreakable stone, wells, or holes.'
 }
};

AntGame.SquadRoles = {
 auto:    { id: 'auto', name: 'Auto (Balanced)', desc: 'Standard caste priorities' },
 forager: { id: 'forager', name: 'Foragers', desc: 'Prioritizes harvesting and food gathering', priorities: { harvest: 1, carry: 2, selfFeed: 1, selfWater: 1 } },
 hunter:  { id: 'hunter', name: 'Hunters', desc: 'Prioritizes patrolling and combat engagement', priorities: { combat: 1, selfFeed: 1, selfWater: 1 } },
 hauler:  { id: 'hauler', name: 'Haulers', desc: 'Prioritizes hauling corpses, seeds, and soil', priorities: { carry: 1, haulSoil: 1, selfFeed: 1, selfWater: 1 } },
 guard:   { id: 'guard', name: 'Guards', desc: 'Defends perimeter and counters nearby threats', priorities: { combat: 1, selfFeed: 1, selfWater: 1 } },
 digger:  { id: 'digger', name: 'Diggers', desc: 'Prioritizes excavation in assigned territory', priorities: { dig: 1, haulSoil: 3, selfFeed: 1, selfWater: 1 } }
};

AntGame.SquadRolePriorities = {
 forager: { harvest: 1, carry: 2, selfFeed: 1, selfWater: 1, chewFood: 8, build: 9, dig: 9, haulSoil: 8 },
 hunter:  { combat: 1, selfFeed: 1, selfWater: 1, carry: 6, harvest: 8, build: 10, dig: 10, haulSoil: 9 },
 hauler:  { carry: 1, haulSoil: 1, selfFeed: 1, selfWater: 1, harvest: 6, chewFood: 8, build: 8, dig: 8 },
 guard:   { combat: 1, selfFeed: 1, selfWater: 1, carry: 7, harvest: 9, build: 10, dig: 10, haulSoil: 9 },
 digger:  { dig: 1, haulSoil: 3, selfFeed: 1, selfWater: 1, build: 5, carry: 6, harvest: 7 }
};

AntGame.CasteHaulPower = {
 minor: 0.5,
 worker: 1.0,
 media: 1.0,
 soldier: 1.0,
 major: 2.0,
 supermajor: 4.0,
 queen: 0,
 princess: 0,
 drone: 0
};

AntGame.getCreatureWeight = function(obj) {
 if (!obj) return 1.0;
 if (obj.foodType === 'seeds' || obj.type === 'seeds') return 0.5;
 if (obj.species) {
  const sp = obj.species, size = obj.size || 1.0;
  if (sp === 'hercules') return 6.0;
  if (sp === 'spider') return 5.0;
  if (sp === 'grub') return 3.0;
  if (sp === 'worm') return size > 1.25 ? 3.0 : 2.0;
  if (sp === 'isopod' || sp === 'weevil' || sp === 'beetle') {
   if (size > 1.35) return 2.0;
   return 1.0;
  }
  return 1.0;
 }
 return 1.0;
};

AntGame.canCoopCarry = function(ants, obj) {
 if (!ants || !ants.length || !obj) return false;
 const power = ants.reduce((sum, a) => (a && a.alive) ? sum + (AntGame.CasteHaulPower[a.type] || 0) : sum, 0);
 return power >= AntGame.getCreatureWeight(obj);
};


