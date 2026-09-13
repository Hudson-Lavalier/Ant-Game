/*
 * UNDERFOOT RUNTIME CONFIGURATION
 * This is the single balance sheet for the playable simulation. Change values
 * here when tuning map scale, ant pace, sensing, brood, hunger, water, storage,
 * building, or evolution. The rest of the game reads AntGame.Config rather than
 * embedding competing values in feature code.
 *
 * Feature landmarks: cellSize/chunkRadius control the dense terrain visual;
 * moveSpeed and revealRadius control worker behavior; queenRevealRadius controls
 * automatic nest scanning; egg and resource values govern colony survival.
 */
/* All tuning values are prototype placeholders, except the 85% worker target. */
globalThis.AntGame = {};
AntGame.Config = Object.freeze({
 cellSize:3.4, chunkRadius:33, chunkStride:48, chunkDiagonal:66,
 eggInterval:90, firstEggTime:8, hatchTime:90, moveSpeed:4.5,
 digSeconds:1.1, depositSeconds:0.35, spoilCapacity:800,
 passiveEvolutionRate:0.18, step:1/30, revealRadius:4, queenRevealRadius:15,
 activationRadius:30, deactivationRadius:90, colonyMinDistance:120, ecologyInterval:0.5,
 waterFlowRate:0.38, waterDangerDepth:6, drowningDamage:18,
 decaySeconds:1500, foodPerHarvest:5, carryCapacity:5, harvestSeconds:1.2,
 startingFood:200, startingWater:100, startingFoodCapacity:200, startingWaterCapacity:100,
 startingColonyCap:10, queenHealth:1000, foodDrainPerSecond:200/900,
 waterDrainPerSecond:90/900, eggFoodCost:10, eggWaterCost:2,
 foodCriticalRatio:.15, waterCriticalRatio:.10, feederNeedRatio:.90,
 feederRange:70, waterDropValue:5, buildFoodCost:3, buildDirtCost:2, buildSeconds:2.5,
 // ANT NEEDS: a 50-point supply lasts 12 minutes for food and 8 minutes for water.
 antFoodCapacity:50, antWaterCapacity:50, antFoodDrainPerSecond:50/(12*60), antWaterDrainPerSecond:50/(8*60), antFoodNeedRatio:.10, antWaterNeedRatio:.20, antStarvationDamagePerSecond:2, antDehydrationDamagePerSecond:3,
 foodStoragePerTile:5, spoilStoragePerTile:5, waterStoragePerTile:7, enemyActivationRange:80,
 // CREATURE ECOLOGY: timers and distances are kept here so every generated
 // creature uses the same readable balance rules.
 creatureSizeMin:.91, creatureSizeMax:1.10, creatureActivationRadius:30, creatureDeactivationRadius:90,
 spiderWebInterval:15, spiderWebChance:.45, spiderWebDuration:40,
 spiderWebAttackCooldown:50, spiderEggHatchTime:210, babySpiderMatureTime:900,
 rootWoodDurability:500, rootAphidBiteInterval:8, rootAphidMilkCooldown:60,
 queenPosition:{x:-9,y:0}, foodPosition:{x:-9,y:2},
 casteChances:{worker:0.65,minor:0.10,media:0.10,soldier:0.10,major:0.03,supermajor:0.02,drone:0.00,princess:0.00,queen:0.00}
});
AntGame.Random = class {
 constructor(seed){this.state=seed>>>0;}
 next(){this.state=(this.state+0x6D2B79F5)>>>0;let t=this.state;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;}
};
AntGame.hash=(seed,x,y)=>{let n=Math.imul(x,374761393)^Math.imul(y,668265263)^seed;n=Math.imul(n^(n>>>13),1274126177);return (n^(n>>>16))>>>0;};
AntGame.getWaterExtractValue=level=>{if(!level||level<=0)return 0;const pct=(level/7)*100;return Math.round(pct/5)*5;};
AntGame.rollCaste=random=>{let r=random.next();for(const [type,p] of Object.entries(AntGame.Config.casteChances)){r-=p;if(r<0)return type;}return 'queen';};
