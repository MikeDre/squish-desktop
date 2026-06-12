# Menu-bar Droplet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent menu-bar (tray) icon plus a small floating "droplet" window to squish-desktop, so dropping files onto the droplet squishes them with the user's saved settings and shows a macOS notification — without opening the main window.

**Architecture:** The droplet is a second Tauri webview window (label `"droplet"`) loading the same frontend bundle; `main.tsx` branches on the window label to render `<Droplet/>` instead of `<App/>`. The droplet reuses the existing `squish_files` command, `buildPayload()`, and `migrateSettings()` (read fresh from `localStorage` on each drop). The tray icon (already present) becomes the control surface: click toggles the droplet, and its menu gains *Open squish* / *Launch at login* / *Quit*.

**Tech Stack:** Tauri 2 (Rust), React 18 + TypeScript, Vitest, `tauri-plugin-notification`, `tauri-plugin-autostart`.

---

## File Structure

**Frontend (`src/`):**
- `lib/buildPayload.ts` — **new.** The settings→`squish_files`-payload converter, moved out of `useSquish.ts` so both the main hook and the droplet share one copy.
- `lib/notify.ts` — **new.** `formatBytes`, `formatSummary(BatchResult)`, and `notifyBatch(BatchResult)` (permission + send).
- `components/Droplet.tsx` + `components/Droplet.css` — **new.** The droplet drop surface.
- `hooks/useSquish.ts` — **modify.** Import `buildPayload` from `lib/buildPayload`, drop the local copy, keep the re-export.
- `main.tsx` — **modify.** Render `<Droplet/>` when the window label is `"droplet"`.

**Backend (`src-tauri/`):**
- `src/lib.rs` — **modify.** Register notification + autostart plugins; create the droplet window; tray click toggles the droplet; add menu items; macOS accessory policy.
- `Cargo.toml` — **modify.** Add `tauri-plugin-notification`, `tauri-plugin-autostart`.
- `capabilities/droplet.json` — **new.** Capability scoping the droplet window.
- `capabilities/default.json` — **modify.** Add `notification:default` to the main window.

**Tests (`src/__tests__/`):**
- `notify.test.ts` — **new.** `formatSummary` cases.
- `Droplet.test.tsx` — **new.** drop → `squish_files` + `notifyBatch`.

**Docs:**
- `README.md` — **modify.** Document the menu-bar droplet.

---

## Phase 1 — Core value (droplet + tray toggle + drop→squish→notification)

### Task 1: Extract `buildPayload` into a shared module

**Files:**
- Create: `src/lib/buildPayload.ts`
- Modify: `src/hooks/useSquish.ts`
- Test: `src/__tests__/useSquish.test.tsx` (existing — must still pass unchanged; it imports `{ buildPayload }` from `../hooks/useSquish`)

This is a pure refactor; the existing `buildPayload` tests are the safety net.

- [ ] **Step 1: Create the shared module**

Create `src/lib/buildPayload.ts` with the function moved verbatim from `useSquish.ts`:

```ts
import type { Settings } from "../types";

// Codecs a size budget can't drive: lossless (flac) has no bitrate dial, and
// copy doesn't re-encode. Matches the crate's target-size rejection set.
const BUDGET_INCOMPATIBLE_AUDIO_CODECS = new Set(["flac", "copy"]);

export function buildPayload(settings: Settings) {
  const budget = settings.targetSizeBytes;
  const hasBudget = budget != null;
  const audioCodec =
    hasBudget && settings.audio.codec && BUDGET_INCOMPATIBLE_AUDIO_CODECS.has(settings.audio.codec)
      ? null
      : settings.audio.codec;

  return {
    recursive: settings.recursive,
    force_overwrite: false,
    target_size: budget,
    image: {
      quality: hasBudget ? null : settings.image.quality,
      lossless: hasBudget ? false : settings.image.lossless,
      format: settings.image.format,
      max_width: settings.image.maxWidth,
      max_height: settings.image.maxHeight,
      suffix: settings.image.suffix,
    },
    audio: {
      codec: audioCodec,
      bitrate_kbps: hasBudget ? null : settings.audio.bitrateKbps,
      format: settings.audio.format,
      suffix: settings.audio.suffix,
    },
    video: {
      codec: settings.video.codec,
      quality: hasBudget ? null : settings.video.quality,
      preset: settings.video.preset,
      format: settings.video.format,
      suffix: settings.video.suffix,
    },
    code: {
      source_map: settings.code.sourceMap,
      suffix: settings.code.suffix,
    },
  };
}
```

- [ ] **Step 2: Update `useSquish.ts` to import and re-export it**

In `src/hooks/useSquish.ts`: delete the local `BUDGET_INCOMPATIBLE_AUDIO_CODECS` const and the local `function buildPayload(...)`, add an import at the top, and keep the existing re-export line at the bottom so the existing test's import path keeps working.

Add near the other imports:
```ts
import { buildPayload } from "../lib/buildPayload";
```

The bottom of the file should read:
```ts
// Re-exported for existing callers/tests.
export { buildPayload };
```

- [ ] **Step 3: Run the existing tests, expect PASS (behavior unchanged)**

Run: `npm test -- useSquish`
Expected: PASS — all `buildPayload` and `useSquish` tests green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/buildPayload.ts src/hooks/useSquish.ts
git commit -m "♻️ Changed: extract buildPayload into lib for reuse [feat/menu-bar-droplet]"
```

---

### Task 2: Notification helper (`formatSummary` + `notifyBatch`)

**Files:**
- Create: `src/lib/notify.ts`
- Test: `src/__tests__/notify.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/notify.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatBytes, formatSummary } from "../lib/notify";
import type { BatchResult } from "../types";

function result(over: Partial<BatchResult>): BatchResult {
  const fam = { total: 0, success: 0, error: 0, skipped: 0 };
  return {
    total_files: 0,
    success_count: 0,
    error_count: 0,
    skipped_count: 0,
    total_input_bytes: 0,
    total_output_bytes: 0,
    total_duration_ms: 0,
    by_family: { image: fam, audio: fam, video: fam, code: fam },
    ...over,
  };
}

describe("formatBytes", () => {
  it("uses decimal units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1_500)).toBe("1.5 KB");
    expect(formatBytes(2_100_000)).toBe("2.1 MB");
  });
});

describe("formatSummary", () => {
  it("reports files squished and bytes saved", () => {
    const s = formatSummary(
      result({ success_count: 4, total_input_bytes: 5_000_000, total_output_bytes: 2_900_000 }),
    );
    expect(s).toBe("Squished 4 files · saved 2.1 MB");
  });

  it("appends failures and skips when present", () => {
    const s = formatSummary(
      result({
        success_count: 3,
        error_count: 1,
        skipped_count: 2,
        total_input_bytes: 1_000_000,
        total_output_bytes: 800_000,
      }),
    );
    expect(s).toBe("Squished 3 files · saved 200 KB · 1 failed · 2 skipped");
  });

  it("handles a nothing-squished batch", () => {
    const s = formatSummary(result({ skipped_count: 1 }));
    expect(s).toBe("Squished 0 files · 1 skipped");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- notify`
Expected: FAIL — cannot resolve `../lib/notify`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/notify.ts`:

```ts
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { BatchResult } from "../types";

/** Decimal byte formatter: 1500 → "1.5 KB", 2_100_000 → "2.1 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1_000;
  let i = 0;
  while (value >= 1_000 && i < units.length - 1) {
    value /= 1_000;
    i++;
  }
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} ${units[i]}`;
}

/** One-line summary for the completion notification. */
export function formatSummary(result: BatchResult): string {
  const parts = [`Squished ${result.success_count} files`];
  if (result.success_count > 0) {
    const saved = result.total_input_bytes - result.total_output_bytes;
    parts.push(`saved ${formatBytes(Math.max(0, saved))}`);
  }
  if (result.error_count > 0) parts.push(`${result.error_count} failed`);
  if (result.skipped_count > 0) parts.push(`${result.skipped_count} skipped`);
  return parts.join(" · ");
}

/** Request permission if needed, then post the completion notification. */
export async function notifyBatch(result: BatchResult): Promise<void> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      granted = (await requestPermission()) === "granted";
    }
    if (granted) {
      sendNotification({ title: "squish", body: formatSummary(result) });
    }
  } catch {
    // Notification plugin unavailable (e.g. tests) — no-op.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- notify`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notify.ts src/__tests__/notify.test.ts
git commit -m "✨ Added: notification summary helper for batch results [feat/menu-bar-droplet]"
```

---

### Task 3: Droplet component

**Files:**
- Create: `src/components/Droplet.tsx`, `src/components/Droplet.css`
- Test: `src/__tests__/Droplet.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/Droplet.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Droplet } from "../components/Droplet";
import { DEFAULT_SETTINGS } from "../types";
import { SETTINGS_KEY_V2 } from "../lib/settings/migrate";
import { buildPayload } from "../lib/buildPayload";

// Capture the drag-drop handler so the test can fire a synthetic drop.
let dropHandler: ((event: { payload: { type: string; paths?: string[] } }) => void) | null = null;

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({
    onDragDropEvent: (cb: typeof dropHandler) => {
      dropHandler = cb;
      return Promise.resolve(() => {});
    },
  }),
}));

const invokeMock = vi.fn(() =>
  Promise.resolve({
    total_files: 1,
    success_count: 1,
    error_count: 0,
    skipped_count: 0,
    total_input_bytes: 1000,
    total_output_bytes: 600,
    total_duration_ms: 5,
    by_family: {
      image: { total: 1, success: 1, error: 0, skipped: 0 },
      audio: { total: 0, success: 0, error: 0, skipped: 0 },
      video: { total: 0, success: 0, error: 0, skipped: 0 },
      code: { total: 0, success: 0, error: 0, skipped: 0 },
    },
  }),
);
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

const notifyBatchMock = vi.fn(() => Promise.resolve());
vi.mock("../lib/notify", () => ({ notifyBatch: () => notifyBatchMock() }));

beforeEach(() => {
  localStorage.clear();
  dropHandler = null;
  invokeMock.mockClear();
  notifyBatchMock.mockClear();
});

describe("Droplet", () => {
  it("squishes dropped files with saved settings, then notifies", async () => {
    localStorage.setItem(SETTINGS_KEY_V2, JSON.stringify(DEFAULT_SETTINGS));
    render(<Droplet />);

    await waitFor(() => expect(dropHandler).not.toBeNull());
    dropHandler!({ payload: { type: "drop", paths: ["/tmp/a.png"] } });

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(invokeMock).toHaveBeenCalledWith("squish_files", {
      paths: ["/tmp/a.png"],
      options: buildPayload(DEFAULT_SETTINGS),
    });
    await waitFor(() => expect(notifyBatchMock).toHaveBeenCalledTimes(1));
  });

  it("ignores non-drop drag events", async () => {
    render(<Droplet />);
    await waitFor(() => expect(dropHandler).not.toBeNull());
    dropHandler!({ payload: { type: "over" } });
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- Droplet`
Expected: FAIL — cannot resolve `../components/Droplet`.

- [ ] **Step 3: Write the implementation**

Create `src/components/Droplet.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { migrateSettings } from "../lib/settings/migrate";
import { buildPayload } from "../lib/buildPayload";
import { notifyBatch } from "../lib/notify";
import type { BatchResult } from "../types";
import "./Droplet.css";

type DropletState = "idle" | "busy";

export function Droplet() {
  const [state, setState] = useState<DropletState>("idle");
  const [isDragOver, setIsDragOver] = useState(false);
  const busyRef = useRef(false);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function squish(paths: string[]) {
      // Ignore drops while a batch is running.
      if (busyRef.current || paths.length === 0) return;
      busyRef.current = true;
      setState("busy");
      try {
        // Read settings fresh on each drop so the latest saved values win.
        const options = buildPayload(migrateSettings());
        const result = await invoke<BatchResult>("squish_files", { paths, options });
        await notifyBatch(result);
      } catch (err) {
        console.error("droplet squish failed:", err);
      } finally {
        busyRef.current = false;
        if (!cancelled) setState("idle");
      }
    }

    async function setup() {
      try {
        const win = getCurrentWebviewWindow();
        const unlisten = await win.onDragDropEvent((event) => {
          if (cancelled) return;
          if (event.payload.type === "over") setIsDragOver(true);
          else if (event.payload.type === "leave") setIsDragOver(false);
          else if (event.payload.type === "drop") {
            setIsDragOver(false);
            void squish(event.payload.paths);
          }
        });
        unlistenRef.current = unlisten;
      } catch {
        // Outside Tauri runtime (tests) — no-op.
      }
    }

    setup();
    return () => {
      cancelled = true;
      unlistenRef.current?.();
    };
  }, []);

  const className = [
    "droplet",
    isDragOver ? "droplet--drag-over" : "",
    state === "busy" ? "droplet--busy" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      <div className="droplet__icon">{state === "busy" ? "⏳" : "📦"}</div>
      <p className="droplet__text">{state === "busy" ? "Squishing…" : "Drop to squish"}</p>
    </div>
  );
}
```

Create `src/components/Droplet.css`:

```css
.droplet {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100vw;
  height: 100vh;
  gap: 8px;
  border-radius: 16px;
  background: rgba(30, 30, 40, 0.92);
  color: #fff;
  font-family: -apple-system, system-ui, sans-serif;
  user-select: none;
  cursor: default;
  border: 2px dashed transparent;
  box-sizing: border-box;
}
.droplet--drag-over {
  border-color: #8b5cf6;
  background: rgba(50, 40, 70, 0.96);
}
.droplet--busy {
  opacity: 0.8;
}
.droplet__icon {
  font-size: 40px;
  line-height: 1;
}
.droplet__text {
  margin: 0;
  font-size: 13px;
  opacity: 0.85;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- Droplet`
Expected: PASS — both cases green.

- [ ] **Step 5: Commit**

```bash
git add src/components/Droplet.tsx src/components/Droplet.css src/__tests__/Droplet.test.tsx
git commit -m "✨ Added: Droplet drop surface (drop → squish → notify) [feat/menu-bar-droplet]"
```

---

### Task 4: Route by window label in `main.tsx`

**Files:**
- Modify: `src/main.tsx`

`main.tsx` is the bootstrap and is not unit-tested; verification is a successful typecheck/build.

- [ ] **Step 1: Implement label-based rendering**

Replace the contents of `src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import App from "./App";
import { Droplet } from "./components/Droplet";

function resolveLabel(): string {
  try {
    // `.label` is a synchronous property on the current webview window.
    return getCurrentWebviewWindow().label;
  } catch {
    return "main";
  }
}

const Root = resolveLabel() === "droplet" ? Droplet : App;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
```

- [ ] **Step 2: Verify the typecheck/build passes**

Run: `npm run build`
Expected: `tsc` succeeds and Vite builds with no type errors.

- [ ] **Step 3: Run the full frontend test suite**

Run: `npm test`
Expected: PASS — existing suites plus the new `notify` and `Droplet` tests.

- [ ] **Step 4: Commit**

```bash
git add src/main.tsx
git commit -m "✨ Added: render Droplet view for the droplet window label [feat/menu-bar-droplet]"
```

---

### Task 5: Backend — droplet window, tray toggle, notification plugin, capability

**Files:**
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `package.json`
- Create: `src-tauri/capabilities/droplet.json`

- [ ] **Step 1: Add the notification plugin (Rust + JS)**

In `src-tauri/Cargo.toml`, under `[dependencies]`, add:
```toml
tauri-plugin-notification = "2"
```

Then add the JS binding:
```bash
npm install @tauri-apps/plugin-notification
```

- [ ] **Step 2: Add the droplet window capability**

Create `src-tauri/capabilities/droplet.json`:
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "droplet",
  "description": "Capability for the floating droplet window",
  "windows": ["droplet"],
  "permissions": [
    "core:default",
    "dialog:default",
    "notification:default"
  ]
}
```

In `src-tauri/capabilities/default.json`, add `"notification:default"` to the `permissions` array so the main window may also notify:
```json
  "permissions": [
    "core:default",
    "opener:default",
    "dialog:default",
    "notification:default"
  ]
```

- [ ] **Step 3: Register the plugin, create the droplet window, and toggle it from the tray**

Edit `src-tauri/src/lib.rs`. Update the imports block:
```rust
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, WebviewUrl, WebviewWindowBuilder,
};
```

Register the plugin — add to the builder chain alongside the existing plugins:
```rust
        .plugin(tauri_plugin_notification::init())
```

Inside `.setup(|app| { ... })`, **after** the tray is built and **before** `Ok(())`, create the hidden droplet window:
```rust
            // Floating droplet: a small, borderless, always-on-top drop target.
            // Hidden until toggled from the tray. Shares the main bundle; the
            // frontend renders the Droplet view based on this window's label.
            let _droplet = WebviewWindowBuilder::new(
                app,
                "droplet",
                WebviewUrl::default(),
            )
            .title("squish droplet")
            .inner_size(180.0, 180.0)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .visible(false)
            .build()?;
```

Replace the tray **click** handler so it toggles the droplet instead of opening the main window:
```rust
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { .. } = event {
                        if let Some(droplet) = tray.app_handle().get_webview_window("droplet") {
                            let visible = droplet.is_visible().unwrap_or(false);
                            if visible {
                                let _ = droplet.hide();
                            } else {
                                let _ = droplet.show();
                                let _ = droplet.set_focus();
                            }
                        }
                    }
                })
```

The existing `"show"` / `"quit"` menu items stay as-is (*Show Window* still opens the main window). The menu already contains them; no change needed in this task.

- [ ] **Step 4: Verify the backend compiles**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: compiles with no errors (first build downloads the new plugin crate).

- [ ] **Step 5: Manual QA**

Run: `npm run tauri dev`
Verify:
1. Tray icon appears in the menu bar.
2. Clicking the tray icon shows a small floating droplet; clicking again hides it.
3. Dragging an image onto the droplet produces a `*_squished.*` sibling and a macOS notification ("Squished 1 files · saved …").
4. The main window never opens during a drop.
5. Changing a setting in the main window, then dropping on the droplet, uses the new setting (e.g. change the output suffix and confirm the new suffix on the output).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/capabilities/ package.json package-lock.json
git commit -m "✨ Added: floating droplet window + tray toggle + notifications [feat/menu-bar-droplet]"
```

---

## Phase 2 — Launch at login + accessory Dock-hiding

### Task 6: Launch at login (autostart)

**Files:**
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`

- [ ] **Step 1: Add the autostart plugin**

In `src-tauri/Cargo.toml`, under `[dependencies]`, add:
```toml
tauri-plugin-autostart = "2"
```

- [ ] **Step 2: Register the plugin and add a checkable menu item**

Edit `src-tauri/src/lib.rs`.

Update the menu import to include `CheckMenuItem`:
```rust
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_autostart::ManagerExt;
```

Register the plugin in the builder chain (macOS launcher, no extra launch args):
```rust
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
```

In `.setup`, build the check item reflecting the real current state, and add it to the menu. Replace the existing menu-construction lines:
```rust
            let show_item = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
```
with:
```rust
            let show_item = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let autostart_enabled = app.autolaunch().is_enabled().unwrap_or(false);
            let login_item = CheckMenuItem::with_id(
                app,
                "login",
                "Launch at login",
                true,
                autostart_enabled,
                None::<&str>,
            )?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &login_item, &quit_item])?;
```

Extend the tray `on_menu_event` match with a `"login"` arm (keep the existing `"show"` and `"quit"` arms):
```rust
                    "login" => {
                        let mgr = app.autolaunch();
                        if mgr.is_enabled().unwrap_or(false) {
                            let _ = mgr.disable();
                        } else {
                            let _ = mgr.enable();
                        }
                    }
```

- [ ] **Step 3: Verify the backend compiles**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: compiles with no errors.

- [ ] **Step 4: Manual QA**

Run: `npm run tauri dev`
Verify:
1. The tray menu shows a checkable *Launch at login* item.
2. Toggling it on adds a login item (System Settings → General → Login Items shows "squish"); toggling off removes it.
3. The checkmark reflects the current state when the menu reopens.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs
git commit -m "✨ Added: opt-in launch at login via autostart plugin [feat/menu-bar-droplet]"
```

---

### Task 7: Hide the Dock icon when only the tray is showing (macOS accessory policy)

**Files:**
- Modify: `src-tauri/src/lib.rs`

The app should be an accessory (no Dock icon) when no main window is visible, and a regular app when the main window is shown.

- [ ] **Step 1: Set accessory policy at startup**

Edit `src-tauri/src/lib.rs`. At the **start** of `.setup` (before building the tray), set the app to accessory on macOS — the main window starts visible, so immediately restore Regular below; the helper keeps the logic in one place:
```rust
            #[cfg(target_os = "macos")]
            {
                use tauri::ActivationPolicy;
                // Start as accessory; switch to Regular whenever the main window
                // is visible so Cmd-Tab and the Dock behave normally.
                let _ = app.set_activation_policy(ActivationPolicy::Accessory);
            }
```

- [ ] **Step 2: Switch policy as the main window shows/hides**

The main window's `on_window_event` already intercepts `CloseRequested` to hide the window. Extend that closure to drop to accessory on hide, and add a `Focused`/`show` path to regular. Replace the existing `on_window_event` block:
```rust
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.hide();
                    }
                    #[cfg(target_os = "macos")]
                    {
                        use tauri::ActivationPolicy;
                        let _ = app_handle.set_activation_policy(ActivationPolicy::Accessory);
                    }
                }
            });
```

In the tray `"show"` menu arm and the main-window show path, set Regular. Update the `"show"` arm:
```rust
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            #[cfg(target_os = "macos")]
                            {
                                use tauri::ActivationPolicy;
                                let _ = app.set_activation_policy(ActivationPolicy::Regular);
                            }
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
```

Because the main window starts visible at launch, also set Regular once right after the window handle is obtained in `.setup` (so the first launch shows a Dock icon):
```rust
            #[cfg(target_os = "macos")]
            {
                use tauri::ActivationPolicy;
                let _ = app.set_activation_policy(ActivationPolicy::Regular);
            }
```

- [ ] **Step 2b: Run the backend tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS — existing Rust tests still green.

- [ ] **Step 3: Verify the backend compiles**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: compiles with no errors.

- [ ] **Step 4: Manual QA**

Run: `npm run tauri dev`
Verify:
1. On launch with the main window open, a Dock icon is present.
2. Closing the main window (to tray) removes the Dock icon; the tray icon remains and the droplet still works.
3. *Show Window* from the tray brings back the Dock icon and the window.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "✨ Added: hide Dock icon when only the tray is showing (macOS) [feat/menu-bar-droplet]"
```

---

### Task 8: Document the menu-bar droplet

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a "Menu-bar droplet" subsection**

In `README.md`, under the `## Use` section (after the existing numbered steps), add:
```markdown
### Menu-bar droplet

squish lives in the menu bar. Click the tray icon to pop out a small floating
droplet, then drag files onto it — they're compressed immediately using your
saved settings, with a notification when done. The main window never opens.

- **Launch at login** — enable from the tray menu so squish is always ready.
- The Dock icon hides automatically when only the menu-bar icon is showing.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "📝 Updated: document the menu-bar droplet [feat/menu-bar-droplet]"
```

---

## Self-Review Notes

- **Spec coverage:** form factor (Tasks 3–5), drop→squish→notification (Tasks 2,3,5), saved-settings reuse read fresh on drop (Task 3), `buildPayload` reuse (Task 1), launch at login (Task 6), accessory Dock-hiding (Task 7), error/skip counts in the summary (Task 2), tests (Tasks 2,3 + suite run in Task 4), docs (Task 8). Out-of-scope Approach B is excluded.
- **Settings-sharing risk** from the spec is handled by reading `migrateSettings()` fresh inside the droplet's drop handler (Task 3, `squish` function), not caching at load.
- **Type consistency:** `buildPayload` (Tasks 1,3), `formatSummary`/`formatBytes`/`notifyBatch` (Tasks 2,3), `BatchResult` fields (`success_count`, `error_count`, `skipped_count`, `total_input_bytes`, `total_output_bytes`) used consistently in Tasks 2 and 3, and match `src/types.ts`.
