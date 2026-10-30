# Controls & Settings Menu Update Walkthrough

## Overview

The controls and settings update has been implemented and verified with all 114 automated tests passing and the renderer benchmark running at 1.87 ms/frame.

---

## What Changed

### 1. 7 Colony Actions Reassigned to Z, X, C, V, B, N, M
- The 7 colony actions are assigned to the bottom keyboard row:
  - **`Z`**: Dig
  - **`X`**: Build
  - **`C`**: Cancel
  - **`V`**: Harvest
  - **`B`**: Carry
  - **`N`**: Attack
  - **`M`**: Move
- Tool modes default to:
  - **`F`**: Brush Mode
  - **`E`**: Select Mode
  - **`R`**: Group Mode

### 2. Smooth WASD Camera Movement
- Holding **`W`**, **`A`**, **`S`**, **`D`** pans the camera continuously and smoothly.
- Movement is normalized diagonally and calculated in screen pixels per second scaled by delta time `dt`, maintaining consistent pan speed across all zoom levels.

### 3. Scroll Wheel Mode Toggle & `Q` Key Quick Toggle
- The mouse scroll wheel can toggle between **Zoom Camera** and **Cycle Actions** (equivalent to Up / Down arrow keys).
- Pressing **`Q`** in-game instantly flips the scroll wheel mode with toast feedback and updates settings.
- The setting can also be toggled inside the new Settings menu.

### 4. Select $\leftrightarrow$ Group Action Persistence
- Switching between **Select** (`E`) and **Group** (`R`) mode now **preserves** the currently active action (`activeAction` is retained).
- Switching to or from **Brush** (`F`) resets `activeAction` to `'none'`.

### 5. Settings Menu (`#settings-panel`)
- Can be opened by hitting **`Escape`** (when no other modals are open) or clicking the **`Settings`** button in the header.
- Hitting `Escape` closes the Settings menu or any currently open modal.
- Includes:
  - **SFX Sound Toggle**: Directly controls `AntGame.AudioCoordinator.enabled` and pauses/resumes loops.
  - **Colony Music Toggle**: Persisted setting ready for future audio tracks.
  - **Scroll Wheel Behavior Toggle**: Switches between Zoom and Action cycling.
  - **Interactive Keybinding Rebinding Engine**:
    - Supports all standard keyboard keys.
    - **Numpad Support**: Differentiates `Numpad0`–`Numpad9`, `NumpadEnter`, etc., from top-row digits.
    - **Mouse Extra Buttons Support**: Captures Middle Click (`Mouse 3`), Back (`Mouse 4`), Forward (`Mouse 5`), and extra buttons (`Mouse 6`+).
    - **Configurable Caste Selectors (Empty by default)**: Shortcuts to select all Soldiers, Workers, Minors, Media, Majors, Supermajors, Feeders, and Brood Helpers.
    - **Focus Queen (Empty by default)**: Shortcut to immediately center camera on the Queen.
    - **Reset to Defaults** and individual **Clear Binding** buttons.
    - All preferences persist in `localStorage` under `'underfoot-settings-v1'`.

---

## Verification Results

### Automated Unit Tests (114 / 114 Passed)
```powershell
$env:ELECTRON_RUN_AS_NODE="1"; & "c:\Users\hudso\AppData\Local\Programs\Microsoft VS Code\Code.exe" --test tests/brood.test.cjs tests/climate.test.cjs tests/simulation.test.cjs | Out-String
```
```
ℹ tests 114
ℹ suites 0
ℹ pass 114
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1656.9512
```

### Renderer Benchmark
```powershell
$env:ELECTRON_RUN_AS_NODE="1"; & "c:\Users\hudso\AppData\Local\Programs\Microsoft VS Code\Code.exe" tests/test_renderer.cjs | Out-String
```
```
Testing Renderer initialization...
Testing all ant castes with moving & carry variations...
✔ All 9 castes x 4 carry states x alive/dead rendered cleanly!
Testing all creature species...
✔ All 9 species rendered cleanly in all movement and life states!
Testing full Simulation draw cycle benchmark...
✔ Benchmark: 100 full frames rendered in 187.4ms (1.874 ms/frame)
ALL RENDERER TESTS PASSED SUCCESSFULLY!
```
