"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import clsx from "clsx";
import { useDarkMode, type ThemeMode } from "@/hooks/useDarkMode";

const OPTIONS: Array<{
  mode: ThemeMode;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { mode: "light", label: "สว่าง", Icon: Sun },
  { mode: "dark", label: "มืด", Icon: Moon },
  { mode: "system", label: "ตามระบบ", Icon: Monitor },
];

/**
 * Segmented control — light / dark / system side-by-side, active mode
 * highlighted. Avoids the "one cycle icon is confusing" problem.
 */
export default function ThemeToggle() {
  const { mode, setMode } = useDarkMode();

  return (
    <div
      role="radiogroup"
      aria-label="โหมดสี"
      className="flex items-center gap-0.5 rounded-xl border border-outline-variant/40 bg-surface-bright p-0.5"
    >
      {OPTIONS.map(({ mode: m, label, Icon }) => {
        const active = mode === m;
        return (
          <button
            key={m}
            role="radio"
            aria-checked={active}
            onClick={() => setMode(m)}
            title={`โหมด: ${label}`}
            className={clsx(
              "flex items-center justify-center w-7 h-7 rounded-lg transition-colors",
              active
                ? "bg-primary text-on-primary shadow-sm"
                : "text-on-surface-variant hover:text-primary hover:bg-primary/10",
            )}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}
