"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import CreateCaseButton from "@/components/CreateCaseButton";
import DocumentUploadModal from "@/components/DocumentUploadModal";
import Link from "next/link";
import { formatThaiDateShort } from "@/lib/thai-date";
import { FilePlus, Upload, RefreshCw } from "lucide-react";

interface AiResult {
  isOfficialDocument: boolean | null;
  subjectText: string | null;
}

interface DocumentIntake {
  id: number;
  sourceChannel: string;
  mimeType: string | null;
  originalFileName: string | null;
  uploadStatus: string;
  ocrStatus: string;
  classifierStatus: string;
  aiStatus: string;
  createdAt: string;
  aiResult: AiResult | null;
}

interface PagedResponse {
  data: DocumentIntake[];
  total: number;
}

export default function IntakesPage() {
  const [intakes, setIntakes] = useState<DocumentIntake[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);

  const loadIntakes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<PagedResponse | DocumentIntake[]>("/intake?limit=100");
      if (Array.isArray(res)) {
        setIntakes(res);
        setTotal(res.length);
      } else {
        setIntakes(res.data);
        setTotal(res.total);
      }
    } catch {
      setIntakes([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIntakes();
  }, [loadIntakes]);

  const handleModalClose = () => {
    setUploadOpen(false);
    loadIntakes();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black text-primary tracking-tight">รับหนังสืออัตโนมัติ</h1>
          <p className="text-sm text-on-surface-variant mt-1">พบ {total} รายการ</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadIntakes}
            disabled={loading}
            className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-bright transition-colors disabled:opacity-40"
            title="รีเฟรช"
          >
            <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary rounded-2xl text-sm font-bold shadow-md shadow-primary/20 transition-transform active:scale-95"
          >
            <FilePlus size={15} />
            อัปโหลดเอกสาร
          </button>
        </div>
      </div>

      <DocumentUploadModal isOpen={uploadOpen} onClose={handleModalClose} />

      {loading ? (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-12 text-center text-outline shadow-sm animate-pulse">
          กำลังโหลด...
        </div>
      ) : intakes.length === 0 ? (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-16 text-center shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Upload size={28} className="text-primary" />
          </div>
          <p className="text-on-surface font-semibold text-base mb-1">ยังไม่มีเอกสารในระบบ</p>
          <p className="text-sm text-on-surface-variant mb-6">
            อัปโหลดเอกสาร PDF, DOCX, หรือรูปภาพ — AI จะอ่านและจับข้อมูลสำคัญให้อัตโนมัติ
          </p>
          <button
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary rounded-2xl text-sm font-bold shadow-md shadow-primary/20 transition-transform active:scale-95"
          >
            <FilePlus size={15} />
            อัปโหลดเอกสารแรก
          </button>
        </div>
      ) : (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-surface-low border-b border-outline-variant/10">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ID</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ช่องทาง</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ชื่อเรื่อง / ไฟล์</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">อัพโหลด</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">OCR</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">จำแนก</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">AI</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">วันที่</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ดำเนินการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {intakes.map((intake) => {
                const isOfficialDone =
                  intake.aiStatus === "done" &&
                  intake.aiResult?.isOfficialDocument === true;
                return (
                  <tr key={intake.id} className="hover:bg-surface-low transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/intakes/${intake.id}`}
                        className="text-primary hover:text-secondary font-mono text-xs font-bold"
                      >
                        #{intake.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant text-xs">{intake.sourceChannel}</td>
                    <td className="px-4 py-3 max-w-xs">
                      {intake.aiResult?.subjectText ? (
                        <p className="text-sm font-medium text-on-surface line-clamp-2">
                          {intake.aiResult.subjectText}
                        </p>
                      ) : (
                        <p className="text-xs text-outline truncate">
                          {intake.originalFileName || "—"}
                        </p>
                      )}
                      {intake.aiResult?.isOfficialDocument === true && (
                        <span className="inline-flex mt-1 text-[10px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 rounded font-semibold">
                          หนังสือราชการ
                        </span>
                      )}
                      {intake.aiResult?.isOfficialDocument === false && (
                        <span className="inline-flex mt-1 text-[10px] px-1.5 py-0.5 bg-surface-mid text-on-surface-variant rounded">
                          ไม่ใช่ราชการ
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={intake.uploadStatus} /></td>
                    <td className="px-4 py-3"><StatusBadge status={intake.ocrStatus} /></td>
                    <td className="px-4 py-3"><StatusBadge status={intake.classifierStatus} /></td>
                    <td className="px-4 py-3"><StatusBadge status={intake.aiStatus} /></td>
                    <td className="px-4 py-3 text-outline text-xs whitespace-nowrap">
                      {formatThaiDateShort(intake.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {isOfficialDone ? (
                        <CreateCaseButton documentIntakeId={intake.id} />
                      ) : (
                        <span className="text-xs text-outline">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
