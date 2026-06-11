# squish-desktop v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add theme system, glassmorphism UI, file picker, recursive folders, reveal in Finder, batch queuing, and system tray to squish-desktop.

**Architecture:** CSS custom properties power the theme system and glassmorphism design tokens. Each feature is an isolated change — useTheme hook for dark mode, tauri-plugin-dialog for file picker, walkdir depth flag for recursion, activeBatches counter for queuing, Tauri tray module for system tray. No new CSS framework.

**Tech Stack:** Tauri 2, React 18, TypeScript, plain CSS with custom properties, tauri-plugin-dialog, Tauri tray API.

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/hooks/useTheme.ts` | Theme detection, localStorage persistence, `data-theme` attribute management |

### Modified Files
| File | Changes |
|------|---------|
| `src/types.ts` | Add `recursive` to Settings, theme types, `activeBatches` to AppState, update AppAction union |
| `src/App.tsx` | Integrate useTheme, update reducer for activeBatches, update handleDrop for queuing, add theme toggle |
| `src/App.css` | CSS custom properties (light/dark tokens), gradient backgrounds, glassmorphism base styles |
| `src/hooks/useSquish.ts` | Pass `recursive` flag in invoke options |
| `src/components/DropZone.tsx` | File picker button, remove processing guard, update status text |
| `src/components/DropZone.css` | Glassmorphism styling, drag-over animation |
| `src/components/SettingsPanel.tsx` | Recursive toggle, glassmorphism styling adjustments |
| `src/components/SettingsPanel.css` | Glassmorphism styling, custom slider/dropdown/toggle |
| `src/components/FileRow.tsx` | Reveal in Finder button, status dot indicators |
| `src/components/FileRow.css` | Glassmorphism cards, status dots, reveal button, row animations |
| `src/components/FileList.css` | Glassmorphism container, updated spacing |
| `src/components/Summary.tsx` | No logic changes, just class name consistency |
| `src/components/Summary.css` | Sticky glass bar, move from FileList.css to own file |
| `src-tauri/Cargo.toml` | Add `tauri-plugin-dialog` dependency, enable tray feature |
| `src-tauri/tauri.conf.json` | Add dialog permission, tray config |
| `src-tauri/capabilities/default.json` | Add dialog permissions |
| `src-tauri/src/lib.rs` | Register dialog plugin, configure tray, handle window close event |
| `src-tauri/src/commands.rs` | Add `recursive` field to SquishOptionsPayload, conditional depth in expand_paths |
| `package.json` | Add `@tauri-apps/plugin-dialog` dependency |
| `src/__tests__/setup.ts` | Add mock for `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-opener` |
| `src/__tests__/App.test.tsx` | Update tests for activeBatches, batch queuing reducer behavior |
| `src/__tests__/useSquish.test.tsx` | Update test to verify recursive flag is passed |
| `src/__tests__/DropZone.test.tsx` | Add test for file picker button, update processing text |
| `src/__tests__/SettingsPanel.test.tsx` | Add test for recursive toggle |
| `src/__tests__/FileRow.test.tsx` | Add test for reveal button visibility |

---

## Task 1: Types & Settings Foundation

**Files:**
- Modify: `src/types.ts`
- Modify: `src/App.tsx` (loadSettings only)
- Test: `src/__tests__/App.test.tsx`

- [ ] **Step 1: Write failing test for new settings defaults**

Add to `src/__tests__/App.test.tsx` after the existing `loadSettings` describe block:

```typescript
describe("loadSettings", () => {
  it("returns defaults when localStorage is empty", () => {
    localStorage.clear();
    const s = loadSettings();
    expect(s.quality).toBeNull();
    expect(s.lossless).toBe(false);
    expect(s.format).toBeNull();
    expect(s.recursive).toBe(false);
  });

  it("merges saved settings with defaults for missing keys", () => {
    localStorage.setItem(
      "squish-settings",
      JSON.stringify({ quality: 80, lossless: true })
    );
    const s = loadSettings();
    expect(s.quality).toBe(80);
    expect(s.lossless).toBe(true);
    expect(s.format).toBeNull();
    expect(s.recursive).toBe(false);
  });
});
```

Replace the existing `loadSettings` describe block with the above (it extends the existing test and adds the new one).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --reporter=verbose 2>&1 | head -60`
Expected: FAIL — `s.recursive` is undefined, not `false`.

- [ ] **Step 3: Update types.ts with new types**

In `src/types.ts`, make these changes:

Add `ThemePreference` and `EffectiveTheme` types after the `FORMAT_OPTIONS` constant:

```typescript
// --- Theme types ---

export type ThemePreference = 'system' | 'light' | 'dark';
export type EffectiveTheme = 'light' | 'dark';
```

Add `recursive: boolean` to the `Settings` interface:

```typescript
export interface Settings {
  quality: number | null;
  lossless: boolean;
  format: string | null;
  recursive: boolean;
}
```

Add `activeBatches: number` to `AppState`:

```typescript
export interface AppState {
  status: AppStatus;
  files: FileEntry[];
  settings: Settings;
  activeBatches: number;
}
```

Update `DEFAULT_SETTINGS`:

```typescript
export const DEFAULT_SETTINGS: Settings = {
  quality: null,
  lossless: false,
  format: null,
  recursive: false,
};
```

- [ ] **Step 4: Update loadSettings in App.tsx**

In `src/App.tsx`, update `loadSettings` to include `recursive`:

```typescript
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
      };
    }
  } catch {
    // Corrupted localStorage — use defaults.
  }
  return { quality: null, lossless: false, format: null, recursive: false };
}
```

Update `initialState` to include `activeBatches`:

```typescript
export function initialState(): AppState {
  return {
    status: "idle",
    files: [],
    settings: loadSettings(),
    activeBatches: 0,
  };
}
```

- [ ] **Step 5: Fix any TypeScript errors in existing tests**

The existing `App.test.tsx` creates `AppState` objects manually. Add `activeBatches: 0` to each. For example, the `prev` objects in the test file need updating:

```typescript
const prev: AppState = {
  ...initialState(),
  status: "done",
  files: [
    { id: "old", filename: "old.png", path: "/old.png", status: "done" },
  ],
};
```

Since these use `...initialState()`, they'll get `activeBatches: 0` automatically. No changes needed for those. But verify with `npm test`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- --reporter=verbose 2>&1 | head -60`
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/App.tsx src/__tests__/App.test.tsx
git commit -m "feat: add recursive, theme types, and activeBatches to state foundation"
```

---

## Task 2: useTheme Hook

**Files:**
- Create: `src/hooks/useTheme.ts`
- Test: `src/__tests__/useTheme.test.tsx` (new)

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/useTheme.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "../hooks/useTheme";

// Mock matchMedia
let mediaQueryListeners: Array<(e: { matches: boolean }) => void> = [];
const mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  addEventListener: vi.fn((_event: string, cb: (e: { matches: boolean }) => void) => {
    mediaQueryListeners.push(cb);
  }),
  removeEventListener: vi.fn(),
}));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: mockMatchMedia,
});

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    mediaQueryListeners = [];
    mockMatchMedia.mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn((_event: string, cb: (e: { matches: boolean }) => void) => {
        mediaQueryListeners.push(cb);
      }),
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to system preference (light)", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("system");
    expect(result.current.effectiveTheme).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("defaults to system preference (dark)", () => {
    mockMatchMedia.mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn((_event: string, cb: (e: { matches: boolean }) => void) => {
        mediaQueryListeners.push(cb);
      }),
      removeEventListener: vi.fn(),
    }));

    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("system");
    expect(result.current.effectiveTheme).toBe("dark");
  });

  it("restores saved preference from localStorage", () => {
    localStorage.setItem("squish-theme", "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
    expect(result.current.effectiveTheme).toBe("dark");
  });

  it("setTheme updates preference and persists", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("dark"));
    expect(result.current.theme).toBe("dark");
    expect(result.current.effectiveTheme).toBe("dark");
    expect(localStorage.getItem("squish-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("setTheme to system follows matchMedia", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("light"));
    expect(result.current.effectiveTheme).toBe("light");
    act(() => result.current.setTheme("system"));
    expect(result.current.theme).toBe("system");
    // matchMedia returns false (light), so effectiveTheme is light
    expect(result.current.effectiveTheme).toBe("light");
  });

  it("cycleTheme goes system -> light -> dark -> system", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("system");
    act(() => result.current.cycleTheme());
    expect(result.current.theme).toBe("light");
    act(() => result.current.cycleTheme());
    expect(result.current.theme).toBe("dark");
    act(() => result.current.cycleTheme());
    expect(result.current.theme).toBe("system");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --reporter=verbose 2>&1 | head -40`
Expected: FAIL — module `../hooks/useTheme` not found.

- [ ] **Step 3: Implement useTheme hook**

Create `src/hooks/useTheme.ts`:

```typescript
import { useState, useEffect, useCallback } from "react";
import type { ThemePreference, EffectiveTheme } from "../types";

const THEME_KEY = "squish-theme";

function getSystemTheme(): EffectiveTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveTheme(preference: ThemePreference): EffectiveTheme {
  return preference === "system" ? getSystemTheme() : preference;
}

function loadThemePreference(): ThemePreference {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemePreference>(loadThemePreference);
  const [effectiveTheme, setEffectiveTheme] = useState<EffectiveTheme>(() =>
    resolveTheme(loadThemePreference())
  );

  // Apply theme to DOM and update effective theme
  useEffect(() => {
    const resolved = resolveTheme(theme);
    setEffectiveTheme(resolved);
    document.documentElement.setAttribute("data-theme", resolved);
  }, [theme]);

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent | { matches: boolean }) => {
      const resolved: EffectiveTheme = e.matches ? "dark" : "light";
      setEffectiveTheme(resolved);
      document.documentElement.setAttribute("data-theme", resolved);
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((preference: ThemePreference) => {
    setThemeState(preference);
    localStorage.setItem(THEME_KEY, preference);
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((current) => {
      const next: ThemePreference =
        current === "system" ? "light" : current === "light" ? "dark" : "system";
      localStorage.setItem(THEME_KEY, next);
      return next;
    });
  }, []);

  return { theme, effectiveTheme, setTheme, cycleTheme };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --reporter=verbose 2>&1 | head -40`
Expected: All useTheme tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTheme.ts src/__tests__/useTheme.test.tsx
git commit -m "feat: useTheme hook with system detection, manual override, and cycling"
```

---

## Task 3: CSS Custom Properties & Glassmorphism Tokens

**Files:**
- Modify: `src/App.css`

This task has no tests — it's purely visual CSS. Verification is visual in the dev server.

- [ ] **Step 1: Replace App.css with design tokens and glassmorphism foundation**

Replace the entire contents of `src/App.css`:

```css
/* --- Design Tokens --- */

:root {
  --bg-gradient-start: #e8ecf1;
  --bg-gradient-end: #d5dbe5;
  --bg-primary: rgba(255, 255, 255, 0.72);
  --bg-surface: rgba(255, 255, 255, 0.5);
  --bg-glass: rgba(255, 255, 255, 0.4);
  --bg-glass-strong: rgba(255, 255, 255, 0.6);
  --text-primary: #1a1a1a;
  --text-secondary: #666;
  --text-tertiary: #999;
  --border: rgba(0, 0, 0, 0.08);
  --border-light: rgba(0, 0, 0, 0.04);
  --shadow-sm: 0 1px 8px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 2px 20px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 8px 40px rgba(0, 0, 0, 0.08);
  --blur: 20px;
  --blur-strong: 40px;
  --accent: #5B7FFF;
  --accent-hover: #4A6FEF;
  --accent-glow: rgba(91, 127, 255, 0.3);
  --success: #34C759;
  --success-glow: rgba(52, 199, 89, 0.2);
  --error: #FF3B30;
  --error-glow: rgba(255, 59, 48, 0.2);
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --transition: 0.2s ease;
}

[data-theme="dark"] {
  --bg-gradient-start: #1a1a2e;
  --bg-gradient-end: #16213e;
  --bg-primary: rgba(30, 30, 30, 0.85);
  --bg-surface: rgba(45, 45, 45, 0.6);
  --bg-glass: rgba(50, 50, 50, 0.5);
  --bg-glass-strong: rgba(60, 60, 60, 0.7);
  --text-primary: #f0f0f0;
  --text-secondary: #999;
  --text-tertiary: #666;
  --border: rgba(255, 255, 255, 0.08);
  --border-light: rgba(255, 255, 255, 0.04);
  --shadow-sm: 0 1px 8px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 2px 20px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 8px 40px rgba(0, 0, 0, 0.4);
  --accent: #7B9FFF;
  --accent-hover: #6B8FEF;
  --accent-glow: rgba(123, 159, 255, 0.3);
  --success: #30D158;
  --success-glow: rgba(48, 209, 88, 0.2);
  --error: #FF453A;
  --error-glow: rgba(255, 69, 58, 0.2);
}

/* --- Global Reset & Base --- */

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text",
    system-ui, -system-ui, sans-serif;
  background: linear-gradient(135deg, var(--bg-gradient-start), var(--bg-gradient-end));
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  min-height: 100vh;
}

/* --- App Shell --- */

.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 16px;
  gap: 12px;
}

/* --- App Header --- */

.app__header {
  display: flex;
  justify-content: flex-end;
  padding: 0 4px;
}

/* --- Theme Toggle --- */

.theme-toggle {
  background: var(--bg-glass);
  backdrop-filter: blur(var(--blur));
  -webkit-backdrop-filter: blur(var(--blur));
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 16px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition);
}

.theme-toggle:hover {
  background: var(--bg-glass-strong);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}
```

- [ ] **Step 2: Verify app compiles**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds (TypeScript + Vite).

- [ ] **Step 3: Commit**

```bash
git add src/App.css
git commit -m "feat: CSS custom properties with light/dark tokens and glassmorphism foundation"
```

---

## Task 4: Glassmorphism Component Styles

**Files:**
- Modify: `src/components/DropZone.css`
- Modify: `src/components/SettingsPanel.css`
- Modify: `src/components/FileRow.css`
- Modify: `src/components/FileList.css`
- Create: `src/components/Summary.css`
- Modify: `src/components/Summary.tsx` (add CSS import)

- [ ] **Step 1: Replace DropZone.css**

```css
.dropzone {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  background: var(--bg-glass);
  backdrop-filter: blur(var(--blur));
  -webkit-backdrop-filter: blur(var(--blur));
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  transition: all var(--transition);
  cursor: default;
  user-select: none;
}

.dropzone--drag-over {
  border-color: var(--accent);
  background: var(--bg-surface);
  box-shadow: var(--shadow-lg), 0 0 0 3px var(--accent-glow);
  transform: scale(1.01);
}

.dropzone--processing {
  opacity: 0.85;
}

.dropzone__content {
  text-align: center;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.dropzone__icon {
  font-size: 32px;
  opacity: 0.5;
  transition: opacity var(--transition);
}

.dropzone--drag-over .dropzone__icon {
  opacity: 0.8;
}

.dropzone__text {
  font-size: 15px;
  font-weight: 400;
  color: var(--text-secondary);
  margin: 0;
}

.dropzone__browse-btn {
  background: var(--bg-glass-strong);
  backdrop-filter: blur(var(--blur));
  -webkit-backdrop-filter: blur(var(--blur));
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--accent);
  font-size: 13px;
  font-weight: 500;
  padding: 6px 16px;
  cursor: pointer;
  transition: all var(--transition);
}

.dropzone__browse-btn:hover {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
  box-shadow: var(--shadow-sm);
}

.dropzone__browse-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
```

- [ ] **Step 2: Replace SettingsPanel.css**

```css
.settings-panel {
  background: var(--bg-glass);
  backdrop-filter: blur(var(--blur));
  -webkit-backdrop-filter: blur(var(--blur));
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.settings-panel__toggle {
  background: none;
  border: none;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 10px 14px;
  width: 100%;
  text-align: left;
  transition: color var(--transition);
  display: flex;
  align-items: center;
  gap: 6px;
}

.settings-panel__toggle:hover {
  color: var(--text-primary);
}

.settings-panel__toggle-icon {
  display: inline-block;
  transition: transform 0.3s ease;
  font-size: 14px;
}

.settings-panel__toggle-icon--open {
  transform: rotate(90deg);
}

.settings-panel__body {
  padding: 0 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  animation: settings-slide-in 0.2s ease;
}

@keyframes settings-slide-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.settings-panel__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.settings-panel__field label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.settings-panel__field select {
  padding: 7px 10px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-primary);
  transition: border-color var(--transition);
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  padding-right: 28px;
}

.settings-panel__field select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-glow);
}

.settings-panel__quality-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.settings-panel__quality-row input[type="range"] {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--border);
  border-radius: 2px;
  outline: none;
}

.settings-panel__quality-row input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  transition: transform var(--transition);
}

.settings-panel__quality-row input[type="range"]::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}

.settings-panel__auto-label {
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-secondary);
}

.settings-panel__quality-value {
  font-size: 13px;
  font-weight: 600;
  min-width: 28px;
  text-align: right;
  color: var(--accent);
}

.settings-panel__checkbox-label {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-primary);
  cursor: pointer;
}
```

- [ ] **Step 3: Replace FileRow.css**

```css
.file-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--bg-glass);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  gap: 12px;
  transition: all var(--transition);
  animation: row-enter 0.25s ease;
}

@keyframes row-enter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.file-row:hover {
  background: var(--bg-surface);
}

.file-row__status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.file-row--compressing .file-row__status-dot {
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent-glow);
  animation: pulse-dot 1.5s ease-in-out infinite;
}

.file-row--done .file-row__status-dot {
  background: var(--success);
}

.file-row--error .file-row__status-dot {
  background: var(--error);
}

.file-row--pending .file-row__status-dot {
  background: var(--text-tertiary);
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.file-row__name {
  font-size: 13px;
  font-weight: 500;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  color: var(--text-primary);
}

.file-row__progress {
  flex: 0 0 100px;
}

.file-row__progress-bar {
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}

.file-row__progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  animation: progress-indeterminate 1.5s ease-in-out infinite;
}

@keyframes progress-indeterminate {
  0% { width: 0%; margin-left: 0%; }
  50% { width: 60%; margin-left: 20%; }
  100% { width: 0%; margin-left: 100%; }
}

.file-row__result {
  display: flex;
  gap: 10px;
  align-items: center;
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.file-row__savings {
  font-weight: 600;
  color: var(--success);
}

.file-row__reveal-btn {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  border-radius: 4px;
  opacity: 0;
  transition: all var(--transition);
}

.file-row:hover .file-row__reveal-btn {
  opacity: 0.6;
}

.file-row__reveal-btn:hover {
  opacity: 1 !important;
  color: var(--accent);
  background: var(--bg-glass);
}

.file-row__error {
  font-size: 12px;
  color: var(--error);
  flex: 1;
  text-align: right;
}

.file-row--error .file-row__name {
  color: var(--error);
}
```

- [ ] **Step 4: Replace FileList.css (remove Summary styles from it)**

```css
.file-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-glass);
  backdrop-filter: blur(var(--blur));
  -webkit-backdrop-filter: blur(var(--blur));
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
}

.file-list__rows {
  max-height: 400px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
}

.file-list__rows::-webkit-scrollbar {
  width: 6px;
}

.file-list__rows::-webkit-scrollbar-track {
  background: transparent;
}

.file-list__rows::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}
```

- [ ] **Step 5: Create Summary.css**

Create `src/components/Summary.css`:

```css
.summary {
  padding: 12px 14px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--bg-glass-strong);
  backdrop-filter: blur(var(--blur-strong));
  -webkit-backdrop-filter: blur(var(--blur-strong));
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 1;
}

.summary__stat {
  color: var(--text-primary);
  font-weight: 600;
}

.summary__errors {
  color: var(--error);
  font-weight: 600;
}
```

- [ ] **Step 6: Add CSS import to Summary.tsx**

In `src/components/Summary.tsx`, add the import at the top (after the type import):

```typescript
import type { BatchResult } from "../types";
import "./Summary.css";
```

- [ ] **Step 7: Verify build compiles**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/components/DropZone.css src/components/SettingsPanel.css src/components/FileRow.css src/components/FileList.css src/components/Summary.css src/components/Summary.tsx
git commit -m "feat: glassmorphism component styles with design tokens"
```

---

## Task 5: Theme Toggle in App + useTheme Integration

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Integrate useTheme into App**

Update `src/App.tsx`:

Add the import:
```typescript
import { useTheme } from "./hooks/useTheme";
```

Inside the `App` function, add the hook call after the existing hooks:
```typescript
const { effectiveTheme, cycleTheme, theme } = useTheme();
```

Update the JSX return to add the header with theme toggle:
```tsx
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
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Run all tests**

Run: `npm test -- --reporter=verbose 2>&1 | head -60`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: integrate theme toggle in app header"
```

---

## Task 6: Batch Queuing — Reducer Changes

**Files:**
- Modify: `src/App.tsx` (reducer + handleDrop)
- Test: `src/__tests__/App.test.tsx`

- [ ] **Step 1: Write failing tests for batch queuing**

Add these tests to the `appReducer` describe block in `src/__tests__/App.test.tsx`:

```typescript
it("START_BATCH increments activeBatches", () => {
  const state = appReducer(initialState(), { type: "START_BATCH" });
  expect(state.activeBatches).toBe(1);
});

it("START_BATCH during processing appends without clearing files", () => {
  const prev: AppState = {
    ...initialState(),
    status: "processing",
    activeBatches: 1,
    files: [
      { id: "1", filename: "a.png", path: "/a.png", status: "done" },
    ],
  };
  const state = appReducer(prev, { type: "START_BATCH" });
  expect(state.activeBatches).toBe(2);
  expect(state.files).toHaveLength(1); // files preserved
  expect(state.status).toBe("processing");
});

it("START_BATCH when idle/done clears files", () => {
  const prev: AppState = {
    ...initialState(),
    status: "done",
    activeBatches: 0,
    files: [
      { id: "1", filename: "a.png", path: "/a.png", status: "done" },
    ],
  };
  const state = appReducer(prev, { type: "START_BATCH" });
  expect(state.files).toHaveLength(0);
  expect(state.activeBatches).toBe(1);
});

it("BATCH_COMPLETE decrements activeBatches", () => {
  const prev: AppState = {
    ...initialState(),
    status: "processing",
    activeBatches: 2,
  };
  const state = appReducer(prev, { type: "BATCH_COMPLETE" });
  expect(state.activeBatches).toBe(1);
  expect(state.status).toBe("processing"); // still processing
});

it("BATCH_COMPLETE transitions to done when activeBatches reaches 0", () => {
  const prev: AppState = {
    ...initialState(),
    status: "processing",
    activeBatches: 1,
  };
  const state = appReducer(prev, { type: "BATCH_COMPLETE" });
  expect(state.activeBatches).toBe(0);
  expect(state.status).toBe("done");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --reporter=verbose 2>&1 | head -80`
Expected: New tests FAIL (activeBatches not tracked correctly yet).

- [ ] **Step 3: Update appReducer for batch queuing**

In `src/App.tsx`, replace the `START_BATCH` and `BATCH_COMPLETE` cases in `appReducer`:

```typescript
case "START_BATCH": {
  const isActive = state.status === "processing";
  return {
    ...state,
    status: "processing",
    files: isActive ? state.files : [],
    activeBatches: state.activeBatches + 1,
  };
}
```

```typescript
case "BATCH_COMPLETE": {
  const remaining = state.activeBatches - 1;
  return {
    ...state,
    status: remaining <= 0 ? "done" : "processing",
    activeBatches: Math.max(0, remaining),
  };
}
```

- [ ] **Step 4: Update handleDrop to remove processing guard**

In `src/App.tsx`, update `handleDrop`:

```typescript
const handleDrop = useCallback(
  async (paths: string[]) => {
    if (state.status !== "processing") {
      setBatchResult(null);
    }
    dispatch({ type: "START_BATCH" });

    const result = await squishFiles(paths);
    if (result) {
      setBatchResult(result);
    }
  },
  [state.status, squishFiles]
);
```

- [ ] **Step 5: Update existing tests that check old START_BATCH behavior**

The existing test `"START_BATCH clears previous files"` should be updated. It starts from `status: "done"` so it will still clear. But the test `"START_BATCH transitions to processing and clears files"` starts from `initialState()` which has `status: "idle"` — this should still work. Verify existing tests still match the new semantics.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- --reporter=verbose 2>&1 | head -80`
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/__tests__/App.test.tsx
git commit -m "feat: batch queuing with activeBatches counter in reducer"
```

---

## Task 7: File Picker — Backend Plugin Setup

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `package.json`

- [ ] **Step 1: Add tauri-plugin-dialog to Cargo.toml**

In `src-tauri/Cargo.toml`, add to `[dependencies]`:

```toml
tauri-plugin-dialog = "2"
```

- [ ] **Step 2: Register the plugin in lib.rs**

In `src-tauri/src/lib.rs`, add the dialog plugin:

```rust
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_version,
            commands::squish_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Add dialog permissions to capabilities**

Update `src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "dialog:default"
  ]
}
```

- [ ] **Step 4: Add @tauri-apps/plugin-dialog to package.json**

Run:
```bash
npm install @tauri-apps/plugin-dialog
```

- [ ] **Step 5: Add mock for dialog plugin in test setup**

In `src/__tests__/setup.ts`, add:

```typescript
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(() => Promise.resolve(null)),
}));
```

- [ ] **Step 6: Verify Rust compiles**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`
Expected: Compiles successfully.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/capabilities/default.json package.json package-lock.json src/__tests__/setup.ts
git commit -m "feat: add tauri-plugin-dialog for native file picker"
```

---

## Task 8: File Picker — Frontend Button

**Files:**
- Modify: `src/components/DropZone.tsx`
- Test: `src/__tests__/DropZone.test.tsx`

- [ ] **Step 1: Write failing test for browse button**

Add to `src/__tests__/DropZone.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DropZone } from "../components/DropZone";

describe("DropZone", () => {
  it("renders drop prompt when idle", () => {
    render(<DropZone status="idle" onDrop={vi.fn()} />);
    expect(screen.getByText(/drop files here/i)).toBeInTheDocument();
  });

  it("shows processing state with drop-more text", () => {
    render(<DropZone status="processing" onDrop={vi.fn()} />);
    expect(screen.getByText(/drop more files/i)).toBeInTheDocument();
  });

  it("shows ready for more when done", () => {
    render(<DropZone status="done" onDrop={vi.fn()} />);
    expect(screen.getByText(/drop files here/i)).toBeInTheDocument();
  });

  it("renders a browse button", () => {
    render(<DropZone status="idle" onDrop={vi.fn()} />);
    expect(screen.getByRole("button", { name: /browse/i })).toBeInTheDocument();
  });

  it("calls onDrop when browse selects files", async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const mockOpen = vi.mocked(open);
    mockOpen.mockResolvedValueOnce([
      { path: "/tmp/a.png", name: "a.png" },
    ] as any);

    const user = userEvent.setup();
    const onDrop = vi.fn();
    render(<DropZone status="idle" onDrop={onDrop} />);

    await user.click(screen.getByRole("button", { name: /browse/i }));
    expect(mockOpen).toHaveBeenCalledWith({
      multiple: true,
      directory: false,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --reporter=verbose 2>&1 | head -40`
Expected: FAIL — browse button not found, text matchers may fail.

- [ ] **Step 3: Update DropZone.tsx with file picker and new text**

Replace `src/components/DropZone.tsx`:

```typescript
import { useEffect, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open } from "@tauri-apps/plugin-dialog";
import type { AppStatus } from "../types";
import "./DropZone.css";

interface DropZoneProps {
  status: AppStatus;
  onDrop: (paths: string[]) => void;
}

export function DropZone({ status, onDrop }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function setupDragDrop() {
      try {
        const appWindow = getCurrentWebviewWindow();
        const unlisten = await appWindow.onDragDropEvent((event) => {
          if (cancelled) return;

          if (event.payload.type === "over") {
            setIsDragOver(true);
          } else if (event.payload.type === "drop") {
            setIsDragOver(false);
            onDrop(event.payload.paths);
          } else if (event.payload.type === "leave") {
            setIsDragOver(false);
          }
        });
        unlistenRef.current = unlisten;
      } catch {
        // Outside Tauri runtime (tests) — no-op.
      }
    }

    setupDragDrop();

    return () => {
      cancelled = true;
      unlistenRef.current?.();
    };
  }, [onDrop]);

  const handleBrowse = async () => {
    try {
      const result = await open({ multiple: true, directory: false });
      if (result && Array.isArray(result)) {
        const paths = result.map((f) =>
          typeof f === "string" ? f : f.path
        );
        if (paths.length > 0) {
          onDrop(paths);
        }
      }
    } catch {
      // User cancelled or dialog error — no-op.
    }
  };

  const statusText = () => {
    if (status === "processing") return "Drop more files to add to queue";
    return "Drop files here to compress";
  };

  const className = [
    "dropzone",
    isDragOver ? "dropzone--drag-over" : "",
    status === "processing" ? "dropzone--processing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      <div className="dropzone__content">
        <div className="dropzone__icon">📁</div>
        <p className="dropzone__text">{statusText()}</p>
        <button
          className="dropzone__browse-btn"
          onClick={handleBrowse}
          aria-label="Browse files"
        >
          Browse files
        </button>
      </div>
    </div>
  );
}
```

Key changes:
- Removed the `status !== "processing"` guard from drag-drop (batch queuing).
- Removed `status` from the effect dependency array (no longer needed for the guard).
- Added `open` import from dialog plugin.
- Added `handleBrowse` function.
- Added browse button and icon to JSX.
- Updated status text for processing state.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --reporter=verbose 2>&1 | head -60`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/DropZone.tsx src/__tests__/DropZone.test.tsx
git commit -m "feat: file picker button with native dialog and batch queuing drop support"
```

---

## Task 9: Recursive Folder Toggle — Backend

**Files:**
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Add recursive field to SquishOptionsPayload**

In `src-tauri/src/commands.rs`, update `SquishOptionsPayload`:

```rust
#[derive(Deserialize)]
pub struct SquishOptionsPayload {
    pub quality: Option<u8>,
    pub lossless: bool,
    pub format: Option<String>,
    pub recursive: bool,
}
```

- [ ] **Step 2: Update expand_paths to accept recursive flag**

Change the signature and implementation of `expand_paths`:

```rust
/// Expand paths: files pass through, directories are walked.
/// When recursive is false, only top-level files in directories are included.
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
```

- [ ] **Step 3: Update squish_files to pass recursive flag**

In the `squish_files` function, change the `expand_paths` call:

```rust
let all_files = expand_paths(&paths, options.recursive);
```

- [ ] **Step 4: Update the expand_paths test**

Update the existing test to match the new signature:

```rust
#[test]
fn expand_paths_with_nonexistent_path_returns_empty() {
    let result = expand_paths(&["/nonexistent/path/xyz".into()], false);
    assert!(result.is_empty());
}
```

- [ ] **Step 5: Verify Rust compiles and tests pass**

Run: `cd src-tauri && cargo test 2>&1 | tail -10`
Expected: All Rust tests pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: recursive directory expansion flag in squish_files"
```

---

## Task 10: Recursive Folder Toggle — Frontend

**Files:**
- Modify: `src/hooks/useSquish.ts`
- Modify: `src/components/SettingsPanel.tsx`
- Test: `src/__tests__/SettingsPanel.test.tsx`
- Test: `src/__tests__/useSquish.test.tsx`

- [ ] **Step 1: Write failing test for recursive toggle**

Add to `src/__tests__/SettingsPanel.test.tsx`:

```typescript
it("shows recursive toggle when expanded", async () => {
  const user = userEvent.setup();
  render(
    <SettingsPanel settings={DEFAULT_SETTINGS} onChange={vi.fn()} />
  );
  await user.click(screen.getByRole("button", { name: /settings/i }));
  expect(screen.getByLabelText(/include subfolders/i)).toBeInTheDocument();
});

it("calls onChange when recursive is toggled", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <SettingsPanel settings={DEFAULT_SETTINGS} onChange={onChange} />
  );
  await user.click(screen.getByRole("button", { name: /settings/i }));
  await user.click(screen.getByLabelText(/include subfolders/i));
  expect(onChange).toHaveBeenCalledWith({ recursive: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --reporter=verbose 2>&1 | head -60`
Expected: FAIL — "include subfolders" not found.

- [ ] **Step 3: Add recursive toggle to SettingsPanel**

In `src/components/SettingsPanel.tsx`, add the recursive checkbox after the lossless field (inside the `settings-panel__body` div):

```tsx
<div className="settings-panel__field">
  <label className="settings-panel__checkbox-label">
    <input
      type="checkbox"
      checked={settings.recursive}
      onChange={(e) => onChange({ recursive: e.target.checked })}
      aria-label="Include subfolders"
    />
    Include subfolders
  </label>
</div>
```

Also update the lossless label to use the new class name for consistency:

```tsx
<div className="settings-panel__field">
  <label className="settings-panel__checkbox-label">
    <input
      type="checkbox"
      checked={settings.lossless}
      onChange={(e) => onChange({ lossless: e.target.checked })}
      aria-label="Lossless"
    />
    Lossless compression
  </label>
</div>
```

- [ ] **Step 4: Update useSquish to pass recursive flag**

In `src/hooks/useSquish.ts`, update the `invoke` call in `squishFiles`:

```typescript
const result = await invoke<BatchResult>("squish_files", {
  paths,
  options: {
    quality: settingsRef.current.quality,
    lossless: settingsRef.current.lossless,
    format: settingsRef.current.format,
    recursive: settingsRef.current.recursive,
  },
});
```

- [ ] **Step 5: Update useSquish test for recursive flag**

In `src/__tests__/useSquish.test.tsx`, update the `settings` in `beforeEach`:

```typescript
settings = { quality: null, lossless: false, format: null, recursive: false };
```

Update the test assertion:

```typescript
expect(mockInvoke).toHaveBeenCalledWith("squish_files", {
  paths: ["/tmp/a.png"],
  options: { quality: null, lossless: false, format: null, recursive: false },
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- --reporter=verbose 2>&1 | head -80`
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/SettingsPanel.tsx src/hooks/useSquish.ts src/__tests__/SettingsPanel.test.tsx src/__tests__/useSquish.test.tsx
git commit -m "feat: recursive folder toggle in settings with backend pass-through"
```

---

## Task 11: Reveal in Finder

**Files:**
- Modify: `src/components/FileRow.tsx`
- Modify: `src/__tests__/setup.ts`
- Test: `src/__tests__/FileRow.test.tsx`

- [ ] **Step 1: Add opener mock to test setup**

In `src/__tests__/setup.ts`, add:

```typescript
vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: vi.fn(() => Promise.resolve()),
}));
```

- [ ] **Step 2: Write failing test for reveal button**

Add to `src/__tests__/FileRow.test.tsx`:

```typescript
it("shows reveal button when done", () => {
  const doneWithPath: FileEntry = {
    ...done,
    outputPath: "/tmp/photo_squished.png",
  };
  render(<FileRow file={doneWithPath} />);
  expect(screen.getByRole("button", { name: /show in finder/i })).toBeInTheDocument();
});

it("does not show reveal button when compressing", () => {
  render(<FileRow file={compressing} />);
  expect(screen.queryByRole("button", { name: /show in finder/i })).not.toBeInTheDocument();
});

it("does not show reveal button when error", () => {
  render(<FileRow file={error} />);
  expect(screen.queryByRole("button", { name: /show in finder/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- --reporter=verbose 2>&1 | head -60`
Expected: FAIL — "show in finder" button not found.

- [ ] **Step 4: Update FileRow.tsx with reveal button and status dots**

Replace `src/components/FileRow.tsx`:

```typescript
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { FileEntry } from "../types";
import "./FileRow.css";

interface FileRowProps {
  file: FileEntry;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileRow({ file }: FileRowProps) {
  const handleReveal = async () => {
    if (file.outputPath) {
      try {
        await revealItemInDir(file.outputPath);
      } catch {
        // Opener failed — no-op.
      }
    }
  };

  return (
    <div className={`file-row file-row--${file.status}`}>
      <div className="file-row__status-dot" />
      <div className="file-row__name">{file.filename}</div>

      {(file.status === "pending" || file.status === "compressing") && (
        <div className="file-row__progress">
          <div
            role="progressbar"
            className="file-row__progress-bar"
            aria-label={`Compressing ${file.filename}`}
          >
            <div className="file-row__progress-fill" />
          </div>
        </div>
      )}

      {file.status === "done" && file.inputBytes != null && file.outputBytes != null && (
        <div className="file-row__result">
          <span className="file-row__sizes">
            {formatBytes(file.inputBytes)} → {formatBytes(file.outputBytes)}
          </span>
          <span className="file-row__savings">
            {file.reductionPercent != null && file.reductionPercent >= 0
              ? `-${file.reductionPercent.toFixed(1)}%`
              : `+${Math.abs(file.reductionPercent ?? 0).toFixed(1)}%`}
          </span>
          {file.outputPath && (
            <button
              className="file-row__reveal-btn"
              onClick={handleReveal}
              aria-label="Show in Finder"
              title="Show in Finder"
            >
              ↗
            </button>
          )}
        </div>
      )}

      {file.status === "error" && (
        <div className="file-row__error">{file.error}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- --reporter=verbose 2>&1 | head -60`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/FileRow.tsx src/__tests__/FileRow.test.tsx src/__tests__/setup.ts
git commit -m "feat: reveal in Finder button and status dot indicators on file rows"
```

---

## Task 12: SettingsPanel Glassmorphism Toggle Update

**Files:**
- Modify: `src/components/SettingsPanel.tsx`

- [ ] **Step 1: Update SettingsPanel toggle to use icon with rotation**

Update the toggle button and body in `src/components/SettingsPanel.tsx`:

```tsx
export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="settings-panel">
      <button
        className="settings-panel__toggle"
        onClick={() => setExpanded(!expanded)}
        aria-label="Settings"
        title="Settings"
      >
        <span
          className={`settings-panel__toggle-icon${expanded ? " settings-panel__toggle-icon--open" : ""}`}
        >
          ⚙
        </span>
        Settings
      </button>

      {expanded && (
        <div className="settings-panel__body">
          {/* ...fields unchanged... */}
        </div>
      )}
    </div>
  );
}
```

The fields inside the body remain the same as they were after Task 10 (quality, format, lossless, recursive).

- [ ] **Step 2: Verify tests still pass**

Run: `npm test -- --reporter=verbose 2>&1 | head -60`
Expected: All tests PASS (the button still has aria-label "Settings").

- [ ] **Step 3: Commit**

```bash
git add src/components/SettingsPanel.tsx
git commit -m "feat: settings panel glassmorphism toggle with rotation animation"
```

---

## Task 13: System Tray

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Enable tray feature in Cargo.toml**

Update the tauri dependency in `src-tauri/Cargo.toml`:

```toml
tauri = { version = "2", features = ["tray-icon"] }
```

- [ ] **Step 2: Implement tray setup in lib.rs**

Replace `src-tauri/src/lib.rs`:

```rust
mod commands;

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Build tray menu
            let show_item = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            // Build tray icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { .. } = event {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Hide window on close instead of quitting
            let app_handle = app.handle().clone();
            let window = app.get_webview_window("main").unwrap();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.hide();
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_version,
            commands::squish_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Verify Rust compiles**

Run: `cd src-tauri && cargo check 2>&1 | tail -10`
Expected: Compiles successfully.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs
git commit -m "feat: system tray with show/quit menu and hide-on-close behavior"
```

---

## Task 14: Final Integration Verification

**Files:** None — verification only.

- [ ] **Step 1: Run all frontend tests**

Run: `npm test -- --reporter=verbose 2>&1`
Expected: All tests PASS.

- [ ] **Step 2: Run Rust tests**

Run: `cd src-tauri && cargo test 2>&1`
Expected: All tests PASS.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1`
Expected: No errors.

- [ ] **Step 4: Verify Vite builds**

Run: `npm run build 2>&1`
Expected: Build succeeds.

- [ ] **Step 5: Verify Rust compiles (full build check)**

Run: `cd src-tauri && cargo check 2>&1`
Expected: Compiles successfully.

- [ ] **Step 6: Start dev server and verify visually**

Run: `cargo tauri dev`

Verify:
1. App opens with glassmorphism UI (gradient background, frosted glass panels).
2. Theme toggle (sun/moon icon) in top-right cycles through system/light/dark.
3. Dark mode applies correctly — all panels, text, borders update.
4. DropZone shows "Drop files here to compress" with a "Browse files" button.
5. Clicking "Browse files" opens a native file dialog.
6. Dropping files shows status dots (blue=compressing, green=done).
7. Dropping more files during processing adds them to the queue.
8. Settings panel opens with smooth animation, shows quality/format/lossless/recursive.
9. Done files show a reveal button (↗) that opens Finder on hover-click.
10. Summary bar shows batch totals at the top of the file list.
11. Closing the window hides to tray (tray icon visible in menu bar).
12. Clicking tray icon shows the window again.
13. Right-click tray shows "Show Window" and "Quit" menu.
14. Cmd+Q quits the app entirely.

- [ ] **Step 7: Commit any final adjustments**

If any visual tweaks are needed, make them and commit:

```bash
git add -A
git commit -m "fix: final visual adjustments from integration testing"
```
