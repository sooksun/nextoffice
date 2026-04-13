"use client";

interface DroppableTimeBlockProps {
  date: Date;
  hour: number;
  minute: number;
  children: React.ReactNode;
}

// DnD disabled — react-dnd is not compatible with React 19
export function DroppableTimeBlock({ children }: DroppableTimeBlockProps) {
  return <div className="h-[24px]">{children}</div>;
}
