"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "theme.mode";
const THEME_EVENT = "nextoffice:theme:change";

export type ThemeMode = "light" | "dark" | "system";

function getMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // ignore
  }
  return "system";
}

function resolveMode(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return mode;
}

function applyToDom(resolved: "light" | "dark") {
  const root = document.documentElement;
  if (resolved === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  root.style.colorScheme = resolved;
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(THEME_EVENT, cb);
  window.addEventListener("storage", cb);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => {
    window.removeEventListener(THEME_EVENT, cb);
    window.removeEventListener("storage", cb);
    mq.removeEventListener("change", cb);
  };
}

function writeMode(next: ThemeMode) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event(THEME_EVENT));
  } catch {
    // ignore
  }
}

/**
 * Theme mode hook — light / dark / system.
 *
 * Persists via localStorage and synchronises via useSyncExternalStore so the
 * DOM is kept in sync with state without any setState-in-effect patterns.
 * FOUC is prevented by the inline script in `app/layout.tsx`.
 */
export function useDarkMode() {
  const mode = useSyncExternalStore<ThemeMode>(
    subscribe,
    getMode,
    () => "system",
  );
  const isDark = typeof window === "undefined" ? false : resolveMode(mode) === "dark";

  // Sync DOM whenever mode changes (this is an external-system write, not state)
  useEffect(() => {
    applyToDom(resolveMode(mode));
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => writeMode(m), []);
  const setLight = useCallback(() => writeMode("light"), []);
  const setDark = useCallback(() => writeMode("dark"), []);
  const setSystem = useCallback(() => writeMode("system"), []);

  /** Cycle: light → dark → system → light */
  const cycle = useCallback(() => {
    const next = mode === "light" ? "dark" : mode === "dark" ? "system" : "light";
    writeMode(next);
  }, [mode]);

  /** Quick toggle dark ↔ light (exits system preference) */
  const toggle = useCallback(() => {
    writeMode(isDark ? "light" : "dark");
  }, [isDark]);

  return { mode, isDark, setMode, setLight, setDark, setSystem, cycle, toggle };
}
