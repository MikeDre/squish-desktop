# squish-desktop 0.4.0 — crate catch-up, target-size, media formats

**Date:** 2026-06-11
**Status:** Approved

## Goal

Bring squish-desktop up to the squish v0.4.0 crates and surface the two
headline features in the UI: per-file target-size budgets and video/audio
output format selection. Absorb the internal crate improvements (DV video,
oxvg SVG, animated WebP pass-through) that need no UI.

## Background

The CLI (squish v0.4.0, released 2026-06-10) moved a full minor version ahead
of the desktop app, which still pins `squish-core` / `squish-audio` /
`squish-video` / `squish-code` to the `v0.3.0` git tag. The crate API changes
between the tags:

- `target_size: Option<u64>` added to `SquishOptions`, `VideoOptions`,
  `AudioOptions` — fit output under a per-file byte budget.
- `output_format` added to `VideoOptions` (`VideoFormat`) and `AudioOptions`
  (`AudioFormat`) — explicit container override.
- `overwrite: bool` (in-place mode) added across option structs — **not
  surfaced** in this release (see Out of scope).
- Internal: DV → MP4 transcode, SVG handler now uses `oxvg_optimiser`,
  animated WebP pass-through, shared `squish-media` plumbing crate,
  MSRV stable Rust 1.95.

## Design

### 1. Crate bump

- `src-tauri/Cargo.toml`: move all four squish crate pins to
  `tag = "v0.4.0"`. `squish-media` arrives transitively; no direct pin.
- `src-tauri/src/options.rs`: the audio/video/code mappers spread
  `..Default::default()`, so new fields compile through. The
  `SquishOptions` construction is exhaustive — add `target_size` and the
  new fields explicitly.
- The video payload's `crf` field, which mapped to nothing under v0.3.0,
  now maps to `VideoOptions.quality`. (`preset` still has no crate-side
  field and stays payload-only.)
- Bump `package.json` and `src-tauri/Cargo.toml`/`tauri.conf.json` versions
  to 0.4.0 to track the CLI.
- README: Rust prerequisite 1.77+ → 1.95+ (new MSRV); document the new
  settings.

Free wins requiring no UI: DV video support, oxvg SVG optimisation, animated
WebP pass-through, richer per-format warnings (FileRow's warnings chip
already renders them).

### 2. Global target-size setting

One budget, applied per-file to images, video, and audio — mirroring the
CLI's `--target-size` semantics. Code files ignore it (the CLI rejects
target-size only for code-only batches; the desktop simply never passes it
to `CodeOptions`).

**UI** (SettingsPanel, top-level section alongside Recursive):

- Number input + unit dropdown (KB / MB / GB). Empty = off.
- Stored in `Settings` as `targetSizeBytes: number | null` (bytes).
- Persisted with the rest of the settings (existing persistence path).

**Conflict handling** — when a budget is set, conflicting controls disable
with the hint "controlled by target size":

- Image panel: quality slider, lossless toggle.
- Video panel: quality control.
- Audio panel: bitrate field; FLAC and Copy entries in the codec dropdown
  disable (budget requires a bitrate-controllable lossy codec).

**Plumbing:**

- `BatchOptionsPayload` gains `target_size: Option<u64>`.
- Mapped into `SquishOptions.target_size`, `VideoOptions.target_size`,
  `AudioOptions.target_size`; `CodeOptions` untouched.
- Over-budget/unreachable outcomes surface as per-file warnings (already
  emitted by the crates and rendered by FileRow).

### 3. Video & audio output format

Same pattern as the existing image format dropdown:

- **Video panel:** Format dropdown — Auto (preserve) / MP4 / WebM / MOV /
  MKV. AVI, FLV, and DV are deliberately excluded as output targets (legacy
  / input-oriented; DV is not a valid output).
- **Audio panel:** Format dropdown — Auto / MP3 / M4A / OGG / Opus / FLAC /
  WAV / AIFF.
- `VideoOptionsPayload` / `AudioOptionsPayload` gain
  `format: Option<String>`, mapped via `VideoFormat::parse` /
  `AudioFormat::parse`. Unknown strings map to `None` (Auto), matching the
  image mapper's behaviour.

### 4. Testing

- **Vitest:** new cases in the settings-panel and App reducer suites — the
  target-size control (entry, unit conversion to bytes, clearing), the
  disable logic on conflicting controls, and the two new format dropdowns.
- **Rust:** mapper tests in `options.rs` for target-size propagation to the
  three option structs (and its absence from `CodeOptions`), and format
  string parsing including unknown-string → `None`.
- **Manual smoke:** `cargo tauri dev`; drop an image, a video, and an audio
  file with an 1 MB budget; verify outputs fit and warnings render when a
  budget is unreachable.

## Out of scope

- In-place overwrite mode (conflicts with the app's non-destructive
  promise; revisit with a confirmation guard if requested).
- Stats view mirroring `--stats`.
- Desktop release/distribution (signed bundles, updater) — separate
  project.
