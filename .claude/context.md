# NextOffice — Project Context & Patterns

## Thai Date System (พ.ศ./ค.ศ.)

### หลักการ
- **DB / API** เก็บวันที่เป็น **CE (ค.ศ.)** เสมอ เช่น `2026-03-10`
- **UI** แสดงผลเป็น **BE (พ.ศ. = CE + 543)** เสมอ เช่น `10/03/2569`
- Reference: https://9mza.net/post/antd-date-thai-locale-nextjs (แนวคิด locale พ.ศ.)

### ปัญหาที่พบและแก้แล้ว

**Double +543 bug** — AI extract วันที่จากเอกสารไทยเป็น พ.ศ. แล้วเก็บใน DB เช่น `2569-03-09` → ThaiDatePicker บวก 543 อีก → แสดง `3112`

แก้ 3 ชั้น:
1. **Prompt** (`apps/api/src/system-prompts/default-prompts.ts`): ระบุให้ AI return ปี ค.ศ. พร้อมตัวอย่าง `2569−543=2026`
2. **API** (`apps/api/src/ai/services/extraction.service.ts`): `normalizeDateToCe()` — ถ้า year > 2500 ลบ 543 ก่อน store
3. **Frontend form** (`apps/web/src/app/inbox/new/page.tsx`): `toInputDate()` — ถ้า year > 2500 ลบ 543 ก่อน parse
4. **ThaiDatePicker** (`apps/web/src/components/ui/ThaiDatePicker.tsx`): `ceStringToDate()` — last defence เดียวกัน

---

## ThaiDatePicker Component

**File**: `apps/web/src/components/ui/ThaiDatePicker.tsx`

### Dependencies
```bash
npm install react-datepicker date-fns
# types จาก @types/react-datepicker ถ้าต้องการ
```

### การใช้งาน
```tsx
import ThaiDatePicker from "@/components/ui/ThaiDatePicker";

// รับ-ส่งเป็น CE string "YYYY-MM-DD", แสดงเป็น พ.ศ.
<ThaiDatePicker
  value={form.documentDate}          // CE: "2026-03-09"
  onChange={(v) => update("documentDate", v)}  // v = CE: "2026-03-09"
/>
```

### Architecture

```
value (CE string "YYYY-MM-DD")
  ↓ ceStringToDate()  [+ safety: year>2500 → −543]
selected (JS Date object — CE internally)
  ↓ react-datepicker renders calendar
  ↓ CustomHeader แสดง month ไทย + year BE (date.getFullYear()+543)
  ↓ formatWeekDay() maps to อา/จ/อ/พ/พฤ/ศ/ส
  ↓ formatBeDisplay() แสดงใน input = "dd/MM/YYYY+543"
onChange → dateToCeString() → CE string ส่งกลับออก
```

### Key Implementation Points

**1. ต้อง import base CSS** (ถ้าไม่ import calendar ไม่เป็น grid)
```tsx
import "react-datepicker/dist/react-datepicker.css";
```

**2. TypeScript strict — ต้อง type ทุก parameter**
```tsx
// ✅ ถูก
onChange={(d: Date | null) => onChange(dateToCeString(d))}
formatWeekDay={(d: string) => ...}

// ❌ ผิด — implicit any
onChange={(d) => ...}
```

**3. Extract CustomHeader เป็น named function** (ไม่ใช่ inline)
```tsx
// ✅ ถูก — typed via ReactDatePickerCustomHeaderProps
function CustomHeader(props: ReactDatePickerCustomHeaderProps) { ... }
renderCustomHeader={(props) => <CustomHeader {...props} />}

// ❌ ผิด — implicit any params
renderCustomHeader={({ date, ... }) => <div>...</div>}
```

**4. Thai weekday abbreviations — ใช้ Map ไม่ใช่ slice()**
```tsx
// ❌ slice(0,2) ตัดผิดบน leading vowel & combining chars
// เสาร์ → "เส" (ผิด), จันทร์ → "จั" (ผิด)

// ✅ ถูก
const WEEKDAY_ABBR: Record<string, string> = {
  "อาทิตย์": "อา", "จันทร์": "จ", "อังคาร": "อ",
  "พุธ": "พ", "พฤหัสบดี": "พฤ", "ศุกร์": "ศ", "เสาร์": "ส",
};
function formatWeekDay(d: string): string {
  return WEEKDAY_ABBR[d] ?? d.charAt(0);
}
```

**5. Year dropdown แสดง BE label แต่ value เป็น CE**
```tsx
const CE_YEARS = Array.from({ length: 101 }, (_, i) => 1980 + i); // CE 1980–2080
<select value={date.getFullYear()} onChange={(e) => changeYear(Number(e.target.value))}>
  {CE_YEARS.map((y) => (
    <option key={y} value={y}>{y + 543}</option>  // label=BE, value=CE
  ))}
</select>
```

**6. Month dropdown ใช้ Thai names**
```tsx
const MONTHS_TH = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน",
  "พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม",
  "กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
<select value={date.getMonth()} onChange={(e) => changeMonth(Number(e.target.value))}>
  {MONTHS_TH.map((m, i) => <option key={i} value={i}>{m}</option>)}
</select>
```

**7. Input แสดง BE แต่ DatePicker ทำงานด้วย CE**
```tsx
// value prop บน DatePicker override text ใน input
value={selected ? formatBeDisplay(selected) : ""}

function formatBeDisplay(d: Date): string {
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()+543}`;
}
```

**8. CSS overrides ใน globals.css** — force flex layout บน day-names และ week rows
```css
.react-datepicker__day-names { display: flex !important; justify-content: space-around; }
.react-datepicker__week { display: flex !important; justify-content: space-around; }
.react-datepicker__day { display: inline-flex !important; align-items: center; justify-content: center; width: 2rem; height: 2rem; }
.react-datepicker { min-width: 280px; }
.react-datepicker__navigation { display: none; }  /* ใช้ custom prev/next buttons แทน */
```

**9. z-index สำหรับ popup**
```tsx
<DatePicker popperClassName="z-50" ... />
```

### Full Component Props
```tsx
interface Props {
  value?: string;      // CE "YYYY-MM-DD"
  onChange: (value: string) => void;  // ส่งออก CE "YYYY-MM-DD"
  name?: string;       // hidden input name สำหรับ form submit
  placeholder?: string;  // default "วว/ดด/พ.ศ."
  className?: string;
  disabled?: boolean;
}
```

---

## Thai Date Utilities

**File**: `apps/web/src/lib/thai-date.ts`

```typescript
formatThaiDate(raw)        // "15 มกราคม 2567" (full month, full BE year)
formatThaiDateShort(raw)   // "15 ม.ค. 67" (short month, 2-digit BE year)
formatThaiDateTime(raw)    // "15 ม.ค. 67, 10:30"
formatThaiDateNumeric(raw) // "15/1/2567"
parseCeDate(s)             // string → Date | null
```

---

## Inbox New Form — AI Pre-fill Pattern

**File**: `apps/web/src/app/inbox/new/page.tsx`

Flow เมื่อเปิด `/inbox/new?intakeId=27`:
1. `loadIntake(id)` → `GET /intake/:id` → รับ `aiResult`
2. `toInputDate(r.documentDate)` แปลง BE→CE ถ้าจำเป็น
3. `dueDate = toInputDate(r.deadlineDate) || defaultDueDate(3)` — default 3 วัน
4. `recipientNote = r.recipientText || "ผู้อำนวยการโรงเรียน"` — default
5. Submit → `POST /cases/manual` → redirect `/inbox/:caseId`

```typescript
/** Default dueDate = today + n days (CE YYYY-MM-DD) */
function defaultDueDate(daysFromNow = 3): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
}

/** Parse date: ถ้า year > 2500 → BE → ลบ 543 → CE */
function toInputDate(raw: string | null | undefined): string { ... }
```

---

## API — Manual Case Creation

**File**: `apps/api/src/cases/services/cases.service.ts` → `createManual()`

สร้าง `Document` record ก่อน แล้ว link `sourceDocumentId`:
```typescript
const sourceDoc = await this.prisma.document.create({
  data: {
    title: dto.title,
    sourceType: 'inbound_manual',
    documentType: 'official',
    issuingAuthority: dto.senderOrg || null,
    documentCode: dto.documentNo || null,
    publishedAt: dto.documentDate ? new Date(dto.documentDate) : null,
    status: 'active',
  },
});
// แล้ว inboundCase.create({ sourceDocumentId: sourceDoc.id, ... })
```

> **สำคัญ**: ต้องสร้าง Document record เพื่อให้ `sourceDocument.issuingAuthority` และ `sourceDocument.documentCode` แสดงใน detail page ได้ถูกต้อง

---

## API Date Normalization

**File**: `apps/api/src/ai/services/extraction.service.ts`

```typescript
function normalizeDateToCe(raw: string | null | undefined): string {
  if (!raw) return '';
  const isoMatch = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const ceYear = year > 2500 ? year - 543 : year;
    return `${ceYear}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  // ... handle DD/MM/YYYY too
  return '';
}
```

ใช้กับทุก date field: `documentDate`, `deadlineDate`, `meetingDate`

---

## Permissions

| Action | Allowed Roles |
|--------|--------------|
| `POST /cases/:id/register` | ADMIN, DIRECTOR, VICE_DIRECTOR, HEAD_TEACHER, CLERK |
| `POST /cases/:id/assign` | ADMIN, DIRECTOR, VICE_DIRECTOR, **CLERK** |
| `PATCH /cases/assignments/:id/status` | ผู้ถูกมอบหมายเท่านั้น (self) |
