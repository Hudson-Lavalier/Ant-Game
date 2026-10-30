# Controls & Settings Menu Update Implementation Plan

This plan outlines the complete implementation of the user's Controls and Settings update, including bottom-row action keys, WASD camera panning, quick wheel toggle with `Q`, select/group action persistence, mouse extra buttons and numpad support, configurable caste/queen selection, and a comprehensive settings menu.

---

## User Review Required

> [!IMPORTANT]
> **Keybinding Changes & Additions**:
> - **7 Colony Actions**: `Z` (Dig), `X` (Build), `C` (Cancel), `V` (Harvest), `B` (Carry), `N` (Attack), `M` (Move).
> - **Scroll Wheel Toggle Key**: `Q` directly toggles the scroll wheel function between **Zoom Camera** and **Cycle Actions** (with toast feedback and instant settings sync).
> - **Modes**: `E` (Select), `G` or `F` (Group), `T` (Brush) — all reconfigurable.
> - **WASD**: Smooth camera movement across the hex world.
> - **New Caste Selection & Queen Focus (Empty by default)**:
>   - Select All Soldiers
>   - Select All Workers
>   - Select All Minors / Media / Majors / Supermajors
>   - Select All Feeders
>   - Select All Brood Helpers
>   - Focus Camera on Queen
> - **Mouse Extra Buttons & Numpad Support**:
>   - Supports `Mouse3` (Middle), `Mouse4` (Back), `Mouse5` (Forward), `Mouse6`+, etc.
>   - Distinguishes `Numpad0`–`Numpad9`, `NumpadEnter`, `NumpadAdd`, etc., from regular numbers.

---

## Proposed Changes

### Component 1: Settings Subsystem (`src/settings.js` [NEW])

Create `src/settings.js` (`AntGame.Settings`) managing:
- **Persistent State (`underfoot-settings-v1`)**:
  - `soundEnabled`: boolean (default `true`, controls `AudioCoordinator.enabled`)
  - `musicEnabled`: boolean (default `true`)
  - `wheelMode`: `'zoom'` | `'actions'` (default `'zoom'`)
  - `keybinds`: Mapping of command IDs to key descriptors:
    - Actions: `action_dig` (`KeyZ`), `action_build` (`KeyX`), `action_cancel` (`KeyC`), `action_harvest` (`KeyV`), `action_carry` (`KeyB`), `action_attack` (`KeyN`), `action_move` (`KeyM`), `action_none` (`Backquote`)
    - Modes: `mode_brush` (`KeyT`), `mode_select` (`KeyE`), `mode_group` (`KeyG`)
    - Camera: `camera_up` (`KeyW`), `camera_left` (`KeyA`), `camera_down` (`KeyS`), `camera_right` (`KeyD`)
    - Wheel Toggle: `toggle_wheel_mode` (`KeyQ`)
    - Caste Selection (empty by default):
      - `select_soldiers`: `""`
      - `select_workers`: `""`
      - `select_minors`: `""`
      - `select_media`: `""`
      - `select_majors`: `""`
      - `select_supermajors`: `""`
      - `select_feeders`: `""`
      - `select_brood_helpers`: `""`
      - `focus_queen`: `""`
    - System: `pause` (`Space`), `home` (`Home`)
- **Numpad & Extra Mouse Button Normalizer**:
  - Normalizes `e.code` (e.g. `Numpad1`, `NumpadEnter`) and `e.button` (`Mouse3`, `Mouse4`, `Mouse5`, `Mouse6`) into readable labels and matching tokens.
- **Rebinding Engine**:
  - Modal UI to click any binding, listen for next keyboard or mouse input (including extra buttons and numpad), validate and save.
  - "Reset to Defaults" button and "Clear Binding" option.

---

### Component 2: Audio Coordinator Integration (`src/audio.js`)

#### [MODIFY] [`src/audio.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/audio.js)
- Add `enableSound(enabled)` method on `AudioCoordinator`:
  - Updates `this.enabled`.
  - When disabled, stops or pauses all active audio loops immediately.
  - Initializes state from `AntGame.Settings.get('soundEnabled')`.

---

### Component 3: Browser Controller & Input Handling (`src/app.js`)

#### [MODIFY] [`src/app.js`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/src/app.js)
1. **Mode Transition Logic (`setMode`)**:
   - When switching between `select` and `group` (either direction), **do not reset action**.
   - When switching to `brush` from `select` or `group` (or from `brush`), reset action to `'none'`.
2. **WASD Camera Panning**:
   - `heldMoveKeys` set tracking W, A, S, D (or custom rebound camera keys).
   - In `frame(now)`, pans `renderer.camera` smoothly and frame-rate independently using delta time and `renderer.world`.
3. **Scroll Wheel Mode & `Q` Toggle**:
   - Pressing `Q` (or `toggle_wheel_mode`):
     - Flips `wheelMode` between `'zoom'` and `'actions'`.
     - Displays toast: `"Scroll wheel: Cycle Actions"` or `"Scroll wheel: Zoom Camera"`.
     - Syncs settings modal toggle.
   - In `canvas.onwheel`:
     - If `wheelMode === 'actions'`: scrolls cycle `ACTIONS` up / down (matching ArrowUp / ArrowDown).
     - Else: zooms camera.
4. **Caste Selection & Focus Queen Handlers**:
   - Support for selecting all soldiers, workers, minors, media, majors, supermajors, feeders, brood helpers, and centering camera on Queen.
5. **Mouse Extra Buttons & Keydowns**:
   - `pointerdown` / `mousedown` listener handles extra mouse buttons (`Mouse3`, `Mouse4`, `Mouse5`, etc.) bound to any action/command.
   - Keydown handler matches against normalized code / key.
6. **Escape Key Handling**:
   - If `#settings-panel` is open: close it.
   - If other modals are open: close them.
   - If no modals are open: open `#settings-panel`.

---

### Component 4: HTML Markup & Styling (`index.html`, `hex-ui.css`)

#### [MODIFY] [`index.html`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/index.html)
- Include `<script src="src/settings.js"></script>` before `src/app.js`.
- Add Settings button in header (`#settings-open`).
- Add `#settings-panel` modal container with sections for Audio, Controls, and Keybindings.
- Update toolbar `<kbd>` hints.

#### [MODIFY] [`hex-ui.css`](file:///c:/Users/hudso/OneDrive/Documents/Ant%20Game/hex-ui.css)
- Add styles for the Settings modal:
  - Audio and scroll wheel toggle buttons with active indicators.
  - Scrollable keybindings table with rebinding button states ("Click to bind", "Press key/mouse...").

---

## Verification Plan

### Automated Tests
- Run full test suite:
  `$env:ELECTRON_RUN_AS_NODE="1"; & "c:\Users\hudso\AppData\Local\Programs\Microsoft VS Code\Code.exe" --test tests/brood.test.cjs tests/climate.test.cjs tests/simulation.test.cjs | Out-String`
- Run renderer benchmark:
  `$env:ELECTRON_RUN_AS_NODE="1"; & "c:\Users\hudso\AppData\Local\Programs\Microsoft VS Code\Code.exe" tests/test_renderer.cjs | Out-String`
- Add unit tests for `AntGame.Settings`:
  - Default keybindings configuration.
  - Numpad and Mouse 3/4/5 normalization.
  - Mode transition persistence (select $\leftrightarrow$ group preserves action).
  - Wheel toggle flip via `toggle_wheel_mode`.

### Manual Verification
- Test `Z`, `X`, `C`, `V`, `B`, `N`, `M` triggering the 7 actions.
- Test `Q` toggling the scroll wheel function between Zoom and Action cycling with toast.
- Test WASD camera navigation.
- Test hitting `Escape` to toggle the Settings menu.
- Test rebinding a key using Numpad and extra mouse button.
