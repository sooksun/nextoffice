import { apiFetch } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import Link from "next/link";
import { formatThaiDateTime } from "@/lib/thai-date";

export const dynamic = "force-dynamic";

interface DocumentIntake {
  id: string;
  sourceChannel: string;
  mimeType: string | null;
  fileExtension: string | null;
  uploadStatus: string;
  ocrStatus: string;
  classifierStatus: string;
  aiStatus: string;
  documentType: string | null;
  isOfficial: boolean | null;
  createdAt: string;
}

interface AiResult {
  id: string;
  documentType: string | null;
  isOfficial: boolean | null;
  confidence: number | null;
  extractedTitle: string | null;
  extractedSender: string | null;
  extractedDate: string | null;
  ocrFullText: string | null;
}

async function getIntake(id: string) {
  try {
    return await apiFetch<DocumentIntake>(`/intake/${id}`);
  } catch {
    return null;
  }
}

async function getResult(id: string) {
  try {
    return await apiFetch<AiResult>(`/intake/${id}/result`);
  } catch {
    return null;
  }
}

export default async function IntakeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [intake, result] = await Promise.all([getIntake(id), getResult(id)]);

  if (!intake) {
    return (
      <div>
        <Link href="/intakes" className="text-primary hover:text-secondary text-sm font-bold">← กลับ</Link>
        <p className="mt-4 text-on-surface-variant">ไม่พบเอกสาร #{id}</p>
      </div>
    );
  }

  return (
    <div>
      <Link href="/intakes" className="text-primary hover:text-secondary text-sm font-bold">← กลับ</Link>
      <h1 className="text-3xl font-black text-primary tracking-tight mt-3 mb-6">เอกสารขาเข้า #{intake.id}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <section className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 shadow-sm">
          <h2 className="font-bold text-primary mb-4">ข้อมูลทั่วไป</h2>
          <dl className="space-y-2.5 text-sm">
            <Row label="ช่องทาง" value={intake.sourceChannel} />
            <Row label="ประเภทไฟล์" value={intake.mimeType ?? "—"} />
            <Row label="นามสกุล" value={intake.fileExtension ?? "—"} />
            <Row label="วันที่" value={formatThaiDateTime(intake.createdAt)} />
          </dl>
        </section>

        <section className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 shadow-sm">
          <h2 className="font-bold text-primary mb-4">สถานะ</h2>
          <dl className="space-y-2.5 text-sm">
            <RowBadge label="อัพโหลด" status={intake.uploadStatus} />
            <RowBadge label="OCR" status={intake.ocrStatus} />
            <RowBadge label="จำแนก" status={intake.classifierStatus} />
            <RowBadge label="AI" status={intake.aiStatus} />
          </dl>
        </section>

        {result && (
          <section className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 md:col-span-2 shadow-sm">
            <h2 className="font-bold text-primary mb-4">ผลวิเคราะห์ AI</h2>
            <dl className="space-y-2.5 text-sm">
              <Row label="ประเภทเอกสาร" value={result.documentType ?? "—"} />
              <Row label="หนังสือราชการ" value={result.isOfficial === null ? "—" : result.isOfficial ? "ใช่" : "ไม่ใช่"} />
              <Row label="ความเชื่อมั่น" value={result.confidence !== null ? `${(result.confidence * 100).toFixed(1)}%` : "—"} />
              <Row label="ชื่อเรื่อง" value={result.extractedTitle ?? "—"} />
              <Row label="ผู้ส่ง" value={result.extractedSender ?? "—"} />
              <Row label="วันที่เอกสาร" value={result.extractedDate ?? "—"} />
            </dl>
            {result.ocrFullText && (
              <div className="mt-4">
                <p className="text-[10px] font-bold text-outline uppercase tracking-wider mb-1.5">OCR ข้อความ</p>
                <pre className="bg-surface-low rounded-xl p-3 text-xs whitespace-pre-wrap text-on-surface-variant max-h-48 overflow-y-auto border border-outline-variant/10">
                  {result.ocrFullText}
                </pre>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-32 text-on-surface-variant shrink-0">{label}</dt>
      <dd className="text-on-surface font-medium">{value}</dd>
    </div>
  );
}

function RowBadge({ label, status }: { label: string; status: string }) {
  return (
    <div className="flex gap-2 items-center">
      <dt className="w-32 text-on-surface-variant shrink-0">{label}</dt>
      <dd><StatusBadge status={status} /></dd>
    </div>
  );
}
