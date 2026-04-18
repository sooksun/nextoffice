"use client";

import { Palette } from "lucide-react";
import clsx from "clsx";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useColorScheme, COLOR_SCHEMES, COLOR_SCHEME_META } from "@/hooks/useColorScheme";

/**
 * Dropdown palette picker — swaps --c-primary across the whole app.
 * Works together with useDarkMode (dark mode is orthogonal to color scheme).
 */
export default function ColorSchemePicker() {
  const { scheme, setScheme } = useColorScheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-xl text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          title={`สีธีม: ${COLOR_SCHEME_META[scheme].label}`}
          aria-label="เลือกสีธีม"
        >
          <Palette size={18} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-2">
        <DropdownMenuLabel className="px-2 py-1.5">สีธีม</DropdownMenuLabel>
        <div className="grid grid-cols-5 gap-1.5 p-1">
          {COLOR_SCHEMES.map((s) => {
            const meta = COLOR_SCHEME_META[s];
            const active = scheme === s;
            return (
              <button
                key={s}
                onClick={() => setScheme(s)}
                className={clsx(
                  "group flex flex-col items-center gap-1 p-2 rounded-lg transition-all",
                  active
                    ? "bg-primary/10 ring-2 ring-primary/40"
                    : "hover:bg-surface-low",
                )}
                title={meta.label}
                aria-pressed={active}
              >
                <span
                  className={clsx(
                    "w-7 h-7 rounded-full shadow-sm transition-transform",
                    active && "scale-110",
                  )}
                  style={{
                    background: `linear-gradient(135deg, ${meta.swatch}, ${meta.swatch}dd)`,
                    boxShadow: active ? `0 0 0 2px ${meta.swatch}44` : undefined,
                  }}
                />
                <span className={clsx("text-[10px] font-medium", active ? "text-primary" : "text-on-surface-variant")}>
                  {meta.label}
                </span>
              </button>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
