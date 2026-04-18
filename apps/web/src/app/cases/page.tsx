import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { formatThaiDateShort, toThaiNumerals } from "@/lib/thai-date";
import {
  TableRoot,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { CaseStatusBadge, UrgencyBadge } from "@/components/status-badges";

export const dynamic = "force-dynamic";

interface InboundCase {
  id: number;
  title: string;
  registrationNo: string | null;
  status: string;
  urgencyLevel: string;
  receivedAt: string;
  organization: { id: number; name: string } | null;
  assignedTo: { id: number; fullName: string } | null;
}

interface CasesResponse {
  total: number;
  data: InboundCase[];
}

async function getCases(): Promise<CasesResponse> {
  try {
    return await apiFetch<CasesResponse>("/cases?take=100");
  } catch {
    return { total: 0, data: [] };
  }
}

export default async function CasesPage() {
  const { total, data: cases } = await getCases();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-black text-primary tracking-tight">เคส</h1>
        <span className="text-sm text-on-surface-variant">{toThaiNumerals(total)} รายการ</span>
      </div>
      {cases.length === 0 ? (
        <div className="rounded-2xl border border-outline-variant/40 bg-surface-bright p-12 text-center text-on-surface-variant shadow-sm">
          ยังไม่มีเคส
        </div>
      ) : (
        <TableRoot>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>เลขรับ</TableHead>
                <TableHead>เรื่อง</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead>ประเภท</TableHead>
                <TableHead>ผู้รับผิดชอบ</TableHead>
                <TableHead>วันที่รับ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      href={`/inbox/${c.id}`}
                      className="text-primary hover:text-secondary font-mono text-xs font-bold"
                    >
                      {c.registrationNo ? toThaiNumerals(c.registrationNo) : `#${c.id}`}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <Link
                      href={`/inbox/${c.id}`}
                      className="text-on-surface hover:text-primary line-clamp-1"
                    >
                      {c.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <CaseStatusBadge status={c.status} />
                  </TableCell>
                  <TableCell>
                    <UrgencyBadge level={c.urgencyLevel} />
                  </TableCell>
                  <TableCell className="text-on-surface-variant text-xs">
                    {c.assignedTo?.fullName ?? "—"}
                  </TableCell>
                  <TableCell className="text-on-surface-variant text-xs">
                    {formatThaiDateShort(c.receivedAt)}
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
