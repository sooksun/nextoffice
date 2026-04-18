import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { formatThaiDateShort } from "@/lib/thai-date";
import {
  TableRoot,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { OfficialBadge } from "@/components/status-badges";

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
        <div className="rounded-2xl border border-outline-variant/40 bg-surface-bright p-12 text-center text-on-surface-variant shadow-sm">
          ยังไม่มีเอกสาร
        </div>
      ) : (
        <TableRoot>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>ชื่อเอกสาร</TableHead>
                <TableHead>ประเภท</TableHead>
                <TableHead>ราชการ</TableHead>
                <TableHead>วันที่</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <Link
                      href={`/documents/${doc.id}`}
                      className="text-primary hover:text-secondary font-mono text-xs font-bold"
                    >
                      #{doc.id}
                    </Link>
                  </TableCell>
                  <TableCell className="text-on-surface">{doc.title ?? "—"}</TableCell>
                  <TableCell className="text-on-surface-variant">{doc.documentType ?? "—"}</TableCell>
                  <TableCell>
                    <OfficialBadge official={doc.isOfficial} />
                  </TableCell>
                  <TableCell className="text-on-surface-variant text-xs">
                    {formatThaiDateShort(doc.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableRoot>
      )}
    </div>
  );
}
