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

  useEffect(() => {
    const resolved = resolveTheme(theme);
    setEffectiveTheme(resolved);
    document.documentElement.setAttribute("data-theme", resolved);
  }, [theme]);

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
