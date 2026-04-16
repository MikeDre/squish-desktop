# squish desktop

Super fast local image & media compression on your machine. Drag and drop files or folders, get `*_squished.*` siblings alongside the originals. Non-destructive — originals are never touched.

Built with [Tauri 2](https://tauri.app) + React, powered by the same [`squish-core`](https://github.com/MikeDre/squish) compression library as the CLI.

## Install

### Prerequisites

- [Rust](https://rustup.rs) (1.77+)
- [Node.js](https://nodejs.org) (18+)
- Tauri CLI: `cargo install tauri-cli --version "^2"`

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

```bash
git clone https://github.com/MikeDre/squish-desktop.git
cd squish-desktop
npm install
cargo tauri build
```

The built app will be in `src-tauri/target/release/bundle/`.

## Use

1. Open the app
2. Drag images or folders onto the window
3. Watch files compress with per-file progress
4. See before/after sizes and savings for each file

That's it. Sensible defaults mean zero configuration needed.

### Settings

Click the gear icon to adjust:

- **Quality** — 0-100 slider, or Auto for format-specific defaults
- **Format** — convert output to PNG, JPEG, WebP, AVIF, SVG, GIF, or HEIC
- **Lossless** — preserve every bit (overrides quality)

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
cargo tauri dev       # launch dev server with hot reload
npm test              # run frontend tests
cargo test --manifest-path src-tauri/Cargo.toml  # run Rust tests
```

## Architecture

The desktop app is a thin Tauri wrapper around [`squish-core`](https://github.com/MikeDre/squish), the same library that powers the [squish CLI](https://github.com/MikeDre/squish). All compression logic lives in `squish-core` — the desktop app handles drag-and-drop, progress display, and settings.

```
squish-desktop/
├── src-tauri/        # Rust backend (Tauri commands + squish-core)
└── src/              # React frontend (TypeScript)
```

## License

MIT.
