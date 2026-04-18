import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Styled keyboard key pill — for shortcut hints like `⌘K`, `esc`, `↵`.
 */
const Kbd = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, children, ...props }, ref) => (
    <kbd
      ref={ref}
      className={cn(
        "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md border border-outline-variant/60 bg-surface-low px-1.5 font-mono text-[10px] font-semibold text-on-surface-variant",
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  ),
);
Kbd.displayName = "Kbd";

export { Kbd };
