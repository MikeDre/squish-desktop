# squish-desktop v2 — Design Spec

**Date:** 2026-04-17
**Status:** Approved, pending implementation plan

## Overview

v2 of squish-desktop adds theme support, UI modernization with a glassmorphism design language, and several quality-of-life features from the v1 future work list. The architectural approach is CSS custom properties + incremental feature additions — no new CSS framework, no component library. Each feature is a small, isolated change building on the existing plain-CSS + BEM architecture.

## Scope

| Feature | Summary |
|---------|---------|
| Theme system & dark mode | CSS variables, system detection with manual override |
| UI modernization | Glassmorphism — frosted glass, blurs, soft shadows, macOS-native feel |
| File picker | Native open dialog as alternative to drag-and-drop |
| Recursive folder toggle | Settings toggle to include subfolders |
| Reveal in Finder | Per-row button to show compressed file in Finder |
| Batch queuing | Accept new file drops during processing |
| System tray | Persistent tray icon, hide-to-tray on window close |

## Out of Scope

- Video and audio compression (requires squish-core crate work first).
- Pre-built binaries, code signing, CI/CD pipeline, auto-update.
- .app bundle distribution (build from source for now).
- "Reduce transparency" accessibility fallback.

---

## 1. Theme System & Dark Mode

### CSS Custom Properties

Two token sets defined on `:root` (light, default) and `[data-theme="dark"]`:

```css
:root {
  --bg-primary: rgba(255, 255, 255, 0.72);
  --bg-surface: rgba(255, 255, 255, 0.5);
  --bg-glass: rgba(255, 255, 255, 0.4);
  --text-primary: #1a1a1a;
  --text-secondary: #666;
  --border: rgba(0, 0, 0, 0.08);
  --shadow: 0 2px 20px rgba(0, 0, 0, 0.06);
  --blur: 20px;
  --accent: #5B7FFF;
  --success: #34C759;
  --error: #FF3B30;
}

[data-theme="dark"] {
  --bg-primary: rgba(30, 30, 30, 0.85);
  --bg-surface: rgba(45, 45, 45, 0.6);
  --bg-glass: rgba(50, 50, 50, 0.5);
  --text-primary: #f0f0f0;
  --text-secondary: #999;
  --border: rgba(255, 255, 255, 0.08);
  --shadow: 0 2px 20px rgba(0, 0, 0, 0.3);
}
```

All existing CSS migrates from hardcoded colors to variable references.

### `useTheme` Hook

- **On mount:** Check localStorage for `theme` key. If `"light"` or `"dark"`, use that. If `"system"` or absent, read `window.matchMedia("(prefers-color-scheme: dark)")`.
- **System listener:** Listens for system theme changes via `matchMedia.addEventListener("change", ...)`.
- **DOM:** Sets `data-theme` attribute on `document.documentElement`.
- **API:** Exposes `{ theme, effectiveTheme, setTheme }` where `theme` is the preference (`"system" | "light" | "dark"`) and `effectiveTheme` is the resolved value (`"light" | "dark"`).
- **Persistence:** Saves preference to localStorage on change.

### Toggle UI

Small icon button (sun/moon) in the top-right corner of the app. Clicking cycles: system → light → dark → system. Subtle tooltip shows the current mode.

---

## 2. UI Modernization — Glassmorphism Design Language

### Overall Feel

Semi-transparent layered panels with backdrop blur, soft shadows, and generous border-radius. The window background is a subtle gradient so the glass layers have something to blur against.

### App Shell

- Body background: soft gradient (light: cool gray-blue; dark: deep charcoal). This is the backdrop that makes the glass effect visible.
- No hard borders between sections — depth comes from layering translucent panels.

### DropZone

- Glass panel with `backdrop-filter: blur(var(--blur))` and semi-transparent background.
- Border: 1px solid with low-opacity white/black for subtle edge definition.
- Dashed inner border on drag-over, with a gentle scale-up animation.
- Large rounded corners (`border-radius: 16px`).
- Drop icon and text centered, with smooth opacity transitions between states.

### Settings Panel

- Glass card that slides down smoothly when toggled (CSS transition on max-height + opacity).
- Gear icon toggle with rotation animation on open/close.
- Slider: custom-styled rounded track, accent-colored thumb with shadow.
- Dropdown and checkbox styled to match the glass aesthetic with design token colors.

### File List & FileRow

- Each row is a subtle glass card with hover state (slight brightness shift).
- Progress bar: rounded, accent-colored with a soft glow/gradient.
- Status indicators: small colored dots (green=done, blue=compressing, red=error) rather than text labels.
- Spacing: generous padding between rows (`gap: 8px`).

### Summary Bar

- Sticky at the bottom, stronger glass effect (more blur, slightly more opaque) to separate from scrolling list.
- Key metrics in a clean horizontal layout.

### Typography

- System font stack: `-apple-system, BlinkMacSystemFont, "SF Pro", system-ui, sans-serif`.
- Lighter font weights for airy feel. Bolder weight only for key numbers (savings %, file sizes).

### Transitions

- All interactive elements: `transition: all 0.2s ease`.
- File rows animate in with subtle fade + slide-up on appearance.

---

## 3. File Picker

### Plugin

Add `tauri-plugin-dialog` to the Rust backend for native file/folder open dialogs.

### Backend

Register the dialog plugin in `main.rs`. No new Tauri command needed — the dialog plugin exposes its API directly to the frontend via `@tauri-apps/plugin-dialog`.

### Frontend

Button inside the DropZone, below the drop prompt text. On click:
- Call `open()` from `@tauri-apps/plugin-dialog` with `multiple: true`.
- Pass returned paths to the same `onDrop(paths)` handler used by drag-and-drop.
- With batch queuing active, the button remains enabled during processing (same behavior as drag-drop accepting new files anytime).

### UX

DropZone text: "Drop files here or" with the browse button underneath. Drop area remains the primary interaction; the button is secondary.

---

## 4. Recursive Folder Toggle

### Frontend

New toggle in SettingsPanel: "Include subfolders" checkbox/switch. Default: off (preserves v1 behavior). Persisted to localStorage as part of `Settings`.

### Types

Add `recursive: boolean` to `Settings` type and `SquishOptionsPayload`.

### Backend

`expand_paths` in `commands.rs` currently uses `walkdir` with `max_depth(1)`. When `recursive` is true, remove the depth cap. walkdir already handles recursive traversal — this is the only backend change.

---

## 5. Reveal in Finder

### Plugin

Uses existing `tauri-plugin-opener` (already in the project). Its `revealItemInDir` function opens Finder with the file selected.

### Frontend

Small folder/arrow-out icon button on each `FileRow` when status is `done`. On click, call `revealItemInDir(outputPath)` from `@tauri-apps/plugin-opener`.

### UX

Button appears inline on the right side of the result row, next to savings percentage. Subtle by default (low opacity), more visible on row hover. Tooltip: "Show in Finder". Only shown for `done` status — not for error or in-progress rows.

---

## 6. Batch Queuing

### Current Behavior

Drops are ignored when status is `processing`. DropZone returns early.

### New Behavior

Drops are always accepted. New files get sent to the backend immediately with current settings.

### State Machine Changes

- Remove the guard that ignores drops during `processing`.
- `AppState` gains `activeBatches: number` (default 0).
- `START_BATCH` action: increment `activeBatches`, set status to `processing`. If already processing, append files without clearing existing ones. If idle/done, clear existing files and start fresh.
- `BATCH_COMPLETE` action: decrement `activeBatches`. Set status to `done` only when `activeBatches === 0`.

### Backend

No changes. Each `squish_files` call is independent. Multiple can run concurrently — rayon handles the thread pool.

### UX

DropZone remains interactive during processing. Text changes to "Drop more files to add to queue". New file rows appear at the bottom of the list with the same pending → compressing → done flow.

---

## 7. System Tray

### Setup

Configure tray in `main.rs` on app setup using Tauri 2's built-in tray module (no separate crate):
- Icon: app icon (already available in multiple sizes).
- Left-click: show/focus the main window.
- Right-click menu: "Show Window", separator, "Quit".

### Window Behavior

- Window close (red X): hide the window instead of quitting. Tray keeps the process alive.
- Tray icon click or "Show Window" menu item: bring the window back.
- "Quit" menu item: actually exit the process.
- `Cmd+Q`: fully quit the app (standard macOS behavior, not hide-to-tray).

### macOS

Set `activate_on_click: true` so clicking the Dock icon also shows the window.

### Frontend

No frontend changes — tray is entirely managed from Rust.

---

## 8. Error Handling & Cross-Cutting Concerns

### Settings Migration

Existing localStorage settings won't have `recursive` or `theme` keys. `loadSettings()` merges saved settings with defaults, so missing keys gracefully fall back: `recursive: false`, `theme: "system"`.

### File Picker + Recursive

If recursive is on and the user picks a folder via the file picker, the recursive setting is respected — same code path as drag-and-drop.

### Batch Queuing + Reveal

Files from completed batches retain their reveal buttons. State is not cleared until a completely new session begins (files dropped when all batches are complete).

### System Tray + Quit

`Cmd+Q` fully quits the app. Only the window close button (red X) triggers hide-to-tray.

### Glassmorphism Performance

`backdrop-filter: blur()` is GPU-accelerated on modern macOS. No "reduce transparency" fallback for v2. Can be added later if performance issues surface on lower-end hardware.

---

## Dependencies Added

| Dependency | Type | Purpose |
|-----------|------|---------|
| `tauri-plugin-dialog` | Rust crate + npm package | Native file/folder open dialogs |
| (tray module) | Tauri 2 built-in | System tray icon and menu |

`tauri-plugin-opener` is already in the project (used for Reveal in Finder).

## Files Modified

### Rust (src-tauri/)
- `Cargo.toml` — add `tauri-plugin-dialog` dependency
- `tauri.conf.json` — add dialog plugin permission, tray configuration
- `src/main.rs` — register dialog plugin, configure tray, handle window close
- `src/commands.rs` — add `recursive` flag to `expand_paths` / `squish_files`

### Frontend (src/)
- `src/types.ts` — add `recursive` to Settings, theme types
- `src/hooks/useTheme.ts` — new hook for theme management
- `src/hooks/useSquish.ts` — pass `recursive` flag, support batch queuing
- `src/App.tsx` — integrate useTheme, update reducer for activeBatches
- `src/App.css` — CSS variables, gradient background, glassmorphism tokens
- `src/components/DropZone.tsx` — file picker button, allow drops during processing
- `src/components/DropZone.css` — glassmorphism styling
- `src/components/SettingsPanel.tsx` — recursive toggle, theme toggle
- `src/components/SettingsPanel.css` — glassmorphism styling, custom controls
- `src/components/FileRow.tsx` — reveal button, status dots
- `src/components/FileRow.css` — glassmorphism styling, animations
- `src/components/FileList.css` — updated spacing
- `src/components/Summary.tsx` — layout updates
- `src/components/Summary.css` — sticky glass bar styling

### New Files
- `src/hooks/useTheme.ts`

### Package
- `package.json` — add `@tauri-apps/plugin-dialog`
