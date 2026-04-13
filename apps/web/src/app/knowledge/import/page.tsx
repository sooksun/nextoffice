"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Upload, FileText, Image, Type, CheckCircle, XCircle, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { getAuthToken } from "@/lib/api";
import { toast } from "react-toastify";

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
  createdAt: string;
  uploadedBy: { id: number; fullName: string };
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`${apiBase}/knowledge-import`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

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
      alert((err as Error).message || "เกิดข้อผิดพลาด");
    } finally {
      setSubmitting(false);
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
        toast.success("เริ่มประมวลผลใหม่แล้ว");
        await loadItems();
      } else {
        toast.error("ไม่สามารถลองใหม่ได้");
      }
    } catch {
      toast.error("เกิดข้อผิดพลาด");
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
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">
                      {item.chunkCount > 0 ? item.chunkCount : "-"}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">{item.uploadedBy.fullName}</td>
                    <td className="px-4 py-3 text-on-surface-variant text-xs">
                      {new Date(item.createdAt).toLocaleDateString("th-TH")}
                    </td>
                    <td className="px-4 py-3">
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
