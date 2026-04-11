"use client";

import { Printer } from "lucide-react";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="btn-ghost flex items-center gap-2 no-print"
    >
      <Printer size={16} />
      <span className="text-sm">พิมพ์ทะเบียน</span>
    </button>
  );
}
