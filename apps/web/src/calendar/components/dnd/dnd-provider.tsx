"use client";

// DnD disabled — react-dnd is not compatible with React 19
interface DndProviderWrapperProps {
  children: React.ReactNode;
}

export function DndProviderWrapper({ children }: DndProviderWrapperProps) {
  return <>{children}</>;
}
