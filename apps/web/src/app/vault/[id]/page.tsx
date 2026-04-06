"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  BookOpen,
  ArrowLeft,
  CheckCircle,
  Send,
  ChevronDown,
  ChevronUp,
  Link2,
  Database,
} from "lucide-react";

interface LinkedNote {
  id: number;
  title: string;
  noteType: string;
  relation: string;
}

interface VaultNoteDetail {
  id: number;
  title: string;
  noteType: string;
  status: string;
  confidenceScore: number | null;
  contentMd: string | null;
  frontmatter: string | null;
  linkedNotes: LinkedNote[];
  createdAt: string;
  updatedAt: string;
}

function NoteTypeBadge({ noteType }: { noteType: string }) {
  const colorMap: Record<string, string> = {
    policy: "bg-primary-fixed text-primary",
    letter: "bg-secondary-fixed text-secondary",
    project: "bg-tertiary-fixed text-tertiary",
    report: "bg-amber-100 text-amber-700",
    agenda: "bg-green-100 text-green-700",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${colorMap[noteType] ?? "bg-surface-high text-on-surface-variant"}`}
    >
      {noteType}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    ai_draft: "bg-amber-100 text-amber-700",
    reviewed: "bg-blue-100 text-blue-700",
    published: "bg-green-100 text-green-700",
  };
  const labelMap: Record<string, string> = {
    ai_draft: "AI Draft",
    reviewed: "ตรวจสอบแล้ว",
    published: "เผยแพร่",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${colorMap[status] ?? "bg-surface-high text-on-surface-variant"}`}
    >
      {labelMap[status] ?? status}
    </span>
  );
}

export default function VaultNoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [note, setNote] = useState<VaultNoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFrontmatter, setShowFrontmatter] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchNote = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<VaultNoteDetail>(`/vault/notes/${id}`);
      setNote(data);
    } catch {
      setNote(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchNote();
  }, [fetchNote]);

  async function handleReview() {
    setActionLoading(true);
    try {
      await apiFetch(`/vault/notes/${id}/review`, { method: "POST" });
      await fetchNote();
    } catch {
      // silently handle
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePublish() {
    setActionLoading(true);
    try {
      await apiFetch(`/vault/notes/${id}/publish`, { method: "POST" });
      await fetchNote();
    } catch {
      // silently handle
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-16 text-on-surface-variant">
        กำลังโหลด...
      </div>
    );
  }

  if (!note) {
    return (
      <div className="text-center py-16">
        <BookOpen size={48} className="text-outline/30 mx-auto mb-4" />
        <h3 className="font-bold text-on-surface-variant mb-2">ไม่พบบันทึก</h3>
        <Link
          href="/vault"
          className="inline-flex items-center gap-2 text-primary font-bold text-sm hover:underline"
        >
          <ArrowLeft size={14} />
          กลับไปคลังความรู้
        </Link>
      </div>
    );
  }

  let parsedFrontmatter: Record<string, unknown> | null = null;
  if (note.frontmatter) {
    try {
      parsedFrontmatter = JSON.parse(note.frontmatter);
    } catch {
      parsedFrontmatter = null;
    }
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/vault"
        className="inline-flex items-center gap-1 text-sm text-primary font-bold hover:underline"
      >
        <ArrowLeft size={14} />
        คลังความรู้
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-black text-primary font-[family-name:var(--font-be-vietnam-pro)] tracking-tight">
            {note.title}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <NoteTypeBadge noteType={note.noteType} />
            <StatusBadge status={note.status} />
            {note.confidenceScore != null && (
              <span className="text-xs text-outline">
                ความมั่นใจ: {Math.round(note.confidenceScore * 100)}%
              </span>
            )}
          </div>
          <p className="text-xs text-outline mt-2">
            สร้างเมื่อ {new Date(note.createdAt).toLocaleDateString("th-TH")}
            {" | "}
            อัปเดตล่าสุด {new Date(note.updatedAt).toLocaleDateString("th-TH")}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {note.status === "ai_draft" && (
            <button
              onClick={handleReview}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-2xl font-bold text-sm disabled:opacity-50 transition-transform active:scale-95"
            >
              <CheckCircle size={14} />
              ตรวจสอบ
            </button>
          )}
          {(note.status === "ai_draft" || note.status === "reviewed") && (
            <button
              onClick={handlePublish}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-2xl font-bold text-sm disabled:opacity-50 transition-transform active:scale-95"
            >
              <Send size={14} />
              เผยแพร่
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-6">
        <h2 className="text-sm font-black text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
          <BookOpen size={14} />
          เนื้อหา
        </h2>
        {note.contentMd ? (
          <div className="whitespace-pre-wrap text-sm text-on-surface leading-relaxed font-mono bg-surface-low rounded-xl p-4">
            {note.contentMd}
          </div>
        ) : (
          <p className="text-outline text-sm">ไม่มีเนื้อหา</p>
        )}
      </div>

      {/* Frontmatter */}
      {parsedFrontmatter && (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 overflow-hidden">
          <button
            onClick={() => setShowFrontmatter(!showFrontmatter)}
            className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-surface-low transition-colors"
          >
            <h2 className="text-sm font-black text-secondary uppercase tracking-wider flex items-center gap-2">
              <Database size={14} />
              Frontmatter (Metadata)
            </h2>
            {showFrontmatter ? (
              <ChevronUp size={16} className="text-outline" />
            ) : (
              <ChevronDown size={16} className="text-outline" />
            )}
          </button>
          {showFrontmatter && (
            <div className="px-6 pb-4">
              <pre className="text-xs text-on-surface bg-surface-low rounded-xl p-4 overflow-x-auto">
                {JSON.stringify(parsedFrontmatter, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Linked Notes */}
      {note.linkedNotes && note.linkedNotes.length > 0 && (
        <div>
          <h2 className="text-sm font-black text-tertiary uppercase tracking-wider mb-3 flex items-center gap-2">
            <Link2 size={14} />
            บันทึกที่เชื่อมโยง
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {note.linkedNotes.map((linked) => (
              <Link
                key={linked.id}
                href={`/vault/${linked.id}`}
                className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-on-surface text-sm truncate">
                      {linked.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <NoteTypeBadge noteType={linked.noteType} />
                      <span className="text-[11px] text-outline">{linked.relation}</span>
                    </div>
                  </div>
                  <Link2 size={14} className="text-outline shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
