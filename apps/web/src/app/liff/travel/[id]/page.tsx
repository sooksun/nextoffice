"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { toast } from "react-toastify";
import { useLiff } from "../../LiffBoot";

interface TravelDetail {
  id: number;
  userId: number;
  travelDate: string;
  destination: string;
  purpose: string;
  departureTime: string | null;
  returnTime: string | null;
  status: string;
  rejectedReason: string | null;
  user?: { id: number; fullName: string; positionTitle: string | null };
}

const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง",
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
  cancelled: "ยกเลิก",
};

export default function LiffTravelDetailPage() {
  const { status: liffStatus } = useLiff();
  const params = useParams();
  const id = params.id as string;

  const [user, setUser] = useState<any>(null);
  const [item, setItem] = useState<TravelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    if (liffStatus !== "ready") return;
    setUser(JSON.parse(localStorage.getItem("user") ?? "null"));
    apiFetch<TravelDetail>(`/attendance/leave/travel/${id}`)
      .then(setItem)
      .catch(() => toast.error("ไม่พบข้อมูล"))
      .finally(() => setLoading(false));
  }, [id, liffStatus]);

  const isManager = user && ["ADMIN", "DIRECTOR", "VICE_DIRECTOR"].includes(user.roleCode);
  const isOwner = user && item && Number(item.userId) === Number(user.id);
  const canApprove = isManager && item?.status === "pending" && !isOwner;
  const canCancel = isOwner && (item?.status === "pending" || item?.status === "draft");

  const act = async (path: string, body: any, successMsg: string) => {
    setActing(true);
    try {
      await apiFetch(path, { method: "PATCH", body: JSON.stringify(body) });
      toast.success(successMsg);
      const fresh = await apiFetch<TravelDetail>(`/attendance/leave/travel/${id}`);
      setItem(fresh);
      setRejectMode(false);
    } catch (e: any) {
      toast.error(e.message ?? "ไม่สำเร็จ");
    } finally {
      setActing(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-sm text-slate-500">กำลังโหลด…</div>;
  if (!item) return <div className="p-6 text-center text-sm text-slate-500">ไม่พบข้อมูล</div>;

  const statusColor =
    item.status === "approved"
      ? "bg-emerald-100 text-emerald-700"
      : item.status === "rejected"
        ? "bg-rose-100 text-rose-700"
        : item.status === "pending"
          ? "bg-amber-100 text-amber-700"
          : "bg-slate-100 text-slate-600";

  return (
    <div className="mx-auto max-w-md px-4 py-4 pb-28">
      <Link
        href="/liff/travel"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500"
      >
        ← กลับ
      </Link>

      <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
        <div className="mb-2">
          <span className={`rounded-full px-2 py-0.5 text-xs ${statusColor}`}>
            {STATUS_LABEL[item.status] ?? item.status}
          </span>
        </div>
        <h1 className="mb-1 text-base font-semibold">{item.destination}</h1>
        <p className="text-sm text-slate-700">
          {new Date(item.travelDate).toLocaleDateString("th-TH", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          {item.departureTime && <> · {item.departureTime}</>}
          {item.returnTime && <>–{item.returnTime}</>}
        </p>
        {item.user?.fullName && (
          <p className="mt-1 text-xs text-slate-500">
            ผู้ขอ: {item.user.fullName}
            {item.user.positionTitle && <> · {item.user.positionTitle}</>}
          </p>
        )}
      </div>

      {item.purpose && (
        <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
          <p className="mb-1 text-xs font-semibold text-slate-700">วัตถุประสงค์</p>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{item.purpose}</p>
        </div>
      )}

      {item.status === "rejected" && item.rejectedReason && (
        <div className="mb-4 rounded-lg border-l-4 border-rose-400 bg-rose-50 p-3">
          <p className="text-xs font-semibold text-rose-800">เหตุผลที่ไม่อนุมัติ</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{item.rejectedReason}</p>
        </div>
      )}

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
          />
        </div>
      )}

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
                    act(`/attendance/leave/travel/${id}/approve`, {}, "อนุมัติเรียบร้อย")
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
                    act(
                      `/attendance/leave/travel/${id}/reject`,
                      { reason: rejectReason },
                      "ไม่อนุมัติเรียบร้อย",
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
                  if (!confirm("ยกเลิกคำขอนี้?")) return;
                  act(`/attendance/leave/travel/${id}/cancel`, {}, "ยกเลิกเรียบร้อย");
                }}
                disabled={acting}
                className="w-full rounded-lg border border-slate-300 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
              >
                ยกเลิกคำขอ
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
