"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { toastSuccess, toastError } from "@/lib/toast";
import Link from "next/link";
import {
  BookOpen,
  FileText,
  Shield,
  FolderOpen,
  BarChart3,
  CalendarClock,
  Database,
  Wand2,
  Loader2,
} from "lucide-react";

interface BatchGenerateResult {
  candidateCount: number;
  totalCases: number;
  alreadyGenerated: number;
  generated: number;
  failures: Array<{ caseId: number; error: string }>;
}

interface VaultNote {
  id: number;
  title: string;
  noteType: string;
  status: string;
  confidenceScore: number | null;
  createdAt: string;
}

const NOTE_TYPES = [
  { value: "", label: "ทั้งหมด" },
  { value: "policy", label: "นโยบาย" },
  { value: "letter", label: "หนังสือ" },
  { value: "project", label: "โครงการ" },
  { value: "report", label: "รายงาน" },
  { value: "agenda", label: "วาระ" },
];

const STATUSES = [
  { value: "", label: "ทั้งหมด" },
  { value: "ai_draft", label: "AI Draft" },
  { value: "reviewed", label: "ตรวจสอบแล้ว" },
  { value: "published", label: "เผยแพร่" },
];

function NoteTypeBadge({ noteType }: { noteType: string }) {
  const colorMap: Record<string, string> = {
    policy: "bg-primary-fixed text-primary",
    letter: "bg-secondary-fixed text-secondary",
    project: "bg-tertiary-fixed text-tertiary",
    report: "bg-amber-100 text-amber-700",
    agenda: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300",
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
    reviewed: "bg-blue-500/20 text-blue-800 dark:text-blue-300",
    published: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300",
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

function ConfidenceBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-outline text-xs">--</span>;
  const pct = Math.round(score * 100);
  const color =
    pct >= 80
      ? "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300"
      : pct >= 50
        ? "bg-amber-100 text-amber-700"
        : "bg-error-container text-on-error-container";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${color}`}
    >
      {pct}%
    </span>
  );
}

export default function VaultPage() {
  const [notes, setNotes] = useState<VaultNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [noteType, setNoteType] = useState("");
  const [status, setStatus] = useState("");

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (noteType) params.set("noteType", noteType);
      if (status) params.set("status", status);
      const qs = params.toString();
      const res = await apiFetch<{ total: number; data: VaultNote[] }>(`/vault/notes${qs ? `?${qs}` : ""}`);
      setNotes(res.data ?? []);
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [noteType, status]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  async function handleBatchGenerate() {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await apiFetch<BatchGenerateResult>("/vault/notes/batch-generate?limit=20", {
        method: "POST",
      });
      if (res.generated > 0) {
        toastSuccess(`สร้าง ${res.generated} บันทึกใหม่สำเร็จ`);
      } else if (res.candidateCount === 0) {
        toastSuccess(
          res.alreadyGenerated > 0
            ? `ไม่มี case ใหม่ที่รอสร้าง (สร้างไปแล้ว ${res.alreadyGenerated} รายการ)`
            : "ยังไม่มี case ที่เข้าเกณฑ์ — ต้องมี case ที่ลงรับ/มอบหมาย/เสร็จสิ้นก่อน",
        );
      }
      if (res.failures.length > 0) {
        toastError(`ผิดพลาด ${res.failures.length} case`);
      }
      await fetchNotes();
    } catch (err: unknown) {
      toastError((err as Error).message || "สร้างบันทึกไม่สำเร็จ");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-primary font-[family-name:var(--font-be-vietnam-pro)] tracking-tight">
            Knowledge Vault
          </h1>
          <p className="text-on-surface-variant mt-1">
            คลังความรู้อัตโนมัติจากเอกสารและนโยบาย
          </p>
        </div>
        <button
          onClick={handleBatchGenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-primary text-on-primary shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          title="สร้างบันทึกอัตโนมัติจาก case ที่ยังไม่เคยสร้าง (batch)"
        >
          {generating ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              กำลังสร้าง…
            </>
          ) : (
            <>
              <Wand2 size={16} />
              สร้างบันทึกจาก case (AI)
            </>
          )}
        </button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-primary-fixed rounded-2xl flex items-center justify-center">
            <BookOpen size={20} className="text-primary" />
          </div>
          <div>
            <p className="text-2xl font-black text-primary">{notes.length}</p>
            <p className="text-xs text-on-surface-variant font-medium">บันทึกทั้งหมด</p>
          </div>
        </div>
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-secondary-fixed rounded-2xl flex items-center justify-center">
            <Shield size={20} className="text-secondary" />
          </div>
          <div>
            <p className="text-2xl font-black text-secondary">
              {notes.filter((n) => n.status === "published").length}
            </p>
            <p className="text-xs text-on-surface-variant font-medium">เผยแพร่แล้ว</p>
          </div>
        </div>
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-tertiary-fixed rounded-2xl flex items-center justify-center">
            <FileText size={20} className="text-tertiary" />
          </div>
          <div>
            <p className="text-2xl font-black text-tertiary">
              {notes.filter((n) => n.status === "ai_draft").length}
            </p>
            <p className="text-xs text-on-surface-variant font-medium">รอตรวจสอบ</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-outline font-bold mb-1.5">ประเภท</p>
          <div className="flex gap-1.5">
            {NOTE_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setNoteType(t.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                  noteType === t.value
                    ? "bg-primary text-on-primary"
                    : "bg-surface-lowest border border-outline-variant/20 text-on-surface-variant hover:bg-surface-bright"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-outline font-bold mb-1.5">สถานะ</p>
          <div className="flex gap-1.5">
            {STATUSES.map((s) => (
              <button
                key={s.value}
                onClick={() => setStatus(s.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                  status === s.value
                    ? "bg-primary text-on-primary"
                    : "bg-surface-lowest border border-outline-variant/20 text-on-surface-variant hover:bg-surface-bright"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Notes Grid */}
      {loading ? (
        <div className="text-center py-16 text-on-surface-variant">
          กำลังโหลด...
        </div>
      ) : notes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {notes.map((note) => (
            <Link
              key={note.id}
              href={`/vault/${note.id}`}
              className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 hover:shadow-md transition-shadow group"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <h3 className="font-bold text-on-surface group-hover:text-primary transition-colors line-clamp-2">
                  {note.title}
                </h3>
                <ConfidenceBadge score={note.confidenceScore} />
              </div>
              <div className="flex items-center gap-2 mb-3">
                <NoteTypeBadge noteType={note.noteType} />
                <StatusBadge status={note.status} />
              </div>
              <div className="flex items-center gap-1 text-[11px] text-outline">
                <CalendarClock size={12} />
                {new Date(note.createdAt).toLocaleDateString("th-TH")}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 rounded-2xl border border-dashed border-outline-variant/60 bg-surface-bright">
          <Database size={48} className="text-on-surface-variant/40 mx-auto mb-4" />
          <h3 className="font-bold text-on-surface-variant mb-2">ยังไม่มีบันทึกความรู้</h3>
          <p className="text-sm text-on-surface-variant/80 max-w-md mx-auto">
            กดปุ่ม <span className="font-semibold text-primary">สร้างบันทึกจาก case (AI)</span> ด้านบน
            เพื่อให้ AI สังเคราะห์บันทึกจาก case ที่ลงรับ / มอบหมาย / เสร็จสิ้นแล้วในระบบ
          </p>
          <button
            onClick={handleBatchGenerate}
            disabled={generating}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary/10 text-primary hover:bg-primary/15 disabled:opacity-50"
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
            เริ่มสร้าง
          </button>
        </div>
      )}

      {/* Sub-page Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/vault/graph"
          className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 hover:shadow-md transition-shadow group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FolderOpen size={18} className="text-primary" />
              <span className="font-bold text-on-surface">Knowledge Graph</span>
            </div>
            <BarChart3 size={16} className="text-outline group-hover:text-primary transition-colors" />
          </div>
          <p className="text-xs text-on-surface-variant mt-2">แสดงความเชื่อมโยงระหว่างบันทึกความรู้</p>
        </Link>
        <Link
          href="/vault/settings"
          className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 hover:shadow-md transition-shadow group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FolderOpen size={18} className="text-secondary" />
              <span className="font-bold text-on-surface">ตั้งค่า Vault</span>
            </div>
            <BarChart3 size={16} className="text-outline group-hover:text-secondary transition-colors" />
          </div>
          <p className="text-xs text-on-surface-variant mt-2">จัดการการซิงค์และตั้งค่าคลังความรู้</p>
        </Link>
      </div>
    </div>
  );
}
