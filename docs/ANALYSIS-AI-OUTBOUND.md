# System Analysis: หนังสือส่งอัตโนมัติโดย AI

## 1. Business Goal

พัฒนาระบบให้โรงเรียนสามารถสร้าง "หนังสือส่ง" (หนังสือราชการขาออก) อัตโนมัติโดย AI จาก 2 แหล่ง:
1. **Prompt ตรง** — ผู้ใช้พิมพ์คำสั่ง AI สร้าง draft ให้ตามรูปแบบราชการ
2. **จากหนังสือรับในระบบ** — AI อ่านหนังสือรับ (InboundCase) → extract metadata → สร้าง draft ตอบกลับ/ดำเนินการ

ต้องเป็นไปตามระเบียบสำนักนายกรัฐมนตรี ว่าด้วยงานสารบรรณ พ.ศ. 2526 (ฉบับที่ 1-4)

---

## 2. สิ่งที่มีอยู่แล้ว (Existing Infrastructure)

| Component | Status | Location |
|-----------|--------|----------|
| OutboundDocument model | มี 18 fields + relations | `prisma/schema.prisma:926` |
| OutboundService.create() | มี — สร้าง draft ได้ | `outbound.service.ts` |
| OutboundService.approve() | มี — ออกเลข/อนุมัติ | `outbound.service.ts` |
| OutboundService.send() | มี — ส่ง/ลงทะเบียน | `outbound.service.ts` |
| **generateAiDraft()** | **มี V1 แล้ว** — ใช้ Claude API, 4 draft types | `outbound.service.ts` |
| TemplatesService | มี — generateKrut, generateMemo, generateStampLetter | `templates.service.ts` |
| GeminiApiService | มี — generateText, generateFromParts | `gemini-api.service.ts` |
| RAG Pipeline | มี — RetrievalService + ReasoningService | `rag/services/` |
| PDF Stamps | มี — apply stamps, digital signature | `stamps/` |
| Frontend /outbound/new | มี — form สร้างหนังสือส่ง | `apps/web/src/app/outbound/new/` |
| Frontend /saraban/outbound | มี — รายการหนังสือส่ง | `apps/web/src/app/saraban/outbound/` |

**สรุป: โครงสร้างหลักมีครบแล้ว!** ต้องเพิ่มแค่:
- ปรับ AI prompt ให้สร้างถูกรูปแบบราชการ 4 ประเภท
- เพิ่ม "สร้างจาก prompt ตรง" (ปัจจุบันรองรับแค่จากหนังสือรับ)
- ปรับ frontend ให้เลือกวิธีสร้าง + เลือกประเภทหนังสือ
- เพิ่ม PDF generation จาก template

---

## 3. Users, Roles & Permissions

| Role | ความสามารถ | roleCode ในระบบ |
|------|-----------|----------------|
| เจ้าหน้าที่สารบรรณ | สร้าง/แก้ draft, ลงทะเบียน, ส่งหนังสือ | CLERK |
| ครู/หัวหน้างาน | ส่งคำขอสร้างหนังสือ, ตรวจ draft | TEACHER, HEAD_TEACHER |
| ผอ./รอง ผอ. | อนุมัติ, ลงนาม | DIRECTOR, VICE_DIRECTOR |
| Admin | จัดการ template, ตั้งค่า AI | ADMIN |

---

## 4. 4 ประเภทหนังสือ (MVP Scope)

### 4.1 หนังสือภายนอก (external_letter)
**โครงสร้าง:** ที่ / วันที่ / เรื่อง / เรียน / อ้างถึง / สิ่งที่ส่งมาด้วย / เนื้อหา / ขอแสดงความนับถือ / ลงนาม
**Template:** ใช้ `TemplatesService.generateKrut()` ที่มีอยู่แล้ว

### 4.2 หนังสือภายใน / บันทึกข้อความ (internal_memo)
**โครงสร้าง:** ส่วนราชการ / ที่ / วันที่ / เรื่อง / เนื้อหา / ลงนาม
**Template:** ใช้ `TemplatesService.generateMemo()` ที่มีอยู่แล้ว

### 4.3 หนังสือประทับตรา (stamp_letter)
**โครงสร้าง:** ที่ / ถึง / เนื้อหา / ประทับตรา
**Template:** ใช้ `TemplatesService.generateStampLetter()` ที่มีอยู่แล้ว

### 4.4 ประกาศ/คำสั่ง (directive)
**โครงสร้าง:** ชื่อส่วนราชการ / เรื่อง / เนื้อหา / วันที่ / ลงนาม
**Template:** ต้องสร้างใหม่ `TemplatesService.generateDirective()`

---

## 5. Workflows

### Flow A: สร้างจาก Prompt ตรง (ใหม่)

```
ผู้ใช้เปิดหน้า /outbound/new
  → เลือกประเภทหนังสือ (4 ประเภท)
  → พิมพ์ prompt อธิบายเรื่อง เช่น "สร้างหนังสือถึง สพป. เรื่องรายงานผลนักเรียน"
  → กด "AI สร้าง"
  → Backend: buildPromptForType(letterType, userPrompt)
     → ดึง org metadata (ชื่อโรงเรียน, ที่อยู่, เลขที่)
     → ส่ง Gemini/Claude API พร้อม template structure
     → Return structured JSON: { subject, recipientOrg, recipientName, bodyText, reference, attachments }
  → Frontend แสดง draft ให้แก้ไข
  → กด "บันทึก" → สร้าง OutboundDocument (status=draft)
  → Workflow ปกติ: ตรวจ → อนุมัติ → ออกเลข → ส่ง
```

### Flow B: สร้างจากหนังสือรับ (ปรับปรุง V1 ที่มีอยู่)

```
ผู้ใช้อยู่หน้า /cases/[id] (หนังสือรับ)
  → กด "สร้างหนังสือตอบ" / "สร้างบันทึก"
  → เลือก draft type: reply | memo | report | order
  → ป้อน context เพิ่มเติม (optional)
  → Backend: generateAiDraft(caseId, draftType, context)
     → อ่าน InboundCase metadata + extractedText
     → สร้าง prompt ตามรูปแบบราชการของ letterType ที่เลือก
     → Return OutboundDocument (draft) พร้อม relatedInboundCaseId
  → Frontend redirect ไป /outbound/[id] ให้แก้ไข
  → Workflow ปกติ: ตรวจ → อนุมัติ → ออกเลข → ส่ง
```

### Flow C: Generate PDF (ทั้ง 2 flow)

```
หลังอนุมัติ
  → Backend: TemplatesService.generate{Type}(data)
  → Return PDF buffer
  → Upload to MinIO (storagePath)
  → Optional: DigitalSignatureService.sign(pdf)
  → Optional: StampsModule.applyStamp(pdf)
```

---

## 6. สิ่งที่ต้องทำ (Implementation Tasks)

### Phase 1: ปรับปรุง AI Draft Generation (Backend)

**แก้ไข: `outbound.service.ts`**
- [ ] เพิ่ม method `generateFromPrompt(letterType, prompt, orgId)` — สร้างจาก prompt ตรง
- [ ] ปรับ `generateAiDraft()` — เพิ่ม letterType-aware prompt templates
- [ ] สร้าง prompt templates สำหรับ 4 ประเภทหนังสือตามรูปแบบราชการ
- [ ] Return structured JSON แทน plain text เพื่อ pre-fill form fields

**แก้ไข: `outbound.controller.ts`**
- [ ] เพิ่ม `POST /outbound/ai-generate` — endpoint ใหม่สำหรับ prompt-based generation

### Phase 2: PDF Generation (Backend)

**แก้ไข: `templates.service.ts`**
- [ ] เพิ่ม `generateDirective()` — template สำหรับประกาศ/คำสั่ง
- [ ] ปรับ `generateKrut()` — เพิ่ม fields: อ้างถึง, สิ่งที่ส่งมาด้วย

**แก้ไข: `outbound.service.ts`**
- [ ] เพิ่ม `generatePdf(id)` — auto-select template ตาม letterType → generate → upload to MinIO

### Phase 3: Frontend (Web)

**แก้ไข: `/outbound/new/page.tsx`**
- [ ] เพิ่ม toggle: "สร้างด้วย AI" / "สร้างเอง"
- [ ] เพิ่ม AI prompt input
- [ ] เพิ่ม "สร้างจากหนังสือรับ" button (เลือก InboundCase)
- [ ] Preview generated draft ก่อนบันทึก

**แก้ไข: `/cases/[id]/page.tsx`**
- [ ] เพิ่มปุ่ม "สร้างหนังสือตอบด้วย AI"

---

## 7. AI Prompt Templates (ตัวอย่าง)

### หนังสือภายนอก

```
คุณเป็นผู้เชี่ยวชาญด้านงานสารบรรณราชการไทย
สร้างหนังสือภายนอกตามระเบียบสำนักนายกรัฐมนตรี ว่าด้วยงานสารบรรณ พ.ศ. 2526

ข้อมูลโรงเรียน:
- ชื่อ: {orgName}
- ที่อยู่: {orgAddress}

คำสั่งจากผู้ใช้: {userPrompt}

ตอบเป็น JSON:
{
  "subject": "เรื่อง...",
  "recipientOrg": "หน่วยงานผู้รับ",
  "recipientName": "ตำแหน่งผู้รับ",
  "reference": "อ้างถึง (ถ้ามี)",
  "attachments": "สิ่งที่ส่งมาด้วย (ถ้ามี)",
  "bodyText": "เนื้อหาหนังสือ...",
  "closing": "จึงเรียนมาเพื่อโปรดทราบ / จึงเรียนมาเพื่อโปรดพิจารณา"
}
```

---

## 8. Assumptions & Risks

**Assumptions:**
- AI model (Claude/Gemini) เข้าใจรูปแบบหนังสือราชการไทยได้ดี
- ผู้ใช้จะตรวจสอบ draft ก่อนอนุมัติเสมอ (AI ไม่ส่งเองอัตโนมัติ)
- Template PDF ที่มีอยู่ใช้ได้กับ 3 ประเภท (Krut, Memo, Stamp) ต้องสร้างเพิ่ม 1 (Directive)

**Risks:**
- AI อาจสร้างเนื้อหาที่ไม่ถูกต้องตามระเบียบ → mitigation: ต้องมีคนตรวจเสมอ
- Thai font rendering ใน PDF → mitigation: ระบบ template ที่มีรองรับ Sarabun อยู่แล้ว
- Claude API quota/cost → mitigation: ใช้ Gemini เป็น fallback

---

## 9. Implementation Phases

| Phase | Scope | Effort |
|-------|-------|--------|
| **Phase 1** | ปรับ AI prompt templates ให้ถูกรูปแบบ 4 ประเภท + endpoint ใหม่ | 1-2 วัน |
| **Phase 2** | เพิ่ม generateDirective() template + auto-generate PDF on approve | 1 วัน |
| **Phase 3** | ปรับ frontend: AI toggle, prompt input, preview | 1-2 วัน |
| **Phase 4** | ทดสอบ + ปรับ prompt quality | 1 วัน |

**รวมประมาณ 4-6 วัน** สำหรับ MVP ที่ใช้งานได้จริง
