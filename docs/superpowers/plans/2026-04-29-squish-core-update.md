# squish-core Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring upstream `squish-core` 0.2.0 features (image resize via `max_width`/`max_height`, custom output `suffix`) into squish-desktop with end-to-end UI plumbing. Video support is deferred.

**Architecture:** Additive only. `squish-core` git dep is re-resolved by `cargo update`; the Tauri payload, settings type, IPC mapper, and `SettingsPanel` each gain three optional fields. The settings panel grows a primary-area "Resize" card and a native `<details>` "Advanced" disclosure containing the suffix input. No event/command/result shapes change.

**Tech Stack:** Rust (Tauri 2 backend), TypeScript + React 18, Vitest + React Testing Library, Cargo + `cargo test`.

**Spec:** `docs/superpowers/specs/2026-04-29-squish-core-update-design.md`

**Conventions to honour:**
- This repo gitignores `docs/`, so the spec/plan files are local-only — never `git add -f` them.
- Existing commit prefix style: `feat:`, `fix:`, `docs:`, `style:`, `chore:`. Match it.
- The user prefers sole authorship on commits — do **not** add a Claude `Co-Authored-By` trailer.
- Run frontend tests with `npm test` (one-shot, vitest run) from the repo root. Run Rust tests with `cargo test --manifest-path src-tauri/Cargo.toml`.

---

## Task 1: Bump `squish-core` to upstream `main`

**Files:**
- Modify: `src-tauri/Cargo.lock` (regenerated)

The desktop pins `squish-core = { git = "...", branch = "main" }` so no Cargo.toml edit is needed; `cargo update` re-resolves the lockfile to the latest upstream commit (currently `822bc29`, on top of the 0.2.0 release).

- [ ] **Step 1: Confirm current pin**

Run: `grep -A 2 'name = "squish-core"' src-tauri/Cargo.lock | head -5`
Expected: shows `version = "0.1.1"` and `source = "git+https://github.com/MikeDre/squish.git?branch=main#8dfe4ac9..."`. If it already shows `0.2.0`, skip to Step 4.

- [ ] **Step 2: Re-resolve the git dependency**

Run: `cargo update -p squish-core --manifest-path src-tauri/Cargo.toml`
Expected: cargo prints `Updating squish-core ... v0.1.1 -> v0.2.0` (or similar). It re-fetches the upstream repo.

- [ ] **Step 3: Verify the lockfile picked up 0.2.0**

Run: `grep -A 2 'name = "squish-core"' src-tauri/Cargo.lock | head -5`
Expected: `version = "0.2.0"`, source URL ends with a fresh commit SHA (≥ `822bc29`).

- [ ] **Step 4: Compile-check the backend**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: `Finished ... profile [unoptimized + debuginfo]`. No errors. Warnings are fine.

- [ ] **Step 5: Run existing Rust tests to ensure nothing regressed**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all existing tests pass. `get_version_returns_something` and `expand_paths_with_nonexistent_path_returns_empty` are the existing two.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.lock
git commit -m "chore: bump squish-core to upstream 0.2.0"
```

---

## Task 2: Backend payload + options mapping (TDD)

**Files:**
- Modify: `src-tauri/src/commands.rs` (struct at lines 5-11, function `to_squish_options` around lines 70-77, tests module at the bottom)

The payload gains three optional fields and `to_squish_options` normalizes empty/zero/whitespace inputs to `None` before constructing `squish_core::SquishOptions`.

- [ ] **Step 1: Write three failing tests in the existing `mod tests` block**

Open `src-tauri/src/commands.rs`. Find the `#[cfg(test)] mod tests` block at the bottom and **append** these three tests (do not delete the existing ones):

```rust
    fn payload_full() -> SquishOptionsPayload {
        SquishOptionsPayload {
            quality: None,
            lossless: false,
            format: None,
            recursive: false,
            max_width: Some(1920),
            max_height: Some(1080),
            suffix: Some("min".to_string()),
        }
    }

    #[test]
    fn to_squish_options_maps_resize_and_suffix() {
        let opts = to_squish_options(&payload_full());
        assert_eq!(opts.max_width, Some(1920));
        assert_eq!(opts.max_height, Some(1080));
        assert_eq!(opts.suffix.as_deref(), Some("min"));
    }

    #[test]
    fn to_squish_options_normalizes_zero_dims_to_none() {
        let p = SquishOptionsPayload {
            quality: None, lossless: false, format: None, recursive: false,
            max_width: Some(0), max_height: Some(0), suffix: None,
        };
        let opts = to_squish_options(&p);
        assert!(opts.max_width.is_none());
        assert!(opts.max_height.is_none());
    }

    #[test]
    fn to_squish_options_normalizes_empty_or_whitespace_suffix_to_none() {
        let empty = SquishOptionsPayload {
            quality: None, lossless: false, format: None, recursive: false,
            max_width: None, max_height: None, suffix: Some("".to_string()),
        };
        assert!(to_squish_options(&empty).suffix.is_none());

        let ws = SquishOptionsPayload {
            quality: None, lossless: false, format: None, recursive: false,
            max_width: None, max_height: None, suffix: Some("   ".to_string()),
        };
        assert!(to_squish_options(&ws).suffix.is_none());
    }
```

- [ ] **Step 2: Run the new tests — expect compile failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib commands::tests::to_squish_options 2>&1 | tail -20`
Expected: compile errors like `struct SquishOptionsPayload has no field named "max_width"` and similar for `max_height`, `suffix`. This confirms the tests are wired up but the production struct doesn't satisfy them yet.

- [ ] **Step 3: Extend `SquishOptionsPayload` with the three fields**

Edit `src-tauri/src/commands.rs`. Replace the existing `SquishOptionsPayload` struct (the four-field version near the top of the file) with:

```rust
#[derive(Deserialize)]
pub struct SquishOptionsPayload {
    pub quality: Option<u8>,
    pub lossless: bool,
    pub format: Option<String>,
    pub recursive: bool,
    pub max_width: Option<u32>,
    pub max_height: Option<u32>,
    pub suffix: Option<String>,
}
```

- [ ] **Step 4: Update `to_squish_options` to map and normalize**

Edit `src-tauri/src/commands.rs`. Replace the entire existing `to_squish_options` function (it currently sets four fields on `SquishOptions`) with:

```rust
fn to_squish_options(payload: &SquishOptionsPayload) -> SquishOptions {
    SquishOptions {
        quality: payload.quality,
        lossless: payload.lossless,
        output_format: payload.format.as_deref().and_then(Format::parse),
        force_overwrite: false,
        max_width: payload.max_width.filter(|&w| w > 0),
        max_height: payload.max_height.filter(|&h| h > 0),
        suffix: payload
            .suffix
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_owned),
    }
}
```

- [ ] **Step 5: Re-run the new tests — expect pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib commands::tests`
Expected: all five tests pass (two existing + three new). Output line `test result: ok. 5 passed`.

- [ ] **Step 6: Run the full backend suite to confirm nothing else broke**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: pipe max_width, max_height, suffix into squish_files command"
```

---

## Task 3: Frontend `Settings` type + reducer/loadSettings tests (TDD)

**Files:**
- Modify: `src/types.ts`
- Modify: `src/App.tsx` (only `loadSettings` and the inline initial fallback)
- Modify: `src/__tests__/App.test.tsx` (add tests)

- [ ] **Step 1: Add failing tests to `src/__tests__/App.test.tsx`**

**Append** these two tests to the existing `describe("appReducer", ...)` block (just before its closing `});`):

```tsx
  it("UPDATE_SETTINGS merges maxWidth, maxHeight, and suffix", () => {
    const state = appReducer(initialState(), {
      type: "UPDATE_SETTINGS",
      settings: { maxWidth: 1920, maxHeight: 1080, suffix: "min" },
    });
    expect(state.settings.maxWidth).toBe(1920);
    expect(state.settings.maxHeight).toBe(1080);
    expect(state.settings.suffix).toBe("min");
    expect(state.settings.quality).toBeNull(); // unchanged
  });
```

And **append** these two to the existing `describe("loadSettings", ...)` block:

```tsx
  it("returns null defaults for maxWidth, maxHeight, and suffix when localStorage is empty", () => {
    localStorage.clear();
    const s = loadSettings();
    expect(s.maxWidth).toBeNull();
    expect(s.maxHeight).toBeNull();
    expect(s.suffix).toBeNull();
  });

  it("preserves saved maxWidth, maxHeight, and suffix from localStorage", () => {
    localStorage.setItem(
      "squish-settings",
      JSON.stringify({ maxWidth: 2560, maxHeight: 1440, suffix: "compressed" })
    );
    const s = loadSettings();
    expect(s.maxWidth).toBe(2560);
    expect(s.maxHeight).toBe(1440);
    expect(s.suffix).toBe("compressed");
  });
```

- [ ] **Step 2: Run the tests — expect TypeScript compile failure**

Run: `npm test`
Expected: vitest fails. Errors mention `Property 'maxWidth' does not exist on type 'Settings'` (and same for `maxHeight`, `suffix`). This is the red signal — types don't have the new fields yet.

- [ ] **Step 3: Extend `Settings` and defaults in `src/types.ts`**

Open `src/types.ts`. Replace the existing `Settings` interface (around lines 50-55) with:

```ts
export interface Settings {
  quality: number | null;  // null = format default
  lossless: boolean;
  format: string | null;   // null = preserve input format
  recursive: boolean;
  maxWidth: number | null;
  maxHeight: number | null;
  suffix: string | null;   // null = backend default ("squished")
}
```

Replace the existing `DEFAULT_SETTINGS` constant (around lines 78-83) with:

```ts
export const DEFAULT_SETTINGS: Settings = {
  quality: null,
  lossless: false,
  format: null,
  recursive: false,
  maxWidth: null,
  maxHeight: null,
  suffix: null,
};
```

- [ ] **Step 4: Update `loadSettings` in `src/App.tsx`**

Open `src/App.tsx`. Replace the entire existing `loadSettings` function with:

```tsx
export function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        quality: parsed.quality ?? null,
        lossless: parsed.lossless ?? false,
        format: parsed.format ?? null,
        recursive: parsed.recursive ?? false,
        maxWidth: parsed.maxWidth ?? null,
        maxHeight: parsed.maxHeight ?? null,
        suffix: parsed.suffix ?? null,
      };
    }
  } catch {
    // Corrupted localStorage — use defaults.
  }
  return {
    quality: null, lossless: false, format: null, recursive: false,
    maxWidth: null, maxHeight: null, suffix: null,
  };
}
```

- [ ] **Step 5: Run the tests — expect pass**

Run: `npm test`
Expected: all `appReducer` and `loadSettings` tests pass. Other suites should still pass too (although the `useSquish` and `SettingsPanel` test files use literal `Settings` objects — see note below).

> **Note for the executor:** if `useSquish.test.tsx` line 18 fails type-checking now (because the literal `settings = { quality: null, ... }` no longer satisfies the extended `Settings` type), update that line in this same task to: `settings = { quality: null, lossless: false, format: null, recursive: false, maxWidth: null, maxHeight: null, suffix: null };`. Do **not** touch any other behavior in that file.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/App.tsx src/__tests__/App.test.tsx src/__tests__/useSquish.test.tsx
git commit -m "feat: add maxWidth, maxHeight, suffix to Settings type and persistence"
```

---

## Task 4: Wire new settings through `useSquish` IPC payload (TDD)

**Files:**
- Modify: `src/__tests__/useSquish.test.tsx`
- Modify: `src/hooks/useSquish.ts`

- [ ] **Step 1: Update the existing IPC payload test**

Open `src/__tests__/useSquish.test.tsx`. Replace the existing test named `"squishFiles invokes Tauri command with correct args"` with:

```tsx
  it("squishFiles invokes Tauri command with correct args including new fields", async () => {
    const batchResult: BatchResult = {
      total_files: 1, success_count: 1, error_count: 0, skipped_count: 0,
      total_input_bytes: 100, total_output_bytes: 50, total_duration_ms: 200,
    };
    mockInvoke.mockResolvedValue(batchResult);

    const filledSettings: Settings = {
      quality: 80, lossless: false, format: "webp", recursive: true,
      maxWidth: 1920, maxHeight: 1080, suffix: "min",
    };

    const { result } = renderHook(() => useSquish(dispatch, filledSettings));

    await act(async () => {
      await result.current.squishFiles(["/tmp/a.png"]);
    });

    expect(mockInvoke).toHaveBeenCalledWith("squish_files", {
      paths: ["/tmp/a.png"],
      options: {
        quality: 80, lossless: false, format: "webp", recursive: true,
        max_width: 1920, max_height: 1080, suffix: "min",
      },
    });
  });
```

- [ ] **Step 2: Run the test — expect failure**

Run: `npm test -- useSquish`
Expected: the assertion fails — the actual `options` object passed to `invoke` is missing `max_width`, `max_height`, `suffix`.

- [ ] **Step 3: Update the IPC mapping in `src/hooks/useSquish.ts`**

Open `src/hooks/useSquish.ts`. Replace the existing `options` literal inside the `invoke<BatchResult>("squish_files", { ... })` call with:

```tsx
          options: {
            quality: settingsRef.current.quality,
            lossless: settingsRef.current.lossless,
            format: settingsRef.current.format,
            recursive: settingsRef.current.recursive,
            max_width: settingsRef.current.maxWidth,
            max_height: settingsRef.current.maxHeight,
            suffix: settingsRef.current.suffix,
          },
```

- [ ] **Step 4: Re-run the test — expect pass**

Run: `npm test -- useSquish`
Expected: pass.

- [ ] **Step 5: Run the full frontend suite**

Run: `npm test`
Expected: all suites pass.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useSquish.ts src/__tests__/useSquish.test.tsx
git commit -m "feat: pass maxWidth, maxHeight, suffix through useSquish IPC"
```

---

## Task 5: Resize card in `SettingsPanel` (TDD)

**Files:**
- Modify: `src/__tests__/SettingsPanel.test.tsx`
- Modify: `src/components/SettingsPanel.tsx`
- Modify: `src/components/SettingsPanel.css`

The settings panel itself is collapsed behind a gear button; new fields render inside the expanded body alongside the existing controls.

- [ ] **Step 1: Add failing tests**

**Append** these tests to `describe("SettingsPanel", ...)` in `src/__tests__/SettingsPanel.test.tsx`:

```tsx
  it("shows max width and max height inputs when expanded", async () => {
    const user = userEvent.setup();
    render(
      <SettingsPanel settings={DEFAULT_SETTINGS} onChange={vi.fn()} />
    );
    await user.click(screen.getByRole("button", { name: /settings/i }));
    expect(screen.getByLabelText(/max width/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/max height/i)).toBeInTheDocument();
  });

  it("calls onChange with maxWidth when max width is typed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SettingsPanel settings={DEFAULT_SETTINGS} onChange={onChange} />
    );
    await user.click(screen.getByRole("button", { name: /settings/i }));
    await user.type(screen.getByLabelText(/max width/i), "1920");
    expect(onChange).toHaveBeenLastCalledWith({ maxWidth: 1920 });
  });

  it("calls onChange with maxWidth null when input is cleared", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const populated = { ...DEFAULT_SETTINGS, maxWidth: 1920 };
    render(<SettingsPanel settings={populated} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    await user.clear(screen.getByLabelText(/max width/i));
    expect(onChange).toHaveBeenLastCalledWith({ maxWidth: null });
  });
```

- [ ] **Step 2: Run the tests — expect failure**

Run: `npm test -- SettingsPanel`
Expected: failures on `getByLabelText(/max width/i)` and `getByLabelText(/max height/i)` — the inputs don't exist yet.

- [ ] **Step 3: Add the resize card to `SettingsPanel.tsx`**

Open `src/components/SettingsPanel.tsx`. Inside the `expanded && (...)` block, **immediately after** the existing "Include subfolders" `<div className="settings-panel__field">…</div>` (the last existing field, containing the recursive checkbox) and **before** the closing `</div>` of `settings-panel__body`, insert:

```tsx
          <div className="settings-panel__field">
            <label>Resize</label>
            <div className="settings-panel__resize-row">
              <input
                type="number"
                min="1"
                placeholder="Max width (px)"
                aria-label="Max width"
                value={settings.maxWidth ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") return onChange({ maxWidth: null });
                  const n = parseInt(raw, 10);
                  onChange({ maxWidth: Number.isNaN(n) ? null : n });
                }}
              />
              <input
                type="number"
                min="1"
                placeholder="Max height (px)"
                aria-label="Max height"
                value={settings.maxHeight ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") return onChange({ maxHeight: null });
                  const n = parseInt(raw, 10);
                  onChange({ maxHeight: Number.isNaN(n) ? null : n });
                }}
              />
            </div>
          </div>
```

- [ ] **Step 4: Add CSS for the resize row**

Open `src/components/SettingsPanel.css`. **Append** to the bottom of the file:

```css
.settings-panel__resize-row {
  display: flex;
  gap: 8px;
}

.settings-panel__resize-row input[type="number"] {
  flex: 1;
  padding: 8px 12px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 13px;
  color: var(--text-primary);
  transition: border-color var(--transition);
}

.settings-panel__resize-row input[type="number"]:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-light);
}
```

- [ ] **Step 5: Run the tests — expect pass**

Run: `npm test -- SettingsPanel`
Expected: all `SettingsPanel` tests pass (existing + 3 new).

- [ ] **Step 6: Commit**

```bash
git add src/components/SettingsPanel.tsx src/components/SettingsPanel.css src/__tests__/SettingsPanel.test.tsx
git commit -m "feat: resize card with max width and max height inputs"
```

---

## Task 6: Advanced disclosure with suffix input (TDD)

**Files:**
- Modify: `src/__tests__/SettingsPanel.test.tsx`
- Modify: `src/components/SettingsPanel.tsx`
- Modify: `src/components/SettingsPanel.css`

A native `<details>` element houses the suffix input. Collapsed by default, no extra React state.

- [ ] **Step 1: Add failing tests**

**Append** to `describe("SettingsPanel", ...)`:

```tsx
  it("hides the suffix input until the Advanced disclosure is opened", async () => {
    const user = userEvent.setup();
    render(
      <SettingsPanel settings={DEFAULT_SETTINGS} onChange={vi.fn()} />
    );
    await user.click(screen.getByRole("button", { name: /settings/i }));
    // The disclosure content is in the DOM but hidden; the trigger is visible.
    const advanced = screen.getByText(/advanced/i);
    expect(advanced).toBeInTheDocument();

    // Native <details> reflects open state on the parent element.
    const details = advanced.closest("details");
    expect(details?.hasAttribute("open")).toBe(false);

    await user.click(advanced);
    expect(details?.hasAttribute("open")).toBe(true);
    expect(screen.getByLabelText(/output suffix/i)).toBeInTheDocument();
  });

  it("calls onChange with suffix when typed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SettingsPanel settings={DEFAULT_SETTINGS} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    await user.click(screen.getByText(/advanced/i));
    await user.type(screen.getByLabelText(/output suffix/i), "min");
    // Last call captures the full string after the third keystroke.
    expect(onChange).toHaveBeenLastCalledWith({ suffix: "min" });
  });

  it("calls onChange with suffix null when cleared", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const populated = { ...DEFAULT_SETTINGS, suffix: "min" };
    render(<SettingsPanel settings={populated} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    await user.click(screen.getByText(/advanced/i));
    await user.clear(screen.getByLabelText(/output suffix/i));
    expect(onChange).toHaveBeenLastCalledWith({ suffix: null });
  });
```

- [ ] **Step 2: Run the tests — expect failure**

Run: `npm test -- SettingsPanel`
Expected: failures finding `/advanced/i` text and `/output suffix/i` label.

- [ ] **Step 3: Add the disclosure to `SettingsPanel.tsx`**

Open `src/components/SettingsPanel.tsx`. **Immediately after** the new `Resize` `<div className="settings-panel__field">…</div>` block (added in Task 5) and **before** the closing `</div>` of `settings-panel__body`, insert:

```tsx
          <details className="settings-panel__advanced">
            <summary>Advanced</summary>
            <div className="settings-panel__field">
              <label htmlFor="suffix">Output suffix</label>
              <input
                id="suffix"
                type="text"
                placeholder="squished"
                value={settings.suffix ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  onChange({ suffix: v === "" ? null : v });
                }}
              />
            </div>
          </details>
```

- [ ] **Step 4: Add CSS for the disclosure and text input**

Open `src/components/SettingsPanel.css`. **Append**:

```css
.settings-panel__advanced summary {
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 4px 0;
  user-select: none;
}

.settings-panel__advanced summary:hover {
  color: var(--text-primary);
}

.settings-panel__advanced[open] {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 4px;
}

.settings-panel__advanced input[type="text"] {
  padding: 8px 12px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 13px;
  color: var(--text-primary);
  transition: border-color var(--transition);
}

.settings-panel__advanced input[type="text"]:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-light);
}
```

- [ ] **Step 5: Run the tests — expect pass**

Run: `npm test -- SettingsPanel`
Expected: all `SettingsPanel` tests pass.

- [ ] **Step 6: Run the full frontend suite to confirm no regressions**

Run: `npm test`
Expected: all suites pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/SettingsPanel.tsx src/components/SettingsPanel.css src/__tests__/SettingsPanel.test.tsx
git commit -m "feat: advanced disclosure with custom output suffix"
```

---

## Task 7: README update

**Files:**
- Modify: `README.md`

Add the two new knobs to the existing Settings bullet list.

- [ ] **Step 1: Locate the Settings section**

Open `README.md`. Find the bullet list under `### Settings` (currently three bullets: Quality, Format, Lossless).

- [ ] **Step 2: Extend the bullet list**

Replace the existing list with:

```markdown
- **Quality** — 0-100 slider, or Auto for format-specific defaults
- **Format** — convert output to PNG, JPEG, WebP, AVIF, SVG, GIF, or HEIC
- **Lossless** — preserve every bit (overrides quality)
- **Resize** — constrain output by max width and/or max height in pixels. Proportional, never upscales.
- **Output suffix** *(advanced)* — customize the filename suffix on compressed outputs (default `squished` produces `dog_squished.png`)
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README mentions resize and custom suffix settings"
```

---

## Task 8: Manual smoke test (no code, no commit)

**Files:** none — this is end-to-end verification before declaring the work done.

The test suites verify code correctness; this verifies feature correctness in a real Tauri window.

- [ ] **Step 1: Start the dev app**

Run: `cargo tauri dev`
Expected: a window opens with the squish desktop UI. Wait until it's interactive.

- [ ] **Step 2: Verify resize on a test image**

1. Open the gear → settings expand.
2. Confirm the new "Resize" field appears with two number inputs.
3. Set "Max width (px)" to `200`.
4. Drop a known-large image (≥ 1000px wide) onto the window.
5. Wait for the file to finish.
6. Run on the host shell: `sips -g pixelWidth /path/to/<original>_squished.<ext>`
   Expected: `pixelWidth: 200`. (On Linux, `identify -format "%w" file.ext`.)

- [ ] **Step 3: Verify custom suffix**

1. In settings, click "Advanced" to open the disclosure.
2. Type `min` in "Output suffix".
3. Drop another image.
4. Confirm the produced file is named `<basename>_min.<ext>` (sibling of the original), not `_squished`.

- [ ] **Step 4: Verify cleared inputs revert to defaults**

1. Clear the suffix field (empty string).
2. Clear both resize fields.
3. Drop another image.
4. Confirm output is named `<basename>_squished.<ext>` and at the original dimensions.

- [ ] **Step 5: Verify settings persistence**

1. Set "Max width" to `1280`, suffix to `tiny`.
2. Quit the app fully (tray menu → Quit, not just close).
3. Reopen via `cargo tauri dev`.
4. Open settings, confirm Max width is `1280` and (after opening Advanced) suffix is `tiny`.

- [ ] **Step 6: Stop the dev server**

Ctrl-C the `cargo tauri dev` process.

If any of these steps fail, file an issue and fix before declaring the work done. No commit for this task — it's pure verification.

---

## Self-review notes (already applied)

- **Spec coverage:** Task 1 covers the Cargo bump. Task 2 covers backend payload + normalization + tests. Task 3 covers Settings type + persistence + reducer/loadSettings tests. Task 4 covers the IPC mapping + test. Tasks 5-6 cover the two SettingsPanel UI groupings + tests. Task 7 covers the README. Task 8 covers manual feature verification.
- **No placeholders:** every code-changing step contains the literal code.
- **Type consistency:** the frontend uses camelCase (`maxWidth`, `maxHeight`, `suffix`) end-to-end, the IPC boundary in `useSquish` translates to snake_case (`max_width`, `max_height`, `suffix`) which matches the Rust struct fields exactly. Tests reflect that mapping.
- **Out of scope confirmed absent:** no video, no `force_overwrite`, no architecture refactor.
