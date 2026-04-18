"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  indeterminate?: boolean;
}

/**
 * Linear progress bar — simple, no dependency on a primitive library.
 * For indeterminate state pass `indeterminate` (ignores `value`).
 */
const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, max = 100, indeterminate = false, ...props }, ref) => {
    const pct = indeterminate ? 100 : Math.min(100, Math.max(0, (value / max) * 100));
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={indeterminate ? undefined : value}
        className={cn(
          "relative h-2 w-full overflow-hidden rounded-full bg-surface-mid",
          className,
        )}
        {...props}
      >
        <div
          className={cn(
            "h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 transition-[width] duration-300 ease-out",
            indeterminate && "animate-[shimmer_1.5s_ease-in-out_infinite] w-1/3",
          )}
          style={indeterminate ? undefined : { width: `${pct}%` }}
        />
      </div>
    );
  },
);
Progress.displayName = "Progress";

export { Progress };
