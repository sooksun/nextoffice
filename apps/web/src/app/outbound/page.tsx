"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { SendHorizontal, Plus, CheckCircle, Clock, Send, FileEdit } from "lucide-react";
import { formatThaiDateTime, toThaiNumerals } from "@/lib/thai-date";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import {
  TableRoot,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { UrgencyBadge, OutboundStatusBadge } from "@/components/status-badges";

interface OutboundDoc {
  id: number;
  documentNo: string | null;
  subject: string;
  recipientOrg: string | null;
  urgencyLevel: string;
  status: string;
  createdAt: string;
  approvedAt: string | null;
  sentAt: string | null;
  createdBy: { id: number; fullName: string } | null;
  approvedBy: { id: number; fullName: string } | null;
}

const FILTER_OPTIONS = [
  { value: "", label: "ทั้งหมด", icon: null },
  { value: "draft", label: "ร่าง", icon: FileEdit },
  { value: "pending_approval", label: "รออนุมัติ", icon: Clock },
  { value: "approved", label: "อนุมัติแล้ว", icon: CheckCircle },
  { value: "sent", label: "ส่งแล้ว", icon: Send },
];

function subscribeStorage(cb: () => void): () => void {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

function getOrgId(): number {
  try {
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    return Number(u.organizationId) || 1;
  } catch {
    return 1;
  }
}

export default function OutboundListPage() {
  const [docs, setDocs] = useState<OutboundDoc[]>([]);
  const [filterStatus, setFilterStatus] = useState("");
  const [isPending, startTransition] = useTransition();

  const orgId = useSyncExternalStore(subscribeStorage, getOrgId, () => 1);

  useEffect(() => {
    const url = `/outbound/${orgId}/documents${filterStatus ? `?status=${filterStatus}` : ""}`;
    startTransition(() => {
      apiFetch<OutboundDoc[]>(url)
        .then(setDocs)
        .catch(() => setDocs([]));
    });
  }, [orgId, filterStatus]);

  const loading = isPending;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
            <SendHorizontal size={20} className="text-secondary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight">หนังสือออก</h1>
            <p className="text-xs text-on-surface-variant">พบ {toThaiNumerals(docs.length)} รายการ</p>
          </div>
        </div>
        <Button asChild size="lg">
          <Link href="/outbound/new">
            <Plus size={16} />
            สร้างหนังสือออก
          </Link>
        </Button>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        {FILTER_OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = filterStatus === value;
          return (
            <button
              key={value}
              onClick={() => setFilterStatus(value)}
              className={clsx(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors",
                active
                  ? "bg-primary text-on-primary"
                  : "bg-surface-bright text-on-surface-variant hover:bg-primary/10 hover:text-primary border border-outline-variant/40",
              )}
            >
              {Icon && <Icon size={13} />}
              {label}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <TableRoot>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>เรื่อง</TableHead>
              <TableHead>ถึง</TableHead>
              <TableHead>เลขที่หนังสือ</TableHead>
              <TableHead>ความเร่งด่วน</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead>วันที่สร้าง</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-on-surface-variant">
                  กำลังโหลด...
                </TableCell>
              </TableRow>
            )}
            {!loading && docs.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-on-surface-variant">
                  ไม่พบเอกสาร
                </TableCell>
              </TableRow>
            )}
            {docs.map((d, i) => (
              <TableRow key={d.id}>
                <TableCell className="text-on-surface-variant">{toThaiNumerals(i + 1)}</TableCell>
                <TableCell className="max-w-xs">
                  <Link
                    href={`/outbound/${d.id}`}
                    className="hover:text-primary hover:underline line-clamp-2 font-medium"
                  >
                    {d.subject}
                  </Link>
                  {d.createdBy && (
                    <p className="text-xs text-on-surface-variant mt-0.5">โดย {d.createdBy.fullName}</p>
                  )}
                </TableCell>
                <TableCell className="text-xs text-on-surface-variant">{d.recipientOrg || "—"}</TableCell>
                <TableCell className="text-xs font-mono text-on-surface-variant">
                  {d.documentNo ? toThaiNumerals(d.documentNo) : "—"}
                </TableCell>
                <TableCell>
                  <UrgencyBadge level={d.urgencyLevel} />
                </TableCell>
                <TableCell>
                  <OutboundStatusBadge status={d.status} />
                </TableCell>
                <TableCell className="text-xs text-on-surface-variant whitespace-nowrap">
                  {formatThaiDateTime(d.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableRoot>
    </div>
  );
}
