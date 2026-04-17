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
