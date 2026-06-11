# Multi-format support in squish-desktop (audio + video + code)

**Status:** Approved (design phase)
**Date:** 2026-05-14
**Owner:** MikeAndré
**Target release:** squish-desktop 0.3.0 (matches squish-core 0.3.0)

## Problem

squish-core has shipped 0.3.0 with three new sibling crates — `squish-audio`, `squish-video`, `squish-code` — plus a `warnings` field on `SquishResult` and animated WebP pass-through. squish-desktop only consumes the image path through `squish-core::squish_file`. This spec covers bringing all three new format families into the desktop UI in a single release.

## Goals

1. Process audio (MP3/Opus/FLAC/AAC/etc.), video (MP4/MOV/MKV/etc.), and code (JS/TS/CSS/HTML/JSON) alongside images from one unified queue.
2. Auto-route each file to the right crate based on extension + (for audio/video ambiguity) `ffprobe`.
3. Surface family-specific options panels only when relevant to the current batch.
4. Detect missing `ffmpeg` / `ffprobe` and guide the user to install — no bundling.
5. Plumb `warnings` (e.g., animated WebP pass-through) into the UI.
6. Pin `squish-core` to a fixed `v0.3.0` tag (drop the `branch = "main"` floating dep).

## Non-goals

- Bundling ffmpeg with the app.
- Per-file option overrides (batch-level options only).
- Adding a frontend test toolchain (vitest).
- Cross-family conversion (e.g., extract audio from video).
- Backwards compatibility with the v1 (flat) IPC payload — coordinated change, single consumer.

## Decisions captured during brainstorm

| Question | Decision |
|---|---|
| Scope of next release | All three families in one release |
| Mixed-batch UX | Auto-dispatch with per-family panels surfaced contextually |
| ffmpeg dependency | Detect at startup + guide install (no bundling) |
| Settings shape | Per-family sub-objects, surfaced contextually in main UI |
| Architecture | Single `squish_files` IPC + internal dispatcher (Approach A) |

## Architecture

```
                    ┌──────────────────────────────────────────────────┐
                    │ Frontend (React + TS)                            │
                    │                                                  │
                    │  ┌────────────┐    ┌─────────────────────────┐   │
                    │  │ Drop / Pick│ →  │ useSquish (single queue)│   │
                    │  └────────────┘    └─────────────────────────┘   │
                    │  ┌───────────────────────────────────────────┐   │
                    │  │ Contextual option panels (Img/Aud/Vid/Cd) │   │
                    │  └───────────────────────────────────────────┘   │
                    │  ┌───────────────────────────────────────────┐   │
                    │  │ Settings store (per-family sub-objects)   │   │
                    │  └───────────────────────────────────────────┘   │
                    └──────────────────────┬───────────────────────────┘
                                           │ invoke('squish_files', { paths, options })
                                           │ invoke('check_ffmpeg')
                                           │ listen('squish://file-start|done|error')
                    ┌──────────────────────▼───────────────────────────┐
                    │ Rust (src-tauri/src)                             │
                    │  commands.rs   — IPC entry, batch orchestration  │
                    │  dispatch.rs   — FileKind detection + routing    │
                    │  options.rs    — BatchOptionsPayload + mappers   │
                    │  ffmpeg.rs     — startup probe + detection cmd   │
                    │                                                  │
                    │     ┌────────┬─────────┬─────────┬───────┐       │
                    │     │squish- │squish-  │squish-  │squish-│       │
                    │     │core    │audio    │video    │code   │       │
                    │     └────────┴─────────┴─────────┴───────┘       │
                    └──────────────────────────────────────────────────┘
```

### Invariants

- **One IPC command** (`squish_files`) handles all four families. Event protocol is family-agnostic.
- **Single source of routing truth** in `dispatch.rs`, mirroring `squish-cli/src/runner.rs::FileKind`. Audio-extension files that `ffprobe` reports as `HasVideo` route to video.
- **ffmpeg status is cached** at app startup, re-probed on demand via the `check_ffmpeg` command.
- **Tag-pinned deps** — all four squish crates pinned to `tag = "v0.3.0"`.

## Rust backend changes

### `Cargo.toml`

```toml
squish-core  = { git = "https://github.com/MikeDre/squish.git", tag = "v0.3.0" }
squish-audio = { git = "https://github.com/MikeDre/squish.git", tag = "v0.3.0" }
squish-video = { git = "https://github.com/MikeDre/squish.git", tag = "v0.3.0" }
squish-code  = { git = "https://github.com/MikeDre/squish.git", tag = "v0.3.0" }
```

If `v0.3.0` isn't tagged in the squish-core repo yet, tag it before merging this work.

### New modules

```
src-tauri/src/
  commands.rs   ← slimmed: IPC entry + batch orchestration only
  dispatch.rs   ← NEW: FileKind detection, route to crate, unified errors
  options.rs    ← NEW: BatchOptionsPayload + per-family mappers
  ffmpeg.rs     ← NEW: startup probe, check_ffmpeg command
```

### `dispatch.rs`

```rust
pub enum FileKind { Image, Audio, Video, Code, Unknown }

pub fn detect_kind(path: &Path) -> FileKind {
    // 1. squish_audio::detect_audio_format → if ambiguous, ffprobe_kind to split A/V
    // 2. squish_video::detect_video_format
    // 3. squish_core::detect_format (image)
    // 4. squish_code::detect_code_format
    // 5. Unknown
}

pub fn run_one(
    path: &Path,
    opts: &BatchOptions,
    ffmpeg_ok: bool,
) -> Result<UnifiedResult, UnifiedError> { /* match on detect_kind */ }
```

### `options.rs` — IPC payload

```rust
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchOptionsPayload {
    pub recursive: bool,
    pub force_overwrite: bool,
    pub image: ImageOptionsPayload,
    pub audio: AudioOptionsPayload,
    pub video: VideoOptionsPayload,
    pub code:  CodeOptionsPayload,
}
```

Each sub-payload mirrors today's `to_squish_options` mapper conventions:
- Zero-valued numeric dims → `None`
- Whitespace-only suffix → `None`
- Empty-string format → `None`

### `ffmpeg.rs`

```rust
pub struct FfmpegStatus { pub ffmpeg: bool, pub ffprobe: bool }

#[tauri::command]
pub fn check_ffmpeg() -> FfmpegStatus { /* re-probe PATH */ }
```

Probed once at app startup and cached in a `Mutex<FfmpegStatus>` accessible to the dispatcher. The `check_ffmpeg` command refreshes the cache.

### `commands.rs::squish_files` flow

1. `expand_paths(&paths, recursive)` (unchanged)
2. Build `Vec<(id, path, FileKind)>` via `detect_kind`
3. Partition: dispatch known kinds in parallel via rayon, `Unknown` increments `skipped_count`
4. For each kind, emit `file-start` (with `family`), call the right `squish_*`, emit `file-done` / `file-error`
5. If `family ∈ {audio, video}` and `!ffmpeg_ok`, short-circuit with `UnifiedError::MissingDependency` before invoking the crate

### `lib.rs`

Register `check_ffmpeg` alongside `squish_files` in the invoke handler.

## IPC contract

### Request

```ts
type BatchOptions = {
  recursive: boolean
  force_overwrite: boolean
  image: { quality: number | null; lossless: boolean; format: string | null;
           max_width: number | null; max_height: number | null; suffix: string | null }
  audio: { codec: 'copy'|'mp3'|'opus'|'aac'|'flac'|'vorbis' | null;
           bitrate_kbps: number | null; suffix: string | null }
  video: { codec: string | null; crf: number | null; preset: string | null;
           suffix: string | null }
  code:  { source_map: boolean; suffix: string | null }
}
```

snake_case on the wire — matches existing IPC convention (`input_bytes`, `max_width` in `useSquish.ts` and `types.ts`). No `serde(rename_all)` attribute needed; default snake_case is correct.

### Events

```ts
// squish://file-start
{ id, path, filename, family: 'image'|'audio'|'video'|'code' }

// squish://file-done
{ id, family, input_bytes, output_bytes, output_path,
  reduction_percent, duration_ms, warnings: string[] }

// squish://file-error
{ id, family,
  kind: 'missing_dependency'|'unsupported'|'parse_failed'|'io'|'other',
  error: string }
```

The `kind` discriminator lets the frontend render `missing_dependency` with a "Install ffmpeg" inline action without string-matching error messages.

### Return value

```ts
type BatchResult = {
  total_files: number; success_count: number; error_count: number; skipped_count: number
  total_input_bytes: number; total_output_bytes: number; total_duration_ms: number
  by_family: { image: FamilyStats; audio: FamilyStats; video: FamilyStats; code: FamilyStats }
}
type FamilyStats = { total: number; success: number; error: number; skipped: number }
```

`Unknown` files are counted only in the top-level `skippedCount`; they do not appear in `byFamily`.

### New command

`invoke('check_ffmpeg')` → `{ ffmpeg: boolean; ffprobe: boolean }`

## Frontend changes

### File layout

Existing components today: `DropZone`, `SettingsPanel`, `FileList` (renders `FileRow` rows), `Summary`. The plan reworks `SettingsPanel` to host the per-family panels rather than introducing a separate `OptionsPanel`.

```
src/
  hooks/
    useSquish.ts                  ← rework: new payload + family-aware events + warnings
    useFfmpegStatus.ts            ← NEW: invokes check_ffmpeg, exposes { ffmpeg, ffprobe, recheck() }
  components/
    SettingsPanel.tsx             ← rework: nest per-family sub-panels (Image/Audio/Video/Code)
    SettingsPanel.css             ← extend styles for per-family sections
    ImageSettings.tsx + .css      ← NEW: quality/lossless/format/max_w/max_h/suffix
    AudioSettings.tsx + .css      ← NEW: codec, bitrate, suffix
    VideoSettings.tsx + .css      ← NEW: codec, crf, preset, suffix
    CodeSettings.tsx + .css       ← NEW: source_map, suffix
    FfmpegOnboarding.tsx + .css   ← NEW: install-guide card + Re-check
    FileRow.tsx                   ← update: render family badge + warnings chips + missing-dep action
    FileRow.css                   ← extend styles for badge/chips
    Summary.tsx                   ← update: render per-family counts from by_family
    Summary.css                   ← extend styles for per-family stats
  lib/
    families.ts                   ← NEW: Family type + detectFamilyFromExtension + family metadata
    settings/
      schema.ts                   ← NEW: Settings v2 type + defaults
      migrate.ts                  ← NEW: v1 (flat) → v2 (per-family) migration
  types.ts                        ← update: per-family payloads, family/warnings on events, FileEntry
  App.tsx                         ← update: loadSettings → v2 via migrate, hook in FfmpegOnboarding
```

All new code follows existing patterns: TS, named exports, paired `.tsx` + `.css` files, BEM-style class names using design-system CSS variables (no Tailwind in this codebase). Co-located vitest tests under `src/__tests__/`.

### Contextual surfacing

- `OptionsPanel` watches the current queue's families (`Set<Family>` derived in `useSquish`).
- A family panel auto-expands if any queued file belongs to it.
- Empty queue → all panels collapsed by default; user can manually expand.
- The full Settings page always shows all four panels for editing defaults.

### Frontend family detection

`lib/families.ts::detectFamilyFromExtension` is extension-based only — fast, no IPC. Used purely for "should we show this panel?" — Rust dispatch remains authoritative for actual routing. Ambiguous extensions (`.ogg`, `.mov`) bias toward showing both A/V panels since the real decision happens in `ffprobe`.

### ffmpeg onboarding card

- Renders when `!ffmpeg && (queue has audio|video OR user explicitly opened those panels)`.
- Three tabs: macOS (`brew install ffmpeg`), Windows (`winget install Gyan.FFmpeg`), Linux (`apt install ffmpeg` / `dnf install ffmpeg`).
- "Re-check" button calls `useFfmpegStatus.recheck()`.
- Dismissible per-session, non-persistent — re-appears next launch if still missing.

### Settings migration

- localStorage key bumps from `squish-settings` → `squish-settings-v2`.
- On first load, if v1 exists, `migrate.ts` lifts the old flat values into `settings.image` and seeds the other three families from defaults.
- v1 key is deleted after migration succeeds.
- If migration produces an invalid shape, `console.warn` and fall back to defaults.

### Error surfacing

- `kind: 'missing_dependency'` → file row shows an "Install ffmpeg" inline action that scrolls to the onboarding card.
- `warnings[]` → small info-icon chip on the file row with hover/click tooltip.
- All other errors → existing red error state with the message.

## Error handling

### Unified error model

```rust
pub enum UnifiedError {
    MissingDependency { tool: String },   // "ffmpeg" | "ffprobe"
    Unsupported { reason: String },
    ParseFailed { reason: String, line: Option<u32> },
    Io(String),
    Other(String),
}
```

Crate-native errors map to `UnifiedError` only at the dispatcher boundary:

| Native variant | `UnifiedError` |
|---|---|
| `*Error::MissingDependency` | `MissingDependency` (preserves tool name) |
| `*Error::UnsupportedFormat`, `AudioError::NotAudio`, `AudioError::InvalidOption` | `Unsupported` |
| `CodeError::ParseFailed { line, reason, .. }` | `ParseFailed` |
| `*Error::Io(_)` | `Io` (via `format!("{e}")`) |
| Everything else | `Other` |

### Fast-fail for missing ffmpeg

The dispatcher checks the cached `FfmpegStatus` before calling `squish_audio` / `squish_video`. If absent, emits `MissingDependency` for the file without invoking the crate. This avoids the crate's internal `check_ffmpeg` doing a redundant probe per file.

The status cache is invalidated whenever the frontend calls `check_ffmpeg`.

### Warnings (squish-core 0.3.0)

- `SquishResult.warnings: Vec<String>` is propagated unchanged through `file-done`.
- Audio/video/code crates don't currently expose warnings. For event-shape consistency the dispatcher always emits `warnings: []` for them.

### Unknown files

- Counted in `skippedCount` only; no per-family bucket.
- No `file-error` event — silently skipped, same as today's image-only behavior.
- `BatchSummary` toast says "N files skipped (unrecognized format)".

### Panic safety

Each `run_one` call is wrapped in `std::panic::catch_unwind`. A panic in one file becomes `UnifiedError::Other("internal error: <message>")` and doesn't bring down the rayon worker pool.

## Testing

### Rust (`cargo test` in `src-tauri/`)

- **`dispatch.rs::detect_kind`** — unit tests per family from extension alone. The audio/video ambiguity branch (`.ogg`, `.mov`) is gated behind `#[cfg(feature = "ffprobe-tests")]` since it needs ffmpeg installed; kept out of the default test run.
- **`options.rs`** — port the existing four `to_squish_options` tests (zero-dim normalization, whitespace suffix, full payload, empty suffix) and replicate them for audio/video/code payloads.
- **`commands.rs`** — keep existing `expand_paths` + `get_version` tests. No new integration test here; full-stack coverage is manual.
- **Error mapping** — table-driven test in `dispatch.rs`: construct each native error variant, assert correct `UnifiedError` kind. No ffmpeg dependency.

### Frontend (`vitest run` from project root)

Vitest is already configured (`src/__tests__/` already contains tests for `SettingsPanel`, `App`, `DropZone`, `useTheme`, `FileRow`, `FileList`, `useSquish`). New tests added per task:

- `lib/families.test.ts` — `detectFamilyFromExtension` table-driven cases per family + unknown.
- `lib/settings/migrate.test.ts` — v1 → v2 migration: happy path (image fields lifted), missing key (defaults applied), corrupted shape (fall back to defaults + warn).
- `SettingsPanel.test.tsx` — extend existing tests to assert each family sub-panel renders and propagates updates.
- `useSquish.test.tsx` — extend to assert new payload shape and that `family` / `warnings` / `kind` event fields are dispatched into state.
- `FileRow.test.tsx` — extend to assert family badge renders, warnings chip renders when `warnings.length > 0`, and `missing_dependency` rows show the install action.
- `Summary.test.tsx` — NEW: per-family counts render from `by_family`.

`migrate.ts` includes inline `console.warn` on invalid shape with fallback to defaults; the migrate test asserts the warn fires.

### Manual smoke matrix (run before merge)

| Scenario | Expected behavior |
|---|---|
| ffmpeg absent, drop JPEG | Image processes normally, no onboarding card |
| ffmpeg absent, drop MP3 | Onboarding card appears, MP3 row shows `missing_dependency` error |
| ffmpeg installed, click Re-check | Card dismisses, MP3 re-queue succeeds |
| Mixed folder (img + mp3 + js) | All three panels surface; queue shows family badges; per-family counts correct in summary |
| Animated WebP | Passes through; `warnings` chip shows on the row |
| TS file with enums | Compiles via oxc_transformer, outputs `.min.js` |
| Drop unknown extensions | Silent skip, `skippedCount` increments |
| Old v1 settings present | Auto-migrates to v2 on first launch; image defaults preserved |

## Rollout

- Single PR / single release. No feature flags.
- Version bump: `squish-desktop` 0.1.0 → **0.3.0** to align with squish-core 0.3.0. Update all three version locations: `src-tauri/Cargo.toml`, `package.json`, and `src-tauri/tauri.conf.json`.
- Commit sequence (conventional commits per md-dev):
  1. `chore(deps): pin squish-core 0.3.0, add audio/video/code crates`
  2. `feat(rust): add FileKind dispatcher and unified error model`
  3. `feat(rust): per-family options payload and mappers`
  4. `feat(rust): ffmpeg startup probe + check_ffmpeg command`
  5. `feat(rust): wire squish_files through dispatcher`
  6. `feat(ui): per-family settings store with v1→v2 migration`
  7. `feat(ui): contextual options panels (audio/video/code)`
  8. `feat(ui): ffmpeg onboarding card and Re-check action`
  9. `feat(ui): family badges, warnings chips, missing-dependency inline action`
  10. `chore(version): bump squish-desktop to 0.3.0`

## Risks and open questions

- **squish-core v0.3.0 tag.** May not exist yet in the upstream repo. Mitigation: tag it before merging this work.
- **`VideoOptions` shape.** The CRF/preset fields in Section 3 are placeholders; the actual surface area depends on what `squish-video::VideoOptions` exposes. Confirm during implementation and update `VideoOptionsPayload` / `VideoOptions.tsx` to match.
- **Per-file ffmpeg probe cost.** For audio-extension files we call `ffprobe_kind` in `detect_kind` to disambiguate A/V. On a large batch this adds N probe spawns. If this becomes a bottleneck, fall back to extension-only routing for non-ambiguous extensions and only probe `.ogg` / `.mov` / `.mka` / similar.
- **Animated WebP detection in dispatcher.** Already handled inside `squish-core` (copy-through); we just propagate `warnings`. No additional logic needed in `dispatch.rs`.
