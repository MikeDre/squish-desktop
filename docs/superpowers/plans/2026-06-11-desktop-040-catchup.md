# squish-desktop 0.4.0 Crate Catch-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade squish-desktop from the v0.3.0 to the v0.4.0 squish crates and surface target-size budgets and video/audio output formats in the UI.

**Architecture:** The four squish crates are pinned by git tag in `src-tauri/Cargo.toml`; the Rust layer maps IPC payloads (`options.rs`) to crate-native options and dispatches per file (`dispatch.rs`). The React layer holds `Settings` in `types.ts`, persists via `lib/settings/`, and serializes the IPC payload in `hooks/useSquish.ts` (`buildPayload`). New features ride those existing paths: a top-level `targetSizeBytes` setting and `format` fields on video/audio settings.

**Tech Stack:** Tauri 2 (Rust), React 18 + TypeScript, Vitest + Testing Library, cargo test.

**Spec:** `docs/superpowers/specs/2026-06-11-desktop-040-catchup-design.md`

**Conventions (md-dev):** commit format `[emoji] [Prefix]: [message] [[branch]]`, imperative mood, ≤50 chars, one logical change per commit. Branch: `feat/0.4.0-catchup` (repo uses `feat/` prefix). All commits are authored solely by the user — no co-author lines.

**Key crate facts (verified against squish v0.4.0 source):**
- `SquishOptions` gains `target_size: Option<u64>`; `SquishResult` now has `warnings: Vec<String>`.
- `VideoOptions` gains `target_size: Option<u64>` and `output_format: Option<VideoFormat>`; `VideoOptions.quality` is a **0–100 dial** (higher = better) converted internally via `quality_to_crf` — it is NOT raw CRF. `VideoCodec::parse` accepts `h264|x264|avc|h265|x265|hevc|av1|svtav1|vp9|libvpx-vp9|copy`.
- `AudioOptions` gains `target_size: Option<u64>` and `output_format: Option<AudioFormat>`; target-size requires a lossy (bitrate-controllable) codec — FLAC/Copy conflict.
- `AudioResult` / `VideoResult` / `CodeResult` have **no** `warnings` field — only images do.
- `VideoFormat::parse` / `AudioFormat::parse` accept extension strings (`"mp4"`, `"mkv"`, `"mp3"`, `"aiff"`, …) and return `Option`.
- Sizes use decimal units (CLI: `500k` = 500,000 bytes). The UI converts KB/MB/GB at ×10³/10⁶/10⁹.

---

### Task 1: Branch, crate bump, version bump, compile fixes

**Files:**
- Modify: `src-tauri/Cargo.toml` (crate pins)
- Modify: `src-tauri/tauri.conf.json:4` (version)
- Modify: `package.json:4` (version)
- Modify: `src-tauri/src/options.rs:59-71` (exhaustive `SquishOptions` init)
- Modify: `src-tauri/src/dispatch.rs:181-191` (image arm warnings)

- [ ] **Step 1: Create the branch**

```bash
git checkout -b feat/0.4.0-catchup
```

- [ ] **Step 2: Bump the four crate pins**

In `src-tauri/Cargo.toml` change every `tag = "v0.3.0"` to `tag = "v0.4.0"`:

```toml
squish-core  = { git = "https://github.com/MikeDre/squish.git", tag = "v0.4.0" }
squish-audio = { git = "https://github.com/MikeDre/squish.git", tag = "v0.4.0" }
squish-video = { git = "https://github.com/MikeDre/squish.git", tag = "v0.4.0" }
squish-code  = { git = "https://github.com/MikeDre/squish.git", tag = "v0.4.0" }
```

- [ ] **Step 3: Bump app versions**

`src-tauri/tauri.conf.json`: `"version": "0.3.0"` → `"version": "0.4.0"`.
`package.json`: `"version": "0.3.0"` → `"version": "0.4.0"`.
Also check `src-tauri/Cargo.toml` `[package] version` — if it reads `0.3.0`, bump to `0.4.0`.

- [ ] **Step 4: Build and fix the two expected compile errors**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`

Expected failure 1 — `options.rs` `ImageOptionsPayload::to_options`: missing field `target_size` (the struct literal is exhaustive). Fix by adding the field as `None` for now (Task 2 wires the real value):

```rust
        SquishOptions {
            quality: self.quality,
            lossless: self.lossless,
            output_format: self.format.as_deref().and_then(Format::parse),
            force_overwrite,
            max_width: self.max_width.filter(|&w| w > 0),
            max_height: self.max_height.filter(|&h| h > 0),
            suffix: normalize_suffix(self.suffix.as_deref()),
            target_size: None,
        }
```

(If v0.4.0 added further fields the compiler names, set them to their `Default` values the same way — the compiler error is the authoritative list.)

Expected failure 2 — none in `dispatch.rs` (it builds), but the image arm still hardcodes `warnings: vec![]` while `SquishResult` now carries real warnings. Update `run_one`'s `FileKind::Image` arm:

```rust
            squish_core::squish_file(path, &o)
                .map(|r| UnifiedResult {
                    input_bytes: r.input_bytes,
                    output_bytes: r.output_bytes,
                    output_path: r.output_path,
                    duration: r.duration,
                    warnings: r.warnings,
                })
                .map_err(Into::into)
```

Audio/video/code arms keep `warnings: vec![]` — those result structs have no warnings field in v0.4.0.

- [ ] **Step 5: Verify everything still passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all existing tests PASS.

Run: `npm test`
Expected: all Vitest suites PASS (no frontend change yet).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json package.json src-tauri/src/options.rs src-tauri/src/dispatch.rs
git commit -m "🔧 Updated: squish crates to v0.4.0 [feat/0.4.0-catchup]"
```

---

### Task 2: Rust — target-size plumbing through payload and mappers

**Files:**
- Modify: `src-tauri/src/options.rs` (payload field + mapper signatures + tests)
- Modify: `src-tauri/src/dispatch.rs:175-239` (`run_one` call sites)

- [ ] **Step 1: Write the failing tests**

Add to the `tests` module in `src-tauri/src/options.rs`:

```rust
    #[test]
    fn target_size_propagates_to_image_video_audio() {
        let ts = Some(1_000_000_u64);
        assert_eq!(ImageOptionsPayload::default().to_options(false, ts).target_size, ts);
        assert_eq!(VideoOptionsPayload::default().to_options(false, ts).target_size, ts);
        assert_eq!(AudioOptionsPayload::default().to_options(false, ts).target_size, ts);
    }

    #[test]
    fn target_size_none_by_default() {
        assert_eq!(ImageOptionsPayload::default().to_options(false, None).target_size, None);
        assert_eq!(VideoOptionsPayload::default().to_options(false, None).target_size, None);
        assert_eq!(AudioOptionsPayload::default().to_options(false, None).target_size, None);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml target_size`
Expected: FAIL to compile — `to_options` takes 1 argument but 2 were supplied.

- [ ] **Step 3: Implement**

In `src-tauri/src/options.rs`:

1. Add the field to `BatchOptionsPayload`:

```rust
#[allow(dead_code)]
#[derive(Deserialize, Default)]
pub struct BatchOptionsPayload {
    pub recursive: bool,
    pub force_overwrite: bool,
    pub target_size: Option<u64>,
    pub image: ImageOptionsPayload,
    pub audio: AudioOptionsPayload,
    pub video: VideoOptionsPayload,
    pub code: CodeOptionsPayload,
}
```

2. Change the three media mappers to take it (`CodeOptionsPayload::to_options` keeps its current `(force_overwrite)` signature — code has no budget):

```rust
impl ImageOptionsPayload {
    pub fn to_options(&self, force_overwrite: bool, target_size: Option<u64>) -> SquishOptions {
        SquishOptions {
            quality: self.quality,
            lossless: self.lossless,
            output_format: self.format.as_deref().and_then(Format::parse),
            force_overwrite,
            max_width: self.max_width.filter(|&w| w > 0),
            max_height: self.max_height.filter(|&h| h > 0),
            suffix: normalize_suffix(self.suffix.as_deref()),
            target_size,
        }
    }
}

impl AudioOptionsPayload {
    pub fn to_options(&self, force_overwrite: bool, target_size: Option<u64>) -> AudioOptions {
        AudioOptions {
            codec: self.codec.as_deref().and_then(AudioCodec::parse),
            bitrate_kbps: self.bitrate_kbps,
            force_overwrite,
            suffix: normalize_suffix(self.suffix.as_deref()),
            target_size,
            ..AudioOptions::default()
        }
    }
}

impl VideoOptionsPayload {
    pub fn to_options(&self, force_overwrite: bool, target_size: Option<u64>) -> VideoOptions {
        VideoOptions {
            force_overwrite,
            suffix: normalize_suffix(self.suffix.as_deref()),
            target_size,
            ..VideoOptions::default()
        }
    }
}
```

3. Update the existing test call sites in `options.rs` that call `to_options(false)` / `to_options(true)` on image/audio/video payloads to `to_options(false, None)` / `to_options(true, None)`. The `CodeOptionsPayload` calls (`code_mapper_passes_source_map_flag`, the code line in `force_overwrite_propagates_to_all_families`) are unchanged.

4. Update `run_one` in `src-tauri/src/dispatch.rs` to pass the budget (code arm unchanged):

```rust
        FileKind::Image => {
            let o = opts.image.to_options(opts.force_overwrite, opts.target_size);
```

```rust
        FileKind::Audio => {
            // ...ffmpeg guard unchanged...
            let o = opts.audio.to_options(opts.force_overwrite, opts.target_size);
```

```rust
        FileKind::Video => {
            // ...ffmpeg guard unchanged...
            let o = opts.video.to_options(opts.force_overwrite, opts.target_size);
```

- [ ] **Step 4: Run all Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS, including the two new tests.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/options.rs src-tauri/src/dispatch.rs
git commit -m "✨ Added: target_size plumbed to media mappers [feat/0.4.0-catchup]"
```

---

### Task 3: Rust — video quality/codec mapping and video/audio output format

**Files:**
- Modify: `src-tauri/src/options.rs` (video + audio payloads, mappers, tests)

- [ ] **Step 1: Write the failing tests**

Add to the `tests` module in `src-tauri/src/options.rs`:

```rust
    #[test]
    fn video_mapper_maps_quality_codec_and_format() {
        let p = VideoOptionsPayload {
            quality: Some(80),
            codec: Some("hevc".into()),
            format: Some("mkv".into()),
            ..Default::default()
        };
        let o = p.to_options(false, None);
        assert_eq!(o.quality, Some(80));
        assert_eq!(o.codec, Some(squish_video::VideoCodec::H265));
        assert_eq!(o.output_format, Some(squish_video::VideoFormat::Mkv));
    }

    #[test]
    fn video_mapper_unknown_codec_and_format_yield_none() {
        let p = VideoOptionsPayload {
            codec: Some("wat".into()),
            format: Some("wat".into()),
            ..Default::default()
        };
        let o = p.to_options(false, None);
        assert_eq!(o.codec, None);
        assert_eq!(o.output_format, None);
    }

    #[test]
    fn audio_mapper_maps_output_format() {
        let p = AudioOptionsPayload {
            format: Some("aiff".into()),
            ..Default::default()
        };
        let o = p.to_options(false, None);
        assert_eq!(o.output_format, Some(squish_audio::AudioFormat::Aiff));

        let p = AudioOptionsPayload {
            format: Some("wat".into()),
            ..Default::default()
        };
        assert_eq!(p.to_options(false, None).output_format, None);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml mapper`
Expected: FAIL to compile — no field `quality`/`format` on the payload structs.

- [ ] **Step 3: Implement**

In `src-tauri/src/options.rs`:

1. Update the payload structs — `crf` becomes `quality` (the old field mapped to nothing; v0.4.0's `VideoOptions.quality` is a 0–100 dial, not raw CRF), and both media payloads gain `format`:

```rust
#[allow(dead_code)]
#[derive(Deserialize, Default)]
pub struct AudioOptionsPayload {
    pub codec: Option<String>, // "copy" | "mp3" | "opus" | "aac" | "flac" | "vorbis" | "alac"
    pub bitrate_kbps: Option<u32>,
    pub format: Option<String>, // AudioFormat::parse input, e.g. "mp3" | "aiff"
    pub suffix: Option<String>,
}

#[allow(dead_code)]
#[derive(Deserialize, Default)]
pub struct VideoOptionsPayload {
    pub codec: Option<String>,   // VideoCodec::parse input, e.g. "h264" | "hevc"
    pub quality: Option<u8>,     // 0-100 dial (NOT raw CRF)
    pub preset: Option<String>,  // payload-only; no crate-side field yet
    pub format: Option<String>,  // VideoFormat::parse input, e.g. "mp4" | "mkv"
    pub suffix: Option<String>,
}
```

2. Add the imports and update the two mappers:

```rust
use squish_audio::{AudioCodec, AudioFormat, AudioOptions};
use squish_video::{VideoCodec, VideoFormat, VideoOptions};
```

```rust
impl AudioOptionsPayload {
    pub fn to_options(&self, force_overwrite: bool, target_size: Option<u64>) -> AudioOptions {
        AudioOptions {
            codec: self.codec.as_deref().and_then(AudioCodec::parse),
            bitrate_kbps: self.bitrate_kbps,
            output_format: self.format.as_deref().and_then(AudioFormat::parse),
            force_overwrite,
            suffix: normalize_suffix(self.suffix.as_deref()),
            target_size,
            ..AudioOptions::default()
        }
    }
}

impl VideoOptionsPayload {
    pub fn to_options(&self, force_overwrite: bool, target_size: Option<u64>) -> VideoOptions {
        VideoOptions {
            quality: self.quality.map(|q| q.min(100)),
            codec: self.codec.as_deref().and_then(VideoCodec::parse),
            output_format: self.format.as_deref().and_then(VideoFormat::parse),
            force_overwrite,
            suffix: normalize_suffix(self.suffix.as_deref()),
            target_size,
            ..VideoOptions::default()
        }
    }
}
```

(If `VideoCodec`/`VideoFormat`/`AudioFormat` aren't re-exported at crate root, the compiler will say so — import from the path it suggests, e.g. `squish_video::format::VideoFormat`.)

3. Remove the now-stale comment block about "VideoOptions 0.3.0" inside the old video mapper.

- [ ] **Step 4: Run all Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/options.rs
git commit -m "✨ Added: video quality/codec and media format mapping [feat/0.4.0-catchup]"
```

---

### Task 4: TypeScript — types, payload, settings migration

**Files:**
- Modify: `src/types.ts`
- Modify: `src/lib/settings/schema.ts`
- Modify: `src/hooks/useSquish.ts:13-41` (`buildPayload`)
- Modify: `src/components/VideoSettings.tsx:30-44` (mechanical `crf` → `quality` rename so the app keeps compiling; full UI work is Task 6/7)
- Test: `src/__tests__/useSquish.test.tsx`, `src/__tests__/migrate.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/__tests__/useSquish.test.tsx` (it already imports `buildPayload`; follow the existing test style in that file):

```tsx
describe("buildPayload target size and formats", () => {
  it("sends target_size and new format fields", () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      targetSizeBytes: 1_000_000,
      video: { ...DEFAULT_SETTINGS.video, quality: 80, format: "mkv" },
      audio: { ...DEFAULT_SETTINGS.audio, format: "mp3" },
    };
    const p = buildPayload(settings);
    expect(p.target_size).toBe(1_000_000);
    expect(p.video.quality).toBeNull(); // nulled: budget controls quality
    expect(p.video.format).toBe("mkv");
    expect(p.audio.format).toBe("mp3");
  });

  it("nulls conflicting fields when a budget is set", () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      targetSizeBytes: 500_000,
      image: { ...DEFAULT_SETTINGS.image, quality: 80, lossless: true },
      audio: { ...DEFAULT_SETTINGS.audio, bitrateKbps: 192, codec: "flac" },
      video: { ...DEFAULT_SETTINGS.video, quality: 90 },
    };
    const p = buildPayload(settings);
    expect(p.image.quality).toBeNull();
    expect(p.image.lossless).toBe(false);
    expect(p.audio.bitrate_kbps).toBeNull();
    expect(p.audio.codec).toBeNull(); // flac is lossless — incompatible with a budget
    expect(p.video.quality).toBeNull();
  });

  it("passes fields through unchanged when no budget is set", () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      image: { ...DEFAULT_SETTINGS.image, quality: 80, lossless: true },
      video: { ...DEFAULT_SETTINGS.video, quality: 90 },
    };
    const p = buildPayload(settings);
    expect(p.target_size).toBeNull();
    expect(p.image.quality).toBe(80);
    expect(p.image.lossless).toBe(true);
    expect(p.video.quality).toBe(90);
  });
});
```

Add to `src/__tests__/migrate.test.ts`:

```ts
it("fills targetSizeBytes and new format fields with defaults on old v2 blobs", () => {
  localStorage.setItem(
    SETTINGS_KEY_V2,
    JSON.stringify({
      recursive: true,
      image: {}, audio: {}, video: { crf: 23 }, code: {},
    }),
  );
  const s = migrateSettings();
  expect(s.targetSizeBytes).toBeNull();
  expect(s.video.quality).toBeNull(); // legacy crf is dropped, not mapped
  expect(s.video.format).toBeNull();
  expect(s.audio.format).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — TS errors (`targetSizeBytes` / `quality` / `format` not in types).

- [ ] **Step 3: Implement the type changes**

In `src/types.ts`:

```ts
export interface AudioSettings {
  codec: AudioCodec | null;
  bitrateKbps: number | null;
  format: string | null;
  suffix: string | null;
}

export interface VideoSettings {
  codec: string | null;
  quality: number | null; // 0-100 dial (maps to VideoOptions.quality)
  preset: string | null;
  format: string | null;
  suffix: string | null;
}

export interface Settings {
  recursive: boolean;
  targetSizeBytes: number | null;
  image: ImageSettings;
  audio: AudioSettings;
  video: VideoSettings;
  code: CodeSettings;
}
```

Update the defaults:

```ts
export const DEFAULT_AUDIO: AudioSettings = {
  codec: null,
  bitrateKbps: null,
  format: null,
  suffix: null,
};

export const DEFAULT_VIDEO: VideoSettings = {
  codec: null,
  quality: null,
  preset: null,
  format: null,
  suffix: null,
};

export const DEFAULT_SETTINGS: Settings = {
  recursive: false,
  targetSizeBytes: null,
  image: DEFAULT_IMAGE,
  audio: DEFAULT_AUDIO,
  video: DEFAULT_VIDEO,
  code: DEFAULT_CODE,
};
```

Add the new dropdown constants next to `FORMAT_OPTIONS`:

```ts
export const VIDEO_FORMAT_OPTIONS = [
  { value: '', label: 'Auto (preserve input)' },
  { value: 'mp4', label: 'MP4' },
  { value: 'webm', label: 'WebM' },
  { value: 'mov', label: 'MOV' },
  { value: 'mkv', label: 'MKV' },
] as const;

export const AUDIO_FORMAT_OPTIONS = [
  { value: '', label: 'Auto (match codec)' },
  { value: 'mp3', label: 'MP3' },
  { value: 'm4a', label: 'M4A' },
  { value: 'ogg', label: 'OGG' },
  { value: 'opus', label: 'Opus' },
  { value: 'flac', label: 'FLAC' },
  { value: 'wav', label: 'WAV' },
  { value: 'aiff', label: 'AIFF' },
] as const;
```

In `src/lib/settings/schema.ts`, `withDefaults` gains the top-level key (legacy `video.crf` keys in stored blobs are simply ignored — the spread fills `quality` from defaults and stray keys are harmless):

```ts
export function withDefaults(partial: Settings): Settings {
  return {
    recursive: partial.recursive ?? DEFAULT_SETTINGS.recursive,
    targetSizeBytes: partial.targetSizeBytes ?? DEFAULT_SETTINGS.targetSizeBytes,
    image: { ...DEFAULT_SETTINGS.image, ...partial.image },
    audio: { ...DEFAULT_SETTINGS.audio, ...partial.audio },
    video: { ...DEFAULT_SETTINGS.video, ...partial.video },
    code:  { ...DEFAULT_SETTINGS.code,  ...partial.code  },
  };
}
```

- [ ] **Step 4: Implement `buildPayload`**

Replace `buildPayload` in `src/hooks/useSquish.ts`. The budget conflicts are resolved here, in one place, so the backend always receives a consistent payload (the UI disable-logic in Task 6 is UX on top of this):

```ts
const LOSSLESS_AUDIO_CODECS = new Set(["flac", "copy"]);

function buildPayload(settings: Settings) {
  const budget = settings.targetSizeBytes;
  const hasBudget = budget != null;
  const audioCodec =
    hasBudget && settings.audio.codec && LOSSLESS_AUDIO_CODECS.has(settings.audio.codec)
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

- [ ] **Step 5: Mechanical rename in VideoSettings.tsx**

So the app compiles, rename the CRF field binding in `src/components/VideoSettings.tsx` (label/UX polish comes in Task 7):

```tsx
      <div className="video-settings__field">
        <label htmlFor="vid-quality">Quality (0–100, higher = better)</label>
        <input
          id="vid-quality"
          type="number"
          min={0}
          max={100}
          disabled={disabled}
          placeholder="default"
          value={value.quality ?? ""}
          onChange={(e) =>
            onChange({ quality: e.target.value === "" ? null : Number(e.target.value) })
          }
        />
      </div>
```

Then sweep for stale references: `grep -rn "crf" src/` — update any remaining hits (e.g. `App.test.tsx` or `SettingsPanel.test.tsx` fixtures using `crf:`) to `quality`.

- [ ] **Step 6: Run all frontend tests**

Run: `npm test`
Expected: PASS, including the new payload and migration tests.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/lib/settings/schema.ts src/hooks/useSquish.ts src/components/VideoSettings.tsx src/__tests__/
git commit -m "✨ Added: targetSizeBytes and media formats in payload [feat/0.4.0-catchup]"
```

---

### Task 5: TargetSizeSetting component

**Files:**
- Create: `src/components/TargetSizeSetting.tsx`
- Create: `src/components/TargetSizeSetting.css`
- Modify: `src/components/SettingsPanel.tsx:74-86` (General section)
- Test: `src/__tests__/TargetSizeSetting.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/TargetSizeSetting.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { TargetSizeSetting } from "../components/TargetSizeSetting";

describe("TargetSizeSetting", () => {
  it("emits bytes using the selected decimal unit", () => {
    const onChange = vi.fn();
    render(<TargetSizeSetting valueBytes={null} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/target size/i), { target: { value: "1.5" } });
    expect(onChange).toHaveBeenLastCalledWith(1_500_000); // MB is the default unit

    fireEvent.change(screen.getByLabelText(/unit/i), { target: { value: "KB" } });
    expect(onChange).toHaveBeenLastCalledWith(1_500); // 1.5 KB
  });

  it("emits null when cleared", () => {
    const onChange = vi.fn();
    render(<TargetSizeSetting valueBytes={2_000_000} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/target size/i), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("displays an existing byte value in the best-fit unit", () => {
    render(<TargetSizeSetting valueBytes={8_000_000} onChange={() => {}} />);
    expect(screen.getByLabelText(/target size/i)).toHaveValue(8);
    expect(screen.getByLabelText(/unit/i)).toHaveValue("MB");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- TargetSizeSetting`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `src/components/TargetSizeSetting.tsx`:

```tsx
import { useState } from "react";
import "./TargetSizeSetting.css";

type Unit = "KB" | "MB" | "GB";

const UNIT_BYTES: Record<Unit, number> = { KB: 1_000, MB: 1_000_000, GB: 1_000_000_000 };

interface Props {
  valueBytes: number | null;
  onChange: (bytes: number | null) => void;
}

function bestFitUnit(bytes: number): Unit {
  if (bytes >= UNIT_BYTES.GB) return "GB";
  if (bytes >= UNIT_BYTES.MB) return "MB";
  return "KB";
}

export function TargetSizeSetting({ valueBytes, onChange }: Props) {
  const [unit, setUnit] = useState<Unit>(() =>
    valueBytes != null ? bestFitUnit(valueBytes) : "MB",
  );

  const amount = valueBytes != null ? valueBytes / UNIT_BYTES[unit] : null;

  const emit = (nextAmount: number | null, nextUnit: Unit): void => {
    onChange(nextAmount == null ? null : Math.round(nextAmount * UNIT_BYTES[nextUnit]));
  };

  return (
    <div className="target-size">
      <div className="target-size__field">
        <label htmlFor="target-size-amount">Target size (per file)</label>
        <div className="target-size__row">
          <input
            id="target-size-amount"
            type="number"
            min={0}
            step="any"
            placeholder="off"
            value={amount ?? ""}
            onChange={(e) =>
              emit(e.target.value === "" ? null : Number(e.target.value), unit)
            }
          />
          <select
            aria-label="Unit"
            value={unit}
            onChange={(e) => {
              const next = e.target.value as Unit;
              setUnit(next);
              if (amount != null) emit(amount, next);
            }}
          >
            <option value="KB">KB</option>
            <option value="MB">MB</option>
            <option value="GB">GB</option>
          </select>
        </div>
        <p className="target-size__hint">
          Fits each image, video, and audio file under this size. Quality and
          bitrate are chosen automatically. Code files are unaffected.
        </p>
      </div>
    </div>
  );
}
```

Create `src/components/TargetSizeSetting.css` (match the field styling used by the sibling settings CSS files — check `ImageSettings.css` for the conventions):

```css
.target-size__row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.target-size__row input {
  flex: 1;
  min-width: 0;
}

.target-size__hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-tertiary);
}
```

- [ ] **Step 4: Wire into SettingsPanel's General section**

In `src/components/SettingsPanel.tsx`, import it and render inside the General section body, after the recursive checkbox label:

```tsx
import { TargetSizeSetting } from "./TargetSizeSetting";
```

```tsx
            {isOpen("general") && (
              <div className="settings-panel__section-body">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.recursive}
                    onChange={(e) => onChange({ recursive: e.target.checked })}
                  />
                  Recurse into subdirectories
                </label>
                <TargetSizeSetting
                  valueBytes={settings.targetSizeBytes}
                  onChange={(bytes) => onChange({ targetSizeBytes: bytes })}
                />
              </div>
            )}
```

Note: `UPDATE_SETTINGS` in `App.tsx` merges top-level keys via spread, so `targetSizeBytes` persists with no reducer change.

- [ ] **Step 5: Run all frontend tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/TargetSizeSetting.tsx src/components/TargetSizeSetting.css src/components/SettingsPanel.tsx src/__tests__/TargetSizeSetting.test.tsx
git commit -m "✨ Added: TargetSizeSetting control in General [feat/0.4.0-catchup]"
```

---

### Task 6: Disable conflicting controls while a budget is set

**Files:**
- Modify: `src/components/ImageSettings.tsx`
- Modify: `src/components/VideoSettings.tsx`
- Modify: `src/components/AudioSettings.tsx`
- Modify: `src/components/SettingsPanel.tsx:102-127` (pass the prop)
- Test: `src/__tests__/SettingsPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `src/__tests__/SettingsPanel.test.tsx` (follow the file's existing render helpers; the settings fixture needs `targetSizeBytes: 1_000_000`):

```tsx
describe("target-size conflict handling", () => {
  function renderWithBudget() {
    const onChange = vi.fn();
    render(
      <SettingsPanel
        settings={{ ...DEFAULT_SETTINGS, targetSizeBytes: 1_000_000 }}
        onChange={onChange}
        queueFamilies={new Set(["image", "audio", "video"])}
        ffmpegAvailable={true}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    return onChange;
  }

  it("disables image quality and lossless", () => {
    renderWithBudget();
    expect(screen.getByLabelText(/^quality$/i)).toBeDisabled();
    expect(screen.getByLabelText(/lossless/i)).toBeDisabled();
  });

  it("disables video quality", () => {
    renderWithBudget();
    expect(screen.getByLabelText(/quality \(0–100/i)).toBeDisabled();
  });

  it("disables audio bitrate and lossless codec options", () => {
    renderWithBudget();
    expect(screen.getByLabelText(/bitrate/i)).toBeDisabled();
    expect(screen.getByRole("option", { name: /flac/i })).toBeDisabled();
    expect(screen.getByRole("option", { name: /copy/i })).toBeDisabled();
  });
});
```

(If `queueFamilies` doesn't auto-expand the sections in the existing test setup, click each section header first — mirror how the file's other tests open sections.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- SettingsPanel`
Expected: FAIL — controls are not disabled.

- [ ] **Step 3: Implement**

1. `ImageSettings.tsx` — add the prop and disable + hint:

```tsx
interface Props {
  value: ImageSettingsType;
  onChange: (update: Partial<ImageSettingsType>) => void;
  targetSizeActive?: boolean;
}

export function ImageSettings({ value, onChange, targetSizeActive = false }: Props) {
```

Add `disabled={targetSizeActive}` to the quality `<input type="range">` and the lossless `<input type="checkbox">`, and directly under the quality field render:

```tsx
      {targetSizeActive && (
        <p className="image-settings__hint">Controlled by target size</p>
      )}
```

Add to `ImageSettings.css`:

```css
.image-settings__hint {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-tertiary);
}
```

2. `VideoSettings.tsx` — add `targetSizeActive?: boolean` to `Props` the same way and change the quality input's disabled to `disabled={disabled || targetSizeActive}`, with the same hint pattern (class `video-settings__hint`, same CSS in `VideoSettings.css`).

3. `AudioSettings.tsx` — add `targetSizeActive?: boolean`; bitrate input becomes `disabled={disabled || targetSizeActive}` with the hint; the codec options disable per-entry:

```tsx
          {AUDIO_CODEC_OPTIONS.map((o) => (
            <option
              key={o.value}
              value={o.value}
              disabled={targetSizeActive && (o.value === "flac" || o.value === "copy")}
            >
              {o.label}
            </option>
          ))}
```

4. `SettingsPanel.tsx` — compute once and pass to the three components:

```tsx
  const targetSizeActive = settings.targetSizeBytes != null;
```

```tsx
                  {fam === "image" && (
                    <ImageSettings
                      value={settings.image}
                      targetSizeActive={targetSizeActive}
                      onChange={(u) =>
                        onChange({ image: { ...settings.image, ...u } })
                      }
                    />
                  )}
```

(add the same `targetSizeActive={targetSizeActive}` prop to the existing `AudioSettings` and `VideoSettings` elements, leaving their `value`/`ffmpegAvailable`/`onChange` props as they are; `CodeSettings` is untouched.)

- [ ] **Step 4: Run all frontend tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ImageSettings.tsx src/components/ImageSettings.css src/components/VideoSettings.tsx src/components/VideoSettings.css src/components/AudioSettings.tsx src/components/AudioSettings.css src/components/SettingsPanel.tsx src/__tests__/SettingsPanel.test.tsx
git commit -m "✨ Added: disable conflicting controls under budget [feat/0.4.0-catchup]"
```

---

### Task 7: Video and audio format dropdowns

**Files:**
- Modify: `src/components/VideoSettings.tsx`
- Modify: `src/components/AudioSettings.tsx`
- Test: `src/__tests__/SettingsPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `src/__tests__/SettingsPanel.test.tsx` (reuse the same render helper pattern as Task 6, but with `targetSizeBytes: null`):

```tsx
describe("media format dropdowns", () => {
  function renderPanel() {
    const onChange = vi.fn();
    render(
      <SettingsPanel
        settings={DEFAULT_SETTINGS}
        onChange={onChange}
        queueFamilies={new Set(["audio", "video"])}
        ffmpegAvailable={true}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    return onChange;
  }

  it("video format select emits the chosen container", () => {
    const onChange = renderPanel();
    fireEvent.change(screen.getByLabelText(/output format/i, { selector: "#vid-format" }), {
      target: { value: "mkv" },
    });
    expect(onChange).toHaveBeenCalledWith({ video: expect.objectContaining({ format: "mkv" }) });
  });

  it("audio format select emits the chosen container", () => {
    const onChange = renderPanel();
    fireEvent.change(screen.getByLabelText(/output format/i, { selector: "#aud-format" }), {
      target: { value: "aiff" },
    });
    expect(onChange).toHaveBeenCalledWith({ audio: expect.objectContaining({ format: "aiff" }) });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- SettingsPanel`
Expected: FAIL — no format selects in the video/audio panels.

- [ ] **Step 3: Implement**

`VideoSettings.tsx` — import `VIDEO_FORMAT_OPTIONS` from `../types` and add after the codec field:

```tsx
      <div className="video-settings__field">
        <label htmlFor="vid-format">Output format</label>
        <select
          id="vid-format"
          disabled={disabled}
          value={value.format ?? ""}
          onChange={(e) => onChange({ format: e.target.value || null })}
        >
          {VIDEO_FORMAT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
```

`AudioSettings.tsx` — import `AUDIO_FORMAT_OPTIONS` and add after the codec field:

```tsx
      <div className="audio-settings__field">
        <label htmlFor="aud-format">Output format</label>
        <select
          id="aud-format"
          disabled={disabled}
          value={value.format ?? ""}
          onChange={(e) => onChange({ format: e.target.value || null })}
        >
          {AUDIO_FORMAT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
```

- [ ] **Step 4: Run all frontend tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/VideoSettings.tsx src/components/AudioSettings.tsx src/__tests__/SettingsPanel.test.tsx
git commit -m "✨ Added: video and audio output format dropdowns [feat/0.4.0-catchup]"
```

---

### Task 8: README, full verification, wrap-up

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README**

1. Prerequisites: `- [Rust](https://rustup.rs) (1.77+)` → `(1.95+)` (v0.4.0 MSRV).
2. In the Settings list, after the **Resize** bullet add:

```markdown
- **Target size** — fit each image, video, and audio file under a per-file byte budget (KB/MB/GB). Quality and bitrate are chosen automatically; conflicting controls are disabled while set.
- **Video format** — convert video output to MP4, WebM, MOV, or MKV.
- **Audio format** — convert audio output to MP3, M4A, OGG, Opus, FLAC, WAV, or AIFF.
```

3. The Settings **Quality** bullet currently describes images only; if it reads as image-specific leave it, otherwise note video quality is also 0–100.

- [ ] **Step 2: Full verification**

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm test
npm run build
```

Expected: all PASS; `npm run build` (tsc + vite) completes with no type errors.

- [ ] **Step 3: Manual smoke test**

Run: `cargo tauri dev`
- Drop one image, one video, one audio file with no budget → all compress as before.
- Set Target size = 1 MB → image quality/lossless, video quality, audio bitrate grey out; FLAC/Copy disabled in codec dropdown.
- Re-drop the three files → each output lands ≤ 1 MB (or a warning chip appears if unreachable).
- Set Video format = MKV, drop a video → output is `.mkv`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "🔧 Updated: README for 0.4.0 settings and MSRV [feat/0.4.0-catchup]"
```

- [ ] **Step 5: Finish the branch**

Use the superpowers:finishing-a-development-branch skill — run the full suites once more, then offer merge/PR options for `feat/0.4.0-catchup` → `main`.
