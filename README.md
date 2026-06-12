# squish desktop

Super fast local image & media compression on your machine. Drag and drop files or folders, get `*_squished.*` siblings alongside the originals. Non-destructive - originals are never touched.

Built with [Tauri 2](https://tauri.app) + React, powered by the same [`squish-core`](https://github.com/MikeDre/squish) compression library as the CLI.

## Install

### Prerequisites

- [Rust](https://rustup.rs) (1.95+)
- [Node.js](https://nodejs.org) (18+)

### System dependencies

- **`gifsicle`** (required for GIF compression)
  - macOS: `brew install gifsicle`
  - Linux: `apt install gifsicle`
- **`libheif` + `x265`** (required for HEIC/HEIF)
  - macOS: `brew install libheif x265`
  - Linux: `apt install libheif-dev libx265-dev`
- **`dav1d`** (required for AVIF decoding)
  - macOS: `brew install dav1d`
  - Linux: `apt install libdav1d-dev`

### Build from source

Use the project-local Tauri CLI installed by `npm install`. Do not run
`cargo tauri build`; that relies on a Cargo-installed Tauri CLI instead of the
version locked for this project.

```bash
git clone https://github.com/MikeDre/squish-desktop.git
cd squish-desktop
npm install
npm run tauri -- build
```

The built app will be in `src-tauri/target/release/bundle/`.

## Use

1. Open the app
2. Drag images or folders onto the window
3. Watch files compress with per-file progress
4. See before/after sizes and savings for each file

That's it. Sensible defaults mean zero configuration needed.

### Menu-bar droplet

squish lives in the menu bar. Click the tray icon to pop out a small floating
droplet, then drag files onto it — they're compressed immediately using your
saved settings, with a notification when done. The main window never opens.

- **Launch at login** — enable from the tray menu so squish is always ready.
- The Dock icon hides automatically when only the menu-bar icon is showing.

### Settings

Click the gear icon to adjust:

- **Quality** — 0-100 slider, or Auto for format-specific defaults (images and video)
- **Format** — convert image output to PNG, JPEG, WebP, AVIF, SVG, GIF, or HEIC
- **Video format** — convert video output to MP4, WebM, MOV, or MKV
- **Audio format** — convert audio output to MP3, M4A, OGG, Opus, FLAC, WAV, or AIFF
- **Lossless** — preserve every bit (overrides quality)
- **Resize** — constrain output by max width and/or max height in pixels. Proportional, never upscales.
- **Target size** — fit each image, video, and audio file under a per-file byte budget (KB/MB/GB). Quality and bitrate are chosen automatically; conflicting controls are disabled while set. Code files are unaffected.
- **Output suffix** *(advanced)* — customize the filename suffix on compressed outputs (default `squished` produces `dog_squished.png`)

Settings persist across sessions.

## Formats

| Format | Library |
|---|---|
| PNG | `oxipng` + `imagequant` |
| JPEG | `mozjpeg` (progressive, optimized Huffman) |
| WebP | `libwebp` |
| AVIF | `ravif` (encode) + `dav1d` (decode) |
| SVG | `usvg` (compact serialization) |
| GIF (static + animated) | `gifsicle -O3` |
| HEIC | `libheif-rs` |
| TIFF | input only — converts to JPEG by default |

## Development

```bash
npm install
npm run tauri -- dev  # launch dev server with hot reload
npm test              # run frontend tests
cargo test --manifest-path src-tauri/Cargo.toml  # run Rust tests
```

If `cargo tauri build` fails while compiling `tauri-cli` or `tauri-utils` with a
Rust error like `conflicting implementations of trait From<...HourBase...>`, run
the npm script instead:

```bash
npm install
npm run tauri -- build
```

The npm script uses the `@tauri-apps/cli` version from `package-lock.json`.

## Architecture

The desktop app is a thin Tauri wrapper around [`squish-core`](https://github.com/MikeDre/squish), the same library that powers the [squish CLI](https://github.com/MikeDre/squish). All compression logic lives in `squish-core` — the desktop app handles drag-and-drop, progress display, and settings.

```
squish-desktop/
├── src-tauri/        # Rust backend (Tauri commands + squish-core)
└── src/              # React frontend (TypeScript)
```

## License

MIT.
