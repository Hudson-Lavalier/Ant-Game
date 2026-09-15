/*
 * UNDERFOOT UI MODAL & INSPECTOR SUBSYSTEM
 * Handles modal dialogs: Biological Evolution shop, Brood & Nursery shop,
 * Colony Operations labor priorities hierarchy, and rich entity inspection formatting.
 */
(()=>{
const { Config: C, Traits, Species, FoodTypes } = AntGame;

class UIModals {
 static getTaskEligibility(caste, task) {
  if (caste === 'feeder') {
   if (task.id === 'feedQueen' || task.id === 'queenWater') return { text: 'Feeder Core Role', type: 'combat' };
   if (task.id === 'chewFood') return { text: 'Chews Stored Food', type: 'combat' };
   if (task.id === 'carry' || task.id === 'harvest') return { text: 'Secondary Labor', type: 'restricted' };
   if (task.id === 'dig' || task.id === 'build') return { text: 'Fallback Labor', type: 'restricted' };
  }
  if (task.id === 'selfFeed' || task.id === 'selfWater') return { text: 'Emergency / Survival', type: 'combat' };
  if (task.id === 'feedQueen' || task.id === 'queenWater' || task.id === 'chewFood') return { text: 'Feeder role only', type: 'role-only' };
  if (task.id === 'feedLarvae' || task.id === 'transportBrood') {
   if (caste === 'brood_helper') return { text: 'Brood Nurse Specialist', type: 'combat' };
   if (caste === 'feeder') return { text: 'Feeder Fallback', type: 'restricted' };
   return { text: 'Brood Helper / Feeder Only', type: 'role-only' };
  }
  if (task.id === 'dig') {
   if (caste === 'minor') return { text: 'Not Capable (Minor)', type: 'ineligible' };
   if (caste === 'soldier') return { text: 'Not Capable (Soldier)', type: 'ineligible' };
  }
  if (task.id === 'build') {
   if (caste === 'minor') return { text: 'Not Capable (Minor)', type: 'ineligible' };
   if (caste === 'soldier') return { text: 'Not Capable (Soldier)', type: 'ineligible' };
  }
  if (task.id === 'combat') {
   if (['soldier', 'major', 'supermajor'].includes(caste)) return { text: 'Guard Capable', type: 'combat' };
   return { text: 'Defense Only', type: 'restricted' };
  }
  if (task.id === 'carry') {
   if (caste === 'supermajor') return { text: 'Carries All Bodies & Seeds', type: 'restricted' };
   if (caste === 'major') return { text: 'Max: Weevil, Spider, Aphid', type: 'restricted' };
   if (caste === 'media') return { text: 'Max: Spider, Worm, Aphid', type: 'restricted' };
   if (caste === 'worker' || caste === 'minor') return { text: 'Max: Worm, Aphid, Seeds', type: 'restricted' };
  }
  return null;
 }

 static renderColonyOperationsPriorities(sim, caste, onTabClick) {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.caste-tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.caste === caste));
  const dangerList = document.getElementById('danger-priority-list');
  const laborList = document.getElementById('labor-priority-list');
  if (!dangerList || !laborList) return;

  const isFeeder = caste === 'feeder';
  const tasks = (AntGame.TaskHierarchy || []).filter(t => {
   if (!isFeeder && (t.id === 'feedQueen' || t.id === 'queenWater' || t.id === 'chewFood')) return false;
   return true;
  });

  let dangerHtml = '', laborHtml = '';
  tasks.forEach((t, index) => {
   const rank = index + 1;
   const prioVal = sim.getCastePriority(caste, t.id);
   const elig = this.getTaskEligibility(caste, t);
   const badgeHtml = `<span class="priority-badge">#${rank}</span>`;
   const eligHtml = elig ? `<span class="priority-eligibility ${elig.type}">${elig.text}</span>` : '';
   const rowHtml = `<div class="priority-row" data-task-id="${t.id}"><div class="priority-info">${badgeHtml}<div class="priority-details"><div class="priority-title-wrap"><span class="priority-name">${t.name}</span>${eligHtml}</div><span class="priority-desc-text" title="${t.desc}">${t.desc}</span></div></div><div class="priority-control"><span class="priority-label">Priority</span><input type="number" min="1" max="10" step="1" class="priority-input" data-caste="${caste}" data-task="${t.id}" value="${prioVal}"></div></div>`;
   if (t.category === 'danger') dangerHtml += rowHtml;
   else laborHtml += rowHtml;
  });

  dangerList.innerHTML = dangerHtml;
  laborList.innerHTML = laborHtml;

  const bindInputs = container => {
   container.querySelectorAll('.priority-input').forEach(inp => {
    inp.onchange = e => {
     let val = parseInt(e.target.value, 10);
     if (isNaN(val)) val = 5;
     val = Math.max(1, Math.min(10, val));
     e.target.value = val;
     sim.setCastePriority(e.target.dataset.caste, e.target.dataset.task, val);
    };
   });
  };
  bindInputs(dangerList);
  bindInputs(laborList);
 }

 static renderTraits(sim, toast) {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('traits');
  if (!container) return;
  const cap = `${sim.foodCapacity()} food · ${sim.waterCapacity()} water · ${sim.colonyCapacity()} ants · ${sim.feederCapacity()} feeders`;
  const repeatable = new Set(['food_store', 'water_store', 'colony_limit', 'feeder_limit']);
  container.className = 'shop-grid';
  container.innerHTML = (Traits || []).map(t => {
   const level = sim.traitLevels?.[t.id] || 0;
   const cost = Math.ceil(t.cost * (1.5 ** level));
   const locked = sim.traits.includes(t.id) && !repeatable.has(t.id);
   return `<div class="trait"><div class="trait-header"><b>${t.name}${level ? ` · Tier ${level}` : ''}</b><small>${cost} EP</small></div><p>${t.description}${repeatable.has(t.id) ? ' (Tier 2× capacity).' : ''}</p><button data-trait="${t.id}" ${locked || sim.evolution < cost ? 'disabled' : ''}>${locked ? 'Evolved' : level ? 'Upgrade' : 'Evolve'}</button></div>`;
  }).join('');

  let capEl = document.getElementById('traits-cap-footer');
  if (!capEl && container.parentNode) {
   capEl = document.createElement('div');
   capEl.id = 'traits-cap-footer';
   capEl.className = 'shop-cap-footer';
   container.parentNode.appendChild(capEl);
  }
  if (capEl) capEl.textContent = cap;

  container.querySelectorAll('[data-trait]').forEach(b => {
   b.onclick = () => {
    toast?.(sim.evolve(b.dataset.trait));
    this.renderTraits(sim, toast);
   };
  });
 }

 static openEvolutionShop(sim, toast) {
  if (typeof document === 'undefined') return;
  this.renderTraits(sim, toast);
  const p = document.getElementById('evolution-panel');
  if (p) p.hidden = false;
 }

 static renderBroodShop(sim, toast, updateUI) {
  if (typeof document === 'undefined') return;
  const bp = sim.broodPoints || 0;
  const bpDisp = document.getElementById('shop-bp-display');
  if (bpDisp) bpDisp.textContent = `${bp} BP`;
  const eggsCount = sim.eggs.filter(e => e.colonyId === 1).length;
  const cap = sim.effectiveBroodCap();
  const broodCount = document.getElementById('shop-brood-count');
  if (broodCount) broodCount.textContent = `${eggsCount} / ${cap} eggs`;
  const hatcheries = (sim.world.getHatcheries ? sim.world.getHatcheries() : []);
  const validH = hatcheries.filter(h => h.isValid);
  const physCap = sim.physicalHatcheryCap();
  const hStat = document.getElementById('shop-hatchery-status');
  if (hStat) hStat.innerHTML = `Physical Cap: <b>${physCap}</b> (${validH.length} valid room${validH.length === 1 ? '' : 's'}) · Unlocked Cap: <b>${sim.unlockedBroodCap}</b>`;

  const container = document.getElementById('brood-shop-items');
  if (!container) return;

  const items = [
   {
    id: 'brood_helper_unlock',
    name: 'Brood Helper Specialist',
    desc: 'Designate worker ants as dedicated Brood Helpers to prioritize larval feeding, hatchery transport, and brood safety.',
    cost: 50,
    tier: sim.broodHelperUnlocked ? 1 : 0,
    maxTier: 1,
    locked: sim.broodHelperUnlocked,
    btnText: sim.broodHelperUnlocked ? 'Unlocked' : 'Unlock (50 BP)',
    buy: () => sim.buyBroodHelperUnlock()
   },
   {
    id: 'feed_upgrade',
    name: 'Nutrient Feed Batches',
    desc: 'Feed larvae in larger batches with heightened mutation probability (Tier 1: 10 food / 1.2× mut, up to Tier 5: 30 food / 5.0× mut).',
    cost: [100, 150, 200, 300, 500][sim.feedUpgradeTier] || null,
    tier: sim.feedUpgradeTier,
    maxTier: 5,
    locked: sim.feedUpgradeTier >= 5,
    btnText: sim.feedUpgradeTier >= 5 ? 'MAX TIER' : `Upgrade Tier ${sim.feedUpgradeTier + 1} (${[100, 150, 200, 300, 500][sim.feedUpgradeTier]} BP)`,
    buy: () => sim.buyFeedUpgrade()
   },
   {
    id: 'brood_cap',
    name: 'Brood Capacity Expansion',
    desc: 'Increases the colony unlocked brood capacity by +1. Must be matched with hatchery floor space (1 egg per 3 tiles) to take effect.',
    cost: Math.round(50 * (2 ** (sim.broodCapTier || 0))),
    tier: sim.broodCapTier,
    maxTier: 10,
    locked: (sim.broodCapTier || 0) >= 10,
    btnText: (sim.broodCapTier || 0) >= 10 ? 'MAX TIER' : `Expand +1 Cap (${Math.round(50 * (2 ** (sim.broodCapTier || 0)))} BP)`,
    buy: () => sim.buyBroodCapUpgrade()
   },
   {
    id: 'hatch_speed',
    name: 'Metamorphic Acceleration',
    desc: 'Warmth and pheromone tuning accelerates developmental stages by +10% faster progression per tier.',
    cost: Math.round(75 * (1.8 ** (sim.hatchSpeedTier || 0))),
    tier: sim.hatchSpeedTier,
    maxTier: 5,
    locked: (sim.hatchSpeedTier || 0) >= 5,
    btnText: (sim.hatchSpeedTier || 0) >= 5 ? 'MAX TIER' : `Speed +10% (${Math.round(75 * (1.8 ** (sim.hatchSpeedTier || 0)))} BP)`,
    buy: () => sim.buyHatchSpeedUpgrade()
   },
   {
    id: 'mutation_enhancer',
    name: 'Mutation Potency Enhancer',
    desc: 'Strengthens pupal gene expression, boosting positive mutation chances and bonus attribute tiers upon adult emergence.',
    cost: Math.round(150 * (2.5 ** (sim.mutationEnhancerTier || 0))),
    tier: sim.mutationEnhancerTier,
    maxTier: 4,
    locked: (sim.mutationEnhancerTier || 0) >= 4,
    btnText: (sim.mutationEnhancerTier || 0) >= 4 ? 'MAX TIER' : `Enhance Quality (${Math.round(150 * (2.5 ** (sim.mutationEnhancerTier || 0)))} BP)`,
    buy: () => sim.buyMutationEnhancerUpgrade()
   },
   {
    id: 'caste_modifier',
    name: 'Hormonal Caste Bias',
    desc: 'Alters royal jelly pheromones to increase major and supermajor development chances by +25% per tier.',
    cost: Math.round(200 * (2.0 ** (sim.casteModifierTier || 0))),
    tier: sim.casteModifierTier,
    maxTier: 4,
    locked: (sim.casteModifierTier || 0) >= 4,
    btnText: (sim.casteModifierTier || 0) >= 4 ? 'MAX TIER' : `Shift Ratio (${Math.round(200 * (2.0 ** (sim.casteModifierTier || 0)))} BP)`,
    buy: () => sim.buyCasteModifierUpgrade()
   }
  ];

  container.className = 'shop-grid';
  container.innerHTML = items.map(it => {
   const canAfford = !it.locked && it.cost !== null && bp >= it.cost;
   return `<div class="trait"><div class="trait-header"><b>${it.name}${it.tier ? ` · Tier ${it.tier}` : ''}</b><small>${it.cost ? `${it.cost} BP` : 'MAX'}</small></div><p>${it.desc}</p><button data-brood-item="${it.id}" ${canAfford ? '' : 'disabled'}>${it.btnText}</button></div>`;
  }).join('');

  container.querySelectorAll('[data-brood-item]').forEach(btn => {
   btn.onclick = () => {
    const it = items.find(x => x.id === btn.dataset.broodItem);
    if (it) {
     const err = it.buy();
     if (err) toast?.(err);
     else {
      toast?.(`Purchased ${it.name}!`);
      this.renderBroodShop(sim, toast, updateUI);
      updateUI?.();
     }
    }
   };
  });
 }

 static openBroodShop(sim, toast, updateUI) {
  if (typeof document === 'undefined') return;
  this.renderBroodShop(sim, toast, updateUI);
  const p = document.getElementById('brood-shop-panel');
  if (p) p.hidden = false;
 }

 static formatEntityInspection(e, sim, inspectedTile, roomSummary, selectedCount) {
  if (e?.foodType) {
   const d = FoodTypes[e.foodType];
   return {
    title: d.name,
    body: `Value <b>${d.value}</b> · remaining <b>${Math.ceil(e.remaining)}</b>`
   };
  }
  if (e?.species) {
   return {
    title: Species[e.species].name,
    body: `${e.state} · ${Math.ceil(e.health)} HP · corpse food ${e.food}`
   };
  }
  if (e?.stage) {
   const sName = e.stage.charAt(0).toUpperCase() + e.stage.slice(1);
   let details = `${Math.ceil(e.health ?? 25)} / 25 HP · ${sName}<br>Age: <b>${Math.floor(e.age)}s / ${Math.floor(e.duration)}s</b>`;
   if (e.stage === 'larva') {
    const fed = Math.min(30, Math.round(e.foodAccumulated || 0));
    details += `<br>Nutrition: <b>${fed} / 30 food</b>${fed >= 30 ? ' (Ready to pupate)' : ''}`;
   }
   if (e.mutationMultiplier && e.mutationMultiplier > 1.0) {
    details += `<br>Mutation Rate: <b>${e.mutationMultiplier.toFixed(1)}×</b>`;
   }
   if (e.carriedBy) {
    details += `<br><i>Being carried by ant #${e.carriedBy}</i>`;
   }
   return {
    title: `${sName} (${e.assignedAntType})`,
    body: details
   };
  }
  if (e?.type) {
   const title = e.nickname || e.roleName || `${e.type} ${e.id}`;
   let body = `${Math.ceil(e.health)} / ${e.maxHealth || 100} HP<br>${e.state.replaceAll('-', ' ')}${e.feeder ? '<br><b>Colony feeder</b>' : ''}${e.broodHelper ? '<br><b>Brood Helper specialist</b>' : ''}`;
   if (e.type === 'queen') {
    body += `<br>Nutrition: Food <b>${Math.ceil(e.food || 0)} / ${e.maxFood || 200}</b> · Water <b>${Math.ceil(e.water || 0)} / ${e.maxWater || 100}</b>`;
   }
   if (e.mutations && e.mutations.length) {
    body += `<br><b>Mutations:</b> ${e.mutations.map(m => `${m.name} (+${Math.round(m.value * 100)}%)`).join(', ')}`;
   }
   return { title, body };
  }
  if (inspectedTile) {
   const room = roomSummary(inspectedTile);
   return { title: room.title, body: room.body };
  }
  const q = sim.queen();
  return {
   title: selectedCount ? selectedCount + ' ants selected' : 'Your colony',
   body: `Queen ${q ? Math.ceil(q.health) : 0} HP${q ? ` (Food ${Math.ceil(q.food || 0)} · Water ${Math.ceil(q.water || 0)})` : ''} · ${sim.jobs.length} orders<br>Food rooms: ${sim.foodStore.tiles} tiles · Water reservoirs: ${sim.waterStore.tiles.length}`
  };
 }
}

AntGame.UIModals = UIModals;
})();
