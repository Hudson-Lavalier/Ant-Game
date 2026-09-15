/*
 * UNDERFOOT SETTINGS & CONTROLS SUBSYSTEM
 * Manages user preferences, audio switches, scroll wheel behaviors,
 * and customizable keybindings (supporting Keyboard, Numpad, and Extra Mouse Buttons).
 */
(()=>{
const STORAGE_KEY = 'underfoot-settings-v1';

const DEFAULT_KEYBINDS = {
 // Modes (user specified: f = brush, e = select, r = group)
 mode_brush: { code: 'KeyF', key: 'f', label: 'F' },
 mode_select: { code: 'KeyE', key: 'e', label: 'E' },
 mode_group: { code: 'KeyR', key: 'r', label: 'R' },

 // Wheel function toggle (q)
 toggle_wheel_mode: { code: 'KeyQ', key: 'q', label: 'Q' },

 // 7 Colony Actions (z, x, c, v, b, n, m)
 action_dig: { code: 'KeyZ', key: 'z', label: 'Z' },
 action_build: { code: 'KeyX', key: 'x', label: 'X' },
 action_cancel: { code: 'KeyC', key: 'c', label: 'C' },
 action_harvest: { code: 'KeyV', key: 'v', label: 'V' },
 action_carry: { code: 'KeyB', key: 'b', label: 'B' },
 action_attack: { code: 'KeyN', key: 'n', label: 'N' },
 action_move: { code: 'KeyM', key: 'm', label: 'M' },

 // Camera WASD
 camera_up: { code: 'KeyW', key: 'w', label: 'W' },
 camera_left: { code: 'KeyA', key: 'a', label: 'A' },
 camera_down: { code: 'KeyS', key: 's', label: 'S' },
 camera_right: { code: 'KeyD', key: 'd', label: 'D' },

 // General
 pause_game: { code: 'Space', key: ' ', label: 'Space' },
 camera_home: { code: 'Home', key: 'Home', label: 'Home' },

 // Configurable Caste Selection & Queen Focus (Empty by default)
 select_soldiers: null,
 select_workers: null,
 select_minors: null,
 select_media: null,
 select_majors: null,
 select_supermajors: null,
 select_feeders: null,
 select_brood_helpers: null,
 focus_queen: null
};

const BINDING_DEFINITIONS = [
 { id: 'action_dig', category: 'Actions', name: 'Dig' },
 { id: 'action_build', category: 'Actions', name: 'Build' },
 { id: 'action_cancel', category: 'Actions', name: 'Cancel' },
 { id: 'action_harvest', category: 'Actions', name: 'Harvest' },
 { id: 'action_carry', category: 'Actions', name: 'Carry' },
 { id: 'action_attack', category: 'Actions', name: 'Attack' },
 { id: 'action_move', category: 'Actions', name: 'Move' },

 { id: 'camera_up', category: 'Camera & Modes', name: 'Camera Move Up' },
 { id: 'camera_left', category: 'Camera & Modes', name: 'Camera Move Left' },
 { id: 'camera_down', category: 'Camera & Modes', name: 'Camera Move Down' },
 { id: 'camera_right', category: 'Camera & Modes', name: 'Camera Move Right' },
 { id: 'camera_home', category: 'Camera & Modes', name: 'Center on Nest' },
 { id: 'focus_queen', category: 'Camera & Modes', name: 'Focus on Queen' },
 { id: 'mode_brush', category: 'Camera & Modes', name: 'Brush Mode' },
 { id: 'mode_select', category: 'Camera & Modes', name: 'Select Mode' },
 { id: 'mode_group', category: 'Camera & Modes', name: 'Group Mode' },
 { id: 'toggle_wheel_mode', category: 'Camera & Modes', name: 'Toggle Wheel Mode' },
 { id: 'pause_game', category: 'Camera & Modes', name: 'Pause / Resume' },

 { id: 'select_soldiers', category: 'Caste Select', name: 'Select All Soldiers' },
 { id: 'select_workers', category: 'Caste Select', name: 'Select All Workers' },
 { id: 'select_minors', category: 'Caste Select', name: 'Select All Minors' },
 { id: 'select_media', category: 'Caste Select', name: 'Select All Media' },
 { id: 'select_majors', category: 'Caste Select', name: 'Select All Majors' },
 { id: 'select_supermajors', category: 'Caste Select', name: 'Select All Supermajors' },
 { id: 'select_feeders', category: 'Caste Select', name: 'Select All Feeders' },
 { id: 'select_brood_helpers', category: 'Caste Select', name: 'Select All Brood Helpers' }
];

class SettingsManager {
 constructor() {
  this.soundEnabled = true;
  this.musicEnabled = true;
  this.wheelMode = 'zoom'; // 'zoom' or 'actions'
  this.devEnabled = false;
  this.onSaveColony = null;
  this.onLoadColony = null;
  this.onNewColony = null;
  this.activeCategoryTab = 'Actions';
  this.keybinds = JSON.parse(JSON.stringify(DEFAULT_KEYBINDS));
  this.rebindingActionId = null;
  this.listeners = new Set();
  this.load();
 }

 load() {
  if (typeof localStorage === 'undefined') return;
  try {
   const raw = localStorage.getItem(STORAGE_KEY);
   if (!raw) return;
   const parsed = JSON.parse(raw);
   if (typeof parsed.soundEnabled === 'boolean') this.soundEnabled = parsed.soundEnabled;
   if (typeof parsed.musicEnabled === 'boolean') this.musicEnabled = parsed.musicEnabled;
   if (typeof parsed.devEnabled === 'boolean') this.devEnabled = parsed.devEnabled;
   if (parsed.wheelMode === 'zoom' || parsed.wheelMode === 'actions') this.wheelMode = parsed.wheelMode;
   if (parsed.keybinds && typeof parsed.keybinds === 'object') {
    for (const [k, v] of Object.entries(parsed.keybinds)) {
     if (k in this.keybinds) this.keybinds[k] = v;
    }
   }
  } catch (err) {
   console.warn('Could not load settings from storage:', err);
  }
 }

 save() {
  if (typeof localStorage === 'undefined') return;
  try {
   const payload = {
    soundEnabled: this.soundEnabled,
    musicEnabled: this.musicEnabled,
    wheelMode: this.wheelMode,
    devEnabled: this.devEnabled,
    keybinds: this.keybinds
   };
   localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
   console.warn('Could not save settings to storage:', err);
  }
  this.notifyListeners();
 }

 updateDevBubble() {
  if (typeof document === 'undefined') return;
  const bubble = document.getElementById('debug-toggle');
  if (bubble) {
   bubble.hidden = !this.devEnabled;
  }
  if (!this.devEnabled) {
   const debug = document.getElementById('debug');
   if (debug) debug.hidden = true;
  }
 }

 toggleDevMode() {
  this.devEnabled = !this.devEnabled;
  this.save();
  this.updateDevBubble();
  return this.devEnabled;
 }

 notifyListeners() {
  for (const fn of this.listeners) {
   try { fn(this); } catch {}
  }
 }

 onChange(fn) {
  this.listeners.add(fn);
  return () => this.listeners.delete(fn);
 }

 get(key) {
  return this[key];
 }

 set(key, val) {
  this[key] = val;
  this.save();
 }

 toggleSound() {
  this.soundEnabled = !this.soundEnabled;
  if (AntGame.AudioCoordinator) {
   AntGame.AudioCoordinator.enableSound(this.soundEnabled);
  }
  this.save();
  return this.soundEnabled;
 }

 toggleMusic() {
  this.musicEnabled = !this.musicEnabled;
  this.save();
  return this.musicEnabled;
 }

 toggleWheelMode() {
  this.wheelMode = this.wheelMode === 'zoom' ? 'actions' : 'zoom';
  this.save();
  return this.wheelMode;
 }

 resetKeybinds() {
  this.keybinds = JSON.parse(JSON.stringify(DEFAULT_KEYBINDS));
  this.save();
 }

 formatKeyDescriptor(desc) {
  if (!desc) return 'Unassigned';
  if (desc.label) return desc.label;
  if (desc.button !== undefined) {
   if (desc.button === 0) return 'Left Click';
   if (desc.button === 1) return 'Middle Click (Mouse 3)';
   if (desc.button === 2) return 'Right Click';
   if (desc.button === 3) return 'Mouse 4 (Back)';
   if (desc.button === 4) return 'Mouse 5 (Forward)';
   return `Mouse ${desc.button + 1}`;
  }
  if (desc.code) {
   if (desc.code.startsWith('Numpad')) {
    return 'Num ' + desc.code.replace('Numpad', '');
   }
   if (desc.code.startsWith('Key')) {
    return desc.code.replace('Key', '');
   }
   if (desc.code.startsWith('Digit')) {
    return desc.code.replace('Digit', '');
   }
   return desc.code;
  }
  return desc.key ? desc.key.toUpperCase() : 'Unassigned';
 }

 parseFromKeyEvent(e) {
  let label = e.key;
  if (e.code.startsWith('Numpad')) {
   label = 'Num ' + e.code.replace('Numpad', '');
  } else if (e.code.startsWith('Key')) {
   label = e.code.replace('Key', '');
  } else if (e.code.startsWith('Digit')) {
   label = e.code.replace('Digit', '');
  } else if (e.code === 'Space') {
   label = 'Space';
  } else if (e.code === 'Backquote') {
   label = '`';
  } else if (e.key) {
   label = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  }
  return {
   code: e.code,
   key: e.key ? e.key.toLowerCase() : '',
   label
  };
 }

 parseFromMouseEvent(e) {
  const btn = e.button;
  let label = `Mouse ${btn + 1}`;
  if (btn === 0) label = 'Left Click';
  else if (btn === 1) label = 'Middle Click (Mouse 3)';
  else if (btn === 2) label = 'Right Click';
  else if (btn === 3) label = 'Mouse 4 (Back)';
  else if (btn === 4) label = 'Mouse 5 (Forward)';
  return {
   button: btn,
   label
  };
 }

 matchesKeyEvent(actionId, e) {
  const desc = this.keybinds[actionId];
  if (!desc) return false;
  if (desc.code && desc.code.startsWith('Numpad')) {
   return e.code === desc.code;
  }
  if (e.code && e.code.startsWith('Numpad')) {
   return desc.code === e.code;
  }
  if (desc.code && e.code && desc.code === e.code) return true;
  if (desc.key && e.key && desc.key.toLowerCase() === e.key.toLowerCase()) return true;
  return false;
 }

 matchesMouseEvent(actionId, e) {
  const desc = this.keybinds[actionId];
  if (!desc || desc.button === undefined) return false;
  return desc.button === e.button;
 }

 renderModal(panelEl, toastFn) {
  if (!panelEl) return;
  const content = panelEl.querySelector('.settings-modal-content') || panelEl;

  let categories = {};
  for (const def of BINDING_DEFINITIONS) {
   if (!categories[def.category]) categories[def.category] = [];
   categories[def.category].push(def);
  }

  const catTabs = ['Actions', 'Camera & Modes', 'Caste Select'];
  if (!catTabs.includes(this.activeCategoryTab)) this.activeCategoryTab = 'Actions';

  const sfxText = this.soundEnabled ? 'ON' : 'OFF';
  const sfxClass = this.soundEnabled ? 'settings-toggle-btn on' : 'settings-toggle-btn';
  const musicText = this.musicEnabled ? 'ON' : 'OFF';
  const musicClass = this.musicEnabled ? 'settings-toggle-btn on' : 'settings-toggle-btn';
  const wheelText = this.wheelMode === 'actions' ? 'Cycle Actions (Arrow Up/Down)' : 'Zoom Camera (Standard)';
  const wheelClass = this.wheelMode === 'actions' ? 'settings-toggle-btn on' : 'settings-toggle-btn';
  const devText = this.devEnabled ? 'ON' : 'OFF';
  const devClass = this.devEnabled ? 'settings-toggle-btn on' : 'settings-toggle-btn';

  let html = `
   <div class="settings-modal-content">
    <div class="settings-modal-header">
     <div class="settings-brand">
      <span class="brand-mark">⬢</span>
      <div>
       <h1 class="settings-title">UNDERFOOT</h1>
       <div class="eyebrow">SETTINGS &amp; CONTROLS</div>
      </div>
     </div>
     <button class="close" id="settings-close">×</button>
    </div>

    <div class="settings-toggles-grid">
     <div class="settings-toggle-item">
      <span>Sound Effects (SFX)</span>
      <button type="button" id="btn-toggle-sound" class="${sfxClass}">${sfxText}</button>
     </div>
     <div class="settings-toggle-item">
      <span>Colony Music</span>
      <button type="button" id="btn-toggle-music" class="${musicClass}">${musicText}</button>
     </div>
     <div class="settings-toggle-item">
      <span>Scroll Wheel Function</span>
      <button type="button" id="btn-toggle-wheel" class="${wheelClass}">${wheelText}</button>
     </div>
     <div class="settings-toggle-item">
      <span>Developer Tools (Dev Bubble)</span>
      <button type="button" id="btn-toggle-dev" class="${devClass}">${devText}</button>
     </div>
    </div>

    <div class="settings-section">
     <div class="settings-section-title">Colony Management</div>
     <div class="settings-colony-actions">
      <button type="button" id="save" class="settings-action-btn">💾 Save Colony</button>
      <button type="button" id="load" class="settings-action-btn">📂 Load Colony</button>
      <button type="button" id="new" class="settings-action-btn danger">✦ New Colony</button>
     </div>
    </div>

    <div class="settings-section">
     <div class="settings-section-title" style="display:flex;justify-content:space-between;align-items:center;">
      <span>Custom Keybindings</span>
      <button type="button" id="btn-reset-keybinds" class="settings-subtle-btn">Reset Defaults</button>
     </div>

     <div class="settings-tabs">
      ${catTabs.map(cat => `<button type="button" class="settings-tab-btn ${cat === this.activeCategoryTab ? 'active' : ''}" data-cat-tab="${cat}">${cat}</button>`).join('')}
     </div>

     <div class="keybinds-grid">
  `;

  const activeDefs = categories[this.activeCategoryTab] || [];
  for (const def of activeDefs) {
   const currentDesc = this.keybinds[def.id];
   const isRebinding = this.rebindingActionId === def.id;
   const label = isRebinding ? 'Press key/mouse...' : this.formatKeyDescriptor(currentDesc);
   const btnClass = isRebinding ? 'keybind-btn recording' : currentDesc ? 'keybind-btn' : 'keybind-btn unassigned';

   html += `
    <div class="keybind-row">
     <span class="keybind-name" title="${def.name}">${def.name}</span>
     <div class="keybind-controls">
      <button type="button" class="${btnClass}" data-bind-id="${def.id}">${label}</button>
      ${currentDesc ? `<button type="button" class="keybind-clear-btn" data-clear-id="${def.id}" title="Unassign">×</button>` : ''}
     </div>
    </div>
   `;
  }

  html += `
     </div>
    </div>
   </div>
  `;

  content.innerHTML = html;

  // Bind category tabs
  content.querySelectorAll('[data-cat-tab]').forEach(btn => {
   btn.onclick = () => {
    this.activeCategoryTab = btn.dataset.catTab;
    this.renderModal(panelEl, toastFn);
   };
  });

  // Bind close button
  const closeBtn = content.querySelector('#settings-close');
  if (closeBtn) closeBtn.onclick = () => this.closeModal();

  // Bind sound toggle
  const soundBtn = content.querySelector('#btn-toggle-sound');
  if (soundBtn) soundBtn.onclick = () => {
   const nowOn = this.toggleSound();
   soundBtn.textContent = nowOn ? 'ON' : 'OFF';
   soundBtn.classList.toggle('on', nowOn);
   toastFn?.(`Sound effects ${nowOn ? 'enabled' : 'muted'}.`);
  };

  // Bind music toggle
  const musicBtn = content.querySelector('#btn-toggle-music');
  if (musicBtn) musicBtn.onclick = () => {
   const nowOn = this.toggleMusic();
   musicBtn.textContent = nowOn ? 'ON' : 'OFF';
   musicBtn.classList.toggle('on', nowOn);
   toastFn?.(`Music ${nowOn ? 'enabled' : 'muted'}.`);
  };

  // Bind wheel toggle
  const wheelBtn = content.querySelector('#btn-toggle-wheel');
  if (wheelBtn) wheelBtn.onclick = () => {
   const nowMode = this.toggleWheelMode();
   const isAct = nowMode === 'actions';
   wheelBtn.textContent = isAct ? 'Cycle Actions (Arrow Up/Down)' : 'Zoom Camera (Standard)';
   wheelBtn.classList.toggle('on', isAct);
   toastFn?.(`Scroll wheel: ${isAct ? 'Cycle Actions' : 'Zoom Camera'}`);
  };

  // Bind dev toggle
  const devBtn = content.querySelector('#btn-toggle-dev');
  if (devBtn) devBtn.onclick = () => {
   const nowOn = this.toggleDevMode();
   devBtn.textContent = nowOn ? 'ON' : 'OFF';
   devBtn.classList.toggle('on', nowOn);
   toastFn?.(`Developer bubble ${nowOn ? 'enabled on right screen' : 'hidden'}.`);
  };

  // Bind colony management
  const saveBtn = content.querySelector('#save');
  if (saveBtn) saveBtn.onclick = () => {
   if (this.onSaveColony) this.onSaveColony();
   else toastFn?.('Colony saved.');
  };
  const loadBtn = content.querySelector('#load');
  if (loadBtn) loadBtn.onclick = () => {
   if (this.onLoadColony) this.onLoadColony();
  };
  const newBtn = content.querySelector('#new');
  if (newBtn) newBtn.onclick = () => {
   if (this.onNewColony) this.onNewColony();
  };

  // Bind reset defaults
  const resetBtn = content.querySelector('#btn-reset-keybinds');
  if (resetBtn) resetBtn.onclick = () => {
   this.resetKeybinds();
   this.renderModal(panelEl, toastFn);
   toastFn?.('Keybindings reset to default.');
  };

  // Bind clear buttons
  content.querySelectorAll('[data-clear-id]').forEach(btn => {
   btn.onclick = (e) => {
    e.stopPropagation();
    const actionId = btn.dataset.clearId;
    this.keybinds[actionId] = null;
    this.save();
    this.renderModal(panelEl, toastFn);
    toastFn?.(`Cleared binding for ${actionId}.`);
   };
  });

  // Bind rebinding buttons
  content.querySelectorAll('[data-bind-id]').forEach(btn => {
   btn.onclick = (e) => {
    e.stopPropagation();
    const actionId = btn.dataset.bindId;
    if (this.rebindingActionId === actionId) {
     this.rebindingActionId = null;
     this.renderModal(panelEl, toastFn);
     return;
    }
    this.startRebinding(actionId, panelEl, toastFn);
   };
  });
 }

 startRebinding(actionId, panelEl, toastFn) {
  this.rebindingActionId = actionId;
  this.renderModal(panelEl, toastFn);

  const cleanup = () => {
   window.removeEventListener('keydown', onKeyDown, true);
   window.removeEventListener('mousedown', onMouseDown, true);
   window.removeEventListener('pointerdown', onPointerDown, true);
   window.removeEventListener('contextmenu', onContextMenu, true);
  };

  const onKeyDown = (e) => {
   e.preventDefault();
   e.stopPropagation();
   cleanup();

   if (e.key === 'Escape') {
    this.rebindingActionId = null;
    this.renderModal(panelEl, toastFn);
    return;
   }

   if (e.key === 'Delete' || e.key === 'Backspace') {
    this.keybinds[actionId] = null;
    this.rebindingActionId = null;
    this.save();
    this.renderModal(panelEl, toastFn);
    toastFn?.('Binding cleared.');
    return;
   }

   const desc = this.parseFromKeyEvent(e);
   this.keybinds[actionId] = desc;
   this.rebindingActionId = null;
   this.save();
   this.renderModal(panelEl, toastFn);
   toastFn?.(`Bound ${actionId} to ${desc.label}.`);
  };

  const onPointerDown = (e) => {
   // Allow clicking inside modal elements that aren't the rebind button itself to cancel?
   // Extra buttons (button >= 1) or clicking rebind button
   e.preventDefault();
   e.stopPropagation();
   cleanup();

   if (e.button === 0 && e.target?.closest('#settings-close')) {
    this.rebindingActionId = null;
    this.closeModal();
    return;
   }

   const desc = this.parseFromMouseEvent(e);
   this.keybinds[actionId] = desc;
   this.rebindingActionId = null;
   this.save();
   this.renderModal(panelEl, toastFn);
   toastFn?.(`Bound ${actionId} to ${desc.label}.`);
  };

  const onMouseDown = onPointerDown;
  const onContextMenu = (e) => { e.preventDefault(); };

  window.addEventListener('keydown', onKeyDown, true);
  // Delay mouse listening slightly to avoid registering the trigger click
  setTimeout(() => {
   window.addEventListener('pointerdown', onPointerDown, true);
   window.addEventListener('contextmenu', onContextMenu, true);
  }, 100);
 }

 openModal(toastFn) {
  const panel = document.getElementById('settings-panel');
  if (!panel) return;
  this.renderModal(panel, toastFn);
  panel.hidden = false;
 }

 closeModal() {
  this.rebindingActionId = null;
  const panel = document.getElementById('settings-panel');
  if (panel) panel.hidden = true;
 }

 toggleModal(toastFn) {
  const panel = document.getElementById('settings-panel');
  if (!panel) return;
  if (panel.hidden) {
   this.openModal(toastFn);
  } else {
   this.closeModal();
  }
 }
}

AntGame.Settings = new SettingsManager();
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
 if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => AntGame.Settings.updateDevBubble());
 } else {
  AntGame.Settings.updateDevBubble();
 }
}
})();
