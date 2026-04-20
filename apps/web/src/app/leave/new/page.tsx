"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send, AlertCircle, CalendarDays } from "lucide-react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { getUser } from "@/lib/auth";
import ThaiDatePicker from "@/components/ui/ThaiDatePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";

const LEAVE_TYPES = [
  { value: "sick",      label: "ลาป่วย" },
  { value: "personal",  label: "ลากิจส่วนตัว" },
  { value: "vacation",  label: "ลาพักผ่อน" },
  { value: "maternity", label: "ลาคลอด" },
  { value: "ordination",label: "ลาบวช" },
  { value: "training",  label: "ลาศึกษาต่อ/อบรม" },
];

/** พ.ศ. date string for display */
function formatBE(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  const day  = String(d.getDate()).padStart(2, "0");
  const mon  = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear() + 543;
  return `${day}/${mon}/${year}`;
}

function daysBetween(startIso: string, endIso: string): number {
  if (!startIso || !endIso) return 0;
  const s = new Date(startIso + "T00:00:00");
  const e = new Date(endIso + "T00:00:00");
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  return Math.max(1, Math.ceil((e.getTime() - s.getTime()) / 86_400_000) + 1);
}

export default function NewLeavePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // user info
  const [userName, setUserName]     = useState("");
  const [orgName, setOrgName]       = useState("");

  // form state
  const [leaveType, setLeaveType]     = useState("sick");
  const [startDate, setStartDate]     = useState("");
  const [endDate, setEndDate]         = useState("");
  const [positionTitle, setPosition]  = useState("");
  const [reason, setReason]           = useState("");
  const [contactAddress, setAddress]  = useState("");
  const [contactPhone, setPhone]      = useState("");

  const totalDays = daysBetween(startDate, endDate);

  useEffect(() => {
    const u = getUser();
    if (u) {
      setUserName(u.fullName ?? "");
      setOrgName(u.organizationName ?? "");
    }
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!startDate || !endDate) {
      setError("กรุณาระบุวันที่เริ่มและวันที่สิ้นสุด");
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError("วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่ม");
      return;
    }

    setLoading(true);
    try {
      const leave = await apiFetch<{ id: number }>("/attendance/leave", {
        method: "POST",
        body: JSON.stringify({
          leaveType,
          startDate,
          endDate,
          totalDays,
          reason: reason || undefined,
          contactPhone: contactPhone || undefined,
          contactAddress: contactAddress || undefined,
          positionTitle: positionTitle || undefined,
        }),
      });

      await apiFetch(`/attendance/leave/${leave.id}/submit`, { method: "PATCH" });
      router.push("/leave");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <Link href="/leave" className="inline-flex items-center gap-1 text-primary hover:underline text-sm mb-4">
        <ArrowLeft size={16} /> กลับ
      </Link>

      <h1 className="text-xl font-black text-primary mb-1 flex items-center gap-2">
        <CalendarDays size={22} />
        ใบลา
      </h1>
      <p className="text-sm text-on-surface-variant mb-6">กรอกข้อมูลการขอลา แล้วกดส่งเพื่อส่งให้ผู้บังคับบัญชาอนุมัติ</p>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* ── ข้อมูลผู้ลา ─────────────────────────── */}
            <div className="rounded-lg bg-surface-low p-4 space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">ข้อมูลผู้ลา</h2>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-on-surface-variant mb-0.5">ชื่อ-นามสกุล</p>
                  <p className="text-sm font-semibold text-on-surface">{userName || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-on-surface-variant mb-0.5">สังกัด</p>
                  <p className="text-sm font-semibold text-on-surface">{orgName || "—"}</p>
                </div>
              </div>

              <Field>
                <FieldLabel htmlFor="positionTitle">ตำแหน่ง</FieldLabel>
                <Input
                  id="positionTitle"
                  name="positionTitle"
                  placeholder="เช่น ครูชำนาญการพิเศษ, ผู้อำนวยการโรงเรียน"
                  value={positionTitle}
                  onChange={(e) => setPosition(e.target.value)}
                />
              </Field>
            </div>

            {/* ── ประเภทการลา ──────────────────────────── */}
            <Field>
              <FieldLabel htmlFor="leaveType" required>ประเภทการลา</FieldLabel>
              <NativeSelect
                name="leaveType"
                id="leaveType"
                required
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value)}
              >
                {LEAVE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </NativeSelect>
            </Field>

            {/* ── วันที่ลา ─────────────────────────────── */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel required>วันที่เริ่ม (พ.ศ.)</FieldLabel>
                <ThaiDatePicker
                  value={startDate}
                  onChange={setStartDate}
                  placeholder="วว/ดด/พ.ศ."
                />
              </Field>
              <Field>
                <FieldLabel required>วันที่สิ้นสุด (พ.ศ.)</FieldLabel>
                <ThaiDatePicker
                  value={endDate}
                  onChange={setEndDate}
                  placeholder="วว/ดด/พ.ศ."
                />
              </Field>
            </div>

            {/* ── สรุปจำนวนวัน ─────────────────────────── */}
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

            {/* ── เหตุผล ──────────────────────────────── */}
            <Field>
              <FieldLabel htmlFor="reason">เหตุที่ลา</FieldLabel>
              <Textarea
                name="reason"
                id="reason"
                rows={3}
                placeholder="ระบุเหตุผลการลา เช่น มีไข้ ปวดศีรษะ หรือเหตุผลอื่นๆ"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>

            {/* ── ที่อยู่ระหว่างลา ─────────────────────── */}
            <Field>
              <FieldLabel htmlFor="contactAddress">ระหว่างลาพักอยู่ที่</FieldLabel>
              <Input
                id="contactAddress"
                name="contactAddress"
                placeholder="บ้านเลขที่ ถนน ตำบล อำเภอ จังหวัด"
                value={contactAddress}
                onChange={(e) => setAddress(e.target.value)}
              />
            </Field>

            {/* ── เบอร์ติดต่อ ──────────────────────────── */}
            <Field>
              <FieldLabel htmlFor="contactPhone">โทรศัพท์ที่ติดต่อได้ระหว่างลา</FieldLabel>
              <Input
                type="tel"
                id="contactPhone"
                name="contactPhone"
                placeholder="08x-xxx-xxxx"
                value={contactPhone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>

            {error && (
              <Alert variant="error">
                <AlertCircle size={16} />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" size="lg" disabled={loading} className="w-full">
              <Send size={16} />
              {loading ? "กำลังส่ง..." : "ส่งใบลา"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
