"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import { isImpersonating, getUser, getAdminUser, stopImpersonate } from "@/lib/auth";

export default function ImpersonateBanner() {
  const [active, setActive] = useState(false);
  const [targetName, setTargetName] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [adminName, setAdminName] = useState("");

  useEffect(() => {
    if (!isImpersonating()) return;
    setActive(true);
    const u = getUser();
    const a = getAdminUser();
    setTargetName(u?.fullName ?? "");
    setTargetRole(u?.roleCode ?? "");
    setAdminName(a?.fullName ?? "Admin");
  }, []);

  if (!active) return null;

  return (
    <div className="w-full bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between text-sm font-medium z-50">
      <div className="flex items-center gap-2">
        <ShieldAlert size={16} />
        <span>
          ทดสอบในฐานะ:{" "}
          <strong>{targetName}</strong>
          <span className="ml-1 px-1.5 py-0.5 bg-amber-700/20 rounded text-xs font-bold">
            {targetRole}
          </span>
          <span className="ml-2 text-amber-800 font-normal">
            (Admin จริง: {adminName})
          </span>
        </span>
      </div>
      <button
        onClick={stopImpersonate}
        className="flex items-center gap-1 px-3 py-1 bg-amber-700/20 hover:bg-amber-700/40 rounded-lg transition-colors font-semibold"
      >
        <X size={14} />
        หยุดทดสอบ
      </button>
    </div>
  );
}
