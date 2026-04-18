"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

const COMPACT_KEY = "sideMenu.compact";
const STORAGE_EVENT = "nextoffice:sideMenu:compact";

function getCompactSnapshot(): boolean {
  try {
    const raw = localStorage.getItem(COMPACT_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return window.innerWidth <= 1600;
  } catch {
    return false;
  }
}

function subscribeCompact(cb: () => void): () => void {
  window.addEventListener(STORAGE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(STORAGE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function writeCompact(next: boolean) {
  try {
    localStorage.setItem(COMPACT_KEY, next ? "1" : "0");
    window.dispatchEvent(new Event(STORAGE_EVENT));
  } catch {
    // ignore
  }
}

/**
 * Rubick SideMenu behaviour (ported from midone-vue).
 *
 * compactMenu is persisted via localStorage and synced with useSyncExternalStore
 * (no setState-in-effect — satisfies React 19 strict lint).
 *
 * Transient UI state (hover, mobile drawer, scroll flag) uses plain useState
 * since it is inherently client-only interaction state.
 */
export function useSideMenu() {
  const compactMenu = useSyncExternalStore(
    subscribeCompact,
    getCompactSnapshot,
    () => false, // SSR default
  );

  const [compactMenuOnHover, setCompactMenuOnHover] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Auto-compact on narrow viewports (writes via external event; no setState-in-effect)
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth <= 1600) writeCompact(true);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const toggleCompactMenu = useCallback(
    () => writeCompact(!getCompactSnapshot()),
    [],
  );
  const onMouseEnterSideMenu = useCallback(() => setCompactMenuOnHover(true), []);
  const onMouseLeaveSideMenu = useCallback(() => setCompactMenuOnHover(false), []);
  const openMobileMenu = useCallback(() => setMobileMenuOpen(true), []);
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  const onScrollContent = useCallback((e: React.UIEvent<HTMLElement>) => {
    const next = (e.currentTarget.scrollTop ?? 0) > 0;
    setScrolled((prev) => (prev === next ? prev : next));
  }, []);

  return {
    compactMenu,
    compactMenuOnHover,
    mobileMenuOpen,
    scrolled,
    toggleCompactMenu,
    onMouseEnterSideMenu,
    onMouseLeaveSideMenu,
    openMobileMenu,
    closeMobileMenu,
    onScrollContent,
  };
}
