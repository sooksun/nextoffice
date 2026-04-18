"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { toast } from "react-toastify";
import { useLiff } from "../../LiffBoot";

interface OutboundDoc {
  id: number;
  subject: string;
  bodyText: string | null;
  recipientName: string | null;
  recipientOrg: string | null;
  recipientEmail: string | null;
  urgencyLevel: string;
  securityLevel: string;
  letterType: string;
  status: "draft" | "pending_approval" | "approved" | "sent";
  documentNo: string | null;
  documentDate: string | null;
  createdAt: string;
  approvedAt: string | null;
  createdBy?: { fullName: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง",
  pending_approval: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  sent: "ส่งแล้ว",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  pending_approval: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  sent: "bg-sky-100 text-sky-700",
};

const URGENCY_LABEL: Record<string, string> = {
  normal: "ปกติ",
  urgent: "ด่วน",
  very_urgent: "ด่วนมาก",
  most_urgent: "ด่วนที่สุด",
};

const LETTER_TYPE_LABEL: Record<string, string> = {
  external_letter: "หนังสือภายนอก",
  internal_memo: "บันทึกข้อความ",
  directive: "คำสั่ง",
  order: "ระเบียบ",
  announcement: "ประกาศ",
  stamp_letter: "หนังสือประทับตรา",
  secret_letter: "หนังสือลับ",
};

export default function LiffOutboundDetailPage() {
  const { status: liffStatus } = useLiff();
  const params = useParams();
  const router = useRouter();
  const docId = params.id as string;

  const [doc, setDoc] = useState<OutboundDoc | null>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectNote, setRejectNote] = useState("");

  useEffect(() => {
    if (liffStatus !== "ready") return;
    setUser(JSON.parse(localStorage.getItem("user") ?? "null"));
    apiFetch<OutboundDoc>(`/outbound/documents/${docId}`)
      .then(setDoc)
      .catch(() => toast.error("ไม่พบเอกสาร"))
      .finally(() => setLoading(false));
  }, [docId, liffStatus]);

  const canApprove =
    user &&
    ["ADMIN", "DIRECTOR", "VICE_DIRECTOR"].includes(user.roleCode) &&
    doc?.status === "pending_approval";

  const reload = async () => {
    try {
      const fresh = await apiFetch<OutboundDoc>(`/outbound/documents/${docId}`);
      setDoc(fresh);
    } catch {
      /* ignore */
    }
  };

  const handleApprove = async () => {
    if (!confirm("ยืนยันอนุมัติหนังสือส่งนี้? ระบบจะสร้างเลขที่หนังสือให้อัตโนมัติ")) return;
    setActing(true);
    try {
      const res = await apiFetch<{ id: number; documentNo: string }>(
        `/outbound/documents/${docId}/approve`,
        { method: "POST", body: "{}" },
      );
      toast.success(`อนุมัติสำเร็จ — เลขที่ ${res.documentNo}`);
      await reload();
    } catch (e: any) {
      toast.error(e.message ?? "อนุมัติไม่สำเร็จ");
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectNote.trim()) {
      toast.error("กรุณาระบุเหตุผลการตีกลับ");
      return;
    }
    setActing(true);
    try {
      await apiFetch(`/outbound/documents/${docId}/reject`, {
        method: "POST",
        body: JSON.stringify({ note: rejectNote }),
      });
      toast.info("ตีกลับเรียบร้อย เอกสารกลับไปเป็นร่าง");
      router.push("/liff");
    } catch (e: any) {
      toast.error(e.message ?? "ตีกลับไม่สำเร็จ");
    } finally {
      setActing(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-sm text-slate-500">กำลังโหลด…</div>;
  if (!doc) return <div className="p-6 text-center text-sm text-slate-500">ไม่พบเอกสาร</div>;

  const pdfUrl = `/api/files/outbound/${docId}`;

  return (
    <div className="mx-auto max-w-md px-4 py-4 pb-28">
      <Link href="/liff" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500">
        ← กลับ
      </Link>

      {/* Header */}
      <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[doc.status]}`}>
            {STATUS_LABEL[doc.status] ?? doc.status}
          </span>
          {doc.urgencyLevel !== "normal" && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">
              {URGENCY_LABEL[doc.urgencyLevel] ?? doc.urgencyLevel}
            </span>
          )}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {LETTER_TYPE_LABEL[doc.letterType] ?? doc.letterType}
          </span>
        </div>
        <h1 className="mb-2 text-base font-semibold leading-snug">{doc.subject}</h1>
        <dl className="space-y-1 text-xs text-slate-500">
          {doc.documentNo && (
            <div>
              <dt className="inline font-medium text-slate-700">เลขที่: </dt>
              <dd className="inline">{doc.documentNo}</dd>
            </div>
          )}
          {(doc.recipientName || doc.recipientOrg) && (
            <div>
              <dt className="inline font-medium text-slate-700">เรียน: </dt>
              <dd className="inline">{doc.recipientName || doc.recipientOrg}</dd>
            </div>
          )}
          <div>
            <dt className="inline font-medium text-slate-700">สร้างเมื่อ: </dt>
            <dd className="inline">{new Date(doc.createdAt).toLocaleDateString("th-TH")}</dd>
            {doc.createdBy?.fullName && <dd className="inline"> โดย {doc.createdBy.fullName}</dd>}
          </div>
        </dl>
      </div>

      {/* PDF preview */}
      <div className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <iframe src={pdfUrl} className="w-full" style={{ height: "60vh" }} title="PDF preview" />
      </div>

      {/* Reject dialog */}
      {rejectMode && (
        <div className="mb-4 rounded-lg border-l-4 border-rose-500 bg-rose-50 p-3">
          <label className="mb-2 block text-sm font-semibold text-rose-800">เหตุผลการตีกลับ</label>
          <textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            rows={3}
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-rose-500 focus:outline-none"
            placeholder="เช่น หัวเรื่องควรแก้ไขเป็น..., ข้อมูลผู้รับยังไม่ครบ"
          />
        </div>
      )}

      {/* Fixed bottom actions */}
      {canApprove && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-md gap-2">
            {!rejectMode ? (
              <>
                <button
                  onClick={() => setRejectMode(true)}
                  disabled={acting}
                  className="flex-1 rounded-lg border border-rose-300 py-3 text-sm font-semibold text-rose-600 active:scale-[0.98] disabled:opacity-50"
                >
                  ตีกลับ
                </button>
                <button
                  onClick={handleApprove}
                  disabled={acting}
                  className="flex-[2] rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50"
                >
                  {acting ? "กำลังอนุมัติ…" : "✓ อนุมัติ + ออกเลขที่"}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setRejectMode(false);
                    setRejectNote("");
                  }}
                  disabled={acting}
                  className="flex-1 rounded-lg border border-slate-300 py-3 text-sm text-slate-600 active:scale-[0.98] disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleReject}
                  disabled={acting || !rejectNote.trim()}
                  className="flex-[2] rounded-lg bg-rose-600 py-3 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50"
                >
                  {acting ? "กำลังตีกลับ…" : "ยืนยันตีกลับ"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
