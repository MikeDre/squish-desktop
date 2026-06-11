# squish-core update — image resize & custom suffix

**Date:** 2026-04-29
**Status:** Design approved, awaiting written-spec review.

## Goal

Bring squish-desktop up to upstream `squish-core` 0.2.0 and expose the two new image-side features in the desktop UI:

- **Image resize** via `max_width` / `max_height`.
- **Custom output suffix** via `suffix` (replaces the hardcoded `_squished`).

Video support (the third upstream feature, via the new `squish-video` crate) is **out of scope** for this round and tracked for a future iteration.

## Scope

### In scope

- Re-resolve `squish-core` from upstream `main` (currently at `822bc29`, the `--suffix` commit on top of 0.2.0).
- Extend the Tauri `squish_files` payload, options mapping, and persisted React settings with `max_width`, `max_height`, `suffix`.
- Add a "Resize" card to the settings panel (two number inputs, primary visibility).
- Add an "Advanced" disclosure to the settings panel housing the `suffix` text input.
- Update README's Settings section.
- Unit tests on both sides of the IPC boundary.

### Out of scope

- The `squish-video` crate, ffmpeg dependency, video format detection, video UI.
- A `force_overwrite` toggle (today hardcoded `false`; preserved as-is).
- Architectural prep for video — no `peek_media` abstraction, no command split.
- Any change to drop handling, recursion, batch-result shape, or progress events.

## User-facing design

### Resize card

A new `<section>` inside `SettingsPanel`, placed **above** the new Advanced disclosure and grouped as its own card consistent with the existing visual language:

- Label: **Resize**
- Two `number` inputs side-by-side, each optional:
  - `Max width (px)` — empty / `0` clears the constraint
  - `Max height (px)` — empty / `0` clears the constraint
- Helper copy: *Images larger than these dimensions are scaled down proportionally. Never upscales.*
- Disabled while `state.status === 'processing'`, matching the rest of the panel.

### Advanced disclosure

A native `<details>` element (no extra JS state, accessible by default), labeled **Advanced**, collapsed by default. Inside:

- Label: **Output suffix**
- One `text` input, placeholder `squished`. Empty → backend uses the default `squished`.
- Helper copy: *Filename suffix for compressed outputs. Default produces e.g. `dog_squished.png`.*

### Behavior with existing settings

Existing users have a serialized `Settings` object in `localStorage` without the new fields. `loadSettings` already uses `??` fallbacks per field; we extend the same pattern, so migration is seamless and silent. No version bump on the storage key.

## Backend (Rust) design

### Dependency bump

`src-tauri/Cargo.toml` already declares `squish-core = { git = "https://github.com/MikeDre/squish.git", branch = "main" }`. The crate now lives at `crates/squish-core` inside an upstream workspace, but Cargo's git dependency resolution finds it by name regardless of subdirectory. A `cargo update -p squish-core` re-pins `Cargo.lock` to the latest `main`. No source change to `Cargo.toml`.

### `commands.rs` — extended payload

```rust
#[derive(Deserialize)]
pub struct SquishOptionsPayload {
    pub quality: Option<u8>,
    pub lossless: bool,
    pub format: Option<String>,
    pub recursive: bool,
    pub max_width: Option<u32>,    // new
    pub max_height: Option<u32>,   // new
    pub suffix: Option<String>,    // new
}
```

### `commands.rs` — `to_squish_options` normalization

```rust
fn to_squish_options(p: &SquishOptionsPayload) -> SquishOptions {
    SquishOptions {
        quality: p.quality,
        lossless: p.lossless,
        output_format: p.format.as_deref().and_then(Format::parse),
        force_overwrite: false,
        max_width:  p.max_width.filter(|&w| w > 0),
        max_height: p.max_height.filter(|&h| h > 0),
        suffix: p.suffix
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_owned),
    }
}
```

Both sides treat **`0`** for dimensions and **`""` / whitespace-only** for suffix as "unset", so a frontend mid-edit doesn't leak garbage values to the core.

### Untouched

`expand_paths`, the `rayon` parallel loop, `peek_format`, `FileStartEvent` / `FileDoneEvent` / `FileErrorEvent`, and `BatchResult` are unchanged. Resize and custom suffix are absorbed entirely by `squish_core::squish_file`.

### Rust tests (added in `commands.rs`)

- `to_squish_options_maps_resize_and_suffix` — happy path.
- `to_squish_options_normalizes_zero_dims_to_none`.
- `to_squish_options_normalizes_empty_or_whitespace_suffix_to_none`.

## Frontend (TypeScript / React) design

### `src/types.ts`

```ts
export interface Settings {
  quality: number | null;
  lossless: boolean;
  format: string | null;
  recursive: boolean;
  maxWidth: number | null;   // new
  maxHeight: number | null;  // new
  suffix: string | null;     // new — null means use backend default ("squished")
}

export const DEFAULT_SETTINGS: Settings = {
  quality: null, lossless: false, format: null, recursive: false,
  maxWidth: null, maxHeight: null, suffix: null,
};
```

The `AppAction` union and `UPDATE_SETTINGS` reducer branch already accept `Partial<Settings>`, so they require no signature change.

### `src/App.tsx` — `loadSettings`

Extend the existing `??` fallback chain with the three new fields. No localStorage key change, no migration code.

### `src/hooks/useSquish.ts`

Map the camelCase frontend names to the snake_case Rust payload at the IPC boundary:

```ts
const options = {
  quality: settings.quality,
  lossless: settings.lossless,
  format: settings.format,
  recursive: settings.recursive,
  max_width:  settings.maxWidth,
  max_height: settings.maxHeight,
  suffix:     settings.suffix,
};
```

The defensive normalization is symmetric with the backend: empty strings and `NaN` are coerced to `null` before sending.

### `src/components/SettingsPanel.tsx`

Two new groupings, in this order, after the existing Quality/Format/Lossless/Recursive controls:

1. **Resize card** (`<section>` styled like the other cards) — labeled `Resize`, two `<input type="number" min="1">` controls bound to `maxWidth` and `maxHeight`. Empty input → `null`.
2. **Advanced disclosure** (`<details>`) — labeled `Advanced`, collapsed by default. Contains an `<input type="text">` for `suffix` with placeholder `squished`.

Styling reuses existing tokens; new CSS is minimal (one `<details>` selector for chevron alignment, one `.resize-row` flex helper).

### Frontend tests (Vitest)

- `appReducer.UPDATE_SETTINGS` merges `maxWidth`, `maxHeight`, `suffix` correctly.
- `loadSettings` returns `null` defaults for the three new fields when localStorage is empty, partially populated, or corrupt.
- `SettingsPanel` renders both number inputs and renders the suffix input inside the disclosure (queried via `getByRole('group')` on `<details>` or label association).

## Data flow

```
SettingsPanel input
  → dispatch(UPDATE_SETTINGS, partial)
  → appReducer merges + saveSettings to localStorage
  → useSquish reads state.settings
  → invoke('squish_files', { paths, options }) with new fields
  → commands::squish_files
  → to_squish_options normalizes
  → squish_core::squish_file (resize + custom suffix applied here)
  → existing squish://file-start / file-done / file-error events
  → existing reducer cases update FileEntry rows
```

No event payload, command signature, or error path changes shape.

## Error & edge-case handling

- **SVG + resize** — upstream silently skips resize on SVG (vector). No UI surface needed.
- **Suffix with path separators** — backend writes `format!("{stem}_{suffix}.{ext}")`. A `/` in the suffix yields a non-existent subpath and `fs::write` returns an IO error, surfaced through the existing `file-error` event. Acceptable for v1; the suffix lives behind an Advanced disclosure.
- **Suffix collisions** — `derive_output_path_with_suffix` already handles `_2`, `_3`, … appending. No change.
- **Resize requested but image already fits** — upstream returns `None` from `resize_dimensions` and falls through to the same-format fast path. No-op for the user.
- **Mixed-batch failures** — already isolated per file; `BatchResult` aggregation unaffected.

## Documentation

Update `README.md` Settings section to list:
- **Resize** — *Constrain width/height. Proportional, never upscales.*
- **Output suffix** *(advanced)* — *Customize the filename suffix on compressed outputs (default `squished`).*

No new system dependencies.

## Test strategy summary

| Layer | Tool | New tests |
|---|---|---|
| Rust | `cargo test` | 3 new `to_squish_options` cases in `commands.rs` |
| TS reducer | Vitest | `UPDATE_SETTINGS` and `loadSettings` coverage for the new fields |
| TS component | Vitest + RTL | `SettingsPanel` renders resize inputs and the advanced suffix input |
| Manual smoke | `cargo tauri dev` | Resize image, set custom suffix, verify output filename and dimensions |

## Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Workspace restructure breaks the git dependency | Low | Cargo resolves `squish-core` by crate name regardless of subdirectory; verified upstream layout |
| Existing users' localStorage missing new fields | Certain | `??` fallbacks in `loadSettings` handle it; same pattern already in place |
| User enters very large dimensions | Low | Upstream never upscales; clamping not needed |
| Suffix foot-guns (`/`, `..`) | Low | Behind Advanced disclosure; surfaces as a per-file IO error, doesn't crash the batch |

## Future work (not this round)

- **Video support** — pull in `squish-video`, add `squish_video_files` command (or extend the dispatcher), expand format detection, surface video rows in the UI, add ffmpeg as a documented system dependency.
- **`force_overwrite` toggle** — expose the existing `SquishOptions.force_overwrite` field as a settings toggle.
