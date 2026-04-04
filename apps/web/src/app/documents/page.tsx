import { apiFetch } from "@/lib/api";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface Document {
  id: string;
  title: string | null;
  documentType: string | null;
  isOfficial: boolean | null;
  createdAt: string;
}

interface PagedResponse<T> {
  data: T[];
  total: number;
}

async function getDocuments(): Promise<Document[]> {
  try {
    const res = await apiFetch<PagedResponse<Document> | Document[]>("/documents");
    return Array.isArray(res) ? res : res.data;
  } catch {
    return [];
  }
}

export default async function DocumentsPage() {
  const documents = await getDocuments();

  return (
    <div>
      <h1 className="text-3xl font-black text-primary tracking-tight mb-6">คลังเอกสาร</h1>
      {documents.length === 0 ? (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-12 text-center text-outline shadow-sm">
          ยังไม่มีเอกสาร
        </div>
      ) : (
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-surface-low border-b border-outline-variant/10">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ID</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ชื่อเอกสาร</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ประเภท</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ราชการ</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">วันที่</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-surface-low transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/documents/${doc.id}`} className="text-primary hover:text-secondary font-mono text-xs font-bold">
                      #{doc.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-on-surface">{doc.title ?? "—"}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{doc.documentType ?? "—"}</td>
                  <td className="px-4 py-3">
                    {doc.isOfficial === null ? "—" : doc.isOfficial
                      ? <span className="text-[10px] bg-primary-fixed text-primary px-2.5 py-0.5 rounded-full font-bold uppercase">ราชการ</span>
                      : <span className="text-[10px] bg-surface-high text-on-surface-variant px-2.5 py-0.5 rounded-full font-bold uppercase">ทั่วไป</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-outline text-xs">
                    {new Date(doc.createdAt).toLocaleDateString("th-TH")}
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
