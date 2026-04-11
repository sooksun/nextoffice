"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { toastSuccess, toastError } from "@/lib/toast";
import { MessageSquare, Pencil, X, Check, Loader2, ArrowRight } from "lucide-react";
import { formatThaiDateTime } from "@/lib/thai-date";

interface EndorsementAuthor {
  id: number;
  fullName: string;
  roleCode: string;
}

interface Endorsement {
  id: number;
  stepOrder: number;
  roleCode: string;
  noteText: string;
  assignToUserIds: number[];
  routingPath: "direct" | "via_vice";
  createdAt: string;
  author: EndorsementAuthor;
}

const STEP_LABELS: Record<number, string> = {
  1: "ธุรการ",
  2: "รอง ผอ.",
  3: "ผอ.",
};

const ROUTING_LABEL: Record<string, string> = {
  direct: "ส่งตรงถึง ผอ.",
  via_vice: "ผ่านรอง ผอ. ก่อน",
};

interface Props {
  caseId: number;
  directorNote?: string | null;
}

export default function EndorsementPanel({ caseId, directorNote }: Props) {
  const [endorsements, setEndorsements] = useState<Endorsement[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      if (raw) setCurrentUserId(JSON.parse(raw).id);
    } catch {}
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Endorsement[]>(`/cases/${caseId}/endorsements`);
      setEndorsements(Array.isArray(data) ? data : []);
    } catch {
      setEndorsements([]);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    load();
    // Refresh when an assign action completes
    const handler = () => load();
    window.addEventListener("assign-success", handler);
    return () => window.removeEventListener("assign-success", handler);
  }, [load]);

  const startEdit = (e: Endorsement) => {
    setEditingId(e.id);
    setEditText(e.noteText);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const saveEdit = async (endorsementId: number) => {
    if (!editText.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/cases/${caseId}/endorsements/${endorsementId}`, {
        method: "PUT",
        body: JSON.stringify({ noteText: editText.trim() }),
      });
      toastSuccess("บันทึกความเห็นสำเร็จ");
      setEditingId(null);
      setEditText("");
      load();
    } catch (err: unknown) {
      toastError((err as Error).message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  // Build steps 1–3, filling in empty ones
  const steps = [1, 2, 3].map((order) => ({
    order,
    endorsement: endorsements.find((e) => e.stepOrder === order) ?? null,
  }));

  const hasAny = endorsements.length > 0 || !!directorNote;

  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm mb-6">
      <div className="p-5">
        <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wide mb-4 flex items-center gap-1.5">
          <MessageSquare size={14} />
          การเกษียณหนังสือ
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-on-surface-variant gap-2">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">กำลังโหลด...</span>
          </div>
        ) : !hasAny ? (
          <p className="text-sm text-on-surface-variant py-4 text-center italic">
            ยังไม่มีการเกษียณหนังสือ
          </p>
        ) : (
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-4 top-5 bottom-5 w-0.5 bg-outline-variant/20" />

            <div className="space-y-4">
              {steps.map(({ order, endorsement }) => {
                const isOwner = endorsement && endorsement.author.id === currentUserId;
                const isEditing = editingId === endorsement?.id;

                return (
                  <div key={order} className="flex gap-4 relative">
                    {/* Step dot */}
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 text-xs font-bold ${
                        endorsement
                          ? "bg-primary text-on-primary"
                          : "bg-surface-bright text-on-surface-variant border-2 border-outline-variant/30"
                      }`}
                    >
                      {order}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pb-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-on-surface">
                          {STEP_LABELS[order]}
                        </span>
                        {endorsement && (
                          <span className="text-xs text-on-surface-variant">
                            {endorsement.author.fullName}
                          </span>
                        )}
                        {endorsement && order === 1 && (
                          <span className="text-[10px] bg-surface-bright text-on-surface-variant px-1.5 py-0.5 rounded-full border border-outline-variant/20 flex items-center gap-1">
                            <ArrowRight size={9} />
                            {ROUTING_LABEL[endorsement.routingPath] ?? endorsement.routingPath}
                          </span>
                        )}
                      </div>

                      {/* step 3 ผอ. — ถ้าไม่มี endorsement record แต่มี directorNote ให้แสดงแทน */}
                      {!endorsement && order === 3 && directorNote ? (
                        <div className="rounded-xl bg-surface-bright border border-outline-variant/15 p-3">
                          <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed">
                            {directorNote}
                          </p>
                        </div>
                      ) : endorsement ? (
                        <div className="rounded-xl bg-surface-bright border border-outline-variant/15 p-3 space-y-2">
                          {isEditing ? (
                            <div className="space-y-2">
                              <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                className="w-full p-2 rounded-lg border border-outline-variant/20 bg-surface-lowest text-sm resize-none"
                                rows={3}
                                autoFocus
                              />
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={cancelEdit}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-on-surface-variant hover:bg-surface-lowest transition-colors"
                                >
                                  <X size={12} /> ยกเลิก
                                </button>
                                <button
                                  onClick={() => saveEdit(endorsement.id)}
                                  disabled={saving}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-60 transition-colors"
                                >
                                  {saving ? (
                                    <><Loader2 size={12} className="animate-spin" /> กำลังบันทึก</>
                                  ) : (
                                    <><Check size={12} /> บันทึก</>
                                  )}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed">
                                {endorsement.noteText}
                              </p>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-on-surface-variant">
                                  {formatThaiDateTime(endorsement.createdAt)}
                                </span>
                                {isOwner && (
                                  <button
                                    onClick={() => startEdit(endorsement)}
                                    className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium"
                                  >
                                    <Pencil size={11} />
                                    แก้ไขความเห็น
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-on-surface-variant/50 italic px-1">รอความเห็น...</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
