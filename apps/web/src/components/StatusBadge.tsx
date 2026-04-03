import clsx from "clsx";

const colorMap: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  processing: "bg-secondary-fixed text-secondary",
  analyzing: "bg-tertiary-fixed text-tertiary",
  done: "bg-green-100 text-green-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-error-container text-on-error-container",
  stored: "bg-primary-fixed text-primary",
  received: "bg-surface-high text-on-surface-variant",
  backed_up: "bg-primary-fixed text-primary",
  awaiting_user_intent: "bg-amber-100 text-amber-700",
  draft: "bg-surface-high text-on-surface-variant",
  open: "bg-secondary-fixed text-secondary",
  resolved: "bg-green-100 text-green-700",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide",
        colorMap[status] ?? "bg-surface-high text-on-surface-variant",
      )}
    >
      {status}
    </span>
  );
}
