import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, FolderOpen, FileText, Tag } from "lucide-react";

export const dynamic = "force-dynamic";

interface Document {
  id: number;
  title: string;
  sourceType: string | null;
  status: string | null;
  fileUrl: string | null;
  mimeType: string | null;
  extractedText: string | null;
  createdAt: string;
  documentTopics?: { id: number; topic: { id: number; name: string } | null }[];
  documentChunks?: { id: number; content: string }[];
}

async function getDocument(id: string): Promise<Document | null> {
  try {
    return await apiFetch<Document>(`/documents/${id}`);
  } catch {
    return null;
  }
}

const SOURCE_LABEL: Record<string, string> = {
  line: "LINE Bot", upload: "อัปโหลด", email: "อีเมล", manual: "บันทึกเอง",
};

const STATUS_COLOR: Record<string, string> = {
  processed: "bg-success/10 text-success",
  pending: "bg-warning/10 text-warning",
  error: "bg-error/10 text-error",
};

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const doc = await getDocument(id);
  if (!doc) notFound();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-outline">
        <Link href="/documents" className="hover:text-primary transition-colors">คลังเอกสาร</Link>
        <ChevronRight size={14} />
        <span className="text-on-surface font-medium truncate max-w-xs">{doc.title}</span>
      </nav>

      {/* Header */}
      <div className="bg-surface-lowest rounded-3xl border border-outline-variant/10 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <FolderOpen size={28} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-primary tracking-tight leading-snug">{doc.title}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {doc.sourceType && (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                  {SOURCE_LABEL[doc.sourceType] ?? doc.sourceType}
                </span>
              )}
              {doc.status && (
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_COLOR[doc.status] ?? "bg-outline/10 text-outline"}`}>
                  {doc.status}
                </span>
              )}
              {doc.mimeType && (
                <span className="text-xs text-outline">{doc.mimeType}</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-outline text-xs font-bold uppercase tracking-wider">สร้างเมื่อ</span>
            <p className="text-on-surface mt-0.5">
              {new Date(doc.createdAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </div>
          {doc.fileUrl && (
            <div>
              <span className="text-outline text-xs font-bold uppercase tracking-wider">ไฟล์</span>
              <a
                href={doc.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-primary hover:underline mt-0.5"
              >
                <FileText size={14} />
                ดาวน์โหลดไฟล์
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Topics */}
      {doc.documentTopics && doc.documentTopics.length > 0 && (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 shadow-sm p-5">
          <h2 className="font-bold text-on-surface mb-3 flex items-center gap-2">
            <Tag size={16} className="text-secondary" /> หัวข้อที่เกี่ยวข้อง
          </h2>
          <div className="flex flex-wrap gap-2">
            {doc.documentTopics.map((dt) => (
              <span
                key={dt.id}
                className="px-3 py-1 rounded-full text-sm bg-secondary/10 text-secondary font-medium"
              >
                {dt.topic?.name ?? "ไม่ทราบ"}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Extracted text */}
      {doc.extractedText && (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 shadow-sm p-5">
          <h2 className="font-bold text-on-surface mb-3">ข้อความที่สกัดได้ (OCR)</h2>
          <p className="text-sm text-on-surface-variant whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
            {doc.extractedText}
          </p>
        </div>
      )}

      {/* Chunks preview */}
      {doc.documentChunks && doc.documentChunks.length > 0 && (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 shadow-sm p-5">
          <h2 className="font-bold text-on-surface mb-3">ตัวอย่าง Chunks (RAG)</h2>
          <div className="space-y-3">
            {doc.documentChunks.map((ch, i) => (
              <div key={ch.id} className="bg-surface-low rounded-xl p-3">
                <p className="text-xs text-outline font-bold mb-1">Chunk {i + 1}</p>
                <p className="text-sm text-on-surface-variant leading-relaxed line-clamp-3">{ch.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
