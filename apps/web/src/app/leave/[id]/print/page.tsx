import { apiFetch } from "@/lib/api";
import { notFound } from "next/navigation";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

// ─── helpers ────────────────────────────────────────────────

const MONTHS_TH = [
  "มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
  "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม",
];

function formatDateLong(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS_TH[d.getMonth()]} พ.ศ. ${d.getFullYear() + 543}`;
}

// ─── types ──────────────────────────────────────────────────

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
  createdAt: string;
  user?: {
    fullName: string;
    positionTitle?: string | null;
    organization?: { name: string } | null;
  } | null;
}
interface Balance { leaveType: string; totalUsed: number; }

async function getLeave(id: string): Promise<LeaveDetail | null> {
  try { return await apiFetch<LeaveDetail>(`/attendance/leave/${id}`); } catch { return null; }
}
async function getBalance(): Promise<Balance[]> {
  try { return await apiFetch<Balance[]>("/attendance/leave/balance"); } catch { return []; }
}

// ─── checkbox ───────────────────────────────────────────────

function CB({ checked }: { checked: boolean }) {
  return (
    <span style={{
      display: "inline-block",
      width: 13, height: 13,
      border: "1.5px solid #000",
      marginRight: 4,
      verticalAlign: "middle",
      textAlign: "center",
      lineHeight: "12px",
      fontSize: 10,
      fontWeight: "bold",
    }}>
      {checked ? "✓" : ""}
    </span>
  );
}

// ─── table cell styles ───────────────────────────────────────

const th: React.CSSProperties = {
  border: "1px solid #000", padding: "4px 8px",
  textAlign: "center", fontWeight: "bold", fontSize: "13pt",
  backgroundColor: "#f0f0f0",
};
const td: React.CSSProperties = {
  border: "1px solid #000", padding: "4px 8px", fontSize: "13pt",
};

// ─── page ───────────────────────────────────────────────────

export default async function PrintLeavePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [leave, balances] = await Promise.all([getLeave(id), getBalance()]);
  if (!leave) notFound();

  const isSick      = leave.leaveType === "sick";
  const isPersonal  = leave.leaveType === "personal";
  const isMaternity = leave.leaveType === "maternity";

  const typeLabel = isSick ? "ป่วย" : isPersonal ? "กิจส่วนตัว" : isMaternity ? "คลอดบุตร" : leave.leaveType;

  const startDateTH  = formatDateLong(leave.startDate);
  const endDateTH    = formatDateLong(leave.endDate);
  const writtenDateTH = formatDateLong(new Date().toISOString());
  const days         = Number(leave.totalDays);

  const positionTitle = leave.positionTitle ?? leave.user?.positionTitle ?? "-";
  const orgName       = leave.user?.organization?.name ?? "-";
  const fullName      = leave.user?.fullName ?? "-";

  const bSick      = balances.find((b) => b.leaveType === "sick");
  const bPersonal  = balances.find((b) => b.leaveType === "personal");
  const bMaternity = balances.find((b) => b.leaveType === "maternity");

  const contactStr = [
    leave.contactAddress,
    leave.contactPhone ? `โทร. ${leave.contactPhone}` : null,
  ].filter(Boolean).join("  ") || "-";

  const paper: React.CSSProperties = {
    margin: "0 auto",
    background: "#fff",
    color: "#000",
    width: "210mm",
    minHeight: "297mm",
    padding: "14mm 14mm 12mm 20mm",
    fontFamily: "'TH Sarabun New', 'Sarabun', 'Angsana New', sans-serif",
    fontSize: "15pt",
    lineHeight: 1.8,
    boxSizing: "border-box",
  };

  const row: React.CSSProperties = {
    display: "flex", alignItems: "baseline",
    gap: 8, marginBottom: 2,
  };

  return (
    <>
      {/* ── Screen toolbar ── */}
      <div className="no-print flex items-center gap-3 px-4 py-3 bg-surface-low border-b border-outline-variant/30">
        <PrintButton />
        <a href="/leave" className="btn-ghost text-sm">← กลับ</a>
        <span className="ml-auto text-xs text-on-surface-variant">
          กด <kbd className="border border-outline-variant/50 rounded px-1">Ctrl+P</kbd> เพื่อพิมพ์หรือบันทึก PDF
        </span>
      </div>

      {/* ── Paper ── */}
      <div style={paper}>

        {/* Title */}
        <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "18pt", marginBottom: 10 }}>
          แบบใบลาป่วย  ลาคลอดบุตร  ลากิจส่วนตัว
        </div>

        {/* Written at / date */}
        <div style={{ textAlign: "right" }}>
          เขียนที่  {orgName}
        </div>
        <div style={{ textAlign: "right", marginBottom: 12 }}>
          วันที่  {writtenDateTH}
        </div>

        {/* Subject / To */}
        <div style={row}>
          <span style={{ minWidth: 60 }}>เรื่อง</span>
          <span>ขอลา{typeLabel}</span>
        </div>
        <div style={{ ...row, marginBottom: 12 }}>
          <span style={{ minWidth: 60 }}>เรียน</span>
          <span>ผู้อำนวยการ{orgName !== "-" ? " " + orgName : ""}</span>
        </div>

        {/* Name / Position / สังกัด */}
        <div style={row}>
          <span style={{ whiteSpace: "nowrap" }}>ข้าพเจ้า</span>
          <span style={{ fontWeight: "600" }}>{fullName}</span>
          <span style={{ whiteSpace: "nowrap", marginLeft: 12 }}>ตำแหน่ง</span>
          <span>{positionTitle}</span>
        </div>
        <div style={{ ...row, marginBottom: 12 }}>
          <span>สังกัด</span>
          <span>{orgName}</span>
        </div>

        {/* Leave type checkboxes */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 4 }}>
          <span style={{ minWidth: 60 }}>ขอลา</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div><CB checked={isSick} />ป่วย</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span><CB checked={isPersonal} />กิจส่วนตัว</span>
              {isPersonal && leave.reason && (
                <span>เนื่องจาก  {leave.reason}</span>
              )}
            </div>
            <div><CB checked={isMaternity} />คลอดบุตร</div>
          </div>
        </div>

        {/* Reason (for sick) */}
        {isSick && leave.reason && (
          <div style={{ ...row, marginBottom: 4 }}>
            <span>เนื่องจาก</span>
            <span>{leave.reason}</span>
          </div>
        )}

        {/* Dates */}
        <div style={{ ...row, marginBottom: 4 }}>
          <span style={{ whiteSpace: "nowrap" }}>ตั้งแต่วันที่</span>
          <span style={{ fontWeight: "600" }}>{startDateTH}</span>
          <span style={{ whiteSpace: "nowrap", marginLeft: 8 }}>ถึงวันที่</span>
          <span style={{ fontWeight: "600" }}>{endDateTH}</span>
          <span style={{ whiteSpace: "nowrap", marginLeft: 8 }}>มีกำหนด</span>
          <span style={{ fontWeight: "700", fontSize: "16pt" }}>{days}</span>
          <span>วัน</span>
        </div>

        {/* Previous leave */}
        <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 6, marginBottom: 2 }}>
          <span>ข้าพเจ้าได้</span>
          <span><CB checked={isSick} />ลาป่วย</span>
          <span><CB checked={isPersonal} />กิจส่วนตัว</span>
          <span><CB checked={isMaternity} />คลอดบุตร</span>
          <span>ครั้งสุดท้ายตั้งแต่วันที่  -  ถึงวันที่  -  มีกำหนด  -  วัน</span>
        </div>

        {/* Contact */}
        <div style={{ ...row, marginBottom: 4 }}>
          <span style={{ whiteSpace: "nowrap" }}>ในระหว่างลาจะติดต่อข้าพเจ้าได้ที่</span>
          <span>{contactStr}</span>
        </div>

        {/* Closing */}
        <div style={{ textAlign: "right", marginTop: 12, marginBottom: 24 }}>
          ขอแสดงความนับถือ
        </div>
        <div style={{ textAlign: "right", marginBottom: 2 }}>
          ลงชื่อ ................................
        </div>
        <div style={{ textAlign: "right" }}>
          ({fullName})
        </div>

        {/* ════ Bottom two-column ════ */}
        <div style={{ marginTop: 24, display: "flex", gap: 20, alignItems: "flex-start" }}>

          {/* Left: statistics + auditor */}
          <div style={{ flex: 1 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
              <thead>
                <tr>
                  <th style={th}>ประเภทการลา</th>
                  <th style={th}>ลามาแล้ว<br />(วัน)</th>
                  <th style={th}>ลาครั้งนี้<br />(วัน)</th>
                  <th style={th}>รวมเป็น<br />(วัน)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={td}>ลาป่วย</td>
                  <td style={{ ...td, textAlign: "center" }}>
                    {bSick ? Math.max(0, bSick.totalUsed - (isSick ? days : 0)) : "-"}
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>{isSick ? days : "-"}</td>
                  <td style={{ ...td, textAlign: "center" }}>{bSick ? bSick.totalUsed : "-"}</td>
                </tr>
                <tr>
                  <td style={td}>ลากิจส่วนตัว</td>
                  <td style={{ ...td, textAlign: "center" }}>
                    {bPersonal ? Math.max(0, bPersonal.totalUsed - (isPersonal ? days : 0)) : "-"}
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>{isPersonal ? days : "-"}</td>
                  <td style={{ ...td, textAlign: "center" }}>{bPersonal ? bPersonal.totalUsed : "-"}</td>
                </tr>
                <tr>
                  <td style={td}>ลาคลอดบุตร</td>
                  <td style={{ ...td, textAlign: "center" }}>
                    {bMaternity ? Math.max(0, bMaternity.totalUsed - (isMaternity ? days : 0)) : "-"}
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>{isMaternity ? days : "-"}</td>
                  <td style={{ ...td, textAlign: "center" }}>{bMaternity ? bMaternity.totalUsed : "-"}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ fontSize: "13pt", lineHeight: 2.2 }}>
              <div>ลงชื่อ ................................ ผู้ตรวจสอบ</div>
              <div>( ................................ )</div>
              <div>วันที่ ................................</div>
            </div>
            <div style={{ fontSize: "13pt", lineHeight: 2.2, marginTop: 10 }}>
              <div>ลงชื่อ ................................ ผู้อำนวยการกลุ่ม</div>
              <div>( ................................ )</div>
              <div>วันที่ ................................</div>
            </div>
          </div>

          {/* Right: supervisor comment + order */}
          <div style={{ width: "44%", borderLeft: "1.5px solid #000", paddingLeft: 16 }}>
            <div style={{ fontWeight: "bold", fontSize: "14pt", marginBottom: 8 }}>ความคิดเห็นผู้บังคับบัญชา</div>
            <div style={{ fontSize: "13pt", lineHeight: 2.4 }}>
              <div>................................................................</div>
              <div>................................................................</div>
              <div>................................................................</div>
              <div style={{ marginTop: 4 }}>ลงชื่อ ................................</div>
              <div>( ................................ )</div>
              <div>วันที่ ................................</div>
            </div>

            {/* Order box */}
            <div style={{
              marginTop: 16, border: "1.5px solid #000",
              padding: "10px 14px", fontSize: "13pt", lineHeight: 2.2,
            }}>
              <div style={{ fontWeight: "bold", fontSize: "14pt", marginBottom: 6 }}>คำสั่ง</div>
              <div>
                <CB checked={leave.status === "approved"} />อนุญาต
                &nbsp;&nbsp;&nbsp;&nbsp;
                <CB checked={leave.status === "rejected"} />ไม่อนุญาต
              </div>
              <div>................................................................</div>
              <div>................................................................</div>
              <div style={{ marginTop: 4 }}>ลงชื่อ ................................</div>
              <div>ตำแหน่ง ................................</div>
              <div>วันที่ ................................</div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { margin: 0; background: #fff; }
          .no-print { display: none !important; }
        }
      `}</style>
    </>
  );
}
