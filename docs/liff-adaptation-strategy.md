# แนวคิดการปรับ Function จาก Web App → LINE LIFF

เอกสารนี้สรุปหลักคิด เกณฑ์การคัดเลือก และ pattern ในการย้าย/ปรับฟีเจอร์จาก Next.js web app (`apps/web/src/app/*`) ไปใช้งานบน LINE MINI App (LIFF) ให้ได้ประสิทธิภาพสูงสุด

---

## 1. ปรัชญา: Web กับ LIFF ไม่ใช่ของแทนกัน

| มุม | Web (`/director`, `/inbox`, `/outbound`…) | LIFF (`/liff/*`) |
|---|---|---|
| **ผู้ใช้** | นั่งโต๊ะ หน้าจอใหญ่ คีย์บอร์ด | ยืน-เดิน นิ้วหัวแม่มือ หน้าจอเล็ก |
| **Session** | 5–30 นาที | **30 วินาที – 2 นาที** |
| **Trigger** | เปิด browser, มีเวลาคิด | ได้ push → กด link → ทำเลย |
| **Task** | วิเคราะห์, compose, bulk edit | ดู, อนุมัติ, ลงนาม, รายงาน |
| **Data density** | หลายคอลัมน์, filter, sort | 1 คอลัมน์, top 5–10 |

**กฎเหล็ก:** ทุก feature ที่ย้ายเข้า LIFF ต้องทำให้เสร็จได้ใน **≤ 3 แตะ** และ **≤ 60 วินาที**

---

## 2. เกณฑ์คัดเลือก: feature ไหนควรเข้า LIFF

### ✅ **ควรเข้า LIFF** (high-value)
- Quick approval (ลงนาม, อนุมัติ, ปฏิเสธ)
- Push-driven action (ได้แจ้งเตือน → เข้าไปจัดการ)
- Mobile-native capability (GPS, กล้อง, ถ่ายรูป)
- View-only ข้อมูลสรุป (dashboard, pending list)
- Single-entity deep-dive (ดูหนังสือ 1 ฉบับ)

### 🟡 **ปรับให้เข้าได้** (medium-value)
- Search (ขอ input สั้นๆ, ผลลัพธ์ไม่เยอะ)
- Timeline / history (list แบบ infinite scroll)
- Quick status update (เช็คอิน/ออก, รับทราบ)

### ❌ **อย่าย้ายเข้า LIFF** (low-value / anti-pattern)
- Bulk edit / multi-select across dozens of rows
- Form ยาว > 10 fields
- Multi-column table พร้อม sorting/filtering ซับซ้อน
- Export Excel / PDF report / pivot
- Admin CRUD (user mgmt, org mgmt, system config)
- Analytics dashboard ที่ต้องขยาย chart

---

## 3. Pattern การปรับ UI

### Mobile-first layout
- **1 คอลัมน์เสมอ** — ห้ามใช้ `grid-cols-2+` บน LIFF route
- **Width ≤ 420px** — ใช้ `max-w-md mx-auto`
- **Vertical rhythm** — card spacing ≥ 8px, padding ≥ 12px

### Touch targets
- ทุก clickable area **≥ 44×44px** (Apple HIG)
- ปุ่ม primary action **full-width + ≥ 48px height**
- ระยะห่างระหว่างปุ่ม ≥ 8px (กันเผลอโดน)

### Bottom-action pattern
- Action สำคัญ (ยืนยัน, ส่ง, ลงนาม) อยู่ **ด้านล่างสุด** ของหน้า (thumb zone)
- Secondary actions (ยกเลิก, กลับ) อยู่บนหรือเป็น ghost button

### Progressive disclosure
- หน้าแรกเห็นแค่ 3 ข้อมูลหลัก (title, status, date)
- รายละเอียด (description, metadata, history) กด "ดูเพิ่ม" ถึงจะเห็น
- ซ่อน field ที่ใช้ < 5% ของเวลา

### Skeleton + optimistic UI
- โหลด: skeleton cards 3 อัน (ไม่ใช่ spinner กลางจอ)
- กดปุ่ม: เปลี่ยน state ทันที → async call → rollback ถ้า error

---

## 4. Pattern การ reuse API

### กฎ: **ห้ามสร้าง endpoint ใหม่สำหรับ LIFF โดยเฉพาะ**
LIFF = web client ธรรมดา — ใช้ endpoint เดียวกับ web app ได้ทั้งหมด
เพียงแต่ frontend ต้องเลือก field ที่จะแสดงเอง

### ข้อยกเว้น — ใช่ก็ต่อเมื่อ:
1. **Payload ใหญ่กว่า 30KB** บน mobile network → สร้าง `/cases/:id/summary` ที่ส่ง field น้อยลง
2. **Response ต้องเปลี่ยนรูปร่างชัด** เช่น nested hierarchy → flat list

### Data slimming tactic
- ใช้ query param `?fields=id,title,status` (ถ้า API รองรับ)
- ใน frontend ทำ select-only projection:
  ```ts
  const slim = (c: Case) => ({ id: c.id, title: c.title, status: c.status });
  ```
- หลีกเลี่ยง `?take=200` บน LIFF — ใช้ `?take=10` + pagination

---

## 5. Mapping: ฟีเจอร์ Web ที่มีอยู่ → แผนสำหรับ LIFF

| Web Route | สถานะ LIFF ปัจจุบัน | แผนที่แนะนำ | Priority |
|---|---|---|---|
| `/director` dashboard | ✅ มี `/liff` (role-aware) | ขยายให้ Teacher / Clerk เห็นข้อมูลของตัวเอง | 🟢 Done |
| `/director/signing/[id]` | ✅ มี `/liff/sign/[id]` | — | 🟢 Done |
| `/cases/[id]` | ✅ มี `/liff/cases/[id]` | เพิ่ม quick "มอบหมาย" UI | 🟡 v1.1 |
| `/inbox` (list) | ✅ ครอบใน dashboard + search | — | 🟢 Done |
| `/notifications` | ✅ รวมใน `/liff` dashboard | — | 🟢 Done |
| `/cases` search | ✅ มี `/liff/search` + bot `ค้นหา` | — | 🟢 Done |
| **`/attendance/check-in`** | ❌ ยังไม่มี | **🔴 เหมาะ LIFF ที่สุด** — เช็คอิน + GPS + face ผ่านกล้องใน LIFF | 🔴 High |
| `/attendance/history` | ❌ | สรุป 7 วันย้อนหลัง + total ชั่วโมง | 🟡 Medium |
| `/attendance/face` | ❌ | ลงทะเบียนใบหน้า (ใช้ `liff.scanCodeV2` / camera API) | 🟡 Medium |
| `/calendar` (meetings) | ❌ | รายการประชุมวันนี้ + สัปดาห์หน้า (quick RSVP) | 🟡 Medium |
| `/outbound/[id]` (ผอ. อนุมัติส่ง) | ❌ | หน้าอนุมัติเร่งด่วน — preview + 1-click approve | 🟢 High |
| `/outbound/new` (สร้างหนังสือส่ง) | ❌ | **อย่าย้าย** — form ยาว > 10 field ใช้ web ดีกว่า | ⚪ Skip |
| `/chat` (RAG Q&A) | ❌ | **อย่าย้าย** — มี LINE bot text chat อยู่แล้ว (ซ้ำซ้อน) | ⚪ Skip |
| `/documents` | — | รวมใน `/liff/cases/[id]` | 🟢 Done |
| `/horizon`, `/admin/*` | ❌ | **อย่าย้าย** — admin CRUD ไม่ใช่ mobile use-case | ⚪ Skip |
| `/inbox/new` (upload) | ❌ | **พิจารณา** — ใช้ `liff.sendMessages` แบ่ง flow ให้ bot จัดการดีกว่า | 🟡 Low |

---

## 6. Use-cases แนะนำเป็นพิเศษ (high-ROI)

### 🎯 Use-case 1: ผอ. อนุมัติหนังสือส่ง ผ่าน LIFF
**ปัญหา:** ปัจจุบันต้องเปิด web → login → ไป `/outbound` → เลือก → ดู → อนุมัติ (≈ 90 วิ)
**LIFF แก้:** ได้ push → กด link → preview PDF → กด "อนุมัติ" → เสร็จ (≈ 15 วิ)
**ไฟล์ที่ต้องทำ:**
- `apps/web/src/app/liff/outbound/[id]/page.tsx` — preview + approve button
- เรียก endpoint เดิม: `POST /outbound/:id/approve`

### 🎯 Use-case 2: ครูลงเวลา (check-in/out) ผ่าน LIFF
**ปัญหา:** ต้องเปิด web, location permission อาจถูก browser block
**LIFF แก้:** LIFF มี `liff.getContext()` + GPS + กล้อง permission สำเร็จรูป
**ไฟล์ที่ต้องทำ:**
- `apps/web/src/app/liff/checkin/page.tsx` — ปุ่มใหญ่ + GPS auto + face verify
- เรียก endpoint เดิม: `POST /attendance/check-in`

### 🎯 Use-case 3: Rich menu → "ตารางนัดหมายของผม"
**ปัญหา:** ผู้ใช้ไม่รู้ว่าสัปดาห์นี้มีประชุมอะไร
**LIFF แก้:** Rich menu เพิ่มปุ่ม → `/liff/calendar` → list ประชุม 7 วัน
**ไฟล์ที่ต้องทำ:**
- `apps/web/src/app/liff/calendar/page.tsx`
- เรียก endpoint เดิม: `GET /calendar/meetings?from=today&to=+7d`

---

## 7. Performance / Bundle size

### กฎ
- LIFF route bundle **≤ 300KB gzipped** — ตรวจด้วย `next build` + analyze
- First Contentful Paint **≤ 1.5 วิ** บน 4G

### เทคนิค
1. **Dynamic import LIFF SDK** — ทำแล้วใน `LiffBoot.tsx:45` (`await import("@line/liff")`)
2. **Route splitting** — Next.js app router แยก chunk ให้อัตโนมัติ
3. **Avoid heavy libs บน LIFF** — ไม่นำเข้า `react-toastify`, `recharts`, ฯลฯ ถ้าไม่จำเป็น
4. **Skip framer-motion / lottie** บน LIFF — ใช้ CSS transition พอ
5. **Lazy-load `<SignaturePad />`** ใน `/liff/sign/[id]` เฉพาะเมื่อ user เลือกวิธี "เซ็นสด"

### ตัวอย่าง lazy-load
```ts
const SignaturePad = dynamic(() => import("@/components/SignaturePad"), {
  loading: () => <div className="h-40 bg-slate-100 rounded" />,
  ssr: false,
});
```

---

## 8. Security / Auth pattern

### JWT reuse
- LIFF ได้ JWT ผ่าน `/line-auth/verify` (อายุ 7 วัน)
- ใช้ `apiFetch()` เดียวกับ web — token attach อัตโนมัติ
- Token store ใน `localStorage` + cookie (เพื่อรองรับ server component)

### Auth flow edge cases ที่ต้องจัดการ
1. **Token หมดอายุ** → `apiFetch` ปัจจุบัน redirect `/login` — ต้อง **override** สำหรับ LIFF:
   ```ts
   // แทนที่จะไป /login → re-call liff.getAccessToken() + /line-auth/verify
   ```
2. **User un-link ใน web** → บัญชี LINE ไม่ผูกแล้ว → redirect ไป pairing instructions

### ข้อที่ยังไม่ได้ทำ (improvement)
- [ ] Auto-refresh JWT ผ่าน LIFF token (แทน force re-login)
- [ ] Rate-limit `/line-auth/verify` (1 call / user / 30 วิ)

---

## 9. Rollout strategy

### Phase A — ที่ทำแล้ว (ปัจจุบัน)
- ✅ Dashboard + my-tasks
- ✅ Case detail + register
- ✅ Director signing
- ✅ Search

### Phase B — High-ROI (2 สัปดาห์)
1. `/liff/outbound/[id]` — ผอ. อนุมัติหนังสือส่งด่วน
2. `/liff/checkin` — ลงเวลา + GPS
3. เพิ่ม rich menu ปุ่มที่ 4 "ลงเวลา" (ถ้าใส่ได้)

### Phase C — Quality-of-life (ภายหลัง)
1. `/liff/calendar` — ประชุม + RSVP
2. `/liff/attendance/history`
3. Notification history panel ใน LIFF (แทน scroll LINE chat)

### Phase D — Advanced (optional)
1. Offline mode (Service Worker, cache)
2. Push notification ผ่าน LINE Notify
3. LIFF share target (`liff.shareTargetPicker`) — ส่งสรุปงานให้เพื่อน

---

## 10. Anti-patterns ที่ห้ามทำ

- ❌ **iframe ฝัง web page เดิมใน LIFF** — ช้า, responsive พัง, auth พัง
- ❌ **Copy-paste component จาก web route ตรงๆ** — DOM ใหญ่เกิน, layout พัง
- ❌ **ใช้ `window.open()`** — LIFF in-app browser ไม่ได้ behavior เดียวกับ Safari/Chrome
- ❌ **สร้าง endpoint `/liff/*`** ใน backend — auth/authz ซ้ำซ้อน ไม่ต้อง ทำ
- ❌ **ใช้ `<form method="POST" action="...">`** — LIFF block การ navigate cross-origin
- ❌ **ฝัง Google Analytics / tracking pixel** ใน LIFF — LINE มี LIFF analytics ของตัวเอง

---

## 11. Metrics ที่ต้องดู

| Metric | Target | วิธีวัด |
|---|---|---|
| LIFF init time | < 2s (95p) | `liff.ready.then(t => ...)` |
| `/line-auth/verify` latency | < 800ms (95p) | API log |
| Case detail load (`/liff/cases/[id]`) | < 1.5s | Navigation Timing API |
| Signing completion rate | > 90% | เทียบ `start:/liff/sign/:id` vs `success:POST /director-sign` |
| Rich menu click-through | > 30% DAU | LINE Official Account analytics |

---

## สรุป (TL;DR)

1. **เลือก feature ที่ action สั้น** (≤ 60 วิ) — ลงนาม, อนุมัติ, check-in, ดู
2. **อย่าย้าย feature ที่เป็น form ยาว / bulk edit / admin** — ใช้ web ต่อไป
3. **Reuse API endpoint เดิมทั้งหมด** — frontend ปรับ display อย่างเดียว
4. **1 คอลัมน์, ปุ่มใหญ่, action ล่าง** — mobile-first เสมอ
5. **Bundle ≤ 300KB** — dynamic import ทุกอย่างที่เลือกได้
6. **Next focus**: `/liff/outbound/[id]` (ผอ. อนุมัติส่ง) + `/liff/checkin` (ลงเวลา)
