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
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function NewTravelPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [travelDate, setTravelDate] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const td = (form.get("travelDate") as string) || travelDate;
    if (!td) { setError("กรุณาระบุวันที่ไปราชการ"); setLoading(false); return; }

    try {
      const travel = await apiFetch<{ id: number }>("/attendance/leave/travel", {
        method: "POST",
        body: JSON.stringify({
          travelDate: td,
          destination: form.get("destination"),
          purpose: form.get("purpose"),
          departureTime: form.get("departureTime") || null,
          returnTime: form.get("returnTime") || null,
        }),
      });

      await apiFetch(`/attendance/leave/travel/${travel.id}/submit`, { method: "PATCH" });

      router.push("/leave/travel");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <Link href="/leave/travel" className="inline-flex items-center gap-1 text-primary hover:underline text-sm mb-4">
        <ArrowLeft size={16} /> กลับ
      </Link>

      <h1 className="text-xl font-black text-primary mb-6">ขออนุญาตไปราชการ</h1>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field>
              <FieldLabel htmlFor="travelDate" required>
                วันที่ไปราชการ (พ.ศ.)
              </FieldLabel>
              <ThaiDateInput name="travelDate" required onChange={setTravelDate} />
            </Field>

            <Field>
              <FieldLabel htmlFor="destination" required>
                สถานที่ปลายทาง
              </FieldLabel>
              <Input
                type="text"
                name="destination"
                id="destination"
                required
                placeholder="เช่น สพป.นครพนม เขต 1"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="purpose" required>
                เรื่อง / วัตถุประสงค์
              </FieldLabel>
              <Textarea name="purpose" id="purpose" rows={3} required placeholder="ระบุเรื่องที่ไปราชการ..." />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="departureTime">เวลาออก</FieldLabel>
                <Input type="time" name="departureTime" id="departureTime" />
              </Field>
              <Field>
                <FieldLabel htmlFor="returnTime">เวลากลับ</FieldLabel>
                <Input type="time" name="returnTime" id="returnTime" />
              </Field>
            </div>

            {error && (
              <Alert variant="error">
                <AlertCircle size={16} />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" size="lg" disabled={loading} className="w-full">
              <Send size={16} />
              {loading ? "กำลังส่ง..." : "ส่งคำขอไปราชการ"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
