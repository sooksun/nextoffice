"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send, AlertCircle } from "lucide-react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import ThaiDateInput from "@/components/ui/ThaiDateInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";

const LEAVE_TYPES = [
  { value: "sick", label: "ลาป่วย" },
  { value: "personal", label: "ลากิจส่วนตัว" },
  { value: "vacation", label: "ลาพักผ่อน" },
  { value: "maternity", label: "ลาคลอด" },
  { value: "ordination", label: "ลาบวช" },
  { value: "training", label: "ลาศึกษาต่อ/อบรม" },
];

export default function NewLeavePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);

    const sd = (form.get("startDate") as string) || startDate;
    const ed = (form.get("endDate") as string) || endDate;
    if (!sd || !ed) { setError("กรุณาระบุวันที่ให้ครบถ้วน"); setLoading(false); return; }

    const start = new Date(sd);
    const end = new Date(ed);
    const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    try {
      const leave = await apiFetch<{ id: number }>("/attendance/leave", {
        method: "POST",
        body: JSON.stringify({
          leaveType: form.get("leaveType"),
          startDate: sd,
          endDate: ed,
          totalDays,
          reason: form.get("reason"),
          contactPhone: form.get("contactPhone"),
        }),
      });

      await apiFetch(`/attendance/leave/${leave.id}/submit`, { method: "PATCH" });

      router.push("/leave");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <Link href="/leave" className="inline-flex items-center gap-1 text-primary hover:underline text-sm mb-4">
        <ArrowLeft size={16} /> กลับ
      </Link>

      <h1 className="text-xl font-black text-primary mb-6">ส่งใบลา</h1>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field>
              <FieldLabel htmlFor="leaveType" required>
                ประเภทการลา
              </FieldLabel>
              <NativeSelect name="leaveType" id="leaveType" required>
                {LEAVE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel htmlFor="startDate" required>
                วันที่เริ่ม (พ.ศ.)
              </FieldLabel>
              <ThaiDateInput name="startDate" required onChange={setStartDate} />
            </Field>

            <Field>
              <FieldLabel htmlFor="endDate" required>
                วันที่สิ้นสุด (พ.ศ.)
              </FieldLabel>
              <ThaiDateInput name="endDate" required onChange={setEndDate} />
            </Field>

            <Field>
              <FieldLabel htmlFor="reason">เหตุผล</FieldLabel>
              <Textarea name="reason" id="reason" rows={3} placeholder="ระบุเหตุผลการลา..." />
            </Field>

            <Field>
              <FieldLabel htmlFor="contactPhone">เบอร์โทรติดต่อ</FieldLabel>
              <Input type="tel" name="contactPhone" id="contactPhone" placeholder="08x-xxx-xxxx" />
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
