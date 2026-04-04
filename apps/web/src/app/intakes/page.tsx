import { apiFetch } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface DocumentIntake {
  id: string;
  sourceChannel: string;
  mimeType: string | null;
  uploadStatus: string;
  ocrStatus: string;
  classifierStatus: string;
  aiStatus: string;
  createdAt: string;
}

interface PagedResponse<T> {
  data: T[];
  total: number;
}

async function getIntakes(): Promise<DocumentIntake[]> {
  try {
    const res = await apiFetch<PagedResponse<DocumentIntake> | DocumentIntake[]>("/intake");
    return Array.isArray(res) ? res : res.data;
  } catch {
    return [];
  }
}

export default async function IntakesPage() {
  const intakes = await getIntakes();

  return (
    <div>
      <h1 className="text-3xl font-black text-primary tracking-tight mb-6">เอกสารขาเข้า</h1>
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
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ประเภทไฟล์</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">อัพโหลด</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">OCR</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">จำแนก</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">AI</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">วันที่</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {intakes.map((intake) => (
                <tr key={intake.id} className="hover:bg-surface-low transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/intakes/${intake.id}`} className="text-primary hover:text-secondary font-mono text-xs font-bold">
                      #{intake.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{intake.sourceChannel}</td>
                  <td className="px-4 py-3 text-outline text-xs">{intake.mimeType ?? "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={intake.uploadStatus} /></td>
                  <td className="px-4 py-3"><StatusBadge status={intake.ocrStatus} /></td>
                  <td className="px-4 py-3"><StatusBadge status={intake.classifierStatus} /></td>
                  <td className="px-4 py-3"><StatusBadge status={intake.aiStatus} /></td>
                  <td className="px-4 py-3 text-outline text-xs">
                    {new Date(intake.createdAt).toLocaleDateString("th-TH")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
