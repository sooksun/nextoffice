"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Send, AlertCircle, CalendarDays, Loader2 } from "lucide-react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import ThaiDatePicker from "@/components/ui/ThaiDatePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";

const LEAVE_TYPES = [
  { value: "sick",       label: "ลาป่วย" },
  { value: "personal",   label: "ลากิจส่วนตัว" },
  { value: "vacation",   label: "ลาพักผ่อน" },
  { value: "maternity",  label: "ลาคลอด" },
  { value: "ordination", label: "ลาบวช" },
  { value: "training",   label: "ลาศึกษาต่อ/อบรม" },
];

function daysBetween(s: string, e: string) {
  if (!s || !e) return 0;
  const sd = new Date(s + "T00:00:00");
  const ed = new Date(e + "T00:00:00");
  return isNaN(sd.getTime()) || isNaN(ed.getTime())
    ? 0
    : Math.max(1, Math.ceil((ed.getTime() - sd.getTime()) / 86_400_000) + 1);
}

function formatBE(iso: string) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear() + 543}`;
}

interface LeaveDetail {
  id: number;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason?: string | null;
  contactPhone?: string | null;
  contactAddress?: string | null;
  positionTitle?: string | null;
  status: string;
}

export default function EditLeavePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [init, setInit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [leaveType, setLeaveType]     = useState("sick");
  const [startDate, setStartDate]     = useState("");
  const [endDate, setEndDate]         = useState("");
  const [positionTitle, setPosition]  = useState("");
  const [reason, setReason]           = useState("");
  const [contactAddress, setAddress]  = useState("");
  const [contactPhone, setPhone]      = useState("");

  const totalDays = daysBetween(startDate, endDate);

  useEffect(() => {
    apiFetch<LeaveDetail>(`/attendance/leave/${id}`)
      .then((d) => {
        if (d.status !== "draft") {
          router.replace("/leave");
          return;
        }
        setLeaveType(d.leaveType);
        // API returns ISO datetime; extract date part
        setStartDate(d.startDate?.slice(0, 10) ?? "");
        setEndDate(d.endDate?.slice(0, 10) ?? "");
        setPosition(d.positionTitle ?? "");
        setReason(d.reason ?? "");
        setAddress(d.contactAddress ?? "");
        setPhone(d.contactPhone ?? "");
        setInit(true);
      })
      .catch(() => router.replace("/leave"));
  }, [id, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!startDate || !endDate) { setError("กรุณาระบุวันที่"); return; }
    if (new Date(endDate) < new Date(startDate)) { setError("วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่ม"); return; }

    setLoading(true);
    try {
      await apiFetch(`/attendance/leave/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          leaveType,
          startDate,
          endDate,
          totalDays,
          reason: reason || null,
          contactPhone: contactPhone || null,
          contactAddress: contactAddress || null,
          positionTitle: positionTitle || null,
        }),
      });
      router.push("/leave");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  if (!init) {
    return (
      <div className="flex justify-center items-center py-20 text-on-surface-variant">
        <Loader2 size={24} className="animate-spin mr-2" /> กำลังโหลด...
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <Link href="/leave" className="inline-flex items-center gap-1 text-primary hover:underline text-sm mb-4">
        <ArrowLeft size={16} /> กลับ
      </Link>

      <h1 className="text-xl font-black text-primary mb-1 flex items-center gap-2">
        <CalendarDays size={22} />
        แก้ไขใบลา #{id}
      </h1>
      <p className="text-sm text-on-surface-variant mb-6">แก้ไขได้เฉพาะใบลาที่ยังเป็น &ldquo;ร่าง&rdquo; เท่านั้น</p>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-5">

            <Field>
              <FieldLabel htmlFor="leaveType" required>ประเภทการลา</FieldLabel>
              <NativeSelect id="leaveType" required value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                {LEAVE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel htmlFor="positionTitle">ตำแหน่ง</FieldLabel>
              <Input
                id="positionTitle"
                placeholder="เช่น ครูชำนาญการพิเศษ"
                value={positionTitle}
                onChange={(e) => setPosition(e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel required>วันที่เริ่ม (พ.ศ.)</FieldLabel>
                <ThaiDatePicker value={startDate} onChange={setStartDate} placeholder="วว/ดด/พ.ศ." />
              </Field>
              <Field>
                <FieldLabel required>วันที่สิ้นสุด (พ.ศ.)</FieldLabel>
                <ThaiDatePicker value={endDate} onChange={setEndDate} placeholder="วว/ดด/พ.ศ." />
              </Field>
            </div>

            {startDate && endDate && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
                <span className="text-on-surface-variant">ลาตั้งแต่ </span>
                <span className="font-semibold text-primary">{formatBE(startDate)}</span>
                <span className="text-on-surface-variant"> ถึง </span>
                <span className="font-semibold text-primary">{formatBE(endDate)}</span>
                <span className="text-on-surface-variant"> มีกำหนด </span>
                <span className="font-black text-primary text-base">{totalDays}</span>
                <span className="text-on-surface-variant"> วัน</span>
              </div>
            )}

            <Field>
              <FieldLabel htmlFor="reason">เหตุที่ลา</FieldLabel>
              <Textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>

            <Field>
              <FieldLabel htmlFor="contactAddress">ระหว่างลาพักอยู่ที่</FieldLabel>
              <Input id="contactAddress" value={contactAddress} onChange={(e) => setAddress(e.target.value)} />
            </Field>

            <Field>
              <FieldLabel htmlFor="contactPhone">โทรศัพท์ที่ติดต่อได้</FieldLabel>
              <Input type="tel" id="contactPhone" value={contactPhone} onChange={(e) => setPhone(e.target.value)} />
            </Field>

            {error && (
              <Alert variant="error">
                <AlertCircle size={16} />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" size="lg" disabled={loading} className="w-full">
              <Send size={16} />
              {loading ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
