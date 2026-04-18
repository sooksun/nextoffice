"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { toast } from "react-toastify";
import { useLiff } from "../../LiffBoot";

interface CaseDetail {
  id: number;
  title: string;
  status: string;
  urgencyLevel: string;
  registrationNo: string | null;
  documentNo: string | null;
  dueDate: string | null;
  description: string | null;
  directorNote: string | null;
  intake?: { id: number };
}

const STATUS_LABEL: Record<string, string> = {
  new: "ใหม่",
  analyzing: "กำลังวิเคราะห์",
  proposed: "มีข้อเสนอแนะ",
  registered: "ลงรับแล้ว",
  assigned: "มอบหมายแล้ว",
  in_progress: "กำลังดำเนินการ",
  completed: "เสร็จแล้ว",
};

export default function LiffCaseDetailPage() {
  const { status: liffStatus } = useLiff();
  const params = useParams();
  const router = useRouter();
  const caseId = params.id as string;

  const [data, setData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    if (liffStatus !== "ready") return;
    setUser(JSON.parse(localStorage.getItem("user") ?? "null"));
    apiFetch<CaseDetail>(`/cases/${caseId}`)
      .then(setData)
      .catch(() => toast.error("ไม่พบข้อมูลหนังสือ"))
      .finally(() => setLoading(false));
  }, [caseId, liffStatus]);

  const intakeId = data?.intake?.id ?? data?.description?.match(/intake:(\d+)/)?.[1];
  const pdfUrl = intakeId ? `/api/files/intake/${intakeId}?stamped=true` : null;

  const isDirector = user && ["DIRECTOR", "VICE_DIRECTOR", "ADMIN"].includes(user.roleCode);
  const isClerk = user && ["CLERK", "ADMIN"].includes(user.roleCode);
  const canRegister = isClerk && data?.status === "new";
  const canSign = isDirector && data?.status === "registered";

  const handleRegister = async () => {
    if (!confirm("ยืนยันลงรับหนังสือนี้?")) return;
    setActing(true);
    try {
      await apiFetch(`/cases/${caseId}/register`, { method: "POST", body: "{}" });
      toast.success("ลงรับสำเร็จ");
      router.refresh();
      const updated = await apiFetch<CaseDetail>(`/cases/${caseId}`);
      setData(updated);
    } catch (e: any) {
      toast.error(e.message ?? "ไม่สำเร็จ");
    } finally {
      setActing(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-sm text-slate-500">กำลังโหลด…</div>;
  if (!data) return <div className="p-6 text-center text-sm text-slate-500">ไม่พบข้อมูล</div>;

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <Link href="/liff" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500">
        ← กลับ
      </Link>

      <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {STATUS_LABEL[data.status] ?? data.status}
          </span>
          {data.urgencyLevel && data.urgencyLevel !== "normal" && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">
              {data.urgencyLevel === "most_urgent" ? "ด่วนมาก" : "ด่วน"}
            </span>
          )}
        </div>
        <h1 className="mb-1 text-base font-semibold leading-snug">{data.title}</h1>
        <p className="text-xs text-slate-500">
          {data.registrationNo && <>ทะเบียน: {data.registrationNo}</>}
          {data.documentNo && <> · {data.documentNo}</>}
        </p>
        {data.dueDate && (
          <p className="mt-1 text-xs text-amber-600">
            กำหนด: {new Date(data.dueDate).toLocaleDateString("th-TH")}
          </p>
        )}
      </div>

      {pdfUrl && (
        <div className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <iframe src={pdfUrl} className="w-full" style={{ height: "60vh" }} title="เอกสาร" />
        </div>
      )}

      {data.directorNote && (
        <div className="mb-4 rounded-lg border-l-4 border-green-500 bg-green-50 p-3">
          <p className="mb-1 text-xs font-semibold text-green-800">คำสั่ง ผอ.</p>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{data.directorNote}</p>
        </div>
      )}

      <div className="space-y-2">
        {canRegister && (
          <button
            onClick={handleRegister}
            disabled={acting}
            className="w-full rounded-lg bg-blue-500 py-3 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50"
          >
            {acting ? "กำลังดำเนินการ…" : "ลงรับหนังสือ"}
          </button>
        )}
        {canSign && (
          <Link
            href={`/liff/sign/${caseId}`}
            className="block w-full rounded-lg bg-green-600 py-3 text-center text-sm font-semibold text-white active:scale-[0.98]"
          >
            ลงนามเกษียณหนังสือ
          </Link>
        )}
      </div>
    </div>
  );
}
