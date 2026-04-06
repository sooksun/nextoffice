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

## Google Calendar Integration

**Status**: ✅ ติดตั้งแล้วใน `apps/api/src/calendar/`

### Files
- `apps/api/src/calendar/services/google-calendar.service.ts` — core service
- `apps/api/src/calendar/calendar.module.ts` — NestJS module
- Import ใน `app.module.ts`, `ai.module.ts`, `cases.module.ts`

### Events ที่สร้างอัตโนมัติ
| Trigger | Method | Event type |
|---------|--------|------------|
| ลงรับเอกสาร (`register`) | `createDeadlineEvent()` | Deadline event |
| มอบหมายงาน (`assign`) | `createAssignmentReminderEvent()` | Reminder event |
| เอกสารเป็นการประชุม | `createMeetingEvent()` | Meeting event + attendees |

### DB Fields (InboundCase)
```prisma
googleCalendarEventId  String?  # deadline event
meetingCalendarEventId String?  # meeting event
isMeeting              Boolean
meetingDate            DateTime?
meetingTime            String?  # "HH:MM-HH:MM"
meetingLocation        String?
```

### Environment Variables (apps/api/.env.production)
```env
GOOGLE_DRIVE_CLIENT_ID=<see .env.production on server>
GOOGLE_DRIVE_CLIENT_SECRET=<see .env.production on server>
GOOGLE_DRIVE_REFRESH_TOKEN=<see .env.production on server>
GOOGLE_CALENDAR_ID=primary
```

### ขั้นตอนขอ Refresh Token (ทำครั้งเดียว)

1. เพิ่ม Redirect URI ใน [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth 2.0 Client
   - `https://nextoffice.cnppai.com/oauth2callback`
   - `http://localhost:3000/oauth2callback`

2. เปิด Authorization URL:
```
https://accounts.google.com/o/oauth2/v2/auth?client_id=CLIENT_ID&redirect_uri=http://localhost:3000/oauth2callback&response_type=code&scope=https://www.googleapis.com/auth/drive.file%20https://www.googleapis.com/auth/calendar&access_type=offline&prompt=consent
```

3. Login → Allow → copy `code=...` จาก URL bar

4. Exchange code → refresh token:
```bash
curl -X POST https://oauth2.googleapis.com/token \
  -d "code=CODE_HERE" \
  -d "client_id=CLIENT_ID" \
  -d "client_secret=CLIENT_SECRET" \
  -d "redirect_uri=http://localhost:3000/oauth2callback" \
  -d "grant_type=authorization_code"
# → ได้ refresh_token ใน response JSON
```

5. อัปเดต `.env.production` บน server แล้วรัน:
```bash
docker compose up -d --build api
```

> **หมายเหตุ**: ใช้ OAuth credentials เดียวกันกับ Google Drive — Refresh token authorize ทั้ง Drive + Calendar scope

---

## Permissions

| Action | Allowed Roles |
|--------|--------------|
| `POST /cases/:id/register` | ADMIN, DIRECTOR, VICE_DIRECTOR, HEAD_TEACHER, CLERK |
| `POST /cases/:id/assign` | ADMIN, DIRECTOR, VICE_DIRECTOR, **CLERK** |
| `PATCH /cases/assignments/:id/status` | ผู้ถูกมอบหมายเท่านั้น (self) |

---

## ปัญหา Deploy ที่พบบ่อย (NestJS Module Errors)

### 1. Circular Dependency — `forwardRef()` ขาด

**Symptom:** `The module at index [N] is of type "undefined"`

**สาเหตุ:** module chain วนกลับ เช่น `AiModule → LineModule → CasesModule → AiModule`

**Fix:** ใช้ `forwardRef()` ฝั่งที่ import ทีหลัง
```typescript
// apps/api/src/ai/ai.module.ts
import { Module, forwardRef } from '@nestjs/common';
imports: [forwardRef(() => LineModule), ...]
```

**Chain ปัจจุบันที่ต้อง forwardRef:**
- `AiModule` → `forwardRef(() => LineModule)`
- `LineModule` → `forwardRef(() => CasesModule)`
- `CasesModule` → `forwardRef(() => AiModule)`

---

### 2. Module ไม่ Export Services ที่ Processor ต้องการ

**Symptom:** `Nest can't resolve dependencies of the XxxProcessor (?, ...)`

**สาเหตุ:** `HorizonModule` / `VaultModule` export เฉพาะบาง services แต่ `ProcessorModule` import module แล้ว Processor inject service ที่ไม่ได้ export

**Fix:** export ทุก service ที่ Processor ใช้
```typescript
// apps/api/src/horizon/horizon.module.ts
exports: [
  HorizonSourceService, HorizonFetchService, HorizonNormalizeService,
  HorizonClassifyService, HorizonSignalService, HorizonEmbedService, HorizonPipelineService,
],
```

---

### 3. Controller Module ไม่ import AuthModule

**Symptom:** `Nest can't resolve dependencies of the JwtAuthGuard (?). AuthService at index [0] is not available in XxxModule`

**สาเหตุ:** module ที่มี controller ใช้ `@UseGuards(JwtAuthGuard)` แต่ไม่ได้ import `AuthModule`

**Fix:** เพิ่ม `AuthModule` ใน imports ทุก module ที่มี controller พร้อม auth guard
```typescript
import { AuthModule } from '../auth/auth.module';
@Module({ imports: [ConfigModule, AuthModule], ... })
```

**Modules ที่ต้องมี AuthModule:** `HorizonModule`, `ProjectsModule`, `VaultModule` และทุก module ใหม่ที่มี controller

---

### 4. TypeScript Strict Mode — `unknown` ใช้เป็น ReactNode ไม่ได้

**Symptom (Docker build):** `Type 'unknown' is not assignable to type 'ReactNode'`

**สาเหตุ:** JSX condition `{a.detail?.someField && <p>...</p>}` — `someField` มีชนิด `unknown` ซึ่ง strict mode ไม่ยอมให้เป็น boolean condition ใน JSX

**Fix:** เพิ่ม `!!` เพื่อ coerce เป็น boolean
```tsx
// ❌ ผิด
{a.detail?.registrationNo && <p>...</p>}

// ✅ ถูก
{!!a.detail?.registrationNo && <p>...</p>}
```

> หมายเหตุ: local `tsc --noEmit` อาจผ่านได้ แต่ Docker build ล้มเหลว เพราะ Next.js strict mode บังคับใช้เต็มรูปแบบ

---

### 5. Production Deploy Checklist

```bash
# บน server: /DATA/AppData/www/nextoffice
git pull
docker compose up -d --build api   # rebuild api เท่านั้น (ถ้า web ไม่เปลี่ยน)
docker compose logs --tail=30 api  # ตรวจสอบว่า start สำเร็จ

# API start สำเร็จ = log บรรทัดสุดท้ายต้องเป็น:
# 🚀 NextOffice API running on http://localhost:3000
# 📚 Swagger docs at http://localhost:3000/api/docs
```

**env ที่สำคัญใน `.env.production`:**
| Key | ค่าที่ต้องมี |
|-----|------------|
| `DATABASE_URL` | `mysql://root:***@192.168.1.4:3306/nextoffice_db` |
| `JWT_SECRET` | random 64-char string |
| `PUBLIC_API_URL` | `https://noapi.cnppai.com` (bake เข้า web ตอน build) |
| `WEB_URL` | ไม่จำเป็น — default ใช้ `https://nextoffice.cnppai.com` สำหรับ CORS |
