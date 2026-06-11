# Multi-format squish-desktop (audio + video + code) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring audio, video, and code minification into squish-desktop in a single 0.3.0 release, alongside the existing image path, via an internal dispatcher.

**Architecture:** One Tauri command (`squish_files`) with an internal `FileKind` dispatcher routing each file to `squish-core` (image), `squish-audio`, `squish-video`, or `squish-code`. ffmpeg/ffprobe detected at startup and re-probed via a `check_ffmpeg` command. UI surfaces per-family option panels contextually based on the current queue; missing-ffmpeg state triggers an onboarding card.

**Tech Stack:** Rust (Tauri 2, rayon, walkdir), React 18 + TypeScript, Vitest, CSS variables + BEM (no Tailwind in this codebase). Wire format is **snake_case** to match existing IPC convention.

**Spec:** `docs/superpowers/specs/2026-05-14-multi-format-desktop-design.md`

**Prerequisite:** Tag `v0.3.0` exists in the `MikeDre/squish` repo. If not, tag it before starting Task 1.

---

## File map

**Rust (`src-tauri/src/`)**

- Modify: `Cargo.toml` — add three sibling crates, pin all four to `v0.3.0`
- Create: `dispatch.rs` — `FileKind`, `detect_kind`, `run_one`, `UnifiedResult`, `UnifiedError`
- Create: `options.rs` — `BatchOptionsPayload` + per-family sub-payloads + mappers
- Create: `ffmpeg.rs` — `FfmpegStatus`, cached probe, `check_ffmpeg` command
- Modify: `commands.rs` — slim down to orchestration, route through dispatcher
- Modify: `lib.rs` — register `check_ffmpeg`, initialise ffmpeg cache at startup

**Frontend (`src/`)**

- Modify: `types.ts` — per-family payloads, family/kind/warnings on events
- Create: `lib/families.ts` — `Family` type, `detectFamilyFromExtension`, metadata
- Create: `lib/settings/schema.ts` — Settings v2 shape + defaults
- Create: `lib/settings/migrate.ts` — v1 → v2 localStorage migration
- Modify: `App.tsx` — load v2 settings via migrate, mount onboarding card
- Modify: `hooks/useSquish.ts` — new payload, family/kind/warnings dispatched
- Create: `hooks/useFfmpegStatus.ts` — calls `check_ffmpeg`, exposes `recheck`
- Modify: `components/SettingsPanel.tsx` — host per-family sub-panels
- Create: `components/ImageSettings.tsx` + `.css` — extracted image controls
- Create: `components/AudioSettings.tsx` + `.css`
- Create: `components/VideoSettings.tsx` + `.css`
- Create: `components/CodeSettings.tsx` + `.css`
- Create: `components/FfmpegOnboarding.tsx` + `.css`
- Modify: `components/FileRow.tsx` + `.css` — family badge, warnings chip, missing-dep action
- Modify: `components/Summary.tsx` + `.css` — per-family counts from `by_family`

**Tests (`src/__tests__/`)**

- Create: `families.test.ts`, `migrate.test.ts`, `Summary.test.tsx`, `FfmpegOnboarding.test.tsx`
- Modify: `SettingsPanel.test.tsx`, `useSquish.test.tsx`, `FileRow.test.tsx`, `App.test.tsx`

**Version files**

- Modify: `src-tauri/Cargo.toml` (version field), `package.json`, `src-tauri/tauri.conf.json` — all to `0.3.0`

---

## Task 1: Pin squish-core to v0.3.0 and add sibling crates

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1.1: Replace the floating squish-core dep and add three siblings**

In `src-tauri/Cargo.toml`, replace the existing `squish-core` line:

```toml
squish-core = { git = "https://github.com/MikeDre/squish.git", branch = "main" }
```

with all four crates pinned to the v0.3.0 tag:

```toml
squish-core  = { git = "https://github.com/MikeDre/squish.git", tag = "v0.3.0" }
squish-audio = { git = "https://github.com/MikeDre/squish.git", tag = "v0.3.0" }
squish-video = { git = "https://github.com/MikeDre/squish.git", tag = "v0.3.0" }
squish-code  = { git = "https://github.com/MikeDre/squish.git", tag = "v0.3.0" }
```

- [ ] **Step 1.2: Verify cargo can resolve and the existing code still builds**

Run: `cd src-tauri && cargo check`
Expected: Build succeeds. (Existing `commands.rs` only imports `squish_core::{squish_file, Format, SquishOptions}`, all still exported in 0.3.0.)

- [ ] **Step 1.3: Run existing Rust tests to verify no regression**

Run: `cd src-tauri && cargo test`
Expected: PASS, including the existing `to_squish_options_*` tests.

- [ ] **Step 1.4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore(deps): pin squish-core 0.3.0 and add audio/video/code crates"
```

---

## Task 2: Add unified result/error types and FileKind enum in dispatch.rs

**Files:**
- Create: `src-tauri/src/dispatch.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod dispatch;`)

- [ ] **Step 2.1: Write the failing test for UnifiedError mapping**

Create `src-tauri/src/dispatch.rs`:

```rust
//! File-kind detection and crate dispatch.

use serde::Serialize;
use std::path::Path;
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FileKind {
    Image,
    Audio,
    Video,
    Code,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum UnifiedError {
    MissingDependency { tool: String },
    Unsupported { reason: String },
    ParseFailed { reason: String, line: Option<u32> },
    Io(String),
    Other(String),
}

impl std::fmt::Display for UnifiedError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UnifiedError::MissingDependency { tool } => write!(f, "missing dependency: {tool}"),
            UnifiedError::Unsupported { reason } => write!(f, "unsupported: {reason}"),
            UnifiedError::ParseFailed { reason, line: Some(l) } => write!(f, "parse failed at line {l}: {reason}"),
            UnifiedError::ParseFailed { reason, line: None } => write!(f, "parse failed: {reason}"),
            UnifiedError::Io(msg) => write!(f, "io error: {msg}"),
            UnifiedError::Other(msg) => write!(f, "{msg}"),
        }
    }
}

#[derive(Debug, Clone)]
pub struct UnifiedResult {
    pub input_bytes: u64,
    pub output_bytes: u64,
    pub output_path: std::path::PathBuf,
    pub duration: Duration,
    pub warnings: Vec<String>,
}

impl UnifiedResult {
    pub fn reduction_percent(&self) -> f64 {
        if self.input_bytes == 0 { return 0.0; }
        (1.0 - (self.output_bytes as f64 / self.input_bytes as f64)) * 100.0
    }
}

// --- Native error → UnifiedError mappers ---

impl From<squish_core::SquishError> for UnifiedError {
    fn from(e: squish_core::SquishError) -> Self {
        use squish_core::SquishError as E;
        match e {
            E::Io(io) => UnifiedError::Io(io.to_string()),
            other => {
                let msg = format!("{other}");
                if msg.to_lowercase().contains("unsupported") || msg.to_lowercase().contains("unknown") {
                    UnifiedError::Unsupported { reason: msg }
                } else {
                    UnifiedError::Other(msg)
                }
            }
        }
    }
}

impl From<squish_audio::AudioError> for UnifiedError {
    fn from(e: squish_audio::AudioError) -> Self {
        use squish_audio::AudioError as E;
        match e {
            E::MissingDependency { tool, .. } => UnifiedError::MissingDependency { tool: tool.to_string() },
            E::UnsupportedFormat { reason, .. } => UnifiedError::Unsupported { reason },
            E::NotAudio { path } => UnifiedError::Unsupported { reason: format!("not an audio file: {}", path.display()) },
            E::InvalidOption { reason } => UnifiedError::Unsupported { reason },
            E::Io(io) => UnifiedError::Io(io.to_string()),
            other => UnifiedError::Other(format!("{other}")),
        }
    }
}

impl From<squish_video::VideoError> for UnifiedError {
    fn from(e: squish_video::VideoError) -> Self {
        use squish_video::VideoError as E;
        match e {
            E::MissingDependency { tool, .. } => UnifiedError::MissingDependency { tool: tool.to_string() },
            E::UnsupportedFormat { reason, .. } => UnifiedError::Unsupported { reason },
            E::Io(io) => UnifiedError::Io(io.to_string()),
            other => UnifiedError::Other(format!("{other}")),
        }
    }
}

impl From<squish_code::CodeError> for UnifiedError {
    fn from(e: squish_code::CodeError) -> Self {
        use squish_code::CodeError as E;
        match e {
            E::UnsupportedFormat { reason, .. } => UnifiedError::Unsupported { reason },
            E::ParseFailed { reason, line, .. } => UnifiedError::ParseFailed { reason, line },
            E::Io(io) => UnifiedError::Io(io.to_string()),
            other => UnifiedError::Other(format!("{other}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn audio_missing_dep_maps_to_missing_dependency() {
        let e = squish_audio::AudioError::MissingDependency {
            tool: "ffmpeg".into(),
            hint: String::new(),
        };
        let u: UnifiedError = e.into();
        assert!(matches!(u, UnifiedError::MissingDependency { tool } if tool == "ffmpeg"));
    }

    #[test]
    fn code_parse_failed_preserves_line() {
        let e = squish_code::CodeError::ParseFailed {
            path: std::path::PathBuf::from("/x.js"),
            line: Some(42),
            reason: "syntax".into(),
        };
        let u: UnifiedError = e.into();
        match u {
            UnifiedError::ParseFailed { line, reason } => {
                assert_eq!(line, Some(42));
                assert_eq!(reason, "syntax");
            }
            other => panic!("wrong variant: {other:?}"),
        }
    }

    #[test]
    fn reduction_percent_handles_zero_input() {
        let r = UnifiedResult {
            input_bytes: 0, output_bytes: 0,
            output_path: std::path::PathBuf::new(),
            duration: Duration::from_secs(0),
            warnings: vec![],
        };
        assert_eq!(r.reduction_percent(), 0.0);
    }
}
```

Note: error-variant field names (e.g., `MissingDependency { tool, hint }`) must match the actual squish-audio/video/code 0.3.0 error enums. If a variant has different fields, adjust the match arms — the structure is what matters: any `MissingDependency` variant routes to `UnifiedError::MissingDependency`.

In `src-tauri/src/lib.rs`, add at the top of the file (right after the existing `mod commands;` line):

```rust
mod dispatch;
```

- [ ] **Step 2.2: Run tests to verify they pass**

Run: `cd src-tauri && cargo test --lib dispatch`
Expected: PASS, three tests.

If compilation fails because a native error variant has different field names than assumed: read the actual error enum in `~/Sites/squish/crates/squish-{audio,video,code}/src/error.rs` and update the match arms in the `From` impls. Re-run the test.

- [ ] **Step 2.3: Commit**

```bash
git add src-tauri/src/dispatch.rs src-tauri/src/lib.rs
git commit -m "feat(rust): add UnifiedError/UnifiedResult and native error mappers"
```

---

## Task 3: Add detect_kind to dispatch.rs

**Files:**
- Modify: `src-tauri/src/dispatch.rs`

- [ ] **Step 3.1: Write the failing tests for detect_kind (extension-based)**

Append to the `tests` mod in `src-tauri/src/dispatch.rs`:

```rust
    use std::fs;
    use std::path::PathBuf;
    use tempfile::TempDir;

    fn touch(dir: &TempDir, name: &str) -> PathBuf {
        let p = dir.path().join(name);
        fs::write(&p, b"\0\0\0\0").unwrap();
        p
    }

    #[test]
    fn detect_kind_image_from_extension() {
        let tmp = TempDir::new().unwrap();
        for name in ["a.jpg", "a.jpeg", "a.png", "a.webp", "a.gif"] {
            let p = touch(&tmp, name);
            assert_eq!(detect_kind(&p), FileKind::Image, "expected Image for {name}");
        }
    }

    #[test]
    fn detect_kind_video_from_extension() {
        let tmp = TempDir::new().unwrap();
        for name in ["a.mp4", "a.mkv", "a.webm"] {
            let p = touch(&tmp, name);
            assert_eq!(detect_kind(&p), FileKind::Video, "expected Video for {name}");
        }
    }

    #[test]
    fn detect_kind_code_from_extension() {
        let tmp = TempDir::new().unwrap();
        for name in ["a.js", "a.ts", "a.css", "a.html", "a.json"] {
            let p = touch(&tmp, name);
            assert_eq!(detect_kind(&p), FileKind::Code, "expected Code for {name}");
        }
    }

    #[test]
    fn detect_kind_unknown_extension() {
        let tmp = TempDir::new().unwrap();
        let p = touch(&tmp, "mystery.xyz");
        assert_eq!(detect_kind(&p), FileKind::Unknown);
    }
```

Then add the function to `dispatch.rs` (above the `tests` mod):

```rust
/// Classify a file into one of the four families, or Unknown.
///
/// Extension-based for non-ambiguous formats. Ambiguous audio extensions
/// (e.g., `.ogg`, `.mka`) that may actually contain video are resolved
/// at the dispatch boundary via `ffprobe` — `detect_kind` itself does no
/// process work, keeping it cheap to call per file.
pub fn detect_kind(path: &Path) -> FileKind {
    // Image first: cheap byte sniff via squish-core.
    if let Ok(bytes) = peek_head(path) {
        if squish_core::detect_format(path, &bytes).is_some() {
            return FileKind::Image;
        }
    }
    // Video extension.
    if squish_video::detect_video_format(path).is_some() {
        return FileKind::Video;
    }
    // Audio extension (may be ambiguous — caller resolves A/V via ffprobe).
    if squish_audio::detect_audio_format(path).is_some() {
        return FileKind::Audio;
    }
    // Code extension.
    if squish_code::detect_code_format(path).is_some() {
        return FileKind::Code;
    }
    FileKind::Unknown
}

fn peek_head(path: &Path) -> std::io::Result<Vec<u8>> {
    use std::io::Read;
    let mut f = std::fs::File::open(path)?;
    let mut head = [0u8; 32];
    let n = f.read(&mut head)?;
    Ok(head[..n].to_vec())
}
```

Add `tempfile` to dev-dependencies in `src-tauri/Cargo.toml`:

```toml
[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 3.2: Run tests to verify they pass**

Run: `cd src-tauri && cargo test --lib dispatch`
Expected: PASS, including the four new `detect_kind_*` tests.

- [ ] **Step 3.3: Commit**

```bash
git add src-tauri/src/dispatch.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(rust): add detect_kind for FileKind routing"
```

---

## Task 4: Add ffmpeg.rs with cached probe and check_ffmpeg command

**Files:**
- Create: `src-tauri/src/ffmpeg.rs`
- Modify: `src-tauri/src/lib.rs` — `mod ffmpeg;` + register command + initialise cache

- [ ] **Step 4.1: Write the failing test for status probing**

Create `src-tauri/src/ffmpeg.rs`:

```rust
//! ffmpeg/ffprobe detection. Cached at startup, refreshed on demand.

use serde::Serialize;
use std::sync::Mutex;

#[derive(Debug, Clone, Copy, Serialize, Default)]
pub struct FfmpegStatus {
    pub ffmpeg: bool,
    pub ffprobe: bool,
}

static CACHE: Mutex<FfmpegStatus> = Mutex::new(FfmpegStatus { ffmpeg: false, ffprobe: false });

/// Probe `ffmpeg -version` and `ffprobe -version`. Updates the cache and returns the result.
pub fn probe_and_cache() -> FfmpegStatus {
    let status = FfmpegStatus {
        ffmpeg: probe_one("ffmpeg"),
        ffprobe: probe_one("ffprobe"),
    };
    if let Ok(mut guard) = CACHE.lock() {
        *guard = status;
    }
    status
}

/// Read the cached status without re-probing.
pub fn cached() -> FfmpegStatus {
    CACHE.lock().map(|g| *g).unwrap_or_default()
}

fn probe_one(bin: &str) -> bool {
    use std::process::{Command, Stdio};
    Command::new(bin)
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .stdin(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[tauri::command]
pub fn check_ffmpeg() -> FfmpegStatus {
    probe_and_cache()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probe_returns_consistent_shape() {
        // We can't assume ffmpeg is or isn't installed in CI; just assert
        // that the function returns without panicking and the cache matches.
        let s = probe_and_cache();
        let cached = cached();
        assert_eq!(s.ffmpeg, cached.ffmpeg);
        assert_eq!(s.ffprobe, cached.ffprobe);
    }

    #[test]
    fn probe_one_nonexistent_returns_false() {
        assert!(!probe_one("definitely-not-a-real-binary-xyz-12345"));
    }
}
```

In `src-tauri/src/lib.rs`, add `mod ffmpeg;` near the top, register the command in `generate_handler!`, and call `ffmpeg::probe_and_cache()` once in `setup`:

```rust
mod commands;
mod dispatch;
mod ffmpeg;

// ... inside .setup(|app| { ... })
ffmpeg::probe_and_cache();

// ... inside .invoke_handler(tauri::generate_handler![
commands::get_version,
commands::squish_files,
ffmpeg::check_ffmpeg,
// ])
```

- [ ] **Step 4.2: Run tests to verify they pass**

Run: `cd src-tauri && cargo test --lib ffmpeg`
Expected: PASS, both tests.

- [ ] **Step 4.3: Run `cargo check` to verify lib.rs wiring**

Run: `cd src-tauri && cargo check`
Expected: PASS.

- [ ] **Step 4.4: Commit**

```bash
git add src-tauri/src/ffmpeg.rs src-tauri/src/lib.rs
git commit -m "feat(rust): add ffmpeg/ffprobe probe and check_ffmpeg command"
```

---

## Task 5: Add per-family options payload in options.rs

**Files:**
- Create: `src-tauri/src/options.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod options;`)

- [ ] **Step 5.1: Write the failing tests for the new payload mappers**

Create `src-tauri/src/options.rs`:

```rust
//! Per-family IPC option payloads and mappers to crate-native options.

use serde::Deserialize;
use squish_audio::{AudioCodec, AudioOptions};
use squish_code::CodeOptions;
use squish_core::{Format, SquishOptions};
use squish_video::VideoOptions;

#[derive(Deserialize, Default)]
pub struct BatchOptionsPayload {
    pub recursive: bool,
    pub force_overwrite: bool,
    pub image: ImageOptionsPayload,
    pub audio: AudioOptionsPayload,
    pub video: VideoOptionsPayload,
    pub code: CodeOptionsPayload,
}

#[derive(Deserialize, Default)]
pub struct ImageOptionsPayload {
    pub quality: Option<u8>,
    pub lossless: bool,
    pub format: Option<String>,
    pub max_width: Option<u32>,
    pub max_height: Option<u32>,
    pub suffix: Option<String>,
}

#[derive(Deserialize, Default)]
pub struct AudioOptionsPayload {
    pub codec: Option<String>,         // "copy" | "mp3" | "opus" | "aac" | "flac" | "vorbis"
    pub bitrate_kbps: Option<u32>,
    pub suffix: Option<String>,
}

#[derive(Deserialize, Default)]
pub struct VideoOptionsPayload {
    pub codec: Option<String>,
    pub crf: Option<u8>,
    pub preset: Option<String>,
    pub suffix: Option<String>,
}

#[derive(Deserialize, Default)]
pub struct CodeOptionsPayload {
    pub source_map: bool,
    pub suffix: Option<String>,
}

fn normalize_suffix(s: Option<&str>) -> Option<String> {
    s.map(str::trim).filter(|s| !s.is_empty()).map(str::to_owned)
}

impl ImageOptionsPayload {
    pub fn to_options(&self, force_overwrite: bool) -> SquishOptions {
        SquishOptions {
            quality: self.quality,
            lossless: self.lossless,
            output_format: self.format.as_deref().and_then(Format::parse),
            force_overwrite,
            max_width: self.max_width.filter(|&w| w > 0),
            max_height: self.max_height.filter(|&h| h > 0),
            suffix: normalize_suffix(self.suffix.as_deref()),
        }
    }
}

fn parse_audio_codec(s: &str) -> Option<AudioCodec> {
    match s.to_ascii_lowercase().as_str() {
        "copy" => Some(AudioCodec::Copy),
        "mp3" => Some(AudioCodec::Mp3),
        "opus" => Some(AudioCodec::Opus),
        "aac" => Some(AudioCodec::Aac),
        "flac" => Some(AudioCodec::Flac),
        "vorbis" => Some(AudioCodec::Vorbis),
        _ => None,
    }
}

impl AudioOptionsPayload {
    pub fn to_options(&self, force_overwrite: bool) -> AudioOptions {
        AudioOptions {
            codec: self.codec.as_deref().and_then(parse_audio_codec),
            bitrate_kbps: self.bitrate_kbps,
            force_overwrite,
            suffix: normalize_suffix(self.suffix.as_deref()),
            ..AudioOptions::default()
        }
    }
}

impl VideoOptionsPayload {
    pub fn to_options(&self, force_overwrite: bool) -> VideoOptions {
        // VideoOptions concrete shape may include additional fields; the
        // mapper passes through what we surface in the UI.
        VideoOptions {
            force_overwrite,
            suffix: normalize_suffix(self.suffix.as_deref()),
            ..VideoOptions::default()
        }
        // NOTE: codec/crf/preset are surfaced in the UI but the exact
        // VideoOptions field names depend on squish-video 0.3.0. When
        // wiring in Task 6, read crates/squish-video/src/options.rs and
        // add the assignments here.
    }
}

impl CodeOptionsPayload {
    pub fn to_options(&self, force_overwrite: bool) -> CodeOptions {
        CodeOptions {
            source_map: self.source_map,
            force_overwrite,
            suffix: normalize_suffix(self.suffix.as_deref()),
            ..CodeOptions::default()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn image_mapper_normalizes_zero_dims_to_none() {
        let p = ImageOptionsPayload {
            max_width: Some(0), max_height: Some(0), ..Default::default()
        };
        let o = p.to_options(false);
        assert!(o.max_width.is_none());
        assert!(o.max_height.is_none());
    }

    #[test]
    fn image_mapper_trims_and_nones_empty_suffix() {
        let p = ImageOptionsPayload { suffix: Some("   ".into()), ..Default::default() };
        assert!(p.to_options(false).suffix.is_none());

        let p = ImageOptionsPayload { suffix: Some("".into()), ..Default::default() };
        assert!(p.to_options(false).suffix.is_none());

        let p = ImageOptionsPayload { suffix: Some("  min  ".into()), ..Default::default() };
        assert_eq!(p.to_options(false).suffix.as_deref(), Some("min"));
    }

    #[test]
    fn audio_mapper_parses_codec_string_case_insensitive() {
        let p = AudioOptionsPayload { codec: Some("MP3".into()), bitrate_kbps: Some(192), ..Default::default() };
        let o = p.to_options(false);
        assert_eq!(o.codec, Some(AudioCodec::Mp3));
        assert_eq!(o.bitrate_kbps, Some(192));
    }

    #[test]
    fn audio_mapper_unknown_codec_string_yields_none() {
        let p = AudioOptionsPayload { codec: Some("wat".into()), ..Default::default() };
        assert!(p.to_options(false).codec.is_none());
    }

    #[test]
    fn code_mapper_passes_source_map_flag() {
        let p = CodeOptionsPayload { source_map: true, ..Default::default() };
        assert!(p.to_options(false).source_map);
    }

    #[test]
    fn force_overwrite_propagates_to_all_families() {
        assert!(ImageOptionsPayload::default().to_options(true).force_overwrite);
        assert!(AudioOptionsPayload::default().to_options(true).force_overwrite);
        assert!(CodeOptionsPayload::default().to_options(true).force_overwrite);
    }
}
```

In `src-tauri/src/lib.rs`, add `mod options;` near the existing `mod` declarations.

- [ ] **Step 5.2: Run tests to verify they pass**

Run: `cd src-tauri && cargo test --lib options`
Expected: PASS, six tests.

If the build fails because `AudioOptions`/`VideoOptions`/`CodeOptions` 0.3.0 don't have exactly these fields: read the actual `crates/squish-{audio,video,code}/src/options.rs` and either adjust the field names or drop fields the crate doesn't expose. Re-run.

- [ ] **Step 5.3: Commit**

```bash
git add src-tauri/src/options.rs src-tauri/src/lib.rs
git commit -m "feat(rust): add per-family options payload with mappers"
```

---

## Task 6: Add run_one dispatcher in dispatch.rs

**Files:**
- Modify: `src-tauri/src/dispatch.rs`

- [ ] **Step 6.1: Write the failing test for run_one happy path (code only — no ffmpeg required)**

Append to the `tests` mod in `src-tauri/src/dispatch.rs`:

```rust
    use crate::options::{BatchOptionsPayload, CodeOptionsPayload};

    #[test]
    fn run_one_routes_code_file_and_returns_unified_result() {
        let tmp = TempDir::new().unwrap();
        let p = tmp.path().join("a.json");
        fs::write(&p, br#"{"a":   1   }"#).unwrap();

        let opts = BatchOptionsPayload {
            code: CodeOptionsPayload { source_map: false, suffix: Some("min".into()) },
            force_overwrite: false,
            ..Default::default()
        };
        let ffmpeg_ok = false; // irrelevant for code
        let result = run_one(&p, &opts, ffmpeg_ok).expect("code run should succeed");

        assert!(result.input_bytes > 0);
        assert!(result.output_bytes <= result.input_bytes);
        assert!(result.output_path.exists());
    }

    #[test]
    fn run_one_missing_ffmpeg_for_audio_returns_missing_dependency() {
        let tmp = TempDir::new().unwrap();
        let p = tmp.path().join("a.mp3");
        // Minimal MP3-ish header so detect_audio_format succeeds.
        fs::write(&p, b"ID3\x03\x00\x00\x00\x00\x00\x00").unwrap();

        let opts = BatchOptionsPayload::default();
        let err = run_one(&p, &opts, /* ffmpeg_ok */ false).unwrap_err();
        assert!(matches!(err, UnifiedError::MissingDependency { ref tool } if tool == "ffmpeg"));
    }

    #[test]
    fn run_one_unknown_kind_returns_unsupported() {
        let tmp = TempDir::new().unwrap();
        let p = tmp.path().join("mystery.xyz");
        fs::write(&p, b"random").unwrap();

        let err = run_one(&p, &BatchOptionsPayload::default(), false).unwrap_err();
        assert!(matches!(err, UnifiedError::Unsupported { .. }));
    }
```

Add `run_one` to `dispatch.rs` (above the `tests` mod):

```rust
use crate::options::BatchOptionsPayload;

/// Dispatch a single file to the right crate based on its kind.
///
/// `ffmpeg_ok` short-circuits audio/video when the system dependency is missing,
/// avoiding redundant per-file probes inside the crates.
pub fn run_one(
    path: &Path,
    opts: &BatchOptionsPayload,
    ffmpeg_ok: bool,
) -> Result<UnifiedResult, UnifiedError> {
    match detect_kind(path) {
        FileKind::Image => {
            let o = opts.image.to_options(opts.force_overwrite);
            squish_core::squish_file(path, &o)
                .map(|r| UnifiedResult {
                    input_bytes: r.input_bytes,
                    output_bytes: r.output_bytes,
                    output_path: r.output_path,
                    duration: r.duration,
                    warnings: r.warnings.clone(),
                })
                .map_err(Into::into)
        }
        FileKind::Audio => {
            if !ffmpeg_ok {
                return Err(UnifiedError::MissingDependency { tool: "ffmpeg".into() });
            }
            let o = opts.audio.to_options(opts.force_overwrite);
            squish_audio::squish_audio(path, &o)
                .map(|r| UnifiedResult {
                    input_bytes: r.input_bytes,
                    output_bytes: r.output_bytes,
                    output_path: r.output_path,
                    duration: r.duration,
                    warnings: vec![],
                })
                .map_err(Into::into)
        }
        FileKind::Video => {
            if !ffmpeg_ok {
                return Err(UnifiedError::MissingDependency { tool: "ffmpeg".into() });
            }
            let o = opts.video.to_options(opts.force_overwrite);
            squish_video::squish_video(path, &o)
                .map(|r| UnifiedResult {
                    input_bytes: r.input_bytes,
                    output_bytes: r.output_bytes,
                    output_path: r.output_path,
                    duration: r.duration,
                    warnings: vec![],
                })
                .map_err(Into::into)
        }
        FileKind::Code => {
            let o = opts.code.to_options(opts.force_overwrite);
            squish_code::squish_code(path, &o)
                .map(|r| UnifiedResult {
                    input_bytes: r.input_bytes,
                    output_bytes: r.output_bytes,
                    output_path: r.output_path,
                    duration: r.duration,
                    warnings: vec![],
                })
                .map_err(Into::into)
        }
        FileKind::Unknown => Err(UnifiedError::Unsupported {
            reason: format!("unrecognised file: {}", path.display()),
        }),
    }
}
```

If `squish_core::SquishResult` does not have a `.warnings` field in 0.3.0, replace `r.warnings.clone()` with `vec![]` and revisit when the field lands.

- [ ] **Step 6.2: Run tests to verify they pass**

Run: `cd src-tauri && cargo test --lib dispatch`
Expected: PASS, three new tests added to the existing dispatch tests.

- [ ] **Step 6.3: Commit**

```bash
git add src-tauri/src/dispatch.rs
git commit -m "feat(rust): add run_one dispatcher routing files to the right crate"
```

---

## Task 7: Rewire commands::squish_files through the dispatcher

**Files:**
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 7.1: Replace SquishOptionsPayload usage with BatchOptionsPayload + family-aware events**

Replace the entire contents of `src-tauri/src/commands.rs` with:

```rust
use rayon::prelude::*;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::time::Instant;
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

use crate::dispatch::{detect_kind, run_one, FileKind, UnifiedError};
use crate::ffmpeg;
use crate::options::BatchOptionsPayload;

#[derive(Serialize, Clone)]
pub struct FileStartEvent {
    pub id: String,
    pub path: String,
    pub filename: String,
    pub family: FileKind,
}

#[derive(Serialize, Clone)]
pub struct FileDoneEvent {
    pub id: String,
    pub family: FileKind,
    pub input_bytes: u64,
    pub output_bytes: u64,
    pub output_path: String,
    pub reduction_percent: f64,
    pub duration_ms: u64,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Clone)]
pub struct FileErrorEvent {
    pub id: String,
    pub family: FileKind,
    pub kind: String, // "missing_dependency" | "unsupported" | "parse_failed" | "io" | "other"
    pub error: String,
}

#[derive(Serialize, Default, Clone)]
pub struct FamilyStats {
    pub total: usize,
    pub success: usize,
    pub error: usize,
    pub skipped: usize,
}

#[derive(Serialize)]
pub struct ByFamily {
    pub image: FamilyStats,
    pub audio: FamilyStats,
    pub video: FamilyStats,
    pub code: FamilyStats,
}

#[derive(Serialize)]
pub struct BatchResult {
    pub total_files: usize,
    pub success_count: usize,
    pub error_count: usize,
    pub skipped_count: usize,
    pub total_input_bytes: u64,
    pub total_output_bytes: u64,
    pub total_duration_ms: u64,
    pub by_family: ByFamily,
}

#[tauri::command]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

pub fn expand_paths(paths: &[String], recursive: bool) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for p in paths {
        let path = PathBuf::from(p);
        if path.is_file() {
            files.push(path);
        } else if path.is_dir() {
            let mut walker = WalkDir::new(&path).follow_links(false);
            if !recursive {
                walker = walker.max_depth(1);
            }
            for entry in walker.into_iter().filter_map(|e| e.ok()) {
                if entry.file_type().is_file() {
                    files.push(entry.into_path());
                }
            }
        }
    }
    files
}

fn kind_as_str(k: FileKind) -> &'static str {
    match k {
        FileKind::Image => "image",
        FileKind::Audio => "audio",
        FileKind::Video => "video",
        FileKind::Code => "code",
        FileKind::Unknown => "unknown",
    }
}

fn error_kind_str(e: &UnifiedError) -> &'static str {
    match e {
        UnifiedError::MissingDependency { .. } => "missing_dependency",
        UnifiedError::Unsupported { .. } => "unsupported",
        UnifiedError::ParseFailed { .. } => "parse_failed",
        UnifiedError::Io(_) => "io",
        UnifiedError::Other(_) => "other",
    }
}

#[tauri::command]
pub async fn squish_files(
    app: AppHandle,
    paths: Vec<String>,
    options: BatchOptionsPayload,
) -> Result<BatchResult, String> {
    let all_files = expand_paths(&paths, options.recursive);
    let ffmpeg_status = ffmpeg::cached();

    // Classify + assign ids.
    let work: Vec<(String, PathBuf, FileKind)> = all_files
        .iter()
        .enumerate()
        .map(|(i, path)| (format!("file-{i}"), path.clone(), detect_kind(path)))
        .collect();

    let mut family_stats: [(FileKind, FamilyStats); 4] = [
        (FileKind::Image, FamilyStats::default()),
        (FileKind::Audio, FamilyStats::default()),
        (FileKind::Video, FamilyStats::default()),
        (FileKind::Code, FamilyStats::default()),
    ];
    let mut skipped_count: usize = 0;

    for (_, _, kind) in &work {
        match kind {
            FileKind::Unknown => skipped_count += 1,
            other => {
                if let Some(slot) = family_stats.iter_mut().find(|(k, _)| k == other) {
                    slot.1.total += 1;
                }
            }
        }
    }

    let start = Instant::now();
    let success_count = AtomicUsize::new(0);
    let error_count = AtomicUsize::new(0);
    let total_input = AtomicU64::new(0);
    let total_output = AtomicU64::new(0);

    // Emit file-start for known kinds; Unknown is silent (counts as skipped).
    let dispatchable: Vec<(String, PathBuf, FileKind)> = work
        .into_iter()
        .filter(|(_, _, k)| !matches!(k, FileKind::Unknown))
        .map(|(id, path, kind)| {
            let filename = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();
            let _ = app.emit(
                "squish://file-start",
                FileStartEvent {
                    id: id.clone(),
                    path: path.display().to_string(),
                    filename,
                    family: kind,
                },
            );
            (id, path, kind)
        })
        .collect();

    let ffmpeg_ok = ffmpeg_status.ffmpeg && ffmpeg_status.ffprobe;

    let results: Vec<(String, FileKind, Result<crate::dispatch::UnifiedResult, UnifiedError>)> =
        dispatchable
            .into_par_iter()
            .map(|(id, path, kind)| {
                let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    run_one(&path, &options, ffmpeg_ok)
                }))
                .unwrap_or_else(|p| {
                    let msg = if let Some(s) = p.downcast_ref::<&str>() {
                        s.to_string()
                    } else if let Some(s) = p.downcast_ref::<String>() {
                        s.clone()
                    } else {
                        "panic".to_string()
                    };
                    Err(UnifiedError::Other(format!("internal error: {msg}")))
                });
                (id, kind, res)
            })
            .collect();

    for (id, kind, res) in results {
        match res {
            Ok(r) => {
                success_count.fetch_add(1, Ordering::SeqCst);
                total_input.fetch_add(r.input_bytes, Ordering::SeqCst);
                total_output.fetch_add(r.output_bytes, Ordering::SeqCst);
                if let Some(slot) = family_stats.iter_mut().find(|(k, _)| k == &kind) {
                    slot.1.success += 1;
                }
                let _ = app.emit(
                    "squish://file-done",
                    FileDoneEvent {
                        id,
                        family: kind,
                        input_bytes: r.input_bytes,
                        output_bytes: r.output_bytes,
                        output_path: r.output_path.display().to_string(),
                        reduction_percent: r.reduction_percent(),
                        duration_ms: r.duration.as_millis() as u64,
                        warnings: r.warnings,
                    },
                );
            }
            Err(e) => {
                error_count.fetch_add(1, Ordering::SeqCst);
                if let Some(slot) = family_stats.iter_mut().find(|(k, _)| k == &kind) {
                    slot.1.error += 1;
                }
                let _ = app.emit(
                    "squish://file-error",
                    FileErrorEvent {
                        id,
                        family: kind,
                        kind: error_kind_str(&e).to_string(),
                        error: format!("{e}"),
                    },
                );
            }
        }
    }

    let by_family = ByFamily {
        image: family_stats[0].1.clone(),
        audio: family_stats[1].1.clone(),
        video: family_stats[2].1.clone(),
        code: family_stats[3].1.clone(),
    };

    Ok(BatchResult {
        total_files: all_files.len(),
        success_count: success_count.load(Ordering::SeqCst),
        error_count: error_count.load(Ordering::SeqCst),
        skipped_count,
        total_input_bytes: total_input.load(Ordering::SeqCst),
        total_output_bytes: total_output.load(Ordering::SeqCst),
        total_duration_ms: start.elapsed().as_millis() as u64,
        by_family,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_version_returns_something() {
        let v = get_version();
        assert!(!v.is_empty());
    }

    #[test]
    fn expand_paths_with_nonexistent_path_returns_empty() {
        let result = expand_paths(&["/nonexistent/path/xyz".into()], false);
        assert!(result.is_empty());
    }

    #[test]
    fn kind_as_str_covers_all_variants() {
        assert_eq!(kind_as_str(FileKind::Image), "image");
        assert_eq!(kind_as_str(FileKind::Audio), "audio");
        assert_eq!(kind_as_str(FileKind::Video), "video");
        assert_eq!(kind_as_str(FileKind::Code), "code");
        assert_eq!(kind_as_str(FileKind::Unknown), "unknown");
    }
}
```

- [ ] **Step 7.2: Run all Rust tests to verify nothing regressed**

Run: `cd src-tauri && cargo test`
Expected: PASS, all tests across `dispatch`, `options`, `ffmpeg`, `commands` modules.

- [ ] **Step 7.3: `cargo check` to verify the full app builds**

Run: `cd src-tauri && cargo check`
Expected: PASS.

- [ ] **Step 7.4: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat(rust): wire squish_files through dispatcher with family-aware events"
```

---

## Task 8: Update TS types for new IPC contract

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 8.1: Update types.ts with the new payload and event shapes**

Replace the contents of `src/types.ts` with:

```typescript
// --- Family taxonomy ---
export type Family = 'image' | 'audio' | 'video' | 'code';

// --- Error kinds (mirrors UnifiedError variants in Rust dispatch.rs) ---
export type ErrorKind =
  | 'missing_dependency'
  | 'unsupported'
  | 'parse_failed'
  | 'io'
  | 'other';

// --- Tauri event payloads (must match Rust structs in commands.rs) ---

export interface FileStartPayload {
  id: string;
  path: string;
  filename: string;
  family: Family;
}

export interface FileDonePayload {
  id: string;
  family: Family;
  input_bytes: number;
  output_bytes: number;
  output_path: string;
  reduction_percent: number;
  duration_ms: number;
  warnings: string[];
}

export interface FileErrorPayload {
  id: string;
  family: Family;
  kind: ErrorKind;
  error: string;
}

export interface FamilyStats {
  total: number;
  success: number;
  error: number;
  skipped: number;
}

export interface BatchResult {
  total_files: number;
  success_count: number;
  error_count: number;
  skipped_count: number;
  total_input_bytes: number;
  total_output_bytes: number;
  total_duration_ms: number;
  by_family: {
    image: FamilyStats;
    audio: FamilyStats;
    video: FamilyStats;
    code: FamilyStats;
  };
}

// --- Frontend state ---

export type FileStatus = 'pending' | 'compressing' | 'done' | 'error';

export interface FileEntry {
  id: string;
  filename: string;
  path: string;
  family?: Family;
  status: FileStatus;
  inputBytes?: number;
  outputBytes?: number;
  reductionPercent?: number;
  outputPath?: string;
  durationMs?: number;
  warnings?: string[];
  error?: string;
  errorKind?: ErrorKind;
}

// --- Per-family settings ---

export interface ImageSettings {
  quality: number | null;
  lossless: boolean;
  format: string | null;
  maxWidth: number | null;
  maxHeight: number | null;
  suffix: string | null;
}

export type AudioCodec = 'copy' | 'mp3' | 'opus' | 'aac' | 'flac' | 'vorbis';

export interface AudioSettings {
  codec: AudioCodec | null;
  bitrateKbps: number | null;
  suffix: string | null;
}

export interface VideoSettings {
  codec: string | null;
  crf: number | null;
  preset: string | null;
  suffix: string | null;
}

export interface CodeSettings {
  sourceMap: boolean;
  suffix: string | null;
}

export interface Settings {
  recursive: boolean;
  image: ImageSettings;
  audio: AudioSettings;
  video: VideoSettings;
  code: CodeSettings;
}

// --- App state ---

export type AppStatus = 'idle' | 'processing' | 'done';

export interface AppState {
  status: AppStatus;
  files: FileEntry[];
  settings: Settings;
  activeBatches: number;
}

// --- Reducer actions ---

export type AppAction =
  | { type: 'START_BATCH' }
  | { type: 'FILE_START'; payload: FileStartPayload }
  | { type: 'FILE_DONE'; payload: FileDonePayload }
  | { type: 'FILE_ERROR'; payload: FileErrorPayload }
  | { type: 'BATCH_COMPLETE' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<Settings> };

// --- Defaults ---

export const DEFAULT_IMAGE: ImageSettings = {
  quality: null,
  lossless: false,
  format: null,
  maxWidth: null,
  maxHeight: null,
  suffix: null,
};

export const DEFAULT_AUDIO: AudioSettings = {
  codec: null,
  bitrateKbps: null,
  suffix: null,
};

export const DEFAULT_VIDEO: VideoSettings = {
  codec: null,
  crf: null,
  preset: null,
  suffix: null,
};

export const DEFAULT_CODE: CodeSettings = {
  sourceMap: false,
  suffix: null,
};

export const DEFAULT_SETTINGS: Settings = {
  recursive: false,
  image: DEFAULT_IMAGE,
  audio: DEFAULT_AUDIO,
  video: DEFAULT_VIDEO,
  code: DEFAULT_CODE,
};

export const FORMAT_OPTIONS = [
  { value: '', label: 'Auto (preserve input)' },
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
  { value: 'svg', label: 'SVG' },
  { value: 'gif', label: 'GIF' },
  { value: 'heic', label: 'HEIC' },
] as const;

export const AUDIO_CODEC_OPTIONS = [
  { value: '', label: 'Auto (preserve / Opus)' },
  { value: 'copy', label: 'Copy (no re-encode)' },
  { value: 'mp3', label: 'MP3' },
  { value: 'opus', label: 'Opus' },
  { value: 'aac', label: 'AAC' },
  { value: 'flac', label: 'FLAC (lossless)' },
  { value: 'vorbis', label: 'Vorbis' },
] as const;

// --- Theme types ---
export type ThemePreference = 'system' | 'light' | 'dark';
export type EffectiveTheme = 'light' | 'dark';
```

- [ ] **Step 8.2: Type-check the project**

Run: `npx tsc --noEmit`
Expected: Errors in `App.tsx`, `useSquish.ts`, `SettingsPanel.tsx`, `FileRow.tsx`, `Summary.tsx`, and existing tests. These are intentional — they'll be fixed in subsequent tasks. Confirm the errors are limited to consumers of the changed types, not to `types.ts` itself.

- [ ] **Step 8.3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): introduce per-family settings, family/kind/warnings on events"
```

---

## Task 9: Add Family detection utility

**Files:**
- Create: `src/lib/families.ts`
- Create: `src/__tests__/families.test.ts`

- [ ] **Step 9.1: Write the failing test**

Create `src/__tests__/families.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectFamilyFromExtension, FAMILY_META } from '../lib/families';

describe('detectFamilyFromExtension', () => {
  it.each([
    ['photo.jpg', 'image'],
    ['photo.JPEG', 'image'],
    ['photo.png', 'image'],
    ['photo.webp', 'image'],
    ['photo.avif', 'image'],
    ['photo.heic', 'image'],
    ['photo.gif', 'image'],
    ['photo.svg', 'image'],
  ])('classifies %s as image', (name, fam) => {
    expect(detectFamilyFromExtension(name)).toBe(fam);
  });

  it.each([
    ['song.mp3', 'audio'],
    ['song.flac', 'audio'],
    ['song.opus', 'audio'],
    ['song.aac', 'audio'],
    ['song.m4a', 'audio'],
    ['song.wav', 'audio'],
  ])('classifies %s as audio', (name, fam) => {
    expect(detectFamilyFromExtension(name)).toBe(fam);
  });

  it.each([
    ['clip.mp4', 'video'],
    ['clip.mkv', 'video'],
    ['clip.mov', 'video'],
    ['clip.webm', 'video'],
  ])('classifies %s as video', (name, fam) => {
    expect(detectFamilyFromExtension(name)).toBe(fam);
  });

  it.each([
    ['x.js', 'code'],
    ['x.ts', 'code'],
    ['x.tsx', 'code'],
    ['x.jsx', 'code'],
    ['x.css', 'code'],
    ['x.html', 'code'],
    ['x.htm', 'code'],
    ['x.json', 'code'],
  ])('classifies %s as code', (name, fam) => {
    expect(detectFamilyFromExtension(name)).toBe(fam);
  });

  it('returns null for unknown extension', () => {
    expect(detectFamilyFromExtension('mystery.xyz')).toBeNull();
  });

  it('returns null for files without extension', () => {
    expect(detectFamilyFromExtension('Makefile')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(detectFamilyFromExtension('PHOTO.JPG')).toBe('image');
    expect(detectFamilyFromExtension('Song.MP3')).toBe('audio');
  });
});

describe('FAMILY_META', () => {
  it('has a label and icon for every family', () => {
    expect(FAMILY_META.image.label).toBeTruthy();
    expect(FAMILY_META.audio.label).toBeTruthy();
    expect(FAMILY_META.video.label).toBeTruthy();
    expect(FAMILY_META.code.label).toBeTruthy();
  });
});
```

- [ ] **Step 9.2: Run test, verify failure**

Run: `npx vitest run src/__tests__/families.test.ts`
Expected: FAIL (`families.ts` doesn't exist).

- [ ] **Step 9.3: Create families.ts**

Create `src/lib/families.ts`:

```typescript
import type { Family } from '../types';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'heic', 'gif', 'svg']);
const AUDIO_EXTS = new Set(['mp3', 'flac', 'opus', 'aac', 'm4a', 'wav', 'ogg', 'oga', 'aiff', 'aif']);
const VIDEO_EXTS = new Set(['mp4', 'mkv', 'mov', 'webm', 'avi', 'm4v', 'mpg', 'mpeg']);
const CODE_EXTS  = new Set(['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'css', 'html', 'htm', 'json']);

/**
 * Classify a filename by extension only. The Rust dispatcher remains authoritative;
 * this is just for "should the audio panel be visible?"-style UI decisions.
 *
 * Returns null for unrecognised extensions or files with no extension.
 */
export function detectFamilyFromExtension(filename: string): Family | null {
  const dot = filename.lastIndexOf('.');
  if (dot < 0 || dot === filename.length - 1) return null;
  const ext = filename.slice(dot + 1).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (CODE_EXTS.has(ext))  return 'code';
  return null;
}

export interface FamilyMeta {
  label: string;
  icon: string;
}

export const FAMILY_META: Record<Family, FamilyMeta> = {
  image: { label: 'Image', icon: '🖼' },
  audio: { label: 'Audio', icon: '♪' },
  video: { label: 'Video', icon: '▶' },
  code:  { label: 'Code',  icon: '{ }' },
};
```

- [ ] **Step 9.4: Run test, verify pass**

Run: `npx vitest run src/__tests__/families.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 9.5: Commit**

```bash
git add src/lib/families.ts src/__tests__/families.test.ts
git commit -m "feat(ui): add family detection utility"
```

---

## Task 10: Add Settings v1→v2 migration

**Files:**
- Create: `src/lib/settings/schema.ts`
- Create: `src/lib/settings/migrate.ts`
- Create: `src/__tests__/migrate.test.ts`

- [ ] **Step 10.1: Write the failing migration test**

Create `src/__tests__/migrate.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { migrateSettings, SETTINGS_KEY_V2, SETTINGS_KEY_V1 } from '../lib/settings/migrate';
import { DEFAULT_SETTINGS } from '../types';

describe('migrateSettings', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns defaults when neither v1 nor v2 exists', () => {
    expect(migrateSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('loads v2 directly when present', () => {
    const v2 = { ...DEFAULT_SETTINGS, recursive: true };
    localStorage.setItem(SETTINGS_KEY_V2, JSON.stringify(v2));
    expect(migrateSettings().recursive).toBe(true);
  });

  it('migrates v1 flat shape into v2 image sub-object', () => {
    const v1 = {
      quality: 80, lossless: true, format: 'webp',
      recursive: true,
      maxWidth: 1920, maxHeight: 1080, suffix: 'small',
    };
    localStorage.setItem(SETTINGS_KEY_V1, JSON.stringify(v1));
    const out = migrateSettings();

    expect(out.recursive).toBe(true);
    expect(out.image.quality).toBe(80);
    expect(out.image.lossless).toBe(true);
    expect(out.image.format).toBe('webp');
    expect(out.image.maxWidth).toBe(1920);
    expect(out.image.maxHeight).toBe(1080);
    expect(out.image.suffix).toBe('small');
    expect(out.audio).toEqual(DEFAULT_SETTINGS.audio);
    expect(out.video).toEqual(DEFAULT_SETTINGS.video);
    expect(out.code).toEqual(DEFAULT_SETTINGS.code);
  });

  it('removes the v1 key after migrating', () => {
    localStorage.setItem(SETTINGS_KEY_V1, JSON.stringify({ quality: 70 }));
    migrateSettings();
    expect(localStorage.getItem(SETTINGS_KEY_V1)).toBeNull();
    expect(localStorage.getItem(SETTINGS_KEY_V2)).not.toBeNull();
  });

  it('falls back to defaults and warns when v2 is corrupted', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(SETTINGS_KEY_V2, 'not json{');
    const out = migrateSettings();
    expect(out).toEqual(DEFAULT_SETTINGS);
    expect(warn).toHaveBeenCalled();
  });

  it('falls back to defaults and warns when v2 is missing required fields', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(SETTINGS_KEY_V2, JSON.stringify({ foo: 1 }));
    const out = migrateSettings();
    expect(out).toEqual(DEFAULT_SETTINGS);
    expect(warn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 10.2: Run test, verify failure**

Run: `npx vitest run src/__tests__/migrate.test.ts`
Expected: FAIL (modules don't exist).

- [ ] **Step 10.3: Create schema.ts and migrate.ts**

Create `src/lib/settings/schema.ts`:

```typescript
import type { Settings } from '../../types';
import { DEFAULT_SETTINGS } from '../../types';

/** Shallow validity check for a parsed v2 Settings blob. */
export function isValidSettings(value: unknown): value is Settings {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Partial<Settings>;
  return (
    typeof s.recursive === 'boolean' &&
    typeof s.image === 'object' && s.image !== null &&
    typeof s.audio === 'object' && s.audio !== null &&
    typeof s.video === 'object' && s.video !== null &&
    typeof s.code  === 'object' && s.code  !== null
  );
}

/** Merge a possibly-partial v2 blob into full defaults so missing keys get filled. */
export function withDefaults(partial: Settings): Settings {
  return {
    recursive: partial.recursive ?? DEFAULT_SETTINGS.recursive,
    image: { ...DEFAULT_SETTINGS.image, ...partial.image },
    audio: { ...DEFAULT_SETTINGS.audio, ...partial.audio },
    video: { ...DEFAULT_SETTINGS.video, ...partial.video },
    code:  { ...DEFAULT_SETTINGS.code,  ...partial.code  },
  };
}
```

Create `src/lib/settings/migrate.ts`:

```typescript
import type { Settings } from '../../types';
import { DEFAULT_SETTINGS } from '../../types';
import { isValidSettings, withDefaults } from './schema';

export const SETTINGS_KEY_V1 = 'squish-settings';
export const SETTINGS_KEY_V2 = 'squish-settings-v2';

interface V1Settings {
  quality?: number | null;
  lossless?: boolean;
  format?: string | null;
  recursive?: boolean;
  maxWidth?: number | null;
  maxHeight?: number | null;
  suffix?: string | null;
}

function liftV1(v1: V1Settings): Settings {
  return {
    ...DEFAULT_SETTINGS,
    recursive: v1.recursive ?? DEFAULT_SETTINGS.recursive,
    image: {
      quality:   v1.quality   ?? DEFAULT_SETTINGS.image.quality,
      lossless:  v1.lossless  ?? DEFAULT_SETTINGS.image.lossless,
      format:    v1.format    ?? DEFAULT_SETTINGS.image.format,
      maxWidth:  v1.maxWidth  ?? DEFAULT_SETTINGS.image.maxWidth,
      maxHeight: v1.maxHeight ?? DEFAULT_SETTINGS.image.maxHeight,
      suffix:    v1.suffix    ?? DEFAULT_SETTINGS.image.suffix,
    },
  };
}

/**
 * Load settings from localStorage with v1 → v2 migration on first read.
 * Returns DEFAULT_SETTINGS (and warns) on any corruption.
 */
export function migrateSettings(): Settings {
  // 1. Prefer v2 if it exists.
  const v2Raw = localStorage.getItem(SETTINGS_KEY_V2);
  if (v2Raw !== null) {
    try {
      const parsed = JSON.parse(v2Raw);
      if (isValidSettings(parsed)) {
        return withDefaults(parsed);
      }
      console.warn('squish: v2 settings present but invalid; falling back to defaults');
    } catch {
      console.warn('squish: v2 settings parse failed; falling back to defaults');
    }
    return DEFAULT_SETTINGS;
  }

  // 2. Try to migrate v1.
  const v1Raw = localStorage.getItem(SETTINGS_KEY_V1);
  if (v1Raw !== null) {
    try {
      const v1 = JSON.parse(v1Raw) as V1Settings;
      const lifted = liftV1(v1);
      localStorage.setItem(SETTINGS_KEY_V2, JSON.stringify(lifted));
      localStorage.removeItem(SETTINGS_KEY_V1);
      return lifted;
    } catch {
      console.warn('squish: v1 settings parse failed; falling back to defaults');
    }
  }

  // 3. First-ever launch — seed v2 with defaults so subsequent reads are fast.
  localStorage.setItem(SETTINGS_KEY_V2, JSON.stringify(DEFAULT_SETTINGS));
  return DEFAULT_SETTINGS;
}

/** Save the current settings to v2 localStorage. Silently ignores quota errors. */
export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY_V2, JSON.stringify(settings));
  } catch {
    /* localStorage full or unavailable — ignored. */
  }
}
```

- [ ] **Step 10.4: Run test, verify pass**

Run: `npx vitest run src/__tests__/migrate.test.ts`
Expected: PASS, all six cases.

- [ ] **Step 10.5: Commit**

```bash
git add src/lib/settings/ src/__tests__/migrate.test.ts
git commit -m "feat(ui): add v1→v2 settings migration with schema validation"
```

---

## Task 11: Rework App.tsx to use new Settings + migration

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/__tests__/App.test.tsx`

- [ ] **Step 11.1: Update App.tsx to use the new types and migration**

Replace the contents of `src/App.tsx` with:

```typescript
import { useReducer, useCallback, useState } from "react";
import { DropZone } from "./components/DropZone";
import { FileList } from "./components/FileList";
import { SettingsPanel } from "./components/SettingsPanel";
import { useSquish } from "./hooks/useSquish";
import { useTheme } from "./hooks/useTheme";
import { migrateSettings, saveSettings } from "./lib/settings/migrate";
import type {
  AppState,
  AppAction,
  Settings,
  BatchResult,
  FileEntry,
} from "./types";
import "./App.css";

export function initialState(): AppState {
  return {
    status: "idle",
    files: [],
    settings: migrateSettings(),
    activeBatches: 0,
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "START_BATCH": {
      const isActive = state.status === "processing";
      return {
        ...state,
        status: "processing",
        files: isActive ? state.files : [],
        activeBatches: state.activeBatches + 1,
      };
    }

    case "FILE_START": {
      const entry: FileEntry = {
        id: action.payload.id,
        filename: action.payload.filename,
        path: action.payload.path,
        family: action.payload.family,
        status: "compressing",
      };
      return { ...state, files: [...state.files, entry] };
    }

    case "FILE_DONE":
      return {
        ...state,
        files: state.files.map((f) =>
          f.id === action.payload.id
            ? {
                ...f,
                status: "done",
                family: action.payload.family,
                inputBytes: action.payload.input_bytes,
                outputBytes: action.payload.output_bytes,
                outputPath: action.payload.output_path,
                reductionPercent: action.payload.reduction_percent,
                durationMs: action.payload.duration_ms,
                warnings: action.payload.warnings,
              }
            : f,
        ),
      };

    case "FILE_ERROR":
      return {
        ...state,
        files: state.files.map((f) =>
          f.id === action.payload.id
            ? {
                ...f,
                status: "error",
                family: action.payload.family,
                error: action.payload.error,
                errorKind: action.payload.kind,
              }
            : f,
        ),
      };

    case "BATCH_COMPLETE": {
      const remaining = state.activeBatches - 1;
      return {
        ...state,
        status: remaining <= 0 ? "done" : "processing",
        activeBatches: Math.max(0, remaining),
      };
    }

    case "UPDATE_SETTINGS": {
      const merged: Settings = {
        ...state.settings,
        ...action.settings,
        image: { ...state.settings.image, ...action.settings.image },
        audio: { ...state.settings.audio, ...action.settings.audio },
        video: { ...state.settings.video, ...action.settings.video },
        code:  { ...state.settings.code,  ...action.settings.code  },
      };
      saveSettings(merged);
      return { ...state, settings: merged };
    }

    default:
      return state;
  }
}

function App() {
  const [state, dispatch] = useReducer(appReducer, undefined, initialState);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const { squishFiles } = useSquish(dispatch, state.settings);
  const { effectiveTheme, cycleTheme, theme } = useTheme();

  const handleDrop = useCallback(
    async (paths: string[]) => {
      if (state.status !== "processing") {
        setBatchResult(null);
      }
      dispatch({ type: "START_BATCH" });
      const result = await squishFiles(paths);
      if (result) setBatchResult(result);
    },
    [state.status, squishFiles],
  );

  const handleSettingsChange = useCallback((update: Partial<Settings>) => {
    dispatch({ type: "UPDATE_SETTINGS", settings: update });
  }, []);

  return (
    <div className="app">
      <div className="app__header">
        <button
          className="theme-toggle"
          onClick={cycleTheme}
          aria-label={`Theme: ${theme}`}
          title={`Theme: ${theme} (${effectiveTheme})`}
        >
          {effectiveTheme === "dark" ? "☀" : "☾"}
        </button>
      </div>
      <DropZone status={state.status} onDrop={handleDrop} />
      <SettingsPanel settings={state.settings} onChange={handleSettingsChange} />
      <FileList files={state.files} batchResult={batchResult} />
    </div>
  );
}

export default App;
```

- [ ] **Step 11.2: Update App.test.tsx to use new Settings shape**

Read `src/__tests__/App.test.tsx` first to see current assertions. Update any references to flat-shape settings to use the per-family shape. Specifically: anywhere a test pre-seeds localStorage with `squish-settings`, switch to `squish-settings-v2` with the new shape, or rely on the v1 migration path.

(Exact edits depend on the file's current content. The structural change: the reducer's `UPDATE_SETTINGS` now deep-merges per-family sub-objects, so tests that dispatch `{ quality: 80 }` directly need to dispatch `{ image: { quality: 80 } }` — but as `Partial<Settings>`, both are typed.)

- [ ] **Step 11.3: Run App tests**

Run: `npx vitest run src/__tests__/App.test.tsx`
Expected: PASS. If failures remain, they are likely tests asserting on the old payload shape — update them to the new contract; do not loosen assertions.

- [ ] **Step 11.4: Commit**

```bash
git add src/App.tsx src/__tests__/App.test.tsx
git commit -m "feat(ui): wire App.tsx to v2 settings with family-aware reducer"
```

---

## Task 12: Update useSquish hook for new IPC contract

**Files:**
- Modify: `src/hooks/useSquish.ts`
- Modify: `src/__tests__/useSquish.test.tsx`

- [ ] **Step 12.1: Rewrite useSquish.ts to pass the new payload and dispatch new event shapes**

Replace the contents of `src/hooks/useSquish.ts` with:

```typescript
import { useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  Settings,
  AppAction,
  FileStartPayload,
  FileDonePayload,
  FileErrorPayload,
  BatchResult,
} from "../types";

function buildPayload(settings: Settings) {
  return {
    recursive: settings.recursive,
    force_overwrite: false,
    image: {
      quality: settings.image.quality,
      lossless: settings.image.lossless,
      format: settings.image.format,
      max_width: settings.image.maxWidth,
      max_height: settings.image.maxHeight,
      suffix: settings.image.suffix,
    },
    audio: {
      codec: settings.audio.codec,
      bitrate_kbps: settings.audio.bitrateKbps,
      suffix: settings.audio.suffix,
    },
    video: {
      codec: settings.video.codec,
      crf: settings.video.crf,
      preset: settings.video.preset,
      suffix: settings.video.suffix,
    },
    code: {
      source_map: settings.code.sourceMap,
      suffix: settings.code.suffix,
    },
  };
}

export function useSquish(
  dispatch: React.Dispatch<AppAction>,
  settings: Settings,
) {
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    let cancelled = false;
    const unlisteners: Array<() => void> = [];

    async function setup() {
      const u1 = await listen<FileStartPayload>("squish://file-start", (event) => {
        if (!cancelled) dispatch({ type: "FILE_START", payload: event.payload });
      });
      if (cancelled) { u1(); return; }
      unlisteners.push(u1);

      const u2 = await listen<FileDonePayload>("squish://file-done", (event) => {
        if (!cancelled) dispatch({ type: "FILE_DONE", payload: event.payload });
      });
      if (cancelled) { u2(); return; }
      unlisteners.push(u2);

      const u3 = await listen<FileErrorPayload>("squish://file-error", (event) => {
        if (!cancelled) dispatch({ type: "FILE_ERROR", payload: event.payload });
      });
      if (cancelled) { u3(); return; }
      unlisteners.push(u3);
    }

    setup();
    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
    };
  }, [dispatch]);

  const squishFiles = useCallback(
    async (paths: string[]): Promise<BatchResult | null> => {
      try {
        const result = await invoke<BatchResult>("squish_files", {
          paths,
          options: buildPayload(settingsRef.current),
        });
        dispatch({ type: "BATCH_COMPLETE" });
        return result;
      } catch (err) {
        console.error("squish_files failed:", err);
        dispatch({ type: "BATCH_COMPLETE" });
        return null;
      }
    },
    [dispatch],
  );

  return { squishFiles };
}

// Exported for testing.
export { buildPayload };
```

- [ ] **Step 12.2: Update useSquish test**

Read `src/__tests__/useSquish.test.tsx`. Update mocks/assertions to use the new payload shape produced by `buildPayload`, and assert that `FILE_DONE` / `FILE_ERROR` dispatch actions now carry the new `family` / `warnings` / `kind` fields. If the test previously asserted on a flat options object passed to `invoke('squish_files')`, update to assert on the nested shape `{ recursive, force_overwrite, image: { ... }, audio: { ... }, ... }`.

Add a new unit test for `buildPayload`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildPayload } from '../hooks/useSquish';
import { DEFAULT_SETTINGS } from '../types';

describe('buildPayload', () => {
  it('maps camelCase TS settings to snake_case wire format', () => {
    const out = buildPayload({
      ...DEFAULT_SETTINGS,
      recursive: true,
      image: { ...DEFAULT_SETTINGS.image, maxWidth: 1920, maxHeight: 1080, suffix: 'small' },
      audio: { ...DEFAULT_SETTINGS.audio, codec: 'mp3', bitrateKbps: 192 },
      code:  { ...DEFAULT_SETTINGS.code,  sourceMap: true },
    });
    expect(out.recursive).toBe(true);
    expect(out.force_overwrite).toBe(false);
    expect(out.image.max_width).toBe(1920);
    expect(out.image.max_height).toBe(1080);
    expect(out.image.suffix).toBe('small');
    expect(out.audio.codec).toBe('mp3');
    expect(out.audio.bitrate_kbps).toBe(192);
    expect(out.code.source_map).toBe(true);
  });
});
```

- [ ] **Step 12.3: Run useSquish tests**

Run: `npx vitest run src/__tests__/useSquish.test.tsx`
Expected: PASS.

- [ ] **Step 12.4: Commit**

```bash
git add src/hooks/useSquish.ts src/__tests__/useSquish.test.tsx
git commit -m "feat(ui): rework useSquish for per-family payload and family-aware events"
```

---

## Task 13: Add useFfmpegStatus hook

**Files:**
- Create: `src/hooks/useFfmpegStatus.ts`
- Create: `src/__tests__/useFfmpegStatus.test.tsx`

- [ ] **Step 13.1: Write the failing test**

Create `src/__tests__/useFfmpegStatus.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFfmpegStatus } from '../hooks/useFfmpegStatus';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

beforeEach(() => { invokeMock.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('useFfmpegStatus', () => {
  it('invokes check_ffmpeg on mount and exposes status', async () => {
    invokeMock.mockResolvedValueOnce({ ffmpeg: true, ffprobe: true });
    const { result } = renderHook(() => useFfmpegStatus());
    await waitFor(() => {
      expect(result.current.ffmpeg).toBe(true);
      expect(result.current.ffprobe).toBe(true);
    });
    expect(invokeMock).toHaveBeenCalledWith('check_ffmpeg');
  });

  it('recheck re-invokes and updates state', async () => {
    invokeMock
      .mockResolvedValueOnce({ ffmpeg: false, ffprobe: false })
      .mockResolvedValueOnce({ ffmpeg: true,  ffprobe: true  });

    const { result } = renderHook(() => useFfmpegStatus());
    await waitFor(() => expect(result.current.ffmpeg).toBe(false));

    await act(async () => { await result.current.recheck(); });
    expect(result.current.ffmpeg).toBe(true);
    expect(result.current.ffprobe).toBe(true);
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 13.2: Run test, verify failure**

Run: `npx vitest run src/__tests__/useFfmpegStatus.test.tsx`
Expected: FAIL (hook doesn't exist).

- [ ] **Step 13.3: Create useFfmpegStatus.ts**

Create `src/hooks/useFfmpegStatus.ts`:

```typescript
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface FfmpegStatus {
  ffmpeg: boolean;
  ffprobe: boolean;
}

export interface UseFfmpegStatus extends FfmpegStatus {
  loaded: boolean;
  recheck: () => Promise<void>;
}

export function useFfmpegStatus(): UseFfmpegStatus {
  const [status, setStatus] = useState<FfmpegStatus>({ ffmpeg: false, ffprobe: false });
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await invoke<FfmpegStatus>("check_ffmpeg");
      setStatus(next);
    } catch (err) {
      console.error("check_ffmpeg failed:", err);
      setStatus({ ffmpeg: false, ffprobe: false });
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...status, loaded, recheck: refresh };
}
```

- [ ] **Step 13.4: Run test, verify pass**

Run: `npx vitest run src/__tests__/useFfmpegStatus.test.tsx`
Expected: PASS.

- [ ] **Step 13.5: Commit**

```bash
git add src/hooks/useFfmpegStatus.ts src/__tests__/useFfmpegStatus.test.tsx
git commit -m "feat(ui): add useFfmpegStatus hook"
```

---

## Task 14: Add per-family settings sub-panel components

**Files:**
- Create: `src/components/ImageSettings.tsx` + `.css`
- Create: `src/components/AudioSettings.tsx` + `.css`
- Create: `src/components/VideoSettings.tsx` + `.css`
- Create: `src/components/CodeSettings.tsx` + `.css`

This task creates four small presentational components that take a `value` + `onChange`. Existing `SettingsPanel.tsx` will be reworked to host them in Task 15.

- [ ] **Step 14.1: Create ImageSettings.tsx (extracted from current SettingsPanel body)**

Read the existing `src/components/SettingsPanel.tsx` body to see the current image controls (quality, lossless, format, maxWidth, maxHeight, suffix), then create `src/components/ImageSettings.tsx`:

```typescript
import type { ImageSettings } from "../types";
import { FORMAT_OPTIONS } from "../types";
import "./ImageSettings.css";

interface Props {
  value: ImageSettings;
  onChange: (update: Partial<ImageSettings>) => void;
}

export function ImageSettings({ value, onChange }: Props) {
  return (
    <div className="image-settings">
      <div className="image-settings__field">
        <label htmlFor="img-quality">Quality</label>
        <div className="image-settings__quality-row">
          <input
            id="img-quality"
            type="range"
            min={0}
            max={100}
            value={value.quality ?? 0}
            onChange={(e) =>
              onChange({ quality: e.target.value === "0" ? null : Number(e.target.value) })
            }
          />
          <span className="image-settings__quality-value">
            {value.quality ?? "auto"}
          </span>
        </div>
      </div>

      <div className="image-settings__field">
        <label>
          <input
            type="checkbox"
            checked={value.lossless}
            onChange={(e) => onChange({ lossless: e.target.checked })}
          />
          Lossless
        </label>
      </div>

      <div className="image-settings__field">
        <label htmlFor="img-format">Output format</label>
        <select
          id="img-format"
          value={value.format ?? ""}
          onChange={(e) => onChange({ format: e.target.value || null })}
        >
          {FORMAT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="image-settings__row">
        <div className="image-settings__field">
          <label htmlFor="img-mw">Max width</label>
          <input
            id="img-mw"
            type="number"
            min={0}
            value={value.maxWidth ?? ""}
            placeholder="no limit"
            onChange={(e) =>
              onChange({ maxWidth: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
        </div>
        <div className="image-settings__field">
          <label htmlFor="img-mh">Max height</label>
          <input
            id="img-mh"
            type="number"
            min={0}
            value={value.maxHeight ?? ""}
            placeholder="no limit"
            onChange={(e) =>
              onChange({ maxHeight: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
        </div>
      </div>

      <div className="image-settings__field">
        <label htmlFor="img-suffix">Suffix</label>
        <input
          id="img-suffix"
          type="text"
          value={value.suffix ?? ""}
          placeholder="squished"
          onChange={(e) =>
            onChange({ suffix: e.target.value === "" ? null : e.target.value })
          }
        />
      </div>
    </div>
  );
}
```

Create `src/components/ImageSettings.css` (copy relevant rules from `SettingsPanel.css` for the image controls, rename class prefixes to `image-settings__*`):

```css
.image-settings { display: flex; flex-direction: column; gap: 12px; }
.image-settings__field { display: flex; flex-direction: column; gap: 4px; }
.image-settings__row { display: flex; gap: 12px; }
.image-settings__row .image-settings__field { flex: 1; }
.image-settings__quality-row { display: flex; align-items: center; gap: 8px; }
.image-settings__quality-value { font-variant-numeric: tabular-nums; min-width: 3ch; color: var(--text-secondary); }
.image-settings input[type="text"],
.image-settings input[type="number"],
.image-settings select {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
  font-family: inherit;
  font-size: 13px;
  color: var(--text-primary);
}
```

- [ ] **Step 14.2: Create AudioSettings.tsx + .css**

Create `src/components/AudioSettings.tsx`:

```typescript
import type { AudioSettings, AudioCodec } from "../types";
import { AUDIO_CODEC_OPTIONS } from "../types";
import "./AudioSettings.css";

interface Props {
  value: AudioSettings;
  onChange: (update: Partial<AudioSettings>) => void;
  ffmpegAvailable: boolean;
}

export function AudioSettings({ value, onChange, ffmpegAvailable }: Props) {
  const disabled = !ffmpegAvailable;
  return (
    <div className={`audio-settings${disabled ? " audio-settings--disabled" : ""}`}>
      {disabled && (
        <p className="audio-settings__notice">
          Audio compression requires <code>ffmpeg</code>. Install it to enable these controls.
        </p>
      )}
      <div className="audio-settings__field">
        <label htmlFor="aud-codec">Codec</label>
        <select
          id="aud-codec"
          disabled={disabled}
          value={value.codec ?? ""}
          onChange={(e) =>
            onChange({ codec: (e.target.value || null) as AudioCodec | null })
          }
        >
          {AUDIO_CODEC_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className="audio-settings__field">
        <label htmlFor="aud-bitrate">Bitrate (kbps)</label>
        <input
          id="aud-bitrate"
          type="number"
          min={0}
          step={32}
          disabled={disabled}
          value={value.bitrateKbps ?? ""}
          placeholder="auto"
          onChange={(e) =>
            onChange({ bitrateKbps: e.target.value === "" ? null : Number(e.target.value) })
          }
        />
      </div>
      <div className="audio-settings__field">
        <label htmlFor="aud-suffix">Suffix</label>
        <input
          id="aud-suffix"
          type="text"
          disabled={disabled}
          value={value.suffix ?? ""}
          placeholder="squished"
          onChange={(e) =>
            onChange({ suffix: e.target.value === "" ? null : e.target.value })
          }
        />
      </div>
    </div>
  );
}
```

Create `src/components/AudioSettings.css`:

```css
.audio-settings { display: flex; flex-direction: column; gap: 12px; }
.audio-settings__field { display: flex; flex-direction: column; gap: 4px; }
.audio-settings--disabled .audio-settings__field { opacity: 0.5; }
.audio-settings__notice {
  background: var(--bg-elev);
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  font-size: 12px;
  color: var(--text-secondary);
}
.audio-settings input,
.audio-settings select {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
  font-family: inherit;
  font-size: 13px;
  color: var(--text-primary);
}
```

- [ ] **Step 14.3: Create VideoSettings.tsx + .css**

Create `src/components/VideoSettings.tsx`:

```typescript
import type { VideoSettings } from "../types";
import "./VideoSettings.css";

interface Props {
  value: VideoSettings;
  onChange: (update: Partial<VideoSettings>) => void;
  ffmpegAvailable: boolean;
}

export function VideoSettings({ value, onChange, ffmpegAvailable }: Props) {
  const disabled = !ffmpegAvailable;
  return (
    <div className={`video-settings${disabled ? " video-settings--disabled" : ""}`}>
      {disabled && (
        <p className="video-settings__notice">
          Video compression requires <code>ffmpeg</code>. Install it to enable these controls.
        </p>
      )}
      <div className="video-settings__field">
        <label htmlFor="vid-codec">Codec</label>
        <input
          id="vid-codec"
          type="text"
          disabled={disabled}
          placeholder="auto"
          value={value.codec ?? ""}
          onChange={(e) => onChange({ codec: e.target.value || null })}
        />
      </div>
      <div className="video-settings__field">
        <label htmlFor="vid-crf">CRF (quality, lower = better)</label>
        <input
          id="vid-crf"
          type="number"
          min={0}
          max={51}
          disabled={disabled}
          placeholder="default"
          value={value.crf ?? ""}
          onChange={(e) =>
            onChange({ crf: e.target.value === "" ? null : Number(e.target.value) })
          }
        />
      </div>
      <div className="video-settings__field">
        <label htmlFor="vid-preset">Preset</label>
        <input
          id="vid-preset"
          type="text"
          disabled={disabled}
          placeholder="medium"
          value={value.preset ?? ""}
          onChange={(e) => onChange({ preset: e.target.value || null })}
        />
      </div>
      <div className="video-settings__field">
        <label htmlFor="vid-suffix">Suffix</label>
        <input
          id="vid-suffix"
          type="text"
          disabled={disabled}
          value={value.suffix ?? ""}
          placeholder="squished"
          onChange={(e) =>
            onChange({ suffix: e.target.value === "" ? null : e.target.value })
          }
        />
      </div>
    </div>
  );
}
```

Create `src/components/VideoSettings.css`:

```css
.video-settings { display: flex; flex-direction: column; gap: 12px; }
.video-settings__field { display: flex; flex-direction: column; gap: 4px; }
.video-settings--disabled .video-settings__field { opacity: 0.5; }
.video-settings__notice {
  background: var(--bg-elev);
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  font-size: 12px;
  color: var(--text-secondary);
}
.video-settings input,
.video-settings select {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
  font-family: inherit;
  font-size: 13px;
  color: var(--text-primary);
}
```

- [ ] **Step 14.4: Create CodeSettings.tsx + .css**

Create `src/components/CodeSettings.tsx`:

```typescript
import type { CodeSettings } from "../types";
import "./CodeSettings.css";

interface Props {
  value: CodeSettings;
  onChange: (update: Partial<CodeSettings>) => void;
}

export function CodeSettings({ value, onChange }: Props) {
  return (
    <div className="code-settings">
      <div className="code-settings__field">
        <label>
          <input
            type="checkbox"
            checked={value.sourceMap}
            onChange={(e) => onChange({ sourceMap: e.target.checked })}
          />
          Generate source map (.map file)
        </label>
      </div>
      <div className="code-settings__field">
        <label htmlFor="code-suffix">Suffix</label>
        <input
          id="code-suffix"
          type="text"
          value={value.suffix ?? ""}
          placeholder="min"
          onChange={(e) =>
            onChange({ suffix: e.target.value === "" ? null : e.target.value })
          }
        />
      </div>
    </div>
  );
}
```

Create `src/components/CodeSettings.css`:

```css
.code-settings { display: flex; flex-direction: column; gap: 12px; }
.code-settings__field { display: flex; flex-direction: column; gap: 4px; }
.code-settings input[type="text"] {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
  font-family: inherit;
  font-size: 13px;
  color: var(--text-primary);
}
```

- [ ] **Step 14.5: Type-check**

Run: `npx tsc --noEmit`
Expected: Errors only in the not-yet-updated `SettingsPanel.tsx` (consumer side). The four new components should compile clean.

- [ ] **Step 14.6: Commit**

```bash
git add src/components/ImageSettings.* src/components/AudioSettings.* src/components/VideoSettings.* src/components/CodeSettings.*
git commit -m "feat(ui): add per-family settings sub-panels"
```

---

## Task 15: Rework SettingsPanel to host per-family sub-panels with contextual expansion

**Files:**
- Modify: `src/components/SettingsPanel.tsx`
- Modify: `src/components/SettingsPanel.css`
- Modify: `src/__tests__/SettingsPanel.test.tsx`

- [ ] **Step 15.1: Add a `queueFamilies` prop and rework the panel body**

Replace the contents of `src/components/SettingsPanel.tsx` with:

```typescript
import { useState } from "react";
import type { Settings, Family } from "../types";
import { ImageSettings } from "./ImageSettings";
import { AudioSettings } from "./AudioSettings";
import { VideoSettings } from "./VideoSettings";
import { CodeSettings } from "./CodeSettings";
import { FAMILY_META } from "../lib/families";
import "./SettingsPanel.css";

interface Props {
  settings: Settings;
  onChange: (update: Partial<Settings>) => void;
  queueFamilies?: Set<Family>;
  ffmpegAvailable?: boolean;
}

type SectionKey = Family | 'general';

export function SettingsPanel({
  settings,
  onChange,
  queueFamilies,
  ffmpegAvailable = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<SectionKey>>(() => {
    const initial = new Set<SectionKey>();
    if (queueFamilies) {
      queueFamilies.forEach((f) => initial.add(f));
    }
    return initial;
  });

  const toggleSection = (key: SectionKey) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const isOpen = (key: SectionKey) =>
    expanded.has(key) || (queueFamilies?.has(key as Family) ?? false);

  return (
    <div className="settings-panel">
      <button
        className="settings-panel__toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Settings"
      >
        <span className={`settings-panel__toggle-icon${open ? " settings-panel__toggle-icon--open" : ""}`}>
          ⚙
        </span>
        Settings
      </button>

      {open && (
        <div className="settings-panel__body">
          <div className="settings-panel__section">
            <button
              className="settings-panel__section-header"
              onClick={() => toggleSection('general')}
            >
              {isOpen('general') ? '▾' : '▸'} General
            </button>
            {isOpen('general') && (
              <div className="settings-panel__section-body">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.recursive}
                    onChange={(e) => onChange({ recursive: e.target.checked })}
                  />
                  Recurse into subdirectories
                </label>
              </div>
            )}
          </div>

          {(['image', 'audio', 'video', 'code'] as Family[]).map((fam) => (
            <div key={fam} className="settings-panel__section">
              <button
                className="settings-panel__section-header"
                onClick={() => toggleSection(fam)}
              >
                {isOpen(fam) ? '▾' : '▸'} {FAMILY_META[fam].icon} {FAMILY_META[fam].label}
                {queueFamilies?.has(fam) && <span className="settings-panel__badge">in batch</span>}
              </button>
              {isOpen(fam) && (
                <div className="settings-panel__section-body">
                  {fam === 'image' && (
                    <ImageSettings
                      value={settings.image}
                      onChange={(u) => onChange({ image: { ...settings.image, ...u } })}
                    />
                  )}
                  {fam === 'audio' && (
                    <AudioSettings
                      value={settings.audio}
                      ffmpegAvailable={ffmpegAvailable}
                      onChange={(u) => onChange({ audio: { ...settings.audio, ...u } })}
                    />
                  )}
                  {fam === 'video' && (
                    <VideoSettings
                      value={settings.video}
                      ffmpegAvailable={ffmpegAvailable}
                      onChange={(u) => onChange({ video: { ...settings.video, ...u } })}
                    />
                  )}
                  {fam === 'code' && (
                    <CodeSettings
                      value={settings.code}
                      onChange={(u) => onChange({ code: { ...settings.code, ...u } })}
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 15.2: Extend SettingsPanel.css for the new section layout**

Append to `src/components/SettingsPanel.css`:

```css
.settings-panel__section { border-top: 1px solid var(--border); }
.settings-panel__section:first-child { border-top: none; }
.settings-panel__section-header {
  width: 100%;
  background: none;
  border: none;
  padding: 10px 16px;
  text-align: left;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}
.settings-panel__section-header:hover { background: var(--bg-elev); }
.settings-panel__section-body { padding: 4px 16px 14px; }
.settings-panel__badge {
  margin-left: auto;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-fg, white);
}
```

- [ ] **Step 15.3: Update SettingsPanel test**

Read `src/__tests__/SettingsPanel.test.tsx`. Update it to:
- Pass the new `Settings` shape (per-family sub-objects).
- Assert that each of the four section headers renders.
- Assert that opening a section reveals its sub-panel (e.g., image controls render under Image header).
- Assert that passing `queueFamilies={new Set(['audio'])}` auto-expands the audio section and shows the "in batch" badge.

Add at least these two new test cases:

```typescript
it('renders all four family section headers', async () => {
  render(<SettingsPanel settings={DEFAULT_SETTINGS} onChange={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: /Settings/i }));
  expect(screen.getByText(/Image/)).toBeInTheDocument();
  expect(screen.getByText(/Audio/)).toBeInTheDocument();
  expect(screen.getByText(/Video/)).toBeInTheDocument();
  expect(screen.getByText(/Code/)).toBeInTheDocument();
});

it('auto-expands sections in queueFamilies', async () => {
  render(
    <SettingsPanel
      settings={DEFAULT_SETTINGS}
      onChange={vi.fn()}
      queueFamilies={new Set(['audio'])}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: /Settings/i }));
  // The audio sub-panel renders its codec select when expanded.
  expect(screen.getByLabelText(/Codec/i)).toBeInTheDocument();
});
```

- [ ] **Step 15.4: Run SettingsPanel tests**

Run: `npx vitest run src/__tests__/SettingsPanel.test.tsx`
Expected: PASS.

- [ ] **Step 15.5: Commit**

```bash
git add src/components/SettingsPanel.tsx src/components/SettingsPanel.css src/__tests__/SettingsPanel.test.tsx
git commit -m "feat(ui): rework SettingsPanel into per-family contextual sections"
```

---

## Task 16: Pipe queueFamilies + ffmpegAvailable into SettingsPanel via App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 16.1: Derive queueFamilies from state.files and pass ffmpeg status**

In `src/App.tsx`:

1. Import the ffmpeg hook and Family type:

```typescript
import { useFfmpegStatus } from "./hooks/useFfmpegStatus";
import { detectFamilyFromExtension } from "./lib/families";
import type { Family } from "./types";
```

2. Inside the `App` component, after `useTheme`, add:

```typescript
const ffmpeg = useFfmpegStatus();

const queueFamilies = (() => {
  const set = new Set<Family>();
  for (const f of state.files) {
    if (f.family) set.add(f.family);
    else {
      const fam = detectFamilyFromExtension(f.filename);
      if (fam) set.add(fam);
    }
  }
  return set;
})();
```

3. Pass them into `SettingsPanel`:

```tsx
<SettingsPanel
  settings={state.settings}
  onChange={handleSettingsChange}
  queueFamilies={queueFamilies}
  ffmpegAvailable={ffmpeg.ffmpeg && ffmpeg.ffprobe}
/>
```

- [ ] **Step 16.2: Run App tests**

Run: `npx vitest run src/__tests__/App.test.tsx`
Expected: PASS. If existing assertions break because `SettingsPanel` now accepts new props, this is wiring not behaviour — leave assertions as they were unless they were testing specifically those props.

- [ ] **Step 16.3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(ui): pipe queueFamilies and ffmpeg status into SettingsPanel"
```

---

## Task 17: Add FfmpegOnboarding card

**Files:**
- Create: `src/components/FfmpegOnboarding.tsx` + `.css`
- Create: `src/__tests__/FfmpegOnboarding.test.tsx`
- Modify: `src/App.tsx` (mount the card)

- [ ] **Step 17.1: Write the failing test**

Create `src/__tests__/FfmpegOnboarding.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FfmpegOnboarding } from '../components/FfmpegOnboarding';

describe('FfmpegOnboarding', () => {
  it('renders install commands for macOS, Windows, Linux', async () => {
    render(<FfmpegOnboarding visible onRecheck={vi.fn()} />);
    expect(screen.getByText(/brew install ffmpeg/)).toBeInTheDocument();
    expect(screen.getByText(/winget install/)).toBeInTheDocument();
    expect(screen.getByText(/apt install ffmpeg|dnf install ffmpeg/)).toBeInTheDocument();
  });

  it('does not render when visible is false', () => {
    const { container } = render(<FfmpegOnboarding visible={false} onRecheck={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('Re-check button calls onRecheck', async () => {
    const onRecheck = vi.fn();
    render(<FfmpegOnboarding visible onRecheck={onRecheck} />);
    await userEvent.click(screen.getByRole('button', { name: /Re-check/i }));
    expect(onRecheck).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 17.2: Run test, verify failure**

Run: `npx vitest run src/__tests__/FfmpegOnboarding.test.tsx`
Expected: FAIL (component doesn't exist).

- [ ] **Step 17.3: Create FfmpegOnboarding.tsx + .css**

Create `src/components/FfmpegOnboarding.tsx`:

```typescript
import { useState } from "react";
import "./FfmpegOnboarding.css";

interface Props {
  visible: boolean;
  onRecheck: () => void | Promise<void>;
}

type Tab = 'mac' | 'win' | 'linux';

const COMMANDS: Record<Tab, string> = {
  mac:   'brew install ffmpeg',
  win:   'winget install Gyan.FFmpeg',
  linux: 'sudo apt install ffmpeg  # or: sudo dnf install ffmpeg',
};

export function FfmpegOnboarding({ visible, onRecheck }: Props) {
  const [tab, setTab] = useState<Tab>('mac');
  const [busy, setBusy] = useState(false);

  if (!visible) return null;

  const handleRecheck = async () => {
    setBusy(true);
    try { await onRecheck(); } finally { setBusy(false); }
  };

  return (
    <div className="ffmpeg-onboarding" role="alert">
      <h3 className="ffmpeg-onboarding__title">
        Install <code>ffmpeg</code> to compress audio and video
      </h3>
      <div className="ffmpeg-onboarding__tabs" role="tablist">
        {(['mac', 'win', 'linux'] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`ffmpeg-onboarding__tab${tab === t ? ' ffmpeg-onboarding__tab--active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'mac' ? 'macOS' : t === 'win' ? 'Windows' : 'Linux'}
          </button>
        ))}
      </div>
      <pre className="ffmpeg-onboarding__cmd"><code>{COMMANDS[tab]}</code></pre>
      <button
        className="ffmpeg-onboarding__recheck"
        onClick={handleRecheck}
        disabled={busy}
      >
        {busy ? 'Checking…' : 'Re-check'}
      </button>
    </div>
  );
}
```

Create `src/components/FfmpegOnboarding.css`:

```css
.ffmpeg-onboarding {
  background: var(--bg-card);
  border: 1px solid var(--accent);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  margin: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ffmpeg-onboarding__title { margin: 0; font-size: 14px; font-weight: 600; }
.ffmpeg-onboarding__title code { padding: 1px 4px; background: var(--bg-elev); border-radius: 3px; }
.ffmpeg-onboarding__tabs { display: flex; gap: 6px; }
.ffmpeg-onboarding__tab {
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-secondary);
}
.ffmpeg-onboarding__tab--active {
  border-color: var(--accent);
  color: var(--accent);
}
.ffmpeg-onboarding__cmd {
  margin: 0;
  background: var(--bg-elev);
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  overflow-x: auto;
}
.ffmpeg-onboarding__recheck {
  align-self: flex-start;
  background: var(--accent);
  color: var(--accent-fg, white);
  border: none;
  border-radius: var(--radius-sm);
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
}
.ffmpeg-onboarding__recheck:disabled { opacity: 0.6; cursor: progress; }
```

- [ ] **Step 17.4: Run test, verify pass**

Run: `npx vitest run src/__tests__/FfmpegOnboarding.test.tsx`
Expected: PASS, three tests.

- [ ] **Step 17.5: Mount FfmpegOnboarding in App.tsx**

In `src/App.tsx`, import the component:

```typescript
import { FfmpegOnboarding } from "./components/FfmpegOnboarding";
```

And conditionally render it inside the `<div className="app">`, after the header and before `<DropZone>`:

```tsx
<FfmpegOnboarding
  visible={ffmpeg.loaded && (!ffmpeg.ffmpeg || !ffmpeg.ffprobe) &&
    (queueFamilies.has('audio') || queueFamilies.has('video'))}
  onRecheck={ffmpeg.recheck}
/>
```

- [ ] **Step 17.6: Run App tests**

Run: `npx vitest run src/__tests__/App.test.tsx`
Expected: PASS.

- [ ] **Step 17.7: Commit**

```bash
git add src/components/FfmpegOnboarding.* src/__tests__/FfmpegOnboarding.test.tsx src/App.tsx
git commit -m "feat(ui): add ffmpeg install onboarding card"
```

---

## Task 18: Family badge, warnings chip, and missing-dependency action in FileRow

**Files:**
- Modify: `src/components/FileRow.tsx`
- Modify: `src/components/FileRow.css`
- Modify: `src/__tests__/FileRow.test.tsx`

- [ ] **Step 18.1: Update FileRow.tsx to render family badge, warnings, and missing-dep action**

Read `src/components/FileRow.tsx` first to see the current layout. Then add:

- A family badge near the filename (uses `FAMILY_META` icon + label, or a compact form).
- A warnings chip when `file.warnings && file.warnings.length > 0`, tooltip-style.
- An inline "Install ffmpeg" action button when `file.errorKind === 'missing_dependency'`, which dispatches a custom event or callback to scroll/focus the onboarding card.

Apply this edit to `src/components/FileRow.tsx`. The exact diff depends on the current file shape, but the necessary additions are:

```typescript
import { FAMILY_META } from "../lib/families";

// inside the FileRow component, alongside filename rendering:
{file.family && (
  <span className={`file-row__family file-row__family--${file.family}`}>
    {FAMILY_META[file.family].icon}
  </span>
)}

// alongside status rendering, when status === 'done':
{file.warnings && file.warnings.length > 0 && (
  <span
    className="file-row__warnings"
    title={file.warnings.join('\n')}
    aria-label={`${file.warnings.length} warning(s)`}
  >
    ⚠ {file.warnings.length}
  </span>
)}

// when status === 'error' && file.errorKind === 'missing_dependency':
{file.status === 'error' && file.errorKind === 'missing_dependency' && (
  <button
    className="file-row__missing-dep"
    onClick={() => {
      document.querySelector('.ffmpeg-onboarding')?.scrollIntoView({ behavior: 'smooth' });
    }}
  >
    Install ffmpeg →
  </button>
)}
```

- [ ] **Step 18.2: Extend FileRow.css with badge/chip/action styles**

Append to `src/components/FileRow.css`:

```css
.file-row__family {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--bg-elev);
  color: var(--text-secondary);
  margin-right: 8px;
}
.file-row__warnings {
  color: var(--warning, #d97706);
  font-size: 12px;
  margin-left: 8px;
  cursor: help;
}
.file-row__missing-dep {
  background: var(--accent);
  color: var(--accent-fg, white);
  border: none;
  border-radius: var(--radius-sm);
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
  margin-left: 8px;
}
```

- [ ] **Step 18.3: Update FileRow tests**

Add to `src/__tests__/FileRow.test.tsx`:

```typescript
it('renders family icon for a done file', () => {
  render(<FileRow file={{
    id: '1', filename: 'a.mp3', path: '/a.mp3', family: 'audio',
    status: 'done', inputBytes: 100, outputBytes: 50,
    reductionPercent: 50, outputPath: '/a-squished.mp3', durationMs: 100,
    warnings: [],
  }} />);
  // FAMILY_META.audio.icon
  expect(screen.getByText('♪')).toBeInTheDocument();
});

it('shows warnings chip when warnings present', () => {
  render(<FileRow file={{
    id: '1', filename: 'a.webp', path: '/a.webp', family: 'image',
    status: 'done', inputBytes: 100, outputBytes: 100,
    reductionPercent: 0, outputPath: '/a-squished.webp', durationMs: 10,
    warnings: ['animated WebP passed through'],
  }} />);
  expect(screen.getByLabelText(/1 warning/)).toBeInTheDocument();
});

it('shows Install ffmpeg action for missing_dependency error', () => {
  render(<FileRow file={{
    id: '1', filename: 'a.mp3', path: '/a.mp3', family: 'audio',
    status: 'error', error: 'missing dependency: ffmpeg',
    errorKind: 'missing_dependency',
  }} />);
  expect(screen.getByRole('button', { name: /Install ffmpeg/i })).toBeInTheDocument();
});
```

- [ ] **Step 18.4: Run FileRow tests**

Run: `npx vitest run src/__tests__/FileRow.test.tsx`
Expected: PASS.

- [ ] **Step 18.5: Commit**

```bash
git add src/components/FileRow.tsx src/components/FileRow.css src/__tests__/FileRow.test.tsx
git commit -m "feat(ui): family badge, warnings chip, missing-dep action on FileRow"
```

---

## Task 19: Per-family counts in Summary

**Files:**
- Modify: `src/components/Summary.tsx`
- Modify: `src/components/Summary.css`
- Create: `src/__tests__/Summary.test.tsx`

- [ ] **Step 19.1: Write the failing test**

Create `src/__tests__/Summary.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Summary } from '../components/Summary';
import type { BatchResult } from '../types';

function buildResult(over: Partial<BatchResult> = {}): BatchResult {
  return {
    total_files: 5,
    success_count: 4,
    error_count: 0,
    skipped_count: 1,
    total_input_bytes: 1024 * 1024,
    total_output_bytes: 512 * 1024,
    total_duration_ms: 1500,
    by_family: {
      image: { total: 2, success: 2, error: 0, skipped: 0 },
      audio: { total: 1, success: 1, error: 0, skipped: 0 },
      video: { total: 0, success: 0, error: 0, skipped: 0 },
      code:  { total: 1, success: 1, error: 0, skipped: 0 },
    },
    ...over,
  };
}

describe('Summary', () => {
  it('renders top-line counts', () => {
    render(<Summary result={buildResult()} />);
    expect(screen.getByText(/Squished 4 files/)).toBeInTheDocument();
  });

  it('renders per-family breakdown for non-empty families', () => {
    render(<Summary result={buildResult()} />);
    expect(screen.getByText(/2 images?/i)).toBeInTheDocument();
    expect(screen.getByText(/1 audio/i)).toBeInTheDocument();
    expect(screen.getByText(/1 code/i)).toBeInTheDocument();
    // video had zero total; should not render a "0 videos" pill
    expect(screen.queryByText(/0 videos?/i)).not.toBeInTheDocument();
  });

  it('renders skipped count', () => {
    render(<Summary result={buildResult({ skipped_count: 3 })} />);
    expect(screen.getByText(/3 skipped/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 19.2: Run test, verify failure**

Run: `npx vitest run src/__tests__/Summary.test.tsx`
Expected: FAIL (per-family pills not yet rendered).

- [ ] **Step 19.3: Update Summary.tsx**

Replace the contents of `src/components/Summary.tsx` with:

```typescript
import type { BatchResult, Family, FamilyStats } from "../types";
import { FAMILY_META } from "../lib/families";
import "./Summary.css";

interface SummaryProps {
  result: BatchResult;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function pluralLabel(fam: Family, count: number): string {
  // FAMILY_META labels are singular; pluralise simply where it reads well.
  const base = FAMILY_META[fam].label.toLowerCase();
  if (count === 1) return base;
  if (fam === 'audio' || fam === 'video' || fam === 'code') return base; // mass-noun feel
  return `${base}s`;
}

export function Summary({ result }: SummaryProps) {
  const saved =
    result.total_input_bytes > 0
      ? (1 - result.total_output_bytes / result.total_input_bytes) * 100
      : 0;

  const families: Family[] = ['image', 'audio', 'video', 'code'];
  const nonEmpty = families
    .map((fam) => [fam, result.by_family[fam]] as [Family, FamilyStats])
    .filter(([, stats]) => stats.total > 0);

  return (
    <div className="summary">
      <span>
        Squished {result.success_count} files
        {" · "}
        {formatBytes(result.total_input_bytes)} → {formatBytes(result.total_output_bytes)}
        {" "}
        ({saved >= 0 ? `-${saved.toFixed(1)}` : `+${Math.abs(saved).toFixed(1)}`}%)
        {" · "}
        {formatDuration(result.total_duration_ms)}
      </span>

      {nonEmpty.length > 0 && (
        <div className="summary__families">
          {nonEmpty.map(([fam, stats]) => (
            <span key={fam} className="summary__family-pill">
              {FAMILY_META[fam].icon} {stats.success} {pluralLabel(fam, stats.success)}
            </span>
          ))}
        </div>
      )}

      {result.skipped_count > 0 && (
        <span className="summary__skipped">{" · "}{result.skipped_count} skipped</span>
      )}
      {result.error_count > 0 && (
        <span className="summary__errors">{" · "}{result.error_count} failed</span>
      )}
    </div>
  );
}
```

- [ ] **Step 19.4: Extend Summary.css**

Append to `src/components/Summary.css`:

```css
.summary__families {
  display: inline-flex;
  gap: 6px;
  margin-left: 8px;
}
.summary__family-pill {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg-elev);
  color: var(--text-secondary);
}
.summary__skipped { color: var(--text-secondary); }
```

- [ ] **Step 19.5: Run Summary test, verify pass**

Run: `npx vitest run src/__tests__/Summary.test.tsx`
Expected: PASS.

- [ ] **Step 19.6: Commit**

```bash
git add src/components/Summary.tsx src/components/Summary.css src/__tests__/Summary.test.tsx
git commit -m "feat(ui): per-family count pills in Summary"
```

---

## Task 20: Full regression + manual smoke test

- [ ] **Step 20.1: Run the full Rust test suite**

Run: `cd src-tauri && cargo test`
Expected: PASS, all tests in `dispatch`, `options`, `ffmpeg`, `commands` modules.

- [ ] **Step 20.2: Run the full TS test suite**

Run: `npx vitest run`
Expected: PASS, all tests.

- [ ] **Step 20.3: Type-check the project**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 20.4: Build the production bundle**

Run: `npm run build`
Expected: tsc + vite build complete with no errors.

- [ ] **Step 20.5: Manual smoke matrix (spec section "Manual smoke matrix")**

Start the app:

```bash
npm run tauri dev
```

Walk through each row of the smoke matrix from the spec:

| Scenario | Pass? |
|---|---|
| ffmpeg absent, drop JPEG | □ |
| ffmpeg absent, drop MP3 | □ |
| ffmpeg installed, click Re-check | □ |
| Mixed folder (img + mp3 + js) | □ |
| Animated WebP | □ |
| TS file with enums | □ |
| Drop unknown extensions | □ |
| Old v1 settings present | □ |

If any scenario fails, investigate the root cause, fix it, run the relevant test (or add one if missing), then re-run the smoke matrix.

To simulate "ffmpeg absent" without uninstalling, temporarily rename the binaries on PATH:

```bash
# macOS/Linux
sudo mv /opt/homebrew/bin/ffmpeg /opt/homebrew/bin/ffmpeg.bak
# Run the test, then restore:
sudo mv /opt/homebrew/bin/ffmpeg.bak /opt/homebrew/bin/ffmpeg
```

To simulate "old v1 settings present":

```javascript
// In the running app's devtools console:
localStorage.removeItem('squish-settings-v2');
localStorage.setItem('squish-settings', JSON.stringify({
  quality: 80, lossless: false, format: 'webp', recursive: true,
  maxWidth: 1920, maxHeight: 1080, suffix: 'small'
}));
location.reload();
```

After reload, open Settings → Image and verify the values were lifted; check `localStorage.getItem('squish-settings')` returns `null` and `localStorage.getItem('squish-settings-v2')` contains the v2 shape.

- [ ] **Step 20.6: No commit unless smoke fixes were needed**

(If any scenario in 20.5 required code changes, those should have been committed in their own focused commits as they were fixed.)

---

## Task 21: Version bump to 0.3.0

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `package.json`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 21.1: Bump `src-tauri/Cargo.toml` version**

```toml
[package]
name = "squish-desktop"
version = "0.3.0"
```

- [ ] **Step 21.2: Bump `package.json` version**

Edit the `"version"` field in `package.json` from `"0.1.0"` to `"0.3.0"`.

- [ ] **Step 21.3: Bump `src-tauri/tauri.conf.json` version**

Edit the top-level `"version"` field from `"0.1.0"` to `"0.3.0"`.

- [ ] **Step 21.4: Rebuild to refresh Cargo.lock**

Run: `cd src-tauri && cargo build`
Expected: Build succeeds; `Cargo.lock` shows the new version for `squish-desktop`.

- [ ] **Step 21.5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock package.json src-tauri/tauri.conf.json
git commit -m "chore(version): bump squish-desktop to 0.3.0"
```

---

## Done

All 21 tasks complete. The release is ready for whatever PR-creation workflow this project uses (e.g., `gh pr create`).
