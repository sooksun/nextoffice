"use client";

import { Printer } from "lucide-react";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 px-4 py-2 bg-surface-low border border-outline-variant/30 rounded-xl text-sm font-semibold hover:bg-surface transition-colors print:hidden"
    >
      <Printer size={16} />
      พิมพ์รายงาน
    </button>
  );
}
