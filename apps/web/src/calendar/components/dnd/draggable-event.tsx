"use client";

import type { IEvent } from "@/calendar/interfaces";

export const ItemTypes = {
  EVENT: "event",
};

interface DraggableEventProps {
  event: IEvent;
  children: React.ReactNode;
}

// DnD disabled — react-dnd is not compatible with React 19
export function DraggableEvent({ children }: DraggableEventProps) {
  return <div>{children}</div>;
}
