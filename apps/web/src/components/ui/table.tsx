import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Styled HTML table primitives — drop-in, no data layer.
 * Wrap with <TableRoot> for overflow-x handling on narrow viewports.
 *
 * Example:
 *   <TableRoot>
 *     <Table>
 *       <TableHeader>
 *         <TableRow>
 *           <TableHead>ชื่อ</TableHead>
 *           <TableHead>สถานะ</TableHead>
 *         </TableRow>
 *       </TableHeader>
 *       <TableBody>
 *         <TableRow><TableCell>A</TableCell><TableCell>ปกติ</TableCell></TableRow>
 *       </TableBody>
 *     </Table>
 *   </TableRoot>
 */

const TableRoot = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("relative w-full overflow-x-auto rounded-xl border border-outline-variant/40", className)}
      {...props}
    >
      {children}
    </div>
  ),
);
TableRoot.displayName = "TableRoot";

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  ),
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead
      ref={ref}
      className={cn("bg-surface-low [&_tr]:border-b [&_tr]:border-outline-variant/40", className)}
      {...props}
    />
  ),
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody
      ref={ref}
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  ),
);
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot
      ref={ref}
      className={cn("border-t border-outline-variant/40 bg-surface-low/80 font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  ),
);
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b border-outline-variant/20 transition-colors hover:bg-primary/5 data-[state=selected]:bg-primary/10",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-10 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wider text-on-surface-variant [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn(
        "px-4 py-3 align-middle text-on-surface [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  ),
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption
      ref={ref}
      className={cn("mt-3 text-sm text-on-surface-variant", className)}
      {...props}
    />
  ),
);
TableCaption.displayName = "TableCaption";

export {
  TableRoot,
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
