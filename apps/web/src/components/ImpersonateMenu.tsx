"use client";

import { useEffect, useRef, useState } from "react";
import { Users, ChevronDown, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { impersonate } from "@/lib/auth";

interface UserItem {
  id: number;
  fullName: string;
  roleCode: string;
  positionTitle: string | null;
  organizationId: number | null;
}

const ROLE_LABEL: Record<string, string> = {
  DIRECTOR: "ผอ.",
  VICE_DIRECTOR: "รอง ผอ.",
  CLERK: "เจ้าหน้าที่",
  TEACHER: "ครู",
};

export default function ImpersonateMenu() {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function handleOpen() {
    if (!open && users.length === 0) {
      setLoading(true);
      try {
        const data = await apiFetch<UserItem[]>("/auth/users/all");
        setUsers(data.filter((u) => u.roleCode !== "ADMIN"));
      } catch {
        setUsers([]);
      } finally {
        setLoading(false);
      }
    }
    setOpen((v) => !v);
  }

  async function handleImpersonate(userId: number) {
    setBusy(userId);
    try {
      await impersonate(userId);
    } catch (e: any) {
      alert(e.message ?? "เกิดข้อผิดพลาด");
      setBusy(null);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 rounded-lg transition-colors"
        title="ทดสอบในฐานะผู้ใช้อื่น (Admin only)"
      >
        <Users size={13} />
        ทดสอบในฐานะ
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-surface-lowest border border-outline-variant/30 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-outline-variant/20 bg-amber-50">
            <p className="text-xs font-bold text-amber-800">เลือกผู้ใช้ที่ต้องการทดสอบ</p>
            <p className="text-xs text-amber-700 mt-0.5">ระบบจะเปลี่ยน session เป็นผู้ใช้นั้นชั่วคราว</p>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-6 text-outline">
                <Loader2 size={18} className="animate-spin mr-2" />
                <span className="text-sm">กำลังโหลด...</span>
              </div>
            ) : users.length === 0 ? (
              <p className="text-sm text-outline text-center py-4">ไม่พบผู้ใช้</p>
            ) : (
              users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleImpersonate(u.id)}
                  disabled={busy === u.id}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-surface-low transition-colors text-left disabled:opacity-50"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-primary">
                        {u.fullName.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-on-surface leading-tight">{u.fullName}</p>
                      <p className="text-xs text-outline">
                        {u.positionTitle || ROLE_LABEL[u.roleCode] || u.roleCode}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full font-semibold shrink-0">
                    {ROLE_LABEL[u.roleCode] || u.roleCode}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
