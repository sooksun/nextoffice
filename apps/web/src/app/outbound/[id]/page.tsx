import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { ArrowLeft, Send } from "lucide-react";
import OutboundActions from "./OutboundActions";
import OutboundPdfButton from "./OutboundPdfButton";
import SignatureVerification from "@/components/SignatureVerification";
import { formatThaiDateShort, toThaiNumerals } from "@/lib/thai-date";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง", pending_approval: "รออนุมัติ", approved: "อนุมัติแล้ว", sent: "ส่งแล้ว",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-surface-bright text-on-surface-variant", pending_approval: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800", sent: "bg-green-100 text-green-800",
};
const URGENCY_LABEL: Record<string, string> = {
  normal: "ทั่วไป", urgent: "ด่วน", very_urgent: "ด่วนที่สุด", most_urgent: "ด่วนที่สุด",
};
const LETTER_TYPE_LABEL: Record<string, string> = {
  external_letter: "หนังสือภายนอก",
  internal_memo:   "หนังสือภายใน",
  directive:       "หนังสือสั่งการ",
  pr_letter:       "หนังสือประชาสัมพันธ์",
  official_record: "หนังสือที่เจ้าหน้าที่ทำขึ้น",
  stamp_letter:    "หนังสือประทับตรา",
  secret_letter:   "หนังสือลับ",
};
const SECURITY_LABEL: Record<string, string> = {
  normal:      "ไม่มีชั้นความลับ",
  secret:      "ลับ",
  top_secret:  "ลับมาก",
  most_secret: "ลับที่สุด",
};

const SENT_METHOD_LABEL: Record<string, string> = {
  email: "📧 อีเมล",
  line: "💬 LINE",
  paper: "📄 ส่งเอกสาร",
};

interface OutboundDoc {
  id: number;
  documentNo: string | null;
  documentDate: string | null;
  subject: string;
  bodyText: string | null;
  recipientName: string | null;
  recipientOrg: string | null;
  recipientEmail: string | null;
  urgencyLevel: string;
  securityLevel: string;
  letterType: string;
  status: string;
  sentAt: string | null;
  sentMethod: string | null;
  approvedAt: string | null;
  createdAt: string;
  createdBy: { id: number; fullName: string } | null;
  approvedBy: { id: number; fullName: string } | null;
  relatedInboundCase: { id: number; title: string; registrationNo: string | null } | null;
}

async function getDoc(id: string) {
  try { return await apiFetch<OutboundDoc>(`/outbound/documents/${id}`); } catch { return null; }
}

export default async function OutboundDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const doc = await getDoc(id);

  if (!doc) {
    return (
      <div className="text-center py-20">
        <p className="text-on-surface-variant">ไม่พบเอกสาร</p>
        <Link href="/saraban/outbound" className="text-primary hover:underline text-sm mt-2 inline-block">กลับ</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link href="/saraban/outbound" className="inline-flex items-center gap-1 text-primary hover:underline text-sm mb-4">
        <ArrowLeft size={16} /> ย้อนกลับ
      </Link>

      <div className="flex items-start gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0 mt-1">
          <Send size={20} className="text-secondary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-on-surface leading-tight mb-2">{doc.subject}</h1>
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-semibold ${STATUS_COLOR[doc.status]}`}>
              {STATUS_LABEL[doc.status]}
            </span>
            {doc.documentNo && (
              <span className="inline-flex px-2 py-0.5 rounded-lg text-xs font-mono font-bold text-primary bg-primary/5">
                {toThaiNumerals(doc.documentNo)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* PDF Actions */}
      <div className="mb-4">
        <OutboundPdfButton docId={doc.id} documentNo={doc.documentNo} />
      </div>

      {/* Actions */}
      <OutboundActions docId={doc.id} status={doc.status} sentMethod={doc.sentMethod ?? null} recipientEmail={doc.recipientEmail ?? null} />

      {/* Digital Signature Verification */}
      {(doc.status === "approved" || doc.status === "sent") && (
        <div className="mb-4">
          <SignatureVerification type="outbound" id={doc.id} />
        </div>
      )}

      {/* Document Details */}
      <div className="rounded-2xl border border-outline-variant/20 bg-surface-lowest shadow-sm mb-6">
        <div className="p-5">
          <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wide mb-4">ข้อมูลหนังสือ</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-on-surface-variant">เลขที่หนังสือ:</span>
              <p className="font-medium font-mono">{doc.documentNo ? toThaiNumerals(doc.documentNo) : "รอการอนุมัติ"}</p>
            </div>
            <div>
              <span className="text-on-surface-variant">วันที่หนังสือ:</span>
              <p className="font-medium">{doc.documentDate ? formatThaiDateShort(doc.documentDate) : "—"}</p>
            </div>
            <div>
              <span className="text-on-surface-variant">ถึง:</span>
              <p className="font-medium">{doc.recipientOrg || "—"}</p>
            </div>
            <div>
              <span className="text-on-surface-variant">ผู้รับ:</span>
              <p className="font-medium">{doc.recipientName || "—"}</p>
            </div>
            <div>
              <span className="text-on-surface-variant">ประเภทหนังสือ:</span>
              <p className="font-medium">{LETTER_TYPE_LABEL[doc.letterType] ?? doc.letterType}</p>
            </div>
            <div>
              <span className="text-on-surface-variant">ชั้นความเร็ว:</span>
              <p className="font-medium">{URGENCY_LABEL[doc.urgencyLevel]}</p>
            </div>
            {doc.securityLevel !== "normal" && (
              <div>
                <span className="text-on-surface-variant">ชั้นความลับ:</span>
                <p className="font-medium text-red-700">{SECURITY_LABEL[doc.securityLevel] ?? doc.securityLevel}</p>
              </div>
            )}
            <div>
              <span className="text-on-surface-variant">ผู้สร้าง:</span>
              <p className="font-medium">{doc.createdBy?.fullName || "—"}</p>
            </div>
            {doc.approvedBy && (
              <div>
                <span className="text-on-surface-variant">ผู้อนุมัติ:</span>
                <p className="font-medium">{doc.approvedBy.fullName}</p>
              </div>
            )}
            {doc.recipientEmail && (
              <div>
                <span className="text-on-surface-variant">อีเมลผู้รับ:</span>
                <p className="font-medium">{doc.recipientEmail}</p>
              </div>
            )}
            {doc.sentMethod && (
              <div>
                <span className="text-on-surface-variant">วิธีการส่ง:</span>
                <p className="font-medium">{SENT_METHOD_LABEL[doc.sentMethod] ?? doc.sentMethod}</p>
              </div>
            )}
            {doc.sentAt && (
              <div>
                <span className="text-on-surface-variant">วันที่ส่ง:</span>
                <p className="font-medium">{formatThaiDateShort(doc.sentAt)}</p>
              </div>
            )}
          </div>
          {doc.bodyText && (
            <div className="mt-4 pt-4 border-t border-outline-variant/10">
              <span className="text-on-surface-variant text-sm">เนื้อหา:</span>
              <p className="text-sm mt-1 whitespace-pre-wrap">{doc.bodyText}</p>
            </div>
          )}
          {doc.relatedInboundCase && (
            <div className="mt-4 pt-4 border-t border-outline-variant/10">
              <span className="text-on-surface-variant text-sm">หนังสือเข้าที่เกี่ยวข้อง:</span>
              <Link href={`/inbox/${doc.relatedInboundCase.id}`} className="text-primary hover:underline text-sm block mt-1">
                {doc.relatedInboundCase.registrationNo ? `#${toThaiNumerals(doc.relatedInboundCase.registrationNo)} ` : ""}
                {doc.relatedInboundCase.title}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
