"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { PenLine, FileText, Clock } from "lucide-react";
import { formatThaiDateTime, toThaiNumerals } from "@/lib/thai-date";

interface PendingCase {
  id: number;
  title: string;
  registrationNo: string | null;
  urgencyLevel: string;
  receivedAt: string;
  directorNote: string | null;
  assignedTo: { id: number; fullName: string } | null;
  sourceDocument: { documentCode: string | null; issuingAuthority: string | null } | null;
  assignments: { assignedTo: { id: number; fullName: string } | null }[];
}

const URGENCY_LABEL: Record<string, string> = {
  normal: "ปกติ",
  urgent: "ด่วน",
  very_urgent: "ด่วนมาก",
  most_urgent: "ด่วนที่สุด",
};
const URGENCY_COLOR: Record<string, string> = {
  normal: "bg-blue-100 text-blue-800",
  urgent: "bg-yellow-100 text-yellow-800",
  very_urgent: "bg-orange-100 text-orange-800",
  most_urgent: "bg-red-100 text-red-800",
};

export default function DirectorSigningPage() {
  const [cases, setCases] = useState<PendingCase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<PendingCase[]>("/cases/pending-director-signing")
      .then(setCases)
      .catch(() => setCases([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <PenLine size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-primary tracking-tight">รอลงนาม ผอ.</h1>
          <p className="text-xs text-on-surface-variant">
            หนังสือที่รอการลงนามเกษียณ (Stamp 3) — {toThaiNumerals(cases.length)} รายการ
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-surface-bright animate-pulse" />
          ))}
        </div>
      ) : cases.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant">
          <PenLine size={48} className="mx-auto mb-4 opacity-20" />
          <p className="text-lg font-semibold">ไม่มีหนังสือรอลงนาม</p>
          <p className="text-sm mt-1">ทุกเอกสารได้รับการลงนามแล้ว</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cases.map((c) => (
            <Link
              key={c.id}
              href={`/director/signing/${c.id}`}
              className="block rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm p-4 hover:shadow-md hover:border-primary/30 transition-all group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {c.registrationNo && (
                      <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-lg">
                        {toThaiNumerals(c.registrationNo)}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-lg font-semibold ${URGENCY_COLOR[c.urgencyLevel] ?? URGENCY_COLOR.normal}`}>
                      {URGENCY_LABEL[c.urgencyLevel] ?? c.urgencyLevel}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-on-surface group-hover:text-primary transition-colors line-clamp-2">
                    {c.title}
                  </p>
                  {c.sourceDocument?.issuingAuthority && (
                    <p className="text-xs text-on-surface-variant mt-1">
                      จาก: {c.sourceDocument.issuingAuthority}
                    </p>
                  )}
                  {c.assignments.length > 0 && (
                    <p className="text-xs text-on-surface-variant mt-1">
                      มอบหมาย: {c.assignments.map((a) => a.assignedTo?.fullName).filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex items-center gap-1 text-xs text-on-surface-variant">
                    <Clock size={12} />
                    {formatThaiDateTime(c.receivedAt)}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-primary font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                    <FileText size={12} />
                    ลงนาม
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
