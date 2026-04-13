"use client";

import type { ICalendarCell } from "@/calendar/interfaces";

interface DroppableDayCellProps {
  cell: ICalendarCell;
  children: React.ReactNode;
}

// DnD disabled — react-dnd is not compatible with React 19
export function DroppableDayCell({ children }: DroppableDayCellProps) {
  return <div>{children}</div>;
}
