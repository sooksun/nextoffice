import { Suspense } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { Inbox, Plus } from "lucide-react";
import { formatThaiDateTime, toThaiNumerals } from "@/lib/thai-date";
import ThaiDateRangeFilter from "@/components/ui/ThaiDateRangeFilter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TableRoot,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  UrgencyBadge,
  CaseStatusBadge,
} from "@/components/status-badges";

export const dynamic = "force-dynamic";

interface InboxCase {
  id: number;
  title: string;
  registrationNo: string | null;
  documentNo: string | null;
  status: string;
  urgencyLevel: string;
  receivedAt: string;
  dueDate: string | null;
  description: string | null;
  assignedTo: { id: number; fullName: string } | null;
  organization: { id: number; name: string } | null;
  sourceDocument: { id: number; issuingAuthority: string | null; documentCode: string | null } | null;
}

async function getCases(searchParams: Record<string, string>) {
  const params = new URLSearchParams();
  if (searchParams.search) params.set("search", searchParams.search);
  if (searchParams.dateFrom) params.set("dateFrom", searchParams.dateFrom);
  if (searchParams.dateTo) params.set("dateTo", searchParams.dateTo);
  params.set("take", "200");

  try {
    return await apiFetch<{ total: number; data: InboxCase[] }>(`/cases?${params}`);
  } catch {
    return { total: 0, data: [] };
  }
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const { total, data } = await getCases(sp);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Inbox size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight">เอกสารเข้า</h1>
            <p className="text-xs text-on-surface-variant">พบ {toThaiNumerals(total)} รายการ</p>
          </div>
        </div>
        <Button asChild size="lg">
          <Link href="/inbox/new">
            <Plus size={16} />
            รับเอกสารใหม่
          </Link>
        </Button>
      </div>

      {/* Search & Filter */}
      <form method="GET" className="flex flex-wrap gap-3 mb-5 items-center">
        <Input
          type="text"
          name="search"
          defaultValue={sp.search ?? ""}
          placeholder="ค้นหา..."
          className="flex-1 min-w-[200px]"
        />
        <Suspense fallback={<div className="w-40 h-9 rounded-md bg-surface-bright animate-pulse" />}>
          <ThaiDateRangeFilter dateFrom={sp.dateFrom} dateTo={sp.dateTo} />
        </Suspense>
        <Button type="submit">ค้นหา</Button>
        <Button asChild variant="outline">
          <Link href="/inbox">ล้าง</Link>
        </Button>
      </form>

      {/* Table */}
      <TableRoot>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead className="w-24">เอกสาร</TableHead>
              <TableHead>ชื่อเรื่อง</TableHead>
              <TableHead>ที่หนังสือ</TableHead>
              <TableHead>เลขรับ</TableHead>
              <TableHead>ผู้ส่ง</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead>วันที่รับ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-on-surface-variant">
                  ไม่พบเอกสาร
                </TableCell>
              </TableRow>
            )}
            {data.map((c, i) => (
              <TableRow key={c.id}>
                <TableCell className="text-on-surface-variant">{toThaiNumerals(i + 1)}</TableCell>
                <TableCell>
                  <UrgencyBadge level={c.urgencyLevel} />
                </TableCell>
                <TableCell className="max-w-md">
                  <Link
                    href={`/inbox/${c.id}`}
                    className="hover:text-primary hover:underline line-clamp-2 leading-relaxed font-medium"
                  >
                    {c.title}
                  </Link>
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap font-mono text-on-surface-variant">
                  {c.documentNo || c.sourceDocument?.documentCode || "—"}
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  {c.registrationNo ? (
                    <span className="font-mono font-bold text-primary">{toThaiNumerals(c.registrationNo)}</span>
                  ) : (
                    <span className="text-on-surface-variant">—</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-on-surface-variant">
                  {c.sourceDocument?.issuingAuthority || "—"}
                </TableCell>
                <TableCell>
                  <CaseStatusBadge status={c.status} />
                </TableCell>
                <TableCell className="text-xs text-on-surface-variant whitespace-nowrap">
                  {formatThaiDateTime(c.receivedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableRoot>
    </div>
  );
}
