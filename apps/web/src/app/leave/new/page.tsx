"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Send, AlertCircle, CalendarDays, Loader2, Sparkles } from "lucide-react";
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

interface LeaveBalance {
  leaveType: string;
  label: string;
  totalAllowed: number;
  totalUsed: number;
  remaining: number;
}

interface LeaveDraft {
  id: number;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
  contactPhone?: string | null;
  contactAddress?: string | null;
  positionTitle?: string | null;
  status: string;
}

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
  const searchParams = useSearchParams();
  const draftId = searchParams.get("draftId");
  // ฟิลด์ที่ AI ระบุว่ายังขาด (มากับ query string) — ต้อง "ไม่" prefill ฟิลด์เหล่านี้
  // เพราะค่าที่ persist ไว้ในร่างเป็นแค่ placeholder (เช่น วันที่ = วันนี้) ไม่ใช่ค่าจริง
  const missingKeys = useMemo(
    () => new Set((searchParams.get("missing") ?? "").split(",").filter(Boolean)),
    [searchParams],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // block-render จนกว่าจะโหลด draft เสร็จ (หรือไม่มี draftId) — กัน race:
  // ผู้ใช้พิมพ์ทับ prefill / กดส่งก่อน editingDraftId ถูกตั้งค่า (จะเข้า POST ผิดสาขา)
  const [prefillReady, setPrefillReady] = useState(!draftId);
  // ถ้ามาจากร่างที่ AI สร้าง — แก้ไข draft เดิมแล้ว submit (ไม่สร้างใหม่)
  const [editingDraftId, setEditingDraftId] = useState<number | null>(null);
  const [prefilledFromAi, setPrefilledFromAi] = useState(false);
  // true เมื่อ draftId ที่ระบุมาถูกส่ง/ดำเนินการไปแล้ว — ล็อกปุ่มส่งกันสร้างซ้ำ
  const [draftLocked, setDraftLocked] = useState(false);

  // user info
  const [userName, setUserName]     = useState("");
  const [orgName, setOrgName]       = useState("");

  // leave balance from DB
  const [balances, setBalances]         = useState<LeaveBalance[]>([]);
  const [balanceLoading, setBalanceLoading] = useState(true);

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
    // fetch leave balance from DB
    apiFetch<LeaveBalance[]>("/attendance/leave/balance")
      .then(setBalances)
      .catch(() => setBalances([]))
      .finally(() => setBalanceLoading(false));
  }, []);

  // Prefill จากร่างที่ AI สร้าง (?draftId=) — โหลดค่าที่กรอกไว้แล้วมาให้กรอกต่อ
  // block-render (prefillReady) จนกว่า effect นี้จะจบ กันผู้ใช้แก้ไข/ส่งฟอร์มก่อน
  // editingDraftId ถูกตั้งค่า (ไม่งั้น submit จะเข้าใจผิดว่าต้องสร้างใหม่ = POST ซ้ำ)
  useEffect(() => {
    if (!draftId) return;
    apiFetch<LeaveDraft>(`/attendance/leave/${draftId}`)
      .then((d) => {
        if (d.status !== "draft") {
          // ร่างนี้ถูกส่ง/ดำเนินการไปแล้ว — เตือนแทนที่จะเปิดฟอร์มเปล่าเงียบ ๆ
          // (ไม่งั้นกดส่งจะ POST สร้างใบลาซ้ำโดยผู้ใช้ไม่รู้ตัว)
          setError("ร่างใบลานี้ถูกส่งไปแล้ว ไม่สามารถแก้ไขซ้ำได้ — ตรวจสอบสถานะที่หน้ารายการใบลา");
          setDraftLocked(true);
          return;
        }
        if (d.leaveType) setLeaveType(d.leaveType);
        if (d.startDate && !missingKeys.has("startDate")) setStartDate(d.startDate.slice(0, 10));
        if (d.endDate && !missingKeys.has("endDate")) setEndDate(d.endDate.slice(0, 10));
        if (d.positionTitle) setPosition(d.positionTitle);
        if (d.reason) setReason(d.reason);
        if (d.contactAddress) setAddress(d.contactAddress);
        if (d.contactPhone) setPhone(d.contactPhone);
        setEditingDraftId(d.id);
        setPrefilledFromAi(true);
      })
      .catch(() => {
        // ร่างหาไม่เจอ/ไม่มีสิทธิ์ — เปิดฟอร์มเปล่าตามปกติ
      })
      .finally(() => setPrefillReady(true));
  }, [draftId, missingKeys]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (draftLocked) return; // ร่างถูกใช้ไปแล้ว — กันสร้างใบลาซ้ำ
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
      const payload = {
        leaveType,
        startDate,
        endDate,
        totalDays,
        reason: reason || undefined,
        contactPhone: contactPhone || undefined,
        contactAddress: contactAddress || undefined,
        positionTitle: positionTitle || undefined,
      };

      // แก้ไขร่างเดิม (จาก AI) → PATCH; ไม่งั้นสร้างใหม่ → POST
      const leaveId = editingDraftId
        ? (await apiFetch<{ id: number }>(`/attendance/leave/${editingDraftId}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })).id
        : (await apiFetch<{ id: number }>("/attendance/leave", {
            method: "POST",
            body: JSON.stringify(payload),
          })).id;

      await apiFetch(`/attendance/leave/${leaveId}/submit`, { method: "PATCH" });
      router.push("/leave");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  }

  // block-render จนกว่า prefill (ถ้ามี draftId) จะเสร็จ — กันผู้ใช้แก้/ส่งฟอร์ม
  // ก่อน editingDraftId ถูกตั้งค่า (ไม่งั้น submit จะเข้าใจผิดว่าต้องสร้างใหม่)
  if (!prefillReady) {
    return (
      <div className="flex justify-center items-center py-20 text-on-surface-variant">
        <Loader2 size={24} className="animate-spin mr-2" /> กำลังโหลดร่างเอกสาร...
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
        ใบลา
      </h1>
      <p className="text-sm text-on-surface-variant mb-6">กรอกข้อมูลการขอลา แล้วกดส่งเพื่อส่งให้ผู้บังคับบัญชาอนุมัติ</p>

      {prefilledFromAi && (
        <Alert variant="info" className="mb-4">
          <Sparkles size={16} />
          <AlertDescription>
            AI กรอกข้อมูลเบื้องต้นให้แล้วจากที่คุณพิมพ์ในแชท — โปรดตรวจสอบและกรอกส่วนที่ขาดก่อนกดส่ง
          </AlertDescription>
        </Alert>
      )}

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

            {/* ── สรุปวันลาคงเหลือ (จาก DB) ──────────── */}
            <div className="rounded-lg border border-outline-variant/50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-surface-low border-b border-outline-variant/40">
                <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">สรุปวันลาคงเหลือ (ปีปัจจุบัน)</span>
                {balanceLoading && <Loader2 size={14} className="animate-spin text-primary" />}
              </div>

              {!balanceLoading && balances.length === 0 && (
                <p className="px-4 py-3 text-sm text-on-surface-variant">ไม่พบข้อมูลวันลา</p>
              )}

              {balances.length > 0 && (
                <div className="divide-y divide-outline-variant/30">
                  {balances.map((b) => {
                    const isSelected = b.leaveType === leaveType;
                    const pct = b.totalAllowed > 0 ? Math.round((b.remaining / b.totalAllowed) * 100) : 0;
                    const barColor = pct > 50 ? "bg-success" : pct > 20 ? "bg-warning" : "bg-error";
                    return (
                      <div
                        key={b.leaveType}
                        className={`px-4 py-3 ${isSelected ? "bg-primary/5" : ""}`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`text-sm font-semibold ${isSelected ? "text-primary" : "text-on-surface"}`}>
                            {isSelected && <span className="mr-1">▶</span>}
                            {b.label}
                          </span>
                          <span className="text-sm text-on-surface-variant">
                            <span className={`font-black ${b.remaining <= 0 ? "text-error" : isSelected ? "text-primary" : "text-on-surface"}`}>
                              {b.remaining}
                            </span>
                            <span className="text-xs"> / {b.totalAllowed} วัน</span>
                            {b.totalUsed > 0 && (
                              <span className="text-xs text-on-surface-variant ml-1">(ใช้ไป {b.totalUsed} วัน)</span>
                            )}
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-outline-variant/30">
                          <div
                            className={`h-full rounded-full transition-all ${barColor}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── วันที่เลือก ── */}
              {startDate && endDate && (
                <div className="border-t border-outline-variant/40 bg-primary/5 px-4 py-3 text-sm">
                  <span className="text-on-surface-variant">ลาตั้งแต่ </span>
                  <span className="font-semibold text-primary">{formatBE(startDate)}</span>
                  <span className="text-on-surface-variant"> ถึง </span>
                  <span className="font-semibold text-primary">{formatBE(endDate)}</span>
                  <span className="text-on-surface-variant"> มีกำหนด </span>
                  <span className="font-black text-primary text-base">{totalDays}</span>
                  <span className="text-on-surface-variant"> วัน</span>
                  {(() => {
                    const b = balances.find((x) => x.leaveType === leaveType);
                    if (b && b.remaining < totalDays) {
                      return (
                        <span className="ml-2 text-xs text-error font-semibold">
                          (วันลาคงเหลือไม่พอ)
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}
            </div>

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

            <Button type="submit" size="lg" disabled={loading || draftLocked} className="w-full">
              <Send size={16} />
              {loading ? "กำลังส่ง..." : "ส่งใบลา"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
