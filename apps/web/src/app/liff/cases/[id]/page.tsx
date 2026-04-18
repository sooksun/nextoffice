"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { toast } from "react-toastify";
import { useLiff } from "../../LiffBoot";
import ShareButton from "../../ShareButton";

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
  directorStampStatus: string | null;
  intake?: { id: number };
}

interface Assignment {
  id: number;
  assignedToUserId: number;
  status: string; // pending | accepted | in_progress | completed
  assignedRole: string | null;
  note: string | null;
  dueDate: string | null;
}

interface CaseActivity {
  id: number;
  action: string;
  detail: any;
  createdAt: string;
  user?: { id: number; fullName: string; roleCode: string } | null;
}

const ACTION_LABEL: Record<string, string> = {
  created: "สร้างเรื่อง",
  analyzed: "AI วิเคราะห์",
  registered: "ลงรับ",
  assigned: "มอบหมาย",
  director_signed: "ผอ. ลงนาม",
  status_changed: "เปลี่ยนสถานะ",
  endorsement_updated: "แก้ไขบันทึกเสนอ",
  assignment_accepted: "รับทราบงาน",
  assignment_completed: "ดำเนินการเสร็จ",
  rejected: "ตีกลับ",
  hold: "พักเรื่อง",
};

const STATUS_LABEL: Record<string, string> = {
  new: "ใหม่",
  analyzing: "กำลังวิเคราะห์",
  proposed: "มีข้อเสนอแนะ",
  registered: "ลงรับแล้ว",
  assigned: "มอบหมายแล้ว",
  in_progress: "กำลังดำเนินการ",
  completed: "เสร็จแล้ว",
};

// Workflow steps — derived from case.status + directorStampStatus + assignment.status
interface StepState {
  label: string;
  done: boolean;
  active: boolean;
}

function buildWorkflowSteps(
  caseStatus: string,
  directorStampStatus: string | null,
  myAssignment: Assignment | null,
): StepState[] {
  const s = caseStatus;
  const registered = ["registered", "assigned", "in_progress", "completed"].includes(s);
  const signed = directorStampStatus === "applied";
  const assigned = ["assigned", "in_progress", "completed"].includes(s);
  const ackd = myAssignment?.status === "accepted" || myAssignment?.status === "in_progress" || myAssignment?.status === "completed";
  const done = myAssignment?.status === "completed" || s === "completed";

  return [
    {
      label: "ลงรับ",
      done: registered,
      active: !registered && s === "new",
    },
    {
      label: "ผอ. ลงนาม",
      done: signed,
      active: registered && !signed,
    },
    {
      label: "มอบหมาย",
      done: assigned,
      active: signed && !assigned,
    },
    ...(myAssignment
      ? [
          {
            label: "รับทราบ",
            done: ackd,
            active: assigned && !ackd,
          },
          {
            label: "ดำเนินการเสร็จ",
            done,
            active: ackd && !done,
          },
        ]
      : []),
  ];
}

export default function LiffCaseDetailPage() {
  const { status: liffStatus } = useLiff();
  const params = useParams();
  const router = useRouter();
  const caseId = params.id as string;

  const [data, setData] = useState<CaseDetail | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [activities, setActivities] = useState<CaseActivity[]>([]);
  const [showActivities, setShowActivities] = useState(false);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [user, setUser] = useState<any>(null);

  const fetchAll = async () => {
    const [d, a, act] = await Promise.all([
      apiFetch<CaseDetail>(`/cases/${caseId}`),
      apiFetch<Assignment[] | { data: Assignment[] }>(`/cases/${caseId}/assignments`).catch(
        () => [] as Assignment[],
      ),
      apiFetch<CaseActivity[] | { data: CaseActivity[] }>(`/cases/${caseId}/activities`).catch(
        () => [] as CaseActivity[],
      ),
    ]);
    setData(d);
    setAssignments(Array.isArray(a) ? a : (a as any).data ?? []);
    setActivities(Array.isArray(act) ? act : (act as any).data ?? []);
  };

  useEffect(() => {
    if (liffStatus !== "ready") return;
    setUser(JSON.parse(localStorage.getItem("user") ?? "null"));
    fetchAll()
      .catch(() => toast.error("ไม่พบข้อมูลหนังสือ"))
      .finally(() => setLoading(false));

  }, [caseId, liffStatus]);

  const intakeId = data?.intake?.id ?? data?.description?.match(/intake:(\d+)/)?.[1];
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const pdfUrl = intakeId
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/files/intake/${intakeId}?stamped=true${token ? `&token=${encodeURIComponent(token)}` : ""}`
    : null;

  const isDirector = user && ["DIRECTOR", "VICE_DIRECTOR", "ADMIN"].includes(user.roleCode);
  const isClerk = user && ["CLERK", "DIRECTOR", "VICE_DIRECTOR", "ADMIN"].includes(user.roleCode);

  const myAssignment = assignments.find((a) => Number(a.assignedToUserId) === Number(user?.id)) ?? null;

  const canRegister = isClerk && data?.status === "new";
  const canSign = isDirector && data?.status === "registered";
  const canAcknowledge = !!myAssignment && myAssignment.status === "pending";
  const canComplete =
    !!myAssignment &&
    (myAssignment.status === "accepted" || myAssignment.status === "in_progress");

  const steps = data
    ? buildWorkflowSteps(data.status, data.directorStampStatus, myAssignment)
    : [];

  const handleRegister = async () => {
    if (!confirm("ยืนยันลงรับหนังสือนี้?")) return;
    setActing(true);
    try {
      await apiFetch(`/cases/${caseId}/register`, { method: "POST", body: "{}" });
      toast.success("ลงรับสำเร็จ");
      await fetchAll();
    } catch (e: any) {
      toast.error(e.message ?? "ไม่สำเร็จ");
    } finally {
      setActing(false);
    }
  };

  const updateAssignment = async (status: string, successMsg: string) => {
    if (!myAssignment) return;
    setActing(true);
    try {
      await apiFetch(`/cases/assignments/${myAssignment.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      toast.success(successMsg);
      await fetchAll();
    } catch (e: any) {
      toast.error(e.message ?? "ไม่สำเร็จ");
    } finally {
      setActing(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-sm text-slate-500">กำลังโหลด…</div>;
  if (!data) return <div className="p-6 text-center text-sm text-slate-500">ไม่พบข้อมูล</div>;

  const hasAnyAction = canRegister || canSign || canAcknowledge || canComplete;

  return (
    <div className="mx-auto max-w-md px-4 py-4 pb-28">
      <div className="mb-3 flex items-center justify-between">
        <Link href="/liff" className="inline-flex items-center gap-1 text-sm text-slate-500">
          ← กลับ
        </Link>
        <ShareButton
          text={`[หนังสือ] ${data.title}${data.registrationNo ? `\nทะเบียน: ${data.registrationNo}` : ""}${data.documentNo ? `\nเลขที่: ${data.documentNo}` : ""}`}
          label="📤"
        />
      </div>

      {/* Header */}
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

      {/* Workflow timeline */}
      {steps.length > 0 && (
        <div className="mb-4 rounded-lg bg-white p-3 shadow-sm">
          <p className="mb-2 text-xs font-semibold text-slate-700">ขั้นตอนที่ผ่านมา</p>
          <ol className="space-y-1.5">
            {steps.map((step, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    step.done
                      ? "bg-emerald-500 text-white"
                      : step.active
                        ? "bg-amber-400 text-white"
                        : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {step.done ? "✓" : i + 1}
                </span>
                <span
                  className={
                    step.done
                      ? "text-slate-500 line-through"
                      : step.active
                        ? "font-medium text-amber-700"
                        : "text-slate-400"
                  }
                >
                  {step.label}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* PDF */}
      {pdfUrl && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 text-center">
          <p className="mb-1 text-xs text-slate-500">ไฟล์เอกสารแนบ</p>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white active:scale-[0.98]"
          >
            เปิดดูเอกสาร PDF
          </a>
        </div>
      )}

      {/* Director note */}
      {data.directorNote && (
        <div className="mb-4 rounded-lg border-l-4 border-green-500 bg-green-50 p-3">
          <p className="mb-1 text-xs font-semibold text-green-800">คำสั่ง ผอ.</p>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{data.directorNote}</p>
        </div>
      )}

      {/* My assignment info */}
      {myAssignment && (
        <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
          <p className="mb-1 text-xs font-semibold text-indigo-800">งานของคุณในเรื่องนี้</p>
          <p className="text-xs text-indigo-700">
            สถานะ:{" "}
            {myAssignment.status === "pending"
              ? "รอรับทราบ"
              : myAssignment.status === "accepted"
                ? "รับทราบแล้ว"
                : myAssignment.status === "in_progress"
                  ? "กำลังดำเนินการ"
                  : "เสร็จแล้ว"}
          </p>
          {myAssignment.note && (
            <p className="mt-1 whitespace-pre-wrap text-xs text-indigo-700">
              หมายเหตุ: {myAssignment.note}
            </p>
          )}
        </div>
      )}

      {/* Activity timeline (collapsible) */}
      {activities.length > 0 && (
        <div className="mb-4 rounded-lg bg-white p-3 shadow-sm">
          <button
            onClick={() => setShowActivities(!showActivities)}
            className="flex w-full items-center justify-between text-left text-xs font-semibold text-slate-700"
          >
            <span>ประวัติการดำเนินงาน ({activities.length})</span>
            <span className="text-slate-400">{showActivities ? "▼" : "▶"}</span>
          </button>
          {showActivities && (
            <ol className="mt-3 space-y-2 border-l-2 border-slate-200 pl-3">
              {activities
                .slice()
                .reverse()
                .map((a) => (
                  <li key={a.id} className="relative text-xs">
                    <span className="absolute -left-[17px] top-1 block h-2 w-2 rounded-full bg-slate-400" />
                    <p className="font-medium text-slate-700">
                      {ACTION_LABEL[a.action] ?? a.action}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {new Date(a.createdAt).toLocaleString("th-TH", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {a.user?.fullName && <> · {a.user.fullName}</>}
                    </p>
                  </li>
                ))}
            </ol>
          )}
        </div>
      )}

      {/* Action buttons (fixed bottom) */}
      {hasAnyAction && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto max-w-md space-y-2">
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
            {canAcknowledge && (
              <button
                onClick={() => updateAssignment("accepted", "รับทราบเรียบร้อย")}
                disabled={acting}
                className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50"
              >
                ✓ รับทราบงานที่ได้รับมอบหมาย
              </button>
            )}
            {canComplete && (
              <button
                onClick={() => updateAssignment("completed", "บันทึกว่าดำเนินการเสร็จแล้ว")}
                disabled={acting}
                className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50"
              >
                ✓ ดำเนินการเสร็จแล้ว
              </button>
            )}
          </div>
        </div>
      )}

      {!hasAnyAction && data.status === "completed" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center text-sm text-emerald-800">
          ✓ เรื่องนี้ดำเนินการเสร็จแล้ว
        </div>
      )}
    </div>
  );
}
