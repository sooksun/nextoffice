"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Upload, FileText, Image, Type, CheckCircle, XCircle, Loader2, RefreshCw, RotateCcw, Trash2, Eye, AlertTriangle, X } from "lucide-react";
import { getAuthToken } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { toastSuccess, toastError, confirmDelete } from "@/lib/toast";

type SourceType = "file" | "text";
type Status = "PENDING" | "PROCESSING" | "DONE" | "ERROR";

interface KnowledgeItem {
  id: number;
  title: string;
  category: string | null;
  sourceType: string;
  status: Status;
  chunkCount: number;
  embeddedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  uploadedBy: { id: number; fullName: string };
}

interface ChunkInfo {
  id: string;
  chunkIndex: number;
  sectionTitle: string | null;
  semanticLabel: string | null;
  breadcrumb: string | null;
  text: string;
}

interface InspectionData {
  item: {
    id: number;
    title: string;
    category: string | null;
    status: Status;
    chunkCount: number;
    extractedText: string | null;
  };
  qdrantChunkCount: number;
  chunks: ChunkInfo[];
}

const STATUS_LABEL: Record<Status, string> = {
  PENDING: "รอดำเนินการ",
  PROCESSING: "กำลังประมวลผล",
  DONE: "สำเร็จ",
  ERROR: "ผิดพลาด",
};

const STATUS_COLOR: Record<Status, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  PROCESSING: "bg-blue-100 text-blue-800",
  DONE: "bg-green-100 text-green-800",
  ERROR: "bg-red-100 text-red-800",
};

const CATEGORIES = [
  "ระเบียบ/กฎหมาย",
  "คู่มือการปฏิบัติงาน",
  "นโยบาย/แผนงาน",
  "infographic/สื่อความรู้",
  "บันทึกข้อตกลง",
  "อื่น ๆ",
];

export default function KnowledgeImportPage() {
  const [sourceType, setSourceType] = useState<SourceType>("file");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [inspecting, setInspecting] = useState<InspectionData | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [resetting, setResetting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";

  useEffect(() => {
    const u = getUser();
    setIsAdmin(u?.roleCode === "ADMIN");
  }, []);

  const fetchItems = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`${apiBase}/knowledge-import`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data);
        return data as KnowledgeItem[];
      } else if (!silent) {
        toastError("ไม่สามารถโหลดรายการความรู้ได้");
      }
    } catch {
      if (!silent) toastError("เกิดข้อผิดพลาดในการโหลดรายการ");
    } finally {
      if (!silent) setLoading(false);
    }
    return null;
  }, [apiBase]);

  const loadItems = useCallback(() => fetchItems(false), [fetchItems]);

  // Auto-poll every 4 s while any item is PENDING or PROCESSING
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      const latest = await fetchItems(true);
      const hasActive = latest?.some(
        (i) => i.status === "PENDING" || i.status === "PROCESSING"
      );
      if (hasActive) {
        timer = setTimeout(poll, 4000);
      }
    };

    const hasActive = items.some(
      (i) => i.status === "PENDING" || i.status === "PROCESSING"
    );
    if (hasActive) {
      timer = setTimeout(poll, 4000);
    }

    return () => clearTimeout(timer);
  }, [items, fetchItems]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;
    if (sourceType === "file" && !file) return;
    if (sourceType === "text" && !description.trim()) return;

    setSubmitting(true);
    try {
      const token = getAuthToken();
      const formData = new FormData();
      formData.append("title", title.trim());
      if (category) formData.append("category", category);
      if (sourceType === "file" && file) {
        formData.append("file", file);
      } else {
        formData.append("description", description.trim());
      }

      const res = await fetch(`${apiBase}/knowledge-import`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }

      // Reset form
      setTitle("");
      setCategory("");
      setDescription("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      // Reload list
      await loadItems();
    } catch (err: unknown) {
      toastError((err as Error).message || "เกิดข้อผิดพลาด");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number, itemTitle: string) => {
    const ok = await confirmDelete(
      `ต้องการลบ "${itemTitle}" ออกจากระบบหรือไม่? ข้อมูลใน Vector Database จะถูกลบด้วย`,
      "ยืนยันการลบความรู้",
    );
    if (!ok) return;
    try {
      const token = getAuthToken();
      const res = await fetch(`${apiBase}/knowledge-import/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        toastSuccess("ลบความรู้เรียบร้อยแล้ว");
        setItems((prev) => prev.filter((i) => i.id !== id));
      } else {
        toastError("ไม่สามารถลบได้");
      }
    } catch {
      toastError("เกิดข้อผิดพลาด");
    }
  };

  const handleInspect = async (item: KnowledgeItem) => {
    setInspectLoading(true);
    setInspecting({
      item: {
        id: item.id,
        title: item.title,
        category: item.category,
        status: item.status,
        chunkCount: item.chunkCount,
        extractedText: null,
      },
      qdrantChunkCount: 0,
      chunks: [],
    });
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const [detailRes, chunksRes] = await Promise.all([
        fetch(`${apiBase}/knowledge-import/${item.id}`, { headers }),
        fetch(`${apiBase}/knowledge-import/${item.id}/chunks`, { headers }),
      ]);
      if (!detailRes.ok || !chunksRes.ok) {
        throw new Error("โหลดข้อมูลไม่สำเร็จ");
      }
      const detail = await detailRes.json();
      const chunksData = await chunksRes.json();
      setInspecting({
        item: {
          id: detail.id,
          title: detail.title,
          category: detail.category,
          status: detail.status,
          chunkCount: detail.chunkCount,
          extractedText: detail.extractedText,
        },
        qdrantChunkCount: chunksData.qdrantChunkCount,
        chunks: chunksData.chunks,
      });
    } catch (err: unknown) {
      toastError((err as Error).message || "ไม่สามารถตรวจสอบข้อมูลได้");
      setInspecting(null);
    } finally {
      setInspectLoading(false);
    }
  };

  const handleAdminResetOrg = async () => {
    const ok = await confirmDelete(
      "ต้องการลบ vectors ทั้งหมดขององค์กรใน Qdrant และรีเซ็ตทุก item เป็น PENDING หรือไม่? ข้อมูลต้นฉบับ (ไฟล์ + ข้อความ) จะยังอยู่ สามารถ retry ได้หลังรีเซ็ต",
      "ยืนยันการ Reset ความรู้องค์กร",
    );
    if (!ok) return;
    setResetting(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`${apiBase}/knowledge-import/admin/reset-org`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || "รีเซ็ตไม่สำเร็จ");
      }
      const data = await res.json();
      toastSuccess(`รีเซ็ตสำเร็จ (${data.itemsReset} รายการ)`);
      await loadItems();
    } catch (err: unknown) {
      toastError((err as Error).message || "เกิดข้อผิดพลาด");
    } finally {
      setResetting(false);
    }
  };

  const handleAdminResetQdrant = async () => {
    const ok = await confirmDelete(
      "⚠️ ลบทั้ง Qdrant collection 'knowledge' (ทุกองค์กร) และสร้างใหม่ ใช้เฉพาะกรณี migrate embedding model เท่านั้น — ทุก item ทุกองค์กรจะถูก reset เป็น PENDING",
      "ยืนยัน Drop Collection (DESTRUCTIVE)",
    );
    if (!ok) return;
    setResetting(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`${apiBase}/knowledge-import/admin/reset-qdrant`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || "รีเซ็ตไม่สำเร็จ");
      }
      const data = await res.json();
      toastSuccess(`Drop + recreate สำเร็จ (${data.itemsReset} รายการถูกรีเซ็ต)`);
      await loadItems();
    } catch (err: unknown) {
      toastError((err as Error).message || "เกิดข้อผิดพลาด");
    } finally {
      setResetting(false);
    }
  };

  const handleRetry = async (id: number) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${apiBase}/knowledge-import/${id}/retry`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        toastSuccess("เริ่มประมวลผลใหม่แล้ว");
        await loadItems();
      } else {
        toastError("ไม่สามารถลองใหม่ได้");
      }
    } catch {
      toastError("เกิดข้อผิดพลาด");
    }
  };

  const acceptTypes = "application/pdf,image/jpeg,image/png,image/webp,text/plain";

  return (
    <main className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">นำเข้าความรู้</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            อัปโหลด PDF, รูปภาพ, หรือข้อความเพื่อเพิ่มองค์ความรู้ให้ระบบ AI
          </p>
        </div>
        <button
          onClick={loadItems}
          className="p-2 rounded-xl text-on-surface-variant hover:text-primary hover:bg-surface-bright transition-colors"
          title="รีเฟรช"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {isAdmin && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-800 text-sm">เครื่องมือ Admin — Reset ฐานความรู้ RAG</h3>
              <p className="text-xs text-red-700 mt-1">
                ใช้เมื่อข้อมูลความรู้ผิดพลาด/ไม่สามารถใช้ได้ ระบบจะลบ vectors ใน Qdrant และตั้งให้ item เป็น PENDING
                (ต้องกดลองใหม่เพื่อ re-embed) ข้อมูลต้นฉบับในฐานข้อมูลและ MinIO จะไม่ถูกลบ
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleAdminResetOrg}
              disabled={resetting}
              className="inline-flex items-center gap-2 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resetting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              Reset ความรู้องค์กรนี้
            </button>
            <button
              onClick={handleAdminResetQdrant}
              disabled={resetting}
              className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-red-300 text-red-700 text-sm font-medium rounded-xl hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Drop + recreate Qdrant knowledge collection (ทุกองค์กร)"
            >
              <Trash2 size={14} />
              Drop Qdrant Collection (ทุกองค์กร)
            </button>
          </div>
        </div>
      )}

      {/* Upload Form */}
      <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6 space-y-5">
        <h2 className="font-semibold text-on-surface">เพิ่มความรู้ใหม่</h2>

        {/* Source type toggle */}
        <div className="flex gap-2">
          {(["file", "text"] as SourceType[]).map((t) => (
            <button
              key={t}
              onClick={() => setSourceType(t)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                sourceType === t
                  ? "bg-primary text-on-primary"
                  : "bg-surface-bright text-on-surface-variant hover:text-primary"
              }`}
            >
              {t === "file" ? <FileText size={15} /> : <Type size={15} />}
              {t === "file" ? "ไฟล์ (PDF/รูปภาพ)" : "ข้อความ"}
            </button>
          ))}
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-on-surface mb-1">
            ชื่อความรู้ <span className="text-error">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="เช่น คู่มือการลาประจำปี 2568"
            className="w-full px-4 py-2.5 rounded-xl border border-outline-variant bg-surface-bright text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-on-surface mb-1">หมวดหมู่</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-outline-variant bg-surface-bright text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">-- ไม่ระบุ --</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* File dropzone or text area */}
        {sourceType === "file" ? (
          <div
            onDrop={handleFileDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-outline-variant hover:border-primary/50 hover:bg-surface-bright"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptTypes}
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                {file.type.startsWith("image/") ? (
                  <Image size={32} className="text-primary" />
                ) : (
                  <FileText size={32} className="text-primary" />
                )}
                <p className="font-medium text-on-surface text-sm">{file.name}</p>
                <p className="text-xs text-on-surface-variant">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-on-surface-variant">
                <Upload size={32} />
                <p className="text-sm font-medium">ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือก</p>
                <p className="text-xs">PDF, JPG, PNG, WEBP (สูงสุด 20 MB)</p>
              </div>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">
              เนื้อหาความรู้ <span className="text-error">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={8}
              placeholder="วางข้อความหรือเนื้อหาที่ต้องการนำเข้าสู่ระบบ..."
              className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-bright text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={
            submitting ||
            !title.trim() ||
            (sourceType === "file" && !file) ||
            (sourceType === "text" && !description.trim())
          }
          className="w-full py-3 px-4 bg-primary text-on-primary rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary/20 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              กำลังอัปโหลด...
            </>
          ) : (
            <>
              <Upload size={16} />
              นำเข้าความรู้
            </>
          )}
        </button>
      </div>

      {/* Inspection modal */}
      {inspecting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setInspecting(null)}
        >
          <div
            className="bg-surface rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between p-5 border-b border-outline-variant/20">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-on-surface truncate">{inspecting.item.title}</h3>
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-on-surface-variant">
                  <span>หมวดหมู่: {inspecting.item.category ?? "-"}</span>
                  <span>Chunks (DB): {inspecting.item.chunkCount}</span>
                  <span>Chunks (Qdrant): {inspecting.qdrantChunkCount}</span>
                  <span>ข้อความสกัดได้: {inspecting.item.extractedText?.length ?? 0} ตัวอักษร</span>
                </div>
              </div>
              <button
                onClick={() => setInspecting(null)}
                className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-bright"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {inspectLoading ? (
                <div className="py-12 text-center text-on-surface-variant">
                  <Loader2 size={24} className="animate-spin mx-auto mb-2" />
                  กำลังโหลด...
                </div>
              ) : (
                <>
                  {inspecting.item.chunkCount !== inspecting.qdrantChunkCount && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800 flex gap-2">
                      <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                      <div>
                        <strong>จำนวน chunks ไม่ตรงกัน</strong> — DB บันทึก {inspecting.item.chunkCount} แต่ Qdrant มี {inspecting.qdrantChunkCount}
                        อาจเกิดจากลบ collection หรือ re-embed ไม่ครบ กดลองใหม่เพื่อ re-embed
                      </div>
                    </div>
                  )}

                  <section>
                    <h4 className="text-sm font-semibold text-on-surface mb-2">
                      ข้อความที่สกัดได้ (OCR output)
                    </h4>
                    <div className="max-h-64 overflow-y-auto p-3 rounded-xl bg-surface-bright border border-outline-variant/20 text-xs text-on-surface-variant whitespace-pre-wrap font-mono">
                      {inspecting.item.extractedText?.trim() || <em className="text-on-surface-variant/60">ไม่มีข้อความที่สกัดได้</em>}
                    </div>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-on-surface mb-2">
                      Chunks ใน Qdrant ({inspecting.chunks.length})
                    </h4>
                    {inspecting.chunks.length === 0 ? (
                      <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                        ไม่พบ chunks ใน Qdrant — ความรู้นี้ไม่สามารถใช้ค้นหาได้
                        กดปุ่ม &quot;ลองใหม่&quot; เพื่อ re-embed หรือลบรายการนี้ออก
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {inspecting.chunks.map((c) => (
                          <div
                            key={c.id}
                            className="p-3 rounded-xl bg-surface-bright border border-outline-variant/20 text-xs"
                          >
                            <div className="flex flex-wrap gap-2 mb-1.5 text-[10px] uppercase tracking-wider text-on-surface-variant">
                              <span className="font-semibold">#{c.chunkIndex + 1}</span>
                              {c.semanticLabel && (
                                <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary normal-case">
                                  {c.semanticLabel}
                                </span>
                              )}
                              {c.sectionTitle && (
                                <span className="normal-case text-on-surface">{c.sectionTitle}</span>
                              )}
                              {c.breadcrumb && (
                                <span className="normal-case text-on-surface-variant/70">{c.breadcrumb}</span>
                              )}
                            </div>
                            <p className="text-on-surface whitespace-pre-wrap leading-relaxed">
                              {c.text || <em className="text-on-surface-variant/60">(empty payload)</em>}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 p-4 border-t border-outline-variant/20">
              <div className="text-xs text-on-surface-variant">
                {!inspectLoading && (
                  inspecting.chunks.length > 0
                    ? <span className="text-green-700 flex items-center gap-1"><CheckCircle size={14} /> ข้อมูลพร้อมใช้งานใน RAG</span>
                    : <span className="text-red-700 flex items-center gap-1"><XCircle size={14} /> ข้อมูลไม่พร้อมใช้งาน — แนะนำให้ลบหรือ re-embed</span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const id = inspecting.item.id;
                    const title = inspecting.item.title;
                    setInspecting(null);
                    handleDelete(id, title);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl"
                >
                  <Trash2 size={14} />
                  ลบรายการนี้
                </button>
                <button
                  onClick={() => {
                    const id = inspecting.item.id;
                    setInspecting(null);
                    handleRetry(id);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 rounded-xl"
                >
                  <RotateCcw size={14} />
                  ประมวลผลใหม่
                </button>
                <button
                  onClick={() => setInspecting(null)}
                  className="px-3 py-1.5 text-sm bg-surface-bright text-on-surface rounded-xl hover:bg-outline-variant/20"
                >
                  ปิด
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History table */}
      <div className="bg-surface rounded-2xl border border-outline-variant/20 overflow-hidden">
        <div className="p-4 border-b border-outline-variant/20">
          <h2 className="font-semibold text-on-surface">ประวัติการนำเข้า ({items.length})</h2>
        </div>
        {items.length === 0 ? (
          <div className="py-12 text-center text-on-surface-variant text-sm">
            {loading ? "กำลังโหลด..." : "ยังไม่มีรายการความรู้"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-bright text-on-surface-variant text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">ชื่อความรู้</th>
                  <th className="px-4 py-3 text-left">หมวดหมู่</th>
                  <th className="px-4 py-3 text-left">ประเภท</th>
                  <th className="px-4 py-3 text-left">สถานะ</th>
                  <th className="px-4 py-3 text-left">Chunks</th>
                  <th className="px-4 py-3 text-left">ผู้อัปโหลด</th>
                  <th className="px-4 py-3 text-left">วันที่</th>
                  <th className="px-4 py-3 text-left">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-surface-bright transition-colors">
                    <td className="px-4 py-3 font-medium text-on-surface">{item.title}</td>
                    <td className="px-4 py-3 text-on-surface-variant">{item.category ?? "-"}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-on-surface-variant">
                        {item.sourceType === "pdf" ? (
                          <FileText size={13} />
                        ) : item.sourceType === "image" ? (
                          <Image size={13} />
                        ) : (
                          <Type size={13} />
                        )}
                        {item.sourceType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[item.status]}`}
                      >
                        {item.status === "DONE" && <CheckCircle size={11} />}
                        {item.status === "ERROR" && <XCircle size={11} />}
                        {item.status === "PROCESSING" && <Loader2 size={11} className="animate-spin" />}
                        {STATUS_LABEL[item.status]}
                      </span>
                      {item.status === "ERROR" && item.errorMessage && (
                        <p className="text-xs text-red-600 mt-1 max-w-[200px] truncate" title={item.errorMessage}>
                          {item.errorMessage}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">
                      {item.chunkCount > 0 ? item.chunkCount : "-"}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">{item.uploadedBy.fullName}</td>
                    <td className="px-4 py-3 text-on-surface-variant text-xs">
                      {new Date(item.createdAt).toLocaleDateString("th-TH")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {item.status === "DONE" && (
                          <button
                            onClick={() => handleInspect(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="ดูเนื้อหาที่สกัดได้และ chunks ใน Qdrant"
                          >
                            <Eye size={12} />
                            ตรวจสอบ
                          </button>
                        )}
                        {(item.status === "ERROR" || item.status === "PROCESSING") && (
                          <button
                            onClick={() => handleRetry(item.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors"
                            title="ลองประมวลผลใหม่"
                          >
                            <RotateCcw size={12} />
                            ลองใหม่
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(item.id, item.title)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="ลบความรู้นี้"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
