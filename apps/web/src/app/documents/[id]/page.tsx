import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, FolderOpen, FileText, Tag } from "lucide-react";
import { formatThaiDateTime } from "@/lib/thai-date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

const STATUS_CLS: Record<string, string> = {
  processed: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  pending: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
  error: "bg-red-500/20 text-red-800 dark:text-red-300",
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
      {/* Local breadcrumb — complements the header Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-on-surface-variant">
        <Link href="/documents" className="hover:text-primary transition-colors">คลังเอกสาร</Link>
        <ChevronRight size={14} />
        <span className="text-on-surface font-medium truncate max-w-xs">{doc.title}</span>
      </nav>

      {/* Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FolderOpen size={28} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-black text-primary tracking-tight leading-snug">{doc.title}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {doc.sourceType && (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-primary/15 text-primary">
                    {SOURCE_LABEL[doc.sourceType] ?? doc.sourceType}
                  </span>
                )}
                {doc.status && (
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_CLS[doc.status] ?? "bg-surface-mid text-on-surface-variant"}`}
                  >
                    {doc.status}
                  </span>
                )}
                {doc.mimeType && (
                  <span className="text-xs text-on-surface-variant">{doc.mimeType}</span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-on-surface-variant text-xs font-bold uppercase tracking-wider">สร้างเมื่อ</span>
              <p className="text-on-surface mt-0.5">
                {formatThaiDateTime(doc.createdAt)}
              </p>
            </div>
            {doc.fileUrl && (
              <div>
                <span className="text-on-surface-variant text-xs font-bold uppercase tracking-wider">ไฟล์</span>
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
        </CardContent>
      </Card>

      {/* Topics */}
      {doc.documentTopics && doc.documentTopics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag size={16} className="text-secondary" /> หัวข้อที่เกี่ยวข้อง
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {doc.documentTopics.map((dt) => (
                <span
                  key={dt.id}
                  className="px-3 py-1 rounded-full text-sm bg-secondary/15 text-secondary font-medium"
                >
                  {dt.topic?.name ?? "ไม่ทราบ"}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Extracted text */}
      {doc.extractedText && (
        <Card>
          <CardHeader>
            <CardTitle>ข้อความที่สกัดได้ (OCR)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-on-surface-variant whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
              {doc.extractedText}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Chunks preview */}
      {doc.documentChunks && doc.documentChunks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>ตัวอย่าง Chunks (RAG)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {doc.documentChunks.map((ch, i) => (
                <div key={ch.id} className="bg-surface-low rounded-xl p-3 border border-outline-variant/30">
                  <p className="text-xs text-on-surface-variant font-bold mb-1">Chunk {i + 1}</p>
                  <p className="text-sm text-on-surface-variant leading-relaxed line-clamp-3">{ch.content}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
