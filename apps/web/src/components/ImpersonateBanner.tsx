"use client";

import { useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import { isImpersonating, getUser, getAdminUser, stopImpersonate } from "@/lib/auth";

interface ImpersonateBannerState {
  active: boolean;
  targetName: string;
  targetRole: string;
  adminName: string;
}

function getInitialState(): ImpersonateBannerState {
  if (typeof window === "undefined" || !isImpersonating()) {
    return { active: false, targetName: "", targetRole: "", adminName: "" };
  }

  const user = getUser();
  const admin = getAdminUser();
  return {
    active: true,
    targetName: user?.fullName ?? "",
    targetRole: user?.roleCode ?? "",
    adminName: admin?.fullName ?? "Admin",
  };
}

export default function ImpersonateBanner() {
  const [state, setState] = useState(getInitialState);

  if (!state.active) return null;

  const handleStop = () => {
    stopImpersonate();
    setState((current) => ({ ...current, active: false }));
  };

  return (
    <div className="w-full bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between text-sm font-medium z-50">
      <div className="flex items-center gap-2">
        <ShieldAlert size={16} />
        <span>
          ทดสอบในฐานะ:{" "}
          <strong>{state.targetName}</strong>
          <span className="ml-1 px-1.5 py-0.5 bg-amber-700/20 rounded text-xs font-bold">
            {state.targetRole}
          </span>
          <span className="ml-2 text-amber-800 font-normal">
            (Admin จริง: {state.adminName})
          </span>
        </span>
      </div>
      <button
        onClick={handleStop}
        className="flex items-center gap-1 px-3 py-1 bg-amber-700/20 hover:bg-amber-700/40 rounded-lg transition-colors font-semibold"
      >
        <X size={14} />
        หยุดทดสอบ
      </button>
    </div>
  );
}
