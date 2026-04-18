"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "theme.colorScheme";
const EVENT_NAME = "nextoffice:colorScheme:change";

export const COLOR_SCHEMES = ["purple", "blue", "emerald", "rose", "amber"] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];

export const COLOR_SCHEME_META: Record<ColorScheme, { label: string; swatch: string }> = {
  purple: { label: "ม่วง", swatch: "#4f46e5" },
  blue: { label: "ฟ้า", swatch: "#2563eb" },
  emerald: { label: "เขียว", swatch: "#059669" },
  rose: { label: "ชมพู", swatch: "#e11d48" },
  amber: { label: "เหลือง", swatch: "#d97706" },
};

function getScheme(): ColorScheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) as ColorScheme | null;
    if (raw && COLOR_SCHEMES.includes(raw)) return raw;
  } catch {
    // ignore
  }
  return "purple";
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT_NAME, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT_NAME, cb);
    window.removeEventListener("storage", cb);
  };
}

function applyToDom(scheme: ColorScheme) {
  const html = document.documentElement;
  if (scheme === "purple") {
    // Default scheme — don't set the attribute so :root wins
    html.removeAttribute("data-color-scheme");
  } else {
    html.setAttribute("data-color-scheme", scheme);
  }
}

function writeScheme(next: ColorScheme) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch {
    // ignore
  }
  applyToDom(next);
}

/**
 * Reads the persisted color scheme and lets callers switch it.
 * DOM is kept in sync via the write function; FOUC is prevented by the
 * inline script in `app/layout.tsx`.
 */
export function useColorScheme() {
  const scheme = useSyncExternalStore<ColorScheme>(subscribe, getScheme, () => "purple");
  const setScheme = useCallback((s: ColorScheme) => writeScheme(s), []);
  return { scheme, setScheme, schemes: COLOR_SCHEMES, meta: COLOR_SCHEME_META };
}
