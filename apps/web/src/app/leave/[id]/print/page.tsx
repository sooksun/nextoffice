import { apiFetch } from "@/lib/api";
import { notFound } from "next/navigation";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

// ─── helpers ────────────────────────────────────────────────

const MONTHS_TH = [
  "มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
  "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม",
];

function splitDate(iso: string) {
  if (!iso) return { day: "", month: "", year: "" };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { day: "", month: "", year: "" };
  return { day: String(d.getDate()), month: MONTHS_TH[d.getMonth()], year: String(d.getFullYear() + 543) };
}

function todayTH() { return splitDate(new Date().toISOString()); }

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

// ─── micro-components ───────────────────────────────────────

function Dots({ value, minW = 60 }: { value?: string | null; minW?: number }) {
  return (
    <span style={{
      display: "inline-block",
      borderBottom: "1px solid #000",
      minWidth: minW,
      minHeight: "1.2em",
      padding: "0 4px",
      verticalAlign: "bottom",
      flex: 1,
    }}>
      {value ?? ""}
    </span>
  );
}

function CB({ checked }: { checked: boolean }) {
  return (
    <span style={{
      display: "inline-block",
      width: 12, height: 12,
      border: "1px solid #000",
      marginRight: 3,
      verticalAlign: "middle",
      textAlign: "center",
      lineHeight: "11px",
      fontSize: 9,
    }}>
      {checked ? "✓" : ""}
    </span>
  );
}

// ─── table cell styles ───────────────────────────────────────

const th: React.CSSProperties = {
  border: "1px solid #000", padding: "3px 6px",
  textAlign: "center", fontWeight: "bold", fontSize: "12pt",
  backgroundColor: "#f0f0f0",
};
const td: React.CSSProperties = {
  border: "1px solid #000", padding: "3px 6px", fontSize: "12pt",
};

// ─── page ───────────────────────────────────────────────────

export default async function PrintLeavePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [leave, balances] = await Promise.all([getLeave(id), getBalance()]);
  if (!leave) notFound();

  const isSick      = leave.leaveType === "sick";
  const isPersonal  = leave.leaveType === "personal";
  const isMaternity = leave.leaveType === "maternity";
  const isOther     = !isSick && !isPersonal && !isMaternity;

  const start   = splitDate(leave.startDate);
  const end     = splitDate(leave.endDate);
  const written = todayTH();

  const positionTitle = leave.positionTitle ?? leave.user?.positionTitle ?? "";
  const orgName       = leave.user?.organization?.name ?? "";
  const fullName      = leave.user?.fullName ?? "";

  const bSick      = balances.find((b) => b.leaveType === "sick");
  const bPersonal  = balances.find((b) => b.leaveType === "personal");
  const bMaternity = balances.find((b) => b.leaveType === "maternity");
  const days       = Number(leave.totalDays);

  const contactStr = [leave.contactAddress, leave.contactPhone ? `โทร. ${leave.contactPhone}` : ""]
    .filter(Boolean).join("  ");

  const paper: React.CSSProperties = {
    margin: "0 auto",
    background: "#fff",
    color: "#000",
    width: "210mm",
    minHeight: "297mm",
    padding: "12mm 14mm 10mm 20mm",
    fontFamily: "'TH Sarabun New', 'Sarabun', 'Angsana New', sans-serif",
    fontSize: "15pt",
    lineHeight: 1.7,
    boxSizing: "border-box",
  };
  const row: React.CSSProperties = { display: "flex", alignItems: "baseline", gap: 6, marginBottom: 3 };

  return (
    <>
      {/* ── Screen toolbar ── */}
      <div className="print:hidden flex items-center gap-3 px-4 py-3 bg-surface-low border-b border-outline-variant/30 no-print">
        <PrintButton />
        <a href="/leave" className="btn-ghost text-sm">← กลับ</a>
        <span className="ml-auto text-xs text-on-surface-variant">
          กด <kbd className="border border-outline-variant/50 rounded px-1">Ctrl+P</kbd> เพื่อพิมพ์หรือบันทึก PDF
        </span>
      </div>

      {/* ── Paper ── */}
      <div style={paper}>

        {/* Title */}
        <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "18pt", marginBottom: 6 }}>
          แบบใบลาป่วย  ลาคลอดบุตร  ลากิจส่วนตัว
        </div>

        {/* Written at */}
        <div style={{ textAlign: "right", marginBottom: 2 }}>
          เขียนที่&nbsp;<Dots value={orgName} minW={200} />
        </div>
        <div style={{ textAlign: "right", marginBottom: 10, display: "flex", justifyContent: "flex-end", gap: 4, alignItems: "baseline" }}>
          <span>วันที่</span><Dots value={written.day} minW={30} />
          <span>เดือน</span><Dots value={written.month} minW={90} />
          <span>พ.ศ.</span><Dots value={written.year} minW={55} />
        </div>

        {/* Subject / To */}
        <div style={row}>
          <span>เรื่อง</span>
          <Dots value={`ขอลา${isSick ? "ป่วย" : isPersonal ? "กิจส่วนตัว" : isMaternity ? "คลอดบุตร" : leave.leaveType}`} />
        </div>
        <div style={{ ...row, marginBottom: 10 }}>
          <span>เรียน</span>
          <Dots value={`ผู้อำนวยการ${orgName ? " " + orgName : ""}`} />
        </div>

        {/* Name / position */}
        <div style={row}>
          <span style={{ whiteSpace: "nowrap" }}>ข้าพเจ้า</span>
          <Dots value={fullName} />
          <span style={{ whiteSpace: "nowrap" }}>ตำแหน่ง</span>
          <Dots value={positionTitle} />
        </div>
        <div style={{ ...row, marginBottom: 10 }}>
          <span>สังกัด</span>
          <Dots value={orgName} />
        </div>

        {/* Leave type checkboxes */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 4 }}>
          <span style={{ whiteSpace: "nowrap" }}>ขอลา</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <div><CB checked={isSick} />ป่วย</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span><CB checked={isPersonal} />กิจส่วนตัว</span>
              <span style={{ whiteSpace: "nowrap" }}>เนื่องจาก</span>
              <Dots value={isPersonal || isOther ? (leave.reason ?? "") : ""} />
            </div>
            <div><CB checked={isMaternity} />คลอดบุตร</div>
          </div>
        </div>
        {isSick && (
          <div style={{ ...row, marginBottom: 4 }}>
            <span style={{ whiteSpace: "nowrap" }}>เนื่องจาก</span>
            <Dots value={leave.reason ?? ""} />
          </div>
        )}

        {/* Dates */}
        <div style={{ ...row, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ whiteSpace: "nowrap" }}>ตั้งแต่วันที่</span>
          <Dots value={`${start.day} ${start.month} พ.ศ. ${start.year}`} />
          <span style={{ whiteSpace: "nowrap" }}>ถึงวันที่</span>
          <Dots value={`${end.day} ${end.month} พ.ศ. ${end.year}`} />
          <span style={{ whiteSpace: "nowrap" }}>มีกำหนด</span>
          <Dots value={String(days)} minW={30} />
          <span>วัน</span>
        </div>

        {/* Previous leave */}
        <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 4, marginBottom: 2 }}>
          <span style={{ whiteSpace: "nowrap" }}>ข้าพเจ้าได้</span>
          <span><CB checked={isSick} />ลาป่วย</span>
          <span><CB checked={isPersonal} />กิจส่วนตัว</span>
          <span><CB checked={isMaternity} />คลอดบุตร</span>
          <span style={{ whiteSpace: "nowrap" }}>ครั้งสุดท้ายตั้งแต่วันที่</span>
          <Dots value="" minW={120} />
        </div>
        <div style={{ ...row, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ whiteSpace: "nowrap" }}>ถึงวันที่</span>
          <Dots value="" minW={120} />
          <span style={{ whiteSpace: "nowrap" }}>มีกำหนด</span>
          <Dots value="" minW={30} />
          <span>วัน</span>
        </div>
        <div style={{ ...row, marginBottom: 4 }}>
          <span style={{ whiteSpace: "nowrap" }}>ในระหว่างลาจะติดต่อข้าพเจ้าได้ที่</span>
          <Dots value={contactStr} />
        </div>

        {/* Closing */}
        <div style={{ textAlign: "right", marginTop: 10, marginBottom: 20 }}>ขอแสดงความนับถือ</div>
        <div style={{ textAlign: "right", marginBottom: 2 }}>
          (ลงชื่อ)&nbsp;<Dots value="" minW={180} />
        </div>
        <div style={{ textAlign: "right" }}>
          (&nbsp;<Dots value={fullName} minW={180} />&nbsp;)
        </div>

        {/* ════ Bottom two-column ════ */}
        <div style={{ marginTop: 20, display: "flex", gap: 16, alignItems: "flex-start" }}>

          {/* Left: statistics + auditor */}
          <div style={{ flex: 1 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
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
                    {bSick ? Math.max(0, bSick.totalUsed - (isSick ? days : 0)) : ""}
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>{isSick ? days : ""}</td>
                  <td style={{ ...td, textAlign: "center" }}>{bSick ? bSick.totalUsed : ""}</td>
                </tr>
                <tr>
                  <td style={td}>ลากิจส่วนตัว</td>
                  <td style={{ ...td, textAlign: "center" }}>
                    {bPersonal ? Math.max(0, bPersonal.totalUsed - (isPersonal ? days : 0)) : ""}
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>{isPersonal ? days : ""}</td>
                  <td style={{ ...td, textAlign: "center" }}>{bPersonal ? bPersonal.totalUsed : ""}</td>
                </tr>
                <tr>
                  <td style={td}>ลาคลอดบุตร</td>
                  <td style={{ ...td, textAlign: "center" }}>
                    {bMaternity ? Math.max(0, bMaternity.totalUsed - (isMaternity ? days : 0)) : ""}
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>{isMaternity ? days : ""}</td>
                  <td style={{ ...td, textAlign: "center" }}>{bMaternity ? bMaternity.totalUsed : ""}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ fontSize: "13pt", lineHeight: 2 }}>
              <div style={row}><span style={{ whiteSpace: "nowrap" }}>(ลงชื่อ)</span><Dots value="" /><span style={{ whiteSpace: "nowrap" }}>ผู้ตรวจสอบ</span></div>
              <div style={row}><span>(ตำแหน่ง)</span><Dots value="" /></div>
              <div style={row}><span>วันที่</span><Dots value="" minW={100} /></div>
            </div>
            <div style={{ fontSize: "13pt", lineHeight: 2, marginTop: 10 }}>
              <div style={row}><span style={{ whiteSpace: "nowrap" }}>(ลงชื่อ)</span><Dots value="" /><span style={{ whiteSpace: "nowrap" }}>ผู้อำนวยการกลุ่ม</span></div>
              <div style={row}><span style={{ whiteSpace: "nowrap" }}>(</span><Dots value="" /><span>)</span></div>
              <div style={row}><span>วันที่</span><Dots value="" minW={100} /></div>
            </div>
          </div>

          {/* Right: supervisor comment + order */}
          <div style={{ width: "44%", borderLeft: "1px solid #000", paddingLeft: 14 }}>
            <div style={{ fontWeight: "bold", fontSize: "14pt", marginBottom: 6 }}>ความคิดเห็นผู้บังคับบัญชา</div>
            <div style={{ fontSize: "13pt", lineHeight: 2.1 }}>
              <div><Dots value="" /></div>
              <div><Dots value="" /></div>
              <div><Dots value="" /></div>
              <div style={row}><span style={{ whiteSpace: "nowrap" }}>(ลงชื่อ)</span><Dots value="" /></div>
              <div style={row}><span>(</span><Dots value="" /><span>)</span></div>
              <div style={row}><span>วันที่</span><Dots value="" minW={100} /></div>
            </div>

            {/* Order box */}
            <div style={{ marginTop: 14, border: "1px solid #000", padding: "8px 12px", fontSize: "13pt", lineHeight: 2 }}>
              <div style={{ fontWeight: "bold", fontSize: "14pt", marginBottom: 4 }}>คำสั่ง</div>
              <div>
                <CB checked={leave.status === "approved"} />อนุญาต
                &nbsp;&nbsp;&nbsp;
                <CB checked={leave.status === "rejected"} />ไม่อนุญาต
              </div>
              <div><Dots value="" /></div>
              <div><Dots value="" /></div>
              <div style={row}><span style={{ whiteSpace: "nowrap" }}>(ลงชื่อ)</span><Dots value="" /></div>
              <div style={row}><span>ตำแหน่ง</span><Dots value="" /></div>
              <div style={row}><span>วันที่</span><Dots value="" minW={100} /></div>
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
