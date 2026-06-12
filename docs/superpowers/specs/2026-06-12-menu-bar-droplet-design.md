# Menu-bar droplet — design

**Date:** 2026-06-12
**Status:** Approved (brainstorm), pending implementation plan

## Summary

Add an always-available, drop-and-forget compression path to squish-desktop: a
persistent menu-bar (tray) icon plus a small floating "droplet" window. Dropping
files onto the droplet squishes them immediately using the user's saved
settings and shows a macOS notification — the main window never opens.

This is an enhancement to the existing Tauri app, not a new project. The CLI
cannot host a persistent menu-bar/floating UI (that needs a running GUI process
with a status item / always-on-top window), so this work lives here.

## Decisions (from brainstorming)

- **Form factor:** menu-bar tray icon (primary) **plus** a poppable floating
  droplet window.
- **Drop behavior:** squish immediately with saved settings, then fire a macOS
  notification ("Squished 4 files · saved 2.1 MB"). Never steal focus; main
  window stays closed.
- **Availability:** tray present while the app runs; closing the main window
  keeps the app alive in the menu bar (already implemented). Opt-in
  **launch at login**. Hide the Dock icon when only the tray is showing
  (macOS accessory app).
- **Implementation approach:** **Approach A** — the floating droplet window is
  the drop target; the tray icon is the control surface. No custom native code.
  Dropping *directly on the menu-bar icon* (Approach B, custom `NSStatusItem` +
  `objc2` drag view) is explicitly **out of scope / deferred**.

## Architecture

The droplet is a **second webview window loading the same frontend bundle**,
rendered as a `Droplet` view when the Tauri window label is `"droplet"`. The
window **label is the single source of truth** for which view renders.
Because it shares the app origin, it shares `localStorage`, so it reads the
**same saved settings** (`squish-settings-v2`) via the existing
`migrateSettings()` loader and reuses `buildPayload()` and the existing
`squish_files` command (and its `squish://file-*` events). No backend settings
duplication and no new options plumbing.

The **tray icon becomes the control surface** (it already exists in `lib.rs`):

- Left-click **toggles the droplet** (show near the menu bar / hide) instead of
  opening the main window.
- Menu: *Open squish* (show main window), *Launch at login* (checkable),
  *Quit*.
- The main window keeps its current close-to-tray behavior.

### Settings-sharing risk and mitigation

Same-origin Tauri windows share `localStorage`, but a write in the main window
is not live-pushed to an already-open droplet. **Mitigation:** the droplet
re-reads settings from `localStorage` *fresh on each drop* (never caches at
load), so it always uses the latest saved settings. **Fallback** if cross-window
`localStorage` proves unreliable: a small `tauri-plugin-store` snapshot or a
backend-held settings mirror. Start with the simple shared-`localStorage` read.

## Components & file-level changes

### Backend (`src-tauri/`)

- **`lib.rs`**
  - Create a **droplet window** (runtime `WebviewWindowBuilder`, or declared
    hidden in `tauri.conf.json`) with **label `"droplet"`**: ~180×180,
    `decorations: false`, `always_on_top`, `skip_taskbar`, not resizable,
    hidden by default, loading the same bundle entry as the main window.
  - Change the tray **click handler** to toggle the droplet (show near the menu
    bar / hide) rather than open the main window.
  - Extend the tray **menu**: *Open squish*, *Launch at login*
    (`CheckMenuItem`), *Quit*.
  - Register new plugins: `tauri-plugin-notification`,
    `tauri-plugin-autostart`.
  - macOS `ActivationPolicy` toggling: `Accessory` when only the tray is
    showing, `Regular` when the main window is open.
- **`capabilities/`** — add a capability scoping the `droplet` window to
  `core:default`, `dialog`, and `notification:default`.

### Frontend (`src/`)

- **`main.tsx`** — branch on `getCurrentWebviewWindow().label`: render
  `<Droplet/>` for `"droplet"`, else `<App/>`.
- **`components/Droplet.tsx`** — compact drop surface reusing the
  `onDragDropEvent` pattern from `DropZone.tsx`; on drop, load settings via
  `migrateSettings()`, build the payload, invoke `squish_files`, show a brief
  inline "working…" state, then notify.
- **`lib/buildPayload.ts`** (new) — extract `buildPayload()` out of
  `useSquish.ts` so the main hook and the droplet share one settings→payload
  converter (no divergence). `useSquish.ts` imports it.
- **`lib/notify.ts`** (new) — request notification permission + send the
  completion toast built from a `BatchResult` summary.

## Data flow

1. User drops files on the droplet window.
2. `onDragDropEvent` yields `payload.paths`.
3. Droplet reads settings fresh from `localStorage` (`migrateSettings()`).
4. `buildPayload(settings)` → `invoke("squish_files", { paths, options })`.
5. Backend runs the existing parallel pipeline, emits `squish://file-*`,
   returns a `BatchResult`.
6. Droplet formats a summary
   ("Squished 4 files · saved 2.1 MB · 1 skipped") and sends a notification.
   Main window never opens.

## Error handling & edge cases

- **Per-file errors / skips:** `squish_files` already returns `error_count` and
  `skipped_count`; the notification reflects them ("3 squished, 1 failed").
- **No ffmpeg:** media files error individually via the existing
  `missing_dependency` path — surfaced in the summary, not a crash.
- **Notification permission denied:** degrade silently (no toast); request
  permission on first drop.
- **Concurrent drops while busy:** ignore new drops during a run with a subtle
  "busy" indicator on the droplet. Queueing is deferred.
- **Droplet positioning / multi-monitor:** anchor under the tray icon using the
  click event's rect where available, else top-right of the active display.
- **Launch-at-login checkmark:** driven by `autostart`'s `is_enabled()` so it
  reflects reality.

## Testing strategy

- **Frontend (Vitest):** `Droplet.test.tsx` — mock `onDragDropEvent` and
  `invoke`; assert `squish_files` is called with the payload derived from
  *saved* settings, and that the notification fires with the summary. The
  existing `__tests__/setup.ts` already mocks the Tauri APIs.
- **Rust:** unit-test extracted pure helpers (droplet window config builder, any
  summary formatting done in Rust). The `squish_files` pipeline is already
  covered.
- **Manual QA checklist:** drop → notification; uses saved settings; main window
  stays closed; *Launch at login* really toggles a login item; Dock icon hidden
  when only the tray is showing.

## Scope & phasing

- **Phase 1 (core value):** droplet window + tray toggle + drop → squish →
  notification, reusing saved settings and the existing command.
- **Phase 2:** *Launch at login* (autostart) + accessory Dock-hiding.

### Out of scope / deferred

- Native drop **directly on the menu-bar icon** (Approach B: custom
  `NSStatusItem` + `objc2` drag-accepting view). Revisit if click-to-reveal
  proves to be friction.
- Non-macOS accessory/notification nuances. The droplet itself is
  cross-platform; this work is macOS-first.
- Any change to the main window UI.
