"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useDarkMode } from "@/hooks/useDarkMode";

/**
 * Three-state theme toggle: light → dark → system.
 * Cycles on click; icon reflects the current mode (not resolved state).
 */
export default function ThemeToggle() {
  const { mode, cycle } = useDarkMode();

  const label =
    mode === "light" ? "โหมดสว่าง" : mode === "dark" ? "โหมดมืด" : "ตามระบบ";

  return (
    <button
      onClick={cycle}
      title={`ธีม: ${label} (คลิกเพื่อสลับ)`}
      aria-label={`Theme: ${label}`}
      className="flex h-9 w-9 items-center justify-center rounded-xl text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors"
    >
      {mode === "light" && <Sun size={18} />}
      {mode === "dark" && <Moon size={18} />}
      {mode === "system" && <Monitor size={18} />}
    </button>
  );
}
