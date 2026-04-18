"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pagination building blocks — unopinionated about routing.
 * Compose <PaginationRoot>, <PaginationPrev/>, <PaginationItem/>, etc.
 *
 * For a turn-key page-number list from `{page, totalPages, onPageChange}` use
 * the helper <PageNumbers> below.
 */

const PaginationRoot = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => (
    <nav
      ref={ref}
      role="navigation"
      aria-label="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  ),
);
PaginationRoot.displayName = "PaginationRoot";

const PaginationList = React.forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(
  ({ className, ...props }, ref) => (
    <ul ref={ref} className={cn("flex flex-row items-center gap-1", className)} {...props} />
  ),
);
PaginationList.displayName = "PaginationList";

const baseButton =
  "inline-flex items-center justify-center gap-1 rounded-md border border-outline-variant/60 bg-surface-lowest px-3 h-9 text-sm font-medium text-on-surface transition-colors hover:bg-primary/10 hover:text-primary disabled:pointer-events-none disabled:opacity-50";

interface PaginationButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

const PaginationItem = React.forwardRef<HTMLButtonElement, PaginationButtonProps>(
  ({ className, active, ...props }, ref) => (
    <li>
      <button
        ref={ref}
        aria-current={active ? "page" : undefined}
        className={cn(
          baseButton,
          active && "border-primary bg-primary text-on-primary hover:bg-primary hover:text-on-primary",
          className,
        )}
        {...props}
      />
    </li>
  ),
);
PaginationItem.displayName = "PaginationItem";

const PaginationPrev = React.forwardRef<HTMLButtonElement, PaginationButtonProps>(
  ({ className, ...props }, ref) => (
    <li>
      <button ref={ref} className={cn(baseButton, "pl-2", className)} aria-label="ก่อนหน้า" {...props}>
        <ChevronLeft size={14} />
        <span>ก่อนหน้า</span>
      </button>
    </li>
  ),
);
PaginationPrev.displayName = "PaginationPrev";

const PaginationNext = React.forwardRef<HTMLButtonElement, PaginationButtonProps>(
  ({ className, ...props }, ref) => (
    <li>
      <button ref={ref} className={cn(baseButton, "pr-2", className)} aria-label="ถัดไป" {...props}>
        <span>ถัดไป</span>
        <ChevronRight size={14} />
      </button>
    </li>
  ),
);
PaginationNext.displayName = "PaginationNext";

const PaginationEllipsis = ({ className }: { className?: string }) => (
  <li aria-hidden className={cn("flex size-9 items-center justify-center text-on-surface-variant", className)}>
    <MoreHorizontal size={14} />
    <span className="sr-only">More pages</span>
  </li>
);
PaginationEllipsis.displayName = "PaginationEllipsis";

/**
 * High-level helper — renders prev + page numbers (with ellipses) + next.
 */
export interface PageNumbersProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
}
function PageNumbers({
  page,
  totalPages,
  onPageChange,
  siblingCount = 1,
}: PageNumbersProps) {
  if (totalPages <= 1) return null;

  const pages = buildRange(page, totalPages, siblingCount);
  return (
    <PaginationRoot>
      <PaginationList>
        <PaginationPrev disabled={page <= 1} onClick={() => onPageChange(page - 1)} />
        {pages.map((p, i) =>
          p === "…" ? (
            <PaginationEllipsis key={`ell-${i}`} />
          ) : (
            <PaginationItem
              key={p}
              active={p === page}
              onClick={() => onPageChange(p as number)}
            >
              {p}
            </PaginationItem>
          ),
        )}
        <PaginationNext disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} />
      </PaginationList>
    </PaginationRoot>
  );
}

function buildRange(page: number, total: number, sibling: number): Array<number | "…"> {
  const first = 1;
  const last = total;
  const left = Math.max(page - sibling, first);
  const right = Math.min(page + sibling, last);

  const result: Array<number | "…"> = [];
  if (left > first) {
    result.push(first);
    if (left > first + 1) result.push("…");
  }
  for (let i = left; i <= right; i++) result.push(i);
  if (right < last) {
    if (right < last - 1) result.push("…");
    result.push(last);
  }
  return result;
}

export {
  PaginationRoot,
  PaginationList,
  PaginationItem,
  PaginationPrev,
  PaginationNext,
  PaginationEllipsis,
  PageNumbers,
};
