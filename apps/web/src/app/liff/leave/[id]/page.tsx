"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { toast } from "react-toastify";
import { useLiff } from "../../LiffBoot";

interface LeaveDetail {
  id: number;
  userId: number;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string | null;
  contactPhone: string | null;
  status: string;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedByUserId: number | null;
  rejectedReason: string | null;
  createdAt: string;
  user?: { id: number; fullName: string; positionTitle: string | null };
}

const LEAVE_TYPE_LABEL: Record<string, string> = {
  sick: "ลาป่วย",
  personal: "ลากิจ",
  vacation: "ลาพักร้อน",
  maternity: "ลาคลอด",
  ordination: "ลาอุปสมบท",
  training: "ลาฝึกอบรม",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง",
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
  cancelled: "ยกเลิก",
};

export default function LiffLeaveDetailPage() {
  const { status: liffStatus } = useLiff();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [user, setUser] = useState<any>(null);
  const [leave, setLeave] = useState<LeaveDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    if (liffStatus !== "ready") return;
    setUser(JSON.parse(localStorage.getItem("user") ?? "null"));
    apiFetch<LeaveDetail>(`/attendance/leave/${id}`)
      .then(setLeave)
      .catch(() => toast.error("ไม่พบใบลา"))
      .finally(() => setLoading(false));
  }, [id, liffStatus]);

  const isManager =
    user && ["ADMIN", "DIRECTOR", "VICE_DIRECTOR", "HEAD_TEACHER"].includes(user.roleCode);
  const isOwner = user && leave && Number(leave.userId) === Number(user.id);

  const canApprove = isManager && leave?.status === "pending" && !isOwner;
  const canCancel = isOwner && (leave?.status === "pending" || leave?.status === "draft");

  const handleAction = async (
    path: string,
    method: "PATCH" | "POST",
    body: any,
    successMsg: string,
  ) => {
    setActing(true);
    try {
      await apiFetch(path, { method, body: JSON.stringify(body) });
      toast.success(successMsg);
      const fresh = await apiFetch<LeaveDetail>(`/attendance/leave/${id}`);
      setLeave(fresh);
    } catch (e: any) {
      toast.error(e.message ?? "ไม่สำเร็จ");
    } finally {
      setActing(false);
      setRejectMode(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-sm text-slate-500">กำลังโหลด…</div>;
  if (!leave) return <div className="p-6 text-center text-sm text-slate-500">ไม่พบใบลา</div>;

  const statusColor =
    leave.status === "approved"
      ? "bg-emerald-100 text-emerald-700"
      : leave.status === "rejected"
        ? "bg-rose-100 text-rose-700"
        : leave.status === "pending"
          ? "bg-amber-100 text-amber-700"
          : "bg-slate-100 text-slate-600";

  return (
    <div className="mx-auto max-w-md px-4 py-4 pb-28">
      <Link
        href="/liff/leave"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500"
      >
        ← กลับ
      </Link>

      {/* Header */}
      <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
        <div className="mb-2">
          <span className={`rounded-full px-2 py-0.5 text-xs ${statusColor}`}>
            {STATUS_LABEL[leave.status] ?? leave.status}
          </span>
        </div>
        <h1 className="mb-1 text-base font-semibold">
          {LEAVE_TYPE_LABEL[leave.leaveType] ?? leave.leaveType}
        </h1>
        <p className="text-sm text-slate-700">
          {new Date(leave.startDate).toLocaleDateString("th-TH", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
          {leave.startDate !== leave.endDate && (
            <>
              {" – "}
              {new Date(leave.endDate).toLocaleDateString("th-TH", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </>
          )}{" "}
          <span className="text-slate-500">({leave.totalDays} วัน)</span>
        </p>
        {leave.user?.fullName && (
          <p className="mt-1 text-xs text-slate-500">
            ผู้ลา: {leave.user.fullName}
            {leave.user.positionTitle && <> · {leave.user.positionTitle}</>}
          </p>
        )}
      </div>

      {/* Reason */}
      {leave.reason && (
        <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
          <p className="mb-1 text-xs font-semibold text-slate-700">เหตุผล</p>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{leave.reason}</p>
        </div>
      )}

      {leave.contactPhone && (
        <div className="mb-4 rounded-lg bg-white p-3 shadow-sm">
          <p className="text-xs text-slate-500">เบอร์ติดต่อระหว่างลา</p>
          <a
            href={`tel:${leave.contactPhone}`}
            className="text-sm font-medium text-emerald-700 underline"
          >
            {leave.contactPhone}
          </a>
        </div>
      )}

      {/* Rejection reason */}
      {leave.status === "rejected" && leave.rejectedReason && (
        <div className="mb-4 rounded-lg border-l-4 border-rose-400 bg-rose-50 p-3">
          <p className="text-xs font-semibold text-rose-800">เหตุผลที่ไม่อนุมัติ</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
            {leave.rejectedReason}
          </p>
        </div>
      )}

      {/* Reject form */}
      {rejectMode && (
        <div className="mb-4 rounded-lg border-l-4 border-rose-400 bg-rose-50 p-3">
          <label className="mb-2 block text-sm font-semibold text-rose-800">
            เหตุผลที่ไม่อนุมัติ
          </label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-rose-500 focus:outline-none"
            placeholder="ระบุเหตุผล..."
          />
        </div>
      )}

      {/* Actions */}
      {(canApprove || canCancel) && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-md gap-2">
            {canApprove && !rejectMode && (
              <>
                <button
                  onClick={() => setRejectMode(true)}
                  disabled={acting}
                  className="flex-1 rounded-lg border border-rose-300 py-3 text-sm font-semibold text-rose-600 disabled:opacity-50"
                >
                  ไม่อนุมัติ
                </button>
                <button
                  onClick={() =>
                    handleAction(
                      `/attendance/leave/${id}/approve`,
                      "PATCH",
                      {},
                      "อนุมัติใบลาเรียบร้อย",
                    )
                  }
                  disabled={acting}
                  className="flex-[2] rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {acting ? "กำลังอนุมัติ…" : "✓ อนุมัติ"}
                </button>
              </>
            )}
            {canApprove && rejectMode && (
              <>
                <button
                  onClick={() => {
                    setRejectMode(false);
                    setRejectReason("");
                  }}
                  disabled={acting}
                  className="flex-1 rounded-lg border border-slate-300 py-3 text-sm text-slate-600"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={() =>
                    handleAction(
                      `/attendance/leave/${id}/reject`,
                      "PATCH",
                      { reason: rejectReason },
                      "บันทึกการไม่อนุมัติแล้ว",
                    )
                  }
                  disabled={acting || !rejectReason.trim()}
                  className="flex-[2] rounded-lg bg-rose-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  ยืนยันไม่อนุมัติ
                </button>
              </>
            )}
            {canCancel && !canApprove && (
              <button
                onClick={() => {
                  if (!confirm("ยกเลิกใบลานี้?")) return;
                  handleAction(
                    `/attendance/leave/${id}/cancel`,
                    "PATCH",
                    {},
                    "ยกเลิกใบลาแล้ว",
                  );
                }}
                disabled={acting}
                className="w-full rounded-lg border border-slate-300 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
              >
                ยกเลิกใบลา
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
