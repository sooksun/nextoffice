"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Send, AlertCircle, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import ThaiDateInput from "@/components/ui/ThaiDateInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface TravelDraft {
  id: number;
  travelDate: string;
  destination: string;
  purpose: string;
  departureTime?: string | null;
  returnTime?: string | null;
  status: string;
}

export default function NewTravelPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = searchParams.get("draftId");
  // ฟิลด์ที่ AI ระบุว่ายังขาด — ต้อง "ไม่" prefill (ค่า persist ไว้เป็นแค่ placeholder)
  const missingKeys = useMemo(
    () => new Set((searchParams.get("missing") ?? "").split(",").filter(Boolean)),
    [searchParams],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [travelDate, setTravelDate] = useState("");
  // แก้ไขร่างจาก AI (?draftId=) — block render จนโหลดเสร็จเพื่อ prefill defaultValue
  const [editingDraftId, setEditingDraftId] = useState<number | null>(null);
  const [draft, setDraft] = useState<TravelDraft | null>(null);
  const [prefillReady, setPrefillReady] = useState(!draftId);
  // true เมื่อ draftId ที่ระบุมาถูกส่ง/ดำเนินการไปแล้ว — ล็อกปุ่มส่งกันสร้างซ้ำ
  const [draftLocked, setDraftLocked] = useState(false);

  useEffect(() => {
    if (!draftId) return;
    apiFetch<TravelDraft>(`/attendance/leave/travel/${draftId}`)
      .then((d) => {
        if (d.status === "draft") {
          setDraft(d);
          setEditingDraftId(d.id);
        } else {
          // ร่างนี้ถูกส่งไปแล้ว — เตือนแทนที่จะเปิดฟอร์มเปล่าเงียบ ๆ
          setError("ร่างคำขอไปราชการนี้ถูกส่งไปแล้ว ไม่สามารถแก้ไขซ้ำได้ — ตรวจสอบสถานะที่หน้ารายการ");
          setDraftLocked(true);
        }
      })
      .catch(() => {
        // ร่างหาไม่เจอ/ไม่มีสิทธิ์ — เปิดฟอร์มเปล่า
      })
      .finally(() => setPrefillReady(true));
  }, [draftId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (draftLocked) return; // ร่างถูกใช้ไปแล้ว — กันสร้างคำขอซ้ำ
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const td = (form.get("travelDate") as string) || travelDate;
    if (!td) { setError("กรุณาระบุวันที่ไปราชการ"); setLoading(false); return; }

    const payload = {
      travelDate: td,
      destination: form.get("destination"),
      purpose: form.get("purpose"),
      departureTime: form.get("departureTime") || null,
      returnTime: form.get("returnTime") || null,
    };

    try {
      // แก้ไขร่างเดิม (จาก AI) → PATCH; ไม่งั้นสร้างใหม่ → POST
      const travelId = editingDraftId
        ? (await apiFetch<{ id: number }>(`/attendance/leave/travel/${editingDraftId}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })).id
        : (await apiFetch<{ id: number }>("/attendance/leave/travel", {
            method: "POST",
            body: JSON.stringify(payload),
          })).id;

      await apiFetch(`/attendance/leave/travel/${travelId}/submit`, { method: "PATCH" });

      router.push("/leave/travel");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  if (!prefillReady) {
    return (
      <div className="flex justify-center items-center py-20 text-on-surface-variant">
        <Loader2 size={24} className="animate-spin mr-2" /> กำลังโหลดร่างเอกสาร...
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <Link href="/leave/travel" className="inline-flex items-center gap-1 text-primary hover:underline text-sm mb-4">
        <ArrowLeft size={16} /> กลับ
      </Link>

      <h1 className="text-xl font-black text-primary mb-6">ขออนุญาตไปราชการ</h1>

      {draft && (
        <Alert variant="info" className="mb-4">
          <Sparkles size={16} />
          <AlertDescription>
            AI กรอกข้อมูลเบื้องต้นให้แล้วจากที่คุณพิมพ์ในแชท — โปรดตรวจสอบและกรอกส่วนที่ขาดก่อนกดส่ง
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field>
              <FieldLabel htmlFor="travelDate" required>
                วันที่ไปราชการ (พ.ศ.)
              </FieldLabel>
              <ThaiDateInput
                name="travelDate"
                required
                defaultValue={missingKeys.has("travelDate") ? undefined : draft?.travelDate?.slice(0, 10)}
                onChange={setTravelDate}
              />
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
                defaultValue={draft?.destination ?? ""}
                placeholder="เช่น สพป.นครพนม เขต 1"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="purpose" required>
                เรื่อง / วัตถุประสงค์
              </FieldLabel>
              <Textarea
                name="purpose"
                id="purpose"
                rows={3}
                required
                defaultValue={draft?.purpose ?? ""}
                placeholder="ระบุเรื่องที่ไปราชการ..."
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="departureTime">เวลาออก</FieldLabel>
                <Input type="time" name="departureTime" id="departureTime" defaultValue={draft?.departureTime ?? ""} />
              </Field>
              <Field>
                <FieldLabel htmlFor="returnTime">เวลากลับ</FieldLabel>
                <Input type="time" name="returnTime" id="returnTime" defaultValue={draft?.returnTime ?? ""} />
              </Field>
            </div>

            {error && (
              <Alert variant="error">
                <AlertCircle size={16} />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" size="lg" disabled={loading || draftLocked} className="w-full">
              <Send size={16} />
              {loading ? "กำลังส่ง..." : "ส่งคำขอไปราชการ"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
