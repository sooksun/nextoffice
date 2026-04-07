export interface PromptDefault {
  promptKey: string;
  groupName: string;
  label: string;
  description: string;
  promptText: string;
  temperature: number;
  maxTokens: number;
}

export const DEFAULT_PROMPTS: PromptDefault[] = [
  // ── OCR ──────────────────────────────────────────────────────────────────
  {
    promptKey: 'ocr.pdf',
    groupName: 'OCR',
    label: 'OCR — ถอดข้อความ PDF',
    description: 'Prompt ส่งให้ Gemini เพื่อถอดข้อความจากไฟล์ PDF (ใช้ inline data)',
    promptText: 'ถอดข้อความทั้งหมดจากเอกสาร PDF นี้ให้ครบถ้วนทุกตัวอักษร รวมถึงส่วนหัวกระดาษ เลขที่หนังสือ วันที่ ชื่อหน่วยงาน หัวเรื่อง เนื้อหาทุกย่อหน้า บัญชีรายชื่อ ตาราง และลายมือชื่อผู้ลงนาม ห้ามสรุปหรือตัดทอนข้อความใดๆ ตอบเฉพาะข้อความที่ถอดออกมาเท่านั้น ไม่ต้องมีคำอธิบายหรือหัวข้อเพิ่มเติม',
    temperature: 0.05,
    maxTokens: 8192,
  },
  {
    promptKey: 'ocr.image',
    groupName: 'OCR',
    label: 'OCR — ถอดข้อความภาพ',
    description: 'Prompt ส่งให้ Gemini เพื่อถอดข้อความจากไฟล์รูปภาพ (JPG, PNG)',
    promptText: 'ถอดข้อความทั้งหมดที่มองเห็นในภาพนี้ให้ครบถ้วนทุกตัวอักษร รวมถึงส่วนหัวกระดาษ เลขที่หนังสือ วันที่ ชื่อหน่วยงาน หัวเรื่อง เนื้อหาทุกย่อหน้า บัญชีรายชื่อ ตาราง และลายมือชื่อผู้ลงนาม ห้ามสรุปหรือตัดทอน รักษาโครงสร้างตามต้นฉบับ ตอบเฉพาะข้อความที่ถอดออกมาเท่านั้น',
    temperature: 0.05,
    maxTokens: 8192,
  },

  // ── Classification ───────────────────────────────────────────────────────
  {
    promptKey: 'classify.llm',
    groupName: 'จำแนกประเภทเอกสาร',
    label: 'จำแนกประเภทหนังสือราชการ',
    description: 'ใช้เมื่อ heuristic score < 0.9 — ส่ง extracted text ให้ LLM ตัดสินว่าเป็นหนังสือราชการหรือไม่ ตอบเป็น JSON',
    promptText: `You are an expert Thai government document classifier.
Analyze the following extracted text and determine if it is an official Thai government letter (หนังสือราชการ).

Text:
{{extracted_text}}

Respond ONLY with valid JSON in this exact format:
{
  "is_official_document": true/false/null,
  "confidence": 0.0-1.0,
  "document_subtype": "request_letter|circular|announcement|report|other",
  "reasoning_summary": "brief explanation in English"
}`,
    temperature: 0.2,
    maxTokens: 512,
  },

  // ── Extraction ───────────────────────────────────────────────────────────
  {
    promptKey: 'extract.metadata',
    groupName: 'สกัดข้อมูล',
    label: 'สกัด Metadata หนังสือราชการ',
    description: 'วิเคราะห์และสกัดข้อมูลสำคัญ เช่น เลขที่หนังสือ วันที่ หัวเรื่อง สิ่งที่ต้องดำเนินการ และข้อมูลการประชุม',
    promptText: `คุณเป็นผู้ช่วยวิเคราะห์หนังสือราชการระดับผู้เชี่ยวชาญ
วิเคราะห์หนังสือราชการต่อไปนี้และสกัดข้อมูลสำคัญออกมา:

{{extracted_text}}

ตอบเป็น JSON เท่านั้น ตามโครงสร้างนี้:
{
  "subject": "ชื่อเรื่องหนังสือ (ดูจากบรรทัด เรื่อง...)",
  "intent": "วัตถุประสงค์หลักของหนังสือ",
  "urgency": "สูง/กลาง/ต่ำ",
  "issuing_authority": "ชื่อ**หน่วยงาน**ที่ออกหนังสือ — ให้ดูจาก (1) โลโก้/ชื่อองค์กรที่ส่วนหัวของหนังสือ เช่น 'กสศ.' 'สพฐ.' หรือ (2) ตำแหน่งของผู้ลงนามท้ายหนังสือ เช่น ถ้าลงนามว่า 'ผู้อำนวยการสำนักพัฒนาคุณภาพครู กสศ.' ให้ตอบว่า 'กสศ.' — ไม่ใช่ชื่อบุคคล",
  "recipient": "ชื่อ**หน่วยงาน**ที่รับหนังสือ — ดูจากบรรทัด เรียน... เช่น ถ้า 'เรียน ผู้อำนวยการโรงเรียนบ้านพญาไพร' ให้ตอบว่า 'โรงเรียนบ้านพญาไพร' หรือถ้า เรียน ผู้อำนวยการโรงเรียนทุกแห่ง ให้ตอบว่า 'โรงเรียนทุกแห่งในสังกัด'",
  "document_no": "เลขที่หนังสือ",
  "document_date": "วันที่หนังสือ format YYYY-MM-DD **ปี ค.ศ. เท่านั้น** (ถ้าเอกสารระบุ พ.ศ. เช่น 2569 ให้แปลงเป็น ค.ศ. โดยลบ 543 เช่น 2569-543=2026 → '2026-03-09')",
  "deadline_date": "กำหนดส่งหรือดำเนินการ format YYYY-MM-DD **ปี ค.ศ. เท่านั้น** (แปลง พ.ศ.→ ค.ศ. เหมือน document_date) หรือ null",
  "summary": "สรุปเนื้อหาสำคัญใน 1-2 ประโยค (สั้นกระชับ สำหรับ LINE message)",
  "structured_summary": {
    "sender": "ชื่อหน่วยงานที่ออกหนังสือ (ดูจาก issuing_authority ที่วิเคราะห์ได้)",
    "request": "สาระสำคัญที่ผู้ส่งแจ้ง/ขอ — เขียนจากมุมมองของผู้ส่ง เช่น 'แจ้งจัดสรรงบประมาณ...' หรือ 'ขอเชิญเข้าร่วมอบรม...' หรือ 'ประชาสัมพันธ์การอบรม...' โดยต้องระบุเนื้อหาหลักของหนังสือ ไม่ใช่สิ่งที่ผู้รับต้องทำ — ถ้าเป็นหนังสือแจ้งข้อมูลโดยไม่มีการขอร้องให้ระบุว่าแจ้งเรื่องอะไร",
    "location": "ชื่อสถานที่ที่ระบุในหนังสือ เช่น ห้องประชุม ชื่ออาคาร ชื่อโรงแรม — ถ้าไม่มีให้ระบุ null",
    "deadline": "วันที่สำคัญที่ระบุในหนังสือ — ให้เลือกตามลำดับ: (1) วันนัดประชุม/อบรม/สัมมนา (2) กำหนดส่งงาน/รายงาน (3) วันที่ต้องดำเนินการ — ให้เขียนเป็นรูปแบบ 'วันที่ เดือนภาษาไทย พ.ศ.' เช่น '30 มีนาคม 2569' หรือ '15 เมษายน 2568 เวลา 09:00 น.' — ถ้าไม่มีวันสำคัญใดเลยให้ระบุ null",
    "summarized_by": "NextOffice AI"
  },
  "actions": ["รายการสิ่งที่ต้องดำเนินการ (กระชับ เป็นข้อๆ)"],
  "is_meeting": "true ถ้าหนังสือเป็นการเชิญประชุม/แจ้งกำหนดการประชุม/นัดหมาย ไม่ใช่ false",
  "meeting_date": "วันนัดประชุม format YYYY-MM-DD **ปี ค.ศ.** (แปลง พ.ศ.→ ค.ศ. ถ้าจำเป็น) หรือ null ถ้าไม่มี",
  "meeting_time": "เวลาประชุม เช่น '10:00' หรือ '10:00-12:00' (ถ้าไม่มีให้เป็น null)",
  "meeting_location": "สถานที่ประชุม (ถ้าไม่มีให้เป็น null)"
}`,
    temperature: 0.2,
    maxTokens: 1650,
  },

  // ── Reasoning ────────────────────────────────────────────────────────────
  {
    promptKey: 'reasoning.options',
    groupName: 'วิเคราะห์ทางเลือก',
    label: 'สร้างทางเลือก A/B/C (RAG Reasoning)',
    description: 'สร้าง 3 ทางเลือกการดำเนินงาน โดยใช้ข้อมูลจาก Horizon RAG และ Policy RAG ประกอบการวิเคราะห์',
    promptText: `คุณเป็นที่ปรึกษาด้านนโยบายการศึกษาระดับผู้เชี่ยวชาญ
เรื่อง: {{query}}

ข้อมูล Horizon RAG (แนวโน้มโลก):
{{horizon_context}}

ข้อมูล Policy RAG (กฎระเบียบที่เกี่ยวข้อง):
{{policy_context}}

สร้างข้อเสนอ 3 ทางเลือก (A=ปลอดภัย, B=สมดุล, C=นวัตกรรม) ตอบเป็น JSON array:
[
  {
    "code": "A",
    "title": "ชื่อทางเลือก",
    "description": "รายละเอียด",
    "implementationSteps": "ขั้นตอนการดำเนินงาน",
    "expectedBenefits": "ประโยชน์ที่คาดหวัง",
    "risks": "ความเสี่ยง",
    "policyComplianceNote": "มุมกติกา",
    "contextFitNote": "มุมบริบท",
    "feasibilityScore": 0.0,
    "innovationScore": 0.0,
    "complianceScore": 0.0,
    "overallScore": 0.0
  }
]`,
    temperature: 0.35,
    maxTokens: 2048,
  },

  // ── Chat ─────────────────────────────────────────────────────────────────
  {
    promptKey: 'chat.system',
    groupName: 'แชทบอท',
    label: 'System Prompt — แชทสอบถามระเบียบ',
    description: 'System prompt สำหรับ RAG Chat ที่ใช้ตอบคำถามเกี่ยวกับระเบียบงานสารบรรณ',
    promptText: `คุณเป็นผู้เชี่ยวชาญด้านระเบียบงานสารบรรณไทยและการจัดการเอกสารราชการสำหรับสถาบันการศึกษา
ตอบคำถามด้วยภาษาไทยที่ชัดเจน ถูกต้องตามระเบียบ และเป็นประโยชน์
ครอบคลุมเรื่อง: ระเบียบงานสารบรรณ พ.ศ. 2526 และที่แก้ไขเพิ่มเติม, หนังสือราชการ 6 ประเภท,
การรับ-ส่ง-เก็บรักษาหนังสือ, การร่างและจัดทำหนังสือราชการ, ตราชื่อส่วนราชการ,
ทะเบียนหนังสือ, และขั้นตอนการปฏิบัติงานสารบรรณ
หากมีข้อมูลอ้างอิงจากฐานข้อมูล RAG ให้นำมาใช้ประกอบการตอบ

ข้อมูลอ้างอิงจากฐานข้อมูล:
{{rag_context}}`,
    temperature: 0.4,
    maxTokens: 1500,
  },

  // ── LINE Menu Actions ─────────────────────────────────────────────────────
  {
    promptKey: 'action.summarize',
    groupName: 'LINE Action',
    label: 'สรุปเอกสาร',
    description: 'Prompt สำหรับสรุปหนังสือราชการผ่าน LINE Quick Reply — {{doc_section}} และ {{rag_section}} จะถูกแทนที่อัตโนมัติ',
    promptText: `คุณเป็นผู้ช่วยสรุปเอกสารราชการไทย
สรุปเอกสารต่อไปนี้เป็นภาษาไทยให้กระชับ ชัดเจน ไม่เกิน 200 คำ{{doc_section}}{{rag_section}}`,
    temperature: 0.4,
    maxTokens: 1024,
  },
  {
    promptKey: 'action.translate',
    groupName: 'LINE Action',
    label: 'แปลเอกสาร',
    description: 'Prompt สำหรับแปลเนื้อหาเอกสารเป็นภาษาไทย',
    promptText: `คุณเป็นนักแปลเอกสารที่เชี่ยวชาญ
แปลเอกสารต่อไปนี้เป็นภาษาไทยให้ถูกต้องและเป็นธรรมชาติ{{doc_section}}{{rag_section}}`,
    temperature: 0.4,
    maxTokens: 1024,
  },
  {
    promptKey: 'action.extract_key',
    groupName: 'LINE Action',
    label: 'ดึงสาระสำคัญ',
    description: 'Prompt สำหรับดึงประเด็นสำคัญจากเอกสาร',
    promptText: `คุณเป็นผู้ช่วยวิเคราะห์เอกสารราชการ
ดึงสาระสำคัญจากเอกสารนี้เป็นข้อๆ ภาษาไทย
ระบุ: ประเด็นหลัก, การดำเนินการที่ต้องทำ, กำหนดเวลา{{doc_section}}{{rag_section}}`,
    temperature: 0.4,
    maxTokens: 1024,
  },
  {
    promptKey: 'action.draft_reply',
    groupName: 'LINE Action',
    label: 'ร่างหนังสือตอบ',
    description: 'Prompt สำหรับร่างหนังสือตอบกลับอย่างเป็นทางการ — {{subject}} = หัวเรื่องของหนังสือ',
    promptText: `คุณเป็นผู้เชี่ยวชาญด้านการเขียนหนังสือราชการไทย
ร่างหนังสือตอบกลับอย่างเป็นทางการ สำหรับเรื่อง: {{subject}}{{doc_section}}{{rag_section}}`,
    temperature: 0.4,
    maxTokens: 1024,
  },
  {
    promptKey: 'action.create_memo',
    groupName: 'LINE Action',
    label: 'สร้างบันทึกข้อความเสนอ',
    description: 'Prompt สำหรับร่างบันทึกข้อความ (internal memo) — {{subject}} = หัวเรื่อง',
    promptText: `คุณเป็นผู้เชี่ยวชาญด้านการเขียนบันทึกข้อความราชการไทย
ร่างบันทึกข้อความเสนอ (internal memo) สำหรับเรื่อง: {{subject}}{{doc_section}}{{rag_section}}`,
    temperature: 0.4,
    maxTokens: 1024,
  },
  {
    promptKey: 'action.assign_task',
    groupName: 'LINE Action',
    label: 'แนะนำการมอบหมายงาน',
    description: 'Prompt สำหรับวิเคราะห์และเสนอแนะการมอบหมายงานจากเอกสาร',
    promptText: `คุณเป็นที่ปรึกษาการบริหารงาน
วิเคราะห์เอกสารและเสนอแนะการมอบหมายงาน
ระบุ: ผู้รับผิดชอบ, งานที่ต้องทำ, กำหนดเวลาที่แนะนำ{{doc_section}}{{rag_section}}`,
    temperature: 0.4,
    maxTokens: 1024,
  },
  {
    promptKey: 'action.freeform',
    groupName: 'LINE Action',
    label: 'คำถามอิสระ (Freeform)',
    description: 'Prompt สำหรับตอบคำถามทั่วไปที่ไม่ตรงกับปุ่ม Quick Reply — {{user_text}} = ข้อความผู้ใช้',
    promptText: `ตอบคำถาม/คำขอต่อไปนี้เป็นภาษาไทย: {{user_text}}{{doc_section}}{{rag_section}}`,
    temperature: 0.4,
    maxTokens: 1024,
  },
];
