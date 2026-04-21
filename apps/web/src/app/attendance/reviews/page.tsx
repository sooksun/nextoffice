"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "react-toastify";

type ReviewItem = {
  reviewId: number;
  attendanceId: number;
  reviewStatus: string;
  createdAt: string;
  attendance: {
    checkInAt: string | null;
    status: string;
    decision: string | null;
    decisionReasons: string[] | null;
    top1Score: number | null;
    top2Score: number | null;
    scoreMargin: number | null;
    qualityScore: number | null;
    captureImagePath: string | null;
    user: { id: number; fullName: string };
  };
};

type ReviewsResponse = {
  total: number;
  page: number;
  limit: number;
  items: ReviewItem[];
};

const REASON_LABELS: Record<string, string> = {
  LOW_MARGIN: "คะแนนใกล้เคียงกัน",
  LOW_TOP1_SCORE: "คะแนนต่ำ",
  LOW_QUALITY: "ภาพคุณภาพต่ำ",
  LOW_LIVENESS: "อาจไม่ใช่ใบหน้าจริง",
  NO_ACTIVE_TEMPLATE: "ไม่มี template ใบหน้า",
};

export default function AttendanceReviewsPage() {
  const [data, setData] = useState<ReviewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionMap, setActionMap] = useState<Record<number, string>>({});
  const [reassignId, setReassignId] = useState<number | null>(null);
  const [reassignPersonId, setReassignPersonId] = useState("");
  const [noteMap, setNoteMap] = useState<Record<number, string>>({});

  const fetchData = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await apiFetch<ReviewsResponse>(`/attendance/reviews/pending?page=${page}&limit=20`);
      setData(res);
    } catch {
      toast.error("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const action = async (reviewId: number, type: "confirm" | "reject" | "reassign") => {
    setActionMap((m) => ({ ...m, [reviewId]: type }));
    try {
      const body: Record<string, unknown> = { note: noteMap[reviewId] ?? "" };
      if (type === "reassign") {
        if (!reassignPersonId) { toast.warn("กรุณากรอก Person ID"); return; }
        body.finalPersonId = Number(reassignPersonId);
      }
      await apiFetch(`/attendance/reviews/${reviewId}/${type}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast.success(`${type === "confirm" ? "ยืนยัน" : type === "reject" ? "ปฏิเสธ" : "reassign"} สำเร็จ`);
      setReassignId(null);
      fetchData();
    } catch (e: any) {
      toast.error(e.message ?? "ทำรายการไม่สำเร็จ");
    } finally {
      setActionMap((m) => { const n = { ...m }; delete n[reviewId]; return n; });
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Review Queue — Face Scan</h1>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
          {data?.total ?? 0} รายการ
        </span>
      </div>

      {loading && <p className="text-sm text-slate-500">กำลังโหลด…</p>}

      {!loading && data?.items.length === 0 && (
        <div className="rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-400">
          ไม่มีรายการรอ review
        </div>
      )}

      <div className="space-y-4">
        {data?.items.map((item) => {
          const att = item.attendance;
          const isActing = !!actionMap[item.reviewId];
          return (
            <div key={item.reviewId} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-800">{att.user.fullName}</p>
                  <p className="text-xs text-slate-500">
                    เวลาสแกน:{" "}
                    {att.checkInAt
                      ? new Date(att.checkInAt).toLocaleString("th-TH", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })
                      : "-"}
                  </p>
                </div>
                <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  รอ review
                </span>
              </div>

              {/* Scores */}
              <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                {att.top1Score != null && <span>Top-1: <b>{(att.top1Score * 100).toFixed(1)}%</b></span>}
                {att.top2Score != null && <span>Top-2: <b>{(att.top2Score * 100).toFixed(1)}%</b></span>}
                {att.scoreMargin != null && <span>Margin: <b>{att.scoreMargin.toFixed(3)}</b></span>}
                {att.qualityScore != null && <span>Quality: <b>{(att.qualityScore * 100).toFixed(0)}%</b></span>}
              </div>

              {/* Reason codes */}
              {att.decisionReasons && att.decisionReasons.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {att.decisionReasons.map((r) => (
                    <span key={r} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                      {REASON_LABELS[r] ?? r}
                    </span>
                  ))}
                </div>
              )}

              {/* Note input */}
              <input
                type="text"
                placeholder="หมายเหตุ (ไม่บังคับ)"
                className="mb-2 w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                value={noteMap[item.reviewId] ?? ""}
                onChange={(e) => setNoteMap((m) => ({ ...m, [item.reviewId]: e.target.value }))}
              />

              {/* Reassign input */}
              {reassignId === item.reviewId && (
                <div className="mb-2 flex gap-2">
                  <input
                    type="number"
                    placeholder="Person ID ที่ถูกต้อง"
                    className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-xs"
                    value={reassignPersonId}
                    onChange={(e) => setReassignPersonId(e.target.value)}
                  />
                  <button
                    onClick={() => action(item.reviewId, "reassign")}
                    disabled={isActing}
                    className="rounded bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    ยืนยัน Reassign
                  </button>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => action(item.reviewId, "confirm")}
                  disabled={isActing}
                  className="flex-1 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  ยืนยัน (Top-1)
                </button>
                <button
                  onClick={() => { setReassignId(item.reviewId); setReassignPersonId(""); }}
                  disabled={isActing}
                  className="rounded-lg border border-purple-300 px-3 py-2 text-xs font-semibold text-purple-700 disabled:opacity-40"
                >
                  Reassign
                </button>
                <button
                  onClick={() => action(item.reviewId, "reject")}
                  disabled={isActing}
                  className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-40"
                >
                  ปฏิเสธ
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {(data?.total ?? 0) > (data?.limit ?? 20) && (
        <div className="mt-4 flex justify-center gap-2">
          {Array.from({ length: Math.ceil((data?.total ?? 0) / (data?.limit ?? 20)) }, (_, i) => (
            <button
              key={i}
              onClick={() => fetchData(i + 1)}
              className={`rounded px-3 py-1 text-sm ${data?.page === i + 1 ? "bg-slate-800 text-white" : "border text-slate-600"}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
