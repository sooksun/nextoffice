"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { toastSuccess, toastError } from "@/lib/toast";
import { getUser } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { FolderOpen, Plus, Archive, AlertTriangle, Trash2 } from "lucide-react";
import { formatThaiDateShort, toThaiNumerals } from "@/lib/thai-date";

interface Folder {
  id: number;
  name: string;
  code: string;
  retentionYears: number;
  description: string | null;
  documentCount: number;
  parentId: number | null;
}

interface ArchivedDoc {
  id: number;
  registryType: string;
  registryNo: string | null;
  documentNo: string | null;
  subject: string | null;
  archivedAt: string;
  retentionEndDate: string | null;
  folder: { name: string; code: string } | null;
  inboundCase: { id: number; title: string } | null;
  outboundDoc: { id: number; subject: string } | null;
}

interface DestructionReq {
  id: number;
  status: string;
  requestedBy: string;
  approvedBy: string | null;
  itemCount: number;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  destroyed: "ทำลายแล้ว",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
  approved: "bg-blue-500/20 text-blue-800 dark:text-blue-300",
  destroyed: "bg-red-500/20 text-red-800 dark:text-red-300",
};

const DISPOSITION_LABEL: Record<string, string> = {
  keep_self: "ขอเก็บเอง",
  deposit: "ฝากหนังสือ",
};

export default function ArchivePage() {
  const [orgId, setOrgId] = useState(1);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [docs, setDocs] = useState<ArchivedDoc[]>([]);
  const [destructions, setDestructions] = useState<DestructionReq[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<number | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolder, setNewFolder] = useState({ name: "", code: "", retentionYears: 10 });
  const [tab, setTab] = useState<"archive" | "destruction">("archive");

  const loadData = useCallback(async (oid: number) => {
    try {
      const [f, d, dr] = await Promise.all([
        apiFetch<Folder[]>(`/archive/${oid}/folders`),
        apiFetch<ArchivedDoc[]>(`/archive/${oid}/registry`),
        apiFetch<DestructionReq[]>(`/archive/${oid}/destruction`),
      ]);
      setFolders(f);
      setDocs(d);
      setDestructions(dr);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void Promise.resolve().then(async () => {
      const user = getUser();
      const id = user?.organizationId || 1;
      if (cancelled) return;
      setOrgId(id);
      await loadData(id);
    });

    return () => {
      cancelled = true;
    };
  }, [loadData]);

  const handleCreateFolder = async () => {
    if (!newFolder.name || !newFolder.code) return;
    try {
      await apiFetch(`/archive/${orgId}/folders`, {
        method: "POST",
        body: JSON.stringify(newFolder),
      });
      toastSuccess("สร้างแฟ้มสำเร็จ");
      setShowNewFolder(false);
      setNewFolder({ name: "", code: "", retentionYears: 10 });
      void loadData(orgId);
    } catch (err: unknown) {
      toastError(getErrorMessage(err));
    }
  };

  const handleDisposition = async (
    registryId: number,
    disposition: "keep_self" | "deposit" | "archive",
  ) => {
    try {
      await apiFetch(`/archive/documents/${registryId}/disposition`, {
        method: "POST",
        body: JSON.stringify({ disposition }),
      });
      toastSuccess(
        disposition === "keep_self"
          ? "บันทึกเป็นบัญชีขอเก็บเองแล้ว"
          : disposition === "deposit"
            ? "บันทึกเป็นบัญชีฝากหนังสือแล้ว"
            : "คืนสู่ทะเบียนหนังสือเก็บแล้ว",
      );
      void loadData(orgId);
    } catch (err: unknown) {
      toastError(getErrorMessage(err));
    }
  };

  const filteredDocs = selectedFolder
    ? docs.filter((d) => d.folder?.code === folders.find((f) => f.id === selectedFolder)?.code)
    : docs;

  const isExpiringSoon = (date: string | null) => {
    if (!date) return false;
    const d = new Date(date);
    const now = new Date();
    const diffDays = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= 30;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-tertiary/10 flex items-center justify-center">
            <Archive size={20} className="text-tertiary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight">จัดแฟ้มเก็บ</h1>
            <p className="text-xs text-on-surface-variant">ทะเบียนหนังสือเก็บ + ทำลายหนังสือ</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        <button onClick={() => setTab("archive")} className={`px-4 py-2 rounded-xl text-sm font-semibold ${tab === "archive" ? "bg-primary text-on-primary" : "bg-surface-bright text-on-surface-variant"}`}>
          <FolderOpen size={14} className="inline mr-1" /> แฟ้มเก็บ
        </button>
        <button onClick={() => setTab("destruction")} className={`px-4 py-2 rounded-xl text-sm font-semibold ${tab === "destruction" ? "bg-red-600 text-white" : "bg-surface-bright text-on-surface-variant"}`}>
          <Trash2 size={14} className="inline mr-1" /> ทำลายหนังสือ
        </button>
      </div>

      {tab === "archive" && (
        <div className="grid grid-cols-12 gap-4">
          {/* Folder sidebar */}
          <div className="col-span-3">
            <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-on-surface-variant">แฟ้ม</h3>
                <button onClick={() => setShowNewFolder(!showNewFolder)} className="text-primary hover:text-primary/80">
                  <Plus size={16} />
                </button>
              </div>

              {showNewFolder && (
                <div className="space-y-2 mb-3 p-3 bg-surface-bright rounded-xl">
                  <input type="text" placeholder="ชื่อแฟ้ม" value={newFolder.name} onChange={(e) => setNewFolder({ ...newFolder, name: e.target.value })} className="input-text w-full text-xs" />
                  <input type="text" placeholder="รหัสแฟ้ม (เช่น 01-001)" value={newFolder.code} onChange={(e) => setNewFolder({ ...newFolder, code: e.target.value })} className="input-text w-full text-xs" />
                  <input type="number" placeholder="อายุเก็บ (ปี)" value={newFolder.retentionYears} onChange={(e) => setNewFolder({ ...newFolder, retentionYears: parseInt(e.target.value) || 10 })} className="input-text w-full text-xs" />
                  <button onClick={handleCreateFolder} className="btn-primary text-xs w-full">สร้างแฟ้ม</button>
                </div>
              )}

              <button onClick={() => setSelectedFolder(null)} className={`w-full text-left px-3 py-2 rounded-xl text-xs mb-1 ${!selectedFolder ? "bg-primary/10 text-primary font-bold" : "hover:bg-surface-bright"}`}>
                ทั้งหมด ({toThaiNumerals(docs.length)})
              </button>
              {folders.map((f) => (
                <button key={f.id} onClick={() => setSelectedFolder(f.id)} className={`w-full text-left px-3 py-2 rounded-xl text-xs mb-1 ${selectedFolder === f.id ? "bg-primary/10 text-primary font-bold" : "hover:bg-surface-bright"}`}>
                  <FolderOpen size={12} className="inline mr-1" />
                  {toThaiNumerals(f.code)} {f.name} ({toThaiNumerals(f.documentCount)})
                  <span className="text-on-surface-variant ml-1">({toThaiNumerals(f.retentionYears)} ปี)</span>
                </button>
              ))}
            </div>
          </div>

          {/* Document list */}
          <div className="col-span-9">
            <div className="overflow-x-auto rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-surface-bright text-on-surface-variant text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-3 text-left">ลำดับ</th>
                    <th className="px-3 py-3 text-left">เลขที่</th>
                    <th className="px-3 py-3 text-left">เรื่อง</th>
                    <th className="px-3 py-3 text-left">แฟ้ม</th>
                    <th className="px-3 py-3 text-left">วันที่เก็บ</th>
                    <th className="px-3 py-3 text-left">ครบกำหนด</th>
                    <th className="px-3 py-3 text-left">จัดเก็บครบ ๒๐ ปี</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-on-surface-variant">ไม่พบเอกสาร</td></tr>
                  )}
                  {filteredDocs.map((d, i) => (
                    <tr key={d.id} className="border-t border-outline-variant/10 hover:bg-surface-bright/50">
                      <td className="px-3 py-2 text-on-surface-variant">{toThaiNumerals(i + 1)}</td>
                      <td className="px-3 py-2 text-xs font-mono">{d.documentNo ? toThaiNumerals(d.documentNo) : d.registryNo ? toThaiNumerals(d.registryNo) : "—"}</td>
                      <td className="px-3 py-2 text-xs max-w-[200px] truncate">
                        {d.subject || d.inboundCase?.title || d.outboundDoc?.subject || "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">{d.folder ? `${toThaiNumerals(d.folder.code)} ${d.folder.name}` : "—"}</td>
                      <td className="px-3 py-2 text-xs">{formatThaiDateShort(d.archivedAt)}</td>
                      <td className="px-3 py-2 text-xs">
                        {d.retentionEndDate ? (
                          <span className={isExpiringSoon(d.retentionEndDate) ? "text-red-600 font-semibold" : ""}>
                            {isExpiringSoon(d.retentionEndDate) && <AlertTriangle size={12} className="inline mr-1" />}
                            {formatThaiDateShort(d.retentionEndDate)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {d.registryType === "destroy" ? (
                          <span className="text-[10px] text-red-600 font-semibold">ทำลายแล้ว</span>
                        ) : DISPOSITION_LABEL[d.registryType] ? (
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-lg bg-secondary/15 text-secondary font-semibold text-[10px] whitespace-nowrap">
                              {DISPOSITION_LABEL[d.registryType]}
                            </span>
                            <button
                              onClick={() => handleDisposition(d.id, "archive")}
                              className="text-[10px] text-on-surface-variant hover:text-primary underline"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDisposition(d.id, "keep_self")}
                              className="px-2 py-0.5 rounded-lg bg-surface-bright hover:bg-secondary/15 text-[10px] font-medium whitespace-nowrap"
                            >
                              ขอเก็บเอง
                            </button>
                            <button
                              onClick={() => handleDisposition(d.id, "deposit")}
                              className="px-2 py-0.5 rounded-lg bg-surface-bright hover:bg-tertiary/15 text-[10px] font-medium whitespace-nowrap"
                            >
                              ฝาก
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "destruction" && (
        <div className="overflow-x-auto rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-surface-bright text-on-surface-variant text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">สถานะ</th>
                <th className="px-4 py-3 text-left">ผู้ขอ</th>
                <th className="px-4 py-3 text-left">ผู้อนุมัติ</th>
                <th className="px-4 py-3 text-center">จำนวนรายการ</th>
                <th className="px-4 py-3 text-left">วันที่</th>
              </tr>
            </thead>
            <tbody>
              {destructions.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-on-surface-variant">ไม่มีรายการทำลาย</td></tr>
              )}
              {destructions.map((d, i) => (
                <tr key={d.id} className="border-t border-outline-variant/10 hover:bg-surface-bright/50">
                  <td className="px-4 py-2 text-on-surface-variant">{toThaiNumerals(i + 1)}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${STATUS_COLOR[d.status] ?? ""}`}>
                      {STATUS_LABEL[d.status] ?? d.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs">{d.requestedBy}</td>
                  <td className="px-4 py-2 text-xs">{d.approvedBy ?? "—"}</td>
                  <td className="px-4 py-2 text-center text-xs font-bold">{toThaiNumerals(d.itemCount)}</td>
                  <td className="px-4 py-2 text-xs">{formatThaiDateShort(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
