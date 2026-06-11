# squish-desktop "Ember Glass" UI redesign

**Date:** 2026-06-11
**Status:** Approved
**Sequencing:** Implemented after the 0.4.0 crate catch-up
(`2026-06-11-desktop-040-catchup-design.md`), as its own branch/PR,
targeting v0.5.0.

## Goal

Restyle squish-desktop as a modern Apple "Liquid Glass"-style app: frosted
glass surfaces over a warm, brand-forward aurora backdrop, with subtle
motion tied to what the app is doing. A reskin, not a relayout — component
tree, layout, and behaviour are unchanged.

## Decisions (made visually via brainstorm mockups)

Mockups: `.superpowers/brainstorm/40909-1781188929/content/`

1. **Glass depth — "Glass on aurora" (option B).** The window stays opaque;
   the app paints its own backdrop and every surface becomes frosted glass
   over it (pure CSS `backdrop-filter`). Identical on every OS. Full window
   transparency / macOS vibrancy (option A) was explicitly rejected.
2. **Palette — "Ember".** Warm plum-to-burnt-orange glows; the squish
   orange becomes the atmosphere. Distinct dark and light variants; the
   existing light/dark/system theme toggle stays.
3. **Motion — "Reactive".** Slow drift at idle (~15–20 s alternating
   cycles); while a batch is compressing the aurora "heats up" (glows
   brighten and breathe, ~2.4 s pulse), settling when done.

## Design

### AuroraBackdrop component

New presentational component `src/components/AuroraBackdrop.tsx` (+ CSS):

- Fixed, `pointer-events: none`, `z-index` below all content.
- Base gradient plus three blurred glow blobs (absolutely positioned divs
  with `border-radius: 50%` and `filter: blur(...)`).
- Props: `active: boolean` — true while `App` status is `processing`;
  toggles the heat-up animation class. Wired from existing
  `state.status` in `App.tsx`.
- Colours come from theme tokens, so the same component renders the dark
  and light Ember variants.

### Design tokens (App.css)

The existing `:root` / `[data-theme="dark"]` token mechanism stays; values
are reworked and extended:

- New glass tokens: `--glass-bg`, `--glass-bg-strong`, `--glass-border`,
  `--glass-blur`, `--glass-highlight` (inset top sheen shadow).
- New backdrop tokens: base gradient stops and three glow colours per
  theme (dark: deep plum base, orange/magenta/coral glows; light: warm
  cream base, softer peach/pink glows).
- `--accent` (squish orange) remains the action colour for buttons,
  drop-zone border emphasis, progress fills.
- Fallback: each glass surface declares a translucent solid `background`
  before the `backdrop-filter` recipe, so unsupported engines degrade to a
  tinted panel. (WKWebView / WebView2 both support `backdrop-filter`.)

### Component restyling

CSS-only updates, all consuming the shared tokens:

- **DropZone** — frosted panel with dashed translucent border; accent
  border emphasis on drag-over.
- **FileRow / FileList** — glass rows with inset top highlight; savings
  pill keeps success green; warnings chip and family badges restyled onto
  glass.
- **Summary** — glass bar; per-family count pills restyled.
- **SettingsPanel** — floating glass sheet with stronger blur
  (`--glass-bg-strong`), reading as a layer above the content.
- **FfmpegOnboarding** — glass card.
- **Theme toggle** — glass chip button.

### Motion & accessibility

- All animation is `transform` / `opacity` only (GPU-composited).
- Drift and heat-up live inside
  `@media (prefers-reduced-motion: no-preference)`; reduced-motion users
  get the still Ember painting.
- Text/contrast pass on glass surfaces in both themes. The light theme is
  the risk area: use darker text tokens and higher-opacity glass there.
  Target WCAG AA for primary and secondary text.

### Testing

- Existing Vitest suites must pass unchanged (no behavioural change).
- New test: `AuroraBackdrop` renders and applies the active/heat class
  from the `active` prop.
- Manual pass: both themes × idle/processing/done, reduced-motion enabled,
  drag-over state, settings sheet open, a batch with warnings and errors.

## Out of scope

- Tauri window transparency / macOS vibrancy (rejected direction A).
- Custom titlebar / traffic-light inset changes.
- App icon refresh.
- Any layout or behaviour changes.
