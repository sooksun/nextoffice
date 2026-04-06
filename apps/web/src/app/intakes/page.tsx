import { apiFetch } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import CreateCaseButton from "@/components/CreateCaseButton";
import Link from "next/link";
import { formatThaiDateShort } from "@/lib/thai-date";

export const dynamic = "force-dynamic";

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

interface PagedResponse<T> {
  data: T[];
  total: number;
}

async function getIntakes(): Promise<DocumentIntake[]> {
  try {
    const res = await apiFetch<PagedResponse<DocumentIntake> | DocumentIntake[]>("/intake?limit=100");
    return Array.isArray(res) ? res : res.data;
  } catch {
    return [];
  }
}

export default async function IntakesPage() {
  const intakes = await getIntakes();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-black text-primary tracking-tight">AI ประมวลผลเอกสาร</h1>
        <p className="text-sm text-on-surface-variant">พบ {intakes.length} รายการ</p>
      </div>

      {intakes.length === 0 ? (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-12 text-center text-outline shadow-sm">
          ยังไม่มีเอกสารขาเข้า
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
                        <span className="inline-flex mt-1 text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-semibold">
                          หนังสือราชการ
                        </span>
                      )}
                      {intake.aiResult?.isOfficialDocument === false && (
                        <span className="inline-flex mt-1 text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
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
