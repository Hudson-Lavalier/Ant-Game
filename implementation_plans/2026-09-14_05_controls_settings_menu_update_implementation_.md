# Controls & Settings Menu Update Implementation Plan

This plan outlines the design and integration for the user's Controls and Settings update, covering action keybindings, WASD camera movement, select/group mode transition persistence, scroll wheel behavior switching, audio toggles, and reconfigurable keybindings.

---

## User Review Required

> [!IMPORTANT]
> **Keybinding Defaults & Mode Key Shifts**:
> - The 7 colony actions are assigned to the bottom keyboard row:
>   - **Z**: Dig
>   - **X**: Build
>   - **C**: Cancel
>   - **V**: Harvest
>   - **B**: Carry
>   - **N**: Attack
>   - **M**: Move
> - Because `B` and `V` were previously used for Brush and Select modes, the default mode selection shortcuts are now assigned to:
>   - **Q**: Brush Mode
>   - **E**: Select Mode
>   - **G**: Group Mode (or **F**)
> - **WASD** now controls the camera in top/left/down/right directions.
> - All keybindings can be freely customized and rebound in the new Settings menu.

---

## Proposed Changes

### Component 1: Settings Subsystem (`src/settings.js` [NEW])

Create `src/settings.js` (`AntGame.Settings`) to manage persistent user preferences, default keybinds, and modal UI:
- **Settings State**:
  - `soundEnabled`: boolean (default `true`, controls `AudioCoordinator.enabled`)
  - `musicEnabled`: boolean (default `true`, ready for future soundtrack)
  - `wheelMode`: `'zoom'` | `'actions'` (default `'zoom'`, toggles between camera zoom and cycling active actions like up/down arrow)
  - `keybinds`: Key mappings for actions (`dig`, `build`, `cancel`, `harvest`, `carry`, `attack`, `move`, `none`), modes (`brush`, `select`, `group`), camera (`up`, `left`, `down`, `right`), and simulation (`pause`, `home`).
- **Storage**:
  - `load()`: reads from `localStorage.getItem('underfoot-settings-v1')` with robust fallback to defaults.
  - `save()`: saves settings to `localStorage`.
- **Settings Modal & Rebinding UI**:
  - `renderModal()`: builds the settings UI containing:
    1. **Audio Options**: SFX Mute/Unmute toggle, Music Mute/Unmute toggle.
    2. **Control Options**: Scroll Wheel Mode (`Zoom Camera` vs `Cycle Actions`).
    3. **Keybindings Table**: Each action/control displays its current key. Clicking "Rebind" listens for the next keypress to assign and persist.
    4. **Reset Defaults**: Button to restore factory default bindings and settings.
  - `openModal()` / `closeModal()` / `toggleModal()`.

---

### Component 2: Audio Coordinator Integration (`src/audio.js`)

#### [MODIFY] [`src/audio.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/audio.js)
- Add `enableSound(enabled)` method on `AudioCoordinator`:
  - Updates `this.enabled`.
  - When disabled, stops or pauses all active loops immediately.
  - Returns current state.
- Wire initialization to read sound preference from `AntGame.Settings`.

---

### Component 3: Browser Controller & Input Handling (`src/app.js`)

#### [MODIFY] [`src/app.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/app.js)
1. **Mode Transition Logic (`setMode`)**:
   - Update `setMode(m, resetAction = true)`:
     - When transitioning between `'select'` and `'group'` (in either direction), **do not reset action** (preserve `activeAction`).
     - When transitioning to `'brush'` from `'select'` or `'group'` (or vice-versa), reset `activeAction` to `'none'`.
2. **WASD Camera Movement**:
   - Maintain `heldMoveKeys` set on `keydown` and `keyup` (ignoring form inputs).
   - In `frame(now)` loop, if camera keys are held:
     - Compute normalized direction vector `(moveX, moveY)`.
     - Pan `renderer.camera` smoothly and frame-rate independently using delta time `dt` and `renderer.world` conversion.
3. **Scroll Wheel Mode**:
   - In `canvas.onwheel`:
     - If `Settings.get('wheelMode') === 'actions'`: cycle actions up/down (identical to `ArrowUp` / `ArrowDown`).
     - Else: zoom camera.
4. **Action & Mode Keydown Handler**:
   - Map key events through `AntGame.Settings.getKeyAction(e.key)`:
     - Actions: `z` $\rightarrow$ dig, `x` $\rightarrow$ build, `c` $\rightarrow$ cancel, `v` $\rightarrow$ harvest, `b` $\rightarrow$ carry, `n` $\rightarrow$ attack, `m` $\rightarrow$ move.
     - Modes: `q` $\rightarrow$ brush, `e` $\rightarrow$ select, `g` $\rightarrow$ group.
     - Arrow keys still cycle actions.
5. **Escape Key Handling**:
   - If `#settings-panel` is open: close it.
   - If any other panel is open (`evolution-panel`, `brood-shop-panel`, `operations-panel`, `debug`, `actions-wheel-overlay`): close it.
   - If no panel is open: open `#settings-panel`.

---

### Component 4: HTML Markup & Styles (`index.html`, `hex-ui.css`)

#### [MODIFY] [`index.html`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/index.html)
- Add `<script src="src/settings.js"></script>` in script tags before `src/app.js`.
- Add Settings button in header/footer (`#settings-open` / `#settings-button`).
- Update toolbar `<kbd>` badges to reflect new default keys (Brush `<kbd>Q</kbd>`, Select `<kbd>E</kbd>`, Group `<kbd>G</kbd>`).
- Add `#settings-panel` modal markup.

#### [MODIFY] [`hex-ui.css`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/hex-ui.css)
- Style the Settings modal:
  - Settings grid layout for toggles and switches.
  - Keybinds table with key badges and rebind button states (recording / active).

---

## Verification Plan

### Automated Tests
- Run complete 112-test suite:
  `$env:ELECTRON_RUN_AS_NODE="1"; & "c:\Users\hudso\AppData\Local\Programs\Microsoft VS Code\Code.exe" --test tests/brood.test.cjs tests/climate.test.cjs tests/simulation.test.cjs | Out-String`
- Add a new automated test suite or tests in `tests/simulation.test.cjs` covering:
  - Z, X, C, V, B, N, M actions.
  - Mode transition persistence between select and group vs reset to brush.
  - Settings load/save and sound/music/scroll wheel toggles.

### Manual Verification
- Test WASD camera navigation in the browser.
- Test pressing Z, X, C, V, B, N, M to toggle each of the 7 colony actions.
- Test hitting Escape to toggle the Settings panel.
- Test changing the scroll wheel toggle from Zoom to Cycle Actions and verify mouse wheel scrolls through actions.
- Test reassigning a keybind in the settings menu and verify persistence across page reloads.
