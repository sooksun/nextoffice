/**
 * TemplatesService — สร้างหนังสือราชการไทย 6 ประเภท เป็นไฟล์ Word (.docx)
 *
 * ใช้ไลบรารี docx (v9) สร้าง OpenXML โดยตรง
 * Word รองรับภาษาไทยได้สมบูรณ์ ไม่ต้องพึ่ง canvas/HarfBuzz
 *
 * มาตรฐาน: ระเบียบสำนักนายกรัฐมนตรีว่าด้วยงานสารบรรณ พ.ศ. 2526 และที่แก้ไขเพิ่มเติม
 *  - ฟอนต์: TH Sarabun New 16pt (เนื้อหา), 29pt Bold (หัวบันทึก)
 *  - กั้นหน้า 3 ซม., กั้นหลัง 2 ซม., บน 2.5 ซม., ล่าง 2 ซม.
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  AlignmentType,
  convertMillimetersToTwip,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  TabStopType,
  BorderStyle,
  VerticalAlign,
  ShadingType,
} from 'docx';
import * as fs from 'fs';
import * as path from 'path';

// ─── Constants ────────────────────────────────────────────────────────────────
const THAI_FONT = 'TH Sarabun New';

// Margins (mm → twip)
const ML_TW = convertMillimetersToTwip(30);  // กั้นหน้า 3 ซม.
const MR_TW = convertMillimetersToTwip(20);  // กั้นหลัง 2 ซม.
const MT_TW = convertMillimetersToTwip(25);  // บน 2.5 ซม.
const MB_TW = convertMillimetersToTwip(20);  // ล่าง 2 ซม.
const CONTENT_W_TW = convertMillimetersToTwip(160); // 210 - 30 - 20 = 160 ซม.

// Font sizes (half-points: pt × 2)
const FS_BODY   = 16 * 2;  // 32 hp = 16pt
const FS_LABEL  = 16 * 2;
const FS_TITLE  = 18 * 2;  // 36 hp = 18pt
const FS_HEADER = 29 * 2;  // 58 hp = 29pt
const FS_SMALL  = 12 * 2;  // 24 hp = 12pt

// Spacing (twip)
const SPC_LINE  = 276;  // single line spacing
const SPC_SM    = convertMillimetersToTwip(3);
const SPC_MD    = convertMillimetersToTwip(6);
const SPC_LG    = convertMillimetersToTwip(12);
const SPC_SIG   = convertMillimetersToTwip(25); // space before signature
const INDENT_TW = convertMillimetersToTwip(25); // ย่อหน้า 2.5 ซม.

// Garuda image (pixels at 96 dpi: 1 cm ≈ 37.8 px)
const GARUDA_PATH = path.resolve(__dirname, '../stamps/fonts/kruth02.png');
const GARUDA_LG = 113; // ≈ 3 cm
const GARUDA_SM = 57;  // ≈ 1.5 cm

// No borders (for cells without visible border)
const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

// ─── Service ──────────────────────────────────────────────────────────────────
@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  // ── helpers ──────────────────────────────────────────────────────────────

  /** TextRun ภาษาไทย */
  private t(text: string, size = FS_BODY, bold = false, color?: string): TextRun {
    return new TextRun({
      text,
      font: THAI_FONT,
      size,
      bold,
      ...(color ? { color: color.replace('#', '') } : {}),
    });
  }

  /** Paragraph ธรรมดา */
  private p(
    children: TextRun[],
    align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT,
    before = 0,
    after  = 0,
    firstLine?: number,
  ): Paragraph {
    return new Paragraph({
      alignment: align,
      spacing: { before, after, line: SPC_LINE },
      ...(firstLine !== undefined ? { indent: { firstLine } } : {}),
      children,
    });
  }

  /** Paragraph เปล่า (เว้นบรรทัด) */
  private blank(before = 0): Paragraph {
    return new Paragraph({ spacing: { before, after: 0, line: SPC_LINE }, children: [] });
  }

  /** บรรทัดเส้นคั่น (ใช้ paragraph border bottom) */
  private hRule(): Paragraph {
    return new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' } },
      spacing: { before: SPC_SM, after: SPC_SM, line: SPC_LINE },
      children: [],
    });
  }

  /** ครุฑ (centered, returns Paragraph) */
  private garudaPara(sizePx: number, align = AlignmentType.CENTER): Paragraph {
    const children: TextRun[] = [];
    if (fs.existsSync(GARUDA_PATH)) {
      try {
        const data = fs.readFileSync(GARUDA_PATH);
        return new Paragraph({
          alignment: align,
          spacing: { before: 0, after: SPC_SM, line: SPC_LINE },
          children: [
            new ImageRun({ data, transformation: { width: sizePx, height: sizePx }, type: 'png' }),
          ],
        });
      } catch { /* fallback */ }
    }
    return new Paragraph({ alignment: align, spacing: { after: SPC_SM }, children: [] });
  }

  /** บรรทัด ที่/ส่วนราชการ หรือ field ซ้าย/ขวา (tab-separated) */
  private metaRow(left: string, right: string, size = FS_LABEL): Paragraph {
    return new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W_TW }],
      spacing: { before: 0, after: 0, line: SPC_LINE },
      children: [
        this.t(left, size),
        new TextRun({ text: '\t', size }),
        this.t(right, size),
      ],
    });
  }

  /** Field: "เรื่อง  [value]" (label + value) */
  private field(label: string, value: string, size = FS_LABEL): Paragraph {
    return new Paragraph({
      spacing: { before: 0, after: 0, line: SPC_LINE },
      children: [
        this.t(`${label}  `, size, false),
        this.t(value, size),
      ],
    });
  }

  /** Body paragraphs — แยก \n เป็น paragraph, ย่อหน้าบรรทัดแรก */
  private bodyParas(text: string, size = FS_BODY): Paragraph[] {
    const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const out: Paragraph[] = [];
    for (const para of normalized.split('\n')) {
      if (!para.trim()) {
        out.push(this.blank(SPC_SM));
        continue;
      }
      out.push(
        new Paragraph({
          spacing: { before: 0, after: 0, line: SPC_LINE },
          indent: { firstLine: INDENT_TW },
          children: [this.t(para, size)],
        }),
      );
    }
    return out;
  }

  /** ลงชื่อ + ตำแหน่ง (กึ่งกลาง) */
  private signatureParas(name?: string, position?: string): Paragraph[] {
    const out: Paragraph[] = [];
    if (name) {
      out.push(this.p([this.t(`(${name})`, FS_BODY)], AlignmentType.CENTER));
    }
    if (position) {
      out.push(this.p([this.t(position, FS_BODY)], AlignmentType.CENTER));
    }
    return out;
  }

  /** ลงชื่อ + ตำแหน่ง (ชิดขวา) */
  private signatureRightParas(name?: string, position?: string): Paragraph[] {
    const out: Paragraph[] = [];
    if (name) {
      out.push(this.p([this.t(`(${name})`, FS_BODY)], AlignmentType.RIGHT));
    }
    if (position) {
      out.push(this.p([this.t(position, FS_BODY)], AlignmentType.RIGHT));
    }
    return out;
  }

  /** ข้อมูลติดต่อ (มุมล่างซ้าย — ใส่ไว้ท้าย section) */
  private contactParas(dept?: string, phone?: string, email?: string): Paragraph[] {
    const out: Paragraph[] = [this.hRule()];
    if (dept)  out.push(this.p([this.t(dept,  FS_SMALL, false, '#555555')]));
    if (phone) out.push(this.p([this.t(`โทร. ${phone}`, FS_SMALL, false, '#555555')]));
    if (email) out.push(this.p([this.t(`Email: ${email}`, FS_SMALL, false, '#555555')]));
    return out;
  }

  /** แปลง children[] → Buffer .docx */
  private async toDocx(children: Array<Paragraph | Table>, title = 'document'): Promise<Buffer> {
    const doc = new Document({
      title,
      styles: {
        default: {
          document: {
            run: { font: THAI_FONT, size: FS_BODY },
            paragraph: { spacing: { line: SPC_LINE } },
          },
        },
      },
      sections: [{
        properties: {
          page: {
            margin: { top: MT_TW, bottom: MB_TW, left: ML_TW, right: MR_TW },
          },
        },
        children,
      }],
    });
    return Buffer.from(await Packer.toBuffer(doc));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // แบบที่ 1 — หนังสือภายนอก (External Letter)
  // ═══════════════════════════════════════════════════════════════════════════
  async generateKrut(data: {
    documentNo?: string;
    orgName?: string;
    orgAddress?: string;
    date?: string;
    recipient?: string;
    subject?: string;
    reference?: string;
    enclosure?: string;
    body?: string;
    closing?: string;
    signerName?: string;
    signerPosition?: string;
    department?: string;
    phone?: string;
    email?: string;
  }): Promise<Buffer> {
    const children: Paragraph[] = [];

    // ── ครุฑ 3 ซม. กึ่งกลาง ─────────────────────────────────────────────────
    children.push(this.garudaPara(GARUDA_LG));

    // ── ที่ (ซ้าย) / ส่วนราชการ (ขวา) ──────────────────────────────────────
    children.push(this.metaRow(
      data.documentNo ? `ที่  ${data.documentNo}` : '',
      data.orgName ?? '',
    ));

    if (data.orgAddress) {
      children.push(this.p([this.t(data.orgAddress, FS_SMALL, false, '#444444')]));
    }

    // ── วันที่ (ขวา) ──────────────────────────────────────────────────────
    if (data.date) {
      children.push(this.p([this.t(data.date)], AlignmentType.RIGHT, SPC_SM));
    }

    children.push(this.blank(SPC_MD));

    // ── เรื่อง / เรียน / อ้างถึง / สิ่งที่ส่งมาด้วย ─────────────────────────
    if (data.subject)   children.push(this.field('เรื่อง', data.subject));
    if (data.recipient) children.push(this.field('เรียน', data.recipient));
    if (data.reference) children.push(this.field('อ้างถึง', data.reference));
    if (data.enclosure) children.push(this.field('สิ่งที่ส่งมาด้วย', data.enclosure));

    children.push(this.blank(SPC_SM));

    // ── เนื้อหา ──────────────────────────────────────────────────────────────
    if (data.body) children.push(...this.bodyParas(data.body));

    children.push(this.blank(SPC_MD));

    // ── คำลงท้าย ──────────────────────────────────────────────────────────
    if (data.closing) {
      children.push(this.p([this.t(data.closing)], AlignmentType.CENTER, SPC_SM));
    }

    children.push(this.blank(SPC_SIG));

    // ── ลงชื่อ / ตำแหน่ง ────────────────────────────────────────────────────
    children.push(...this.signatureParas(data.signerName, data.signerPosition));

    // ── ข้อมูลติดต่อ ──────────────────────────────────────────────────────
    children.push(this.blank(SPC_LG));
    children.push(...this.contactParas(data.department, data.phone, data.email));

    return this.toDocx(children, 'หนังสือภายนอก');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // แบบที่ 2 — หนังสือภายใน / บันทึกข้อความ (Internal Memo)
  // ═══════════════════════════════════════════════════════════════════════════
  async generateMemo(data: {
    department?: string;
    documentNo?: string;
    date?: string;
    subject?: string;
    recipient?: string;
    body?: string;
    signerName?: string;
    signerPosition?: string;
  }): Promise<Buffer> {
    const children: Array<Paragraph | Table> = [];

    // ── ครุฑ 1.5 ซม. (ซ้าย) + "บันทึกข้อความ" (กึ่งกลาง) ──
    // ใช้ Table 2 คอลัมน์
    const garudaData = fs.existsSync(GARUDA_PATH) ? fs.readFileSync(GARUDA_PATH) : null;
    children.push(
      new Table({
        borders: { top: NO_BORDERS.top, bottom: NO_BORDERS.bottom, left: NO_BORDERS.left, right: NO_BORDERS.right },
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: NO_BORDERS,
                width: { size: 15, type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.CENTER,
                children: [
                  new Paragraph({
                    children: garudaData
                      ? [new ImageRun({ data: garudaData, transformation: { width: GARUDA_SM, height: GARUDA_SM }, type: 'png' })]
                      : [],
                  }),
                ],
              }),
              new TableCell({
                borders: NO_BORDERS,
                width: { size: 85, type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.CENTER,
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [this.t('บันทึกข้อความ', FS_HEADER, true)],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    );

    children.push(this.hRule());

    // ── เมตา ──────────────────────────────────────────────────────────────
    if (data.department) {
      children.push(this.field('ส่วนราชการ', data.department));
    }
    if (data.documentNo || data.date) {
      children.push(this.metaRow(
        data.documentNo ? `ที่  ${data.documentNo}` : '',
        data.date ? `วันที่  ${data.date}` : '',
      ));
    }
    if (data.subject)   children.push(this.field('เรื่อง', data.subject));
    if (data.recipient) children.push(this.field('เรียน', data.recipient));

    children.push(this.blank(SPC_SM));

    // ── เนื้อหา ──────────────────────────────────────────────────────────────
    if (data.body) children.push(...this.bodyParas(data.body));

    children.push(this.blank(SPC_SIG));

    // ── ลงชื่อ / ตำแหน่ง ────────────────────────────────────────────────────
    children.push(...this.signatureParas(data.signerName, data.signerPosition));

    return this.toDocx(children, 'บันทึกข้อความ');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // แบบที่ 3 — หนังสือประทับตรา (Stamped Letter)
  // ═══════════════════════════════════════════════════════════════════════════
  async generateStampLetter(data: {
    documentNo?: string;
    recipient?: string;
    body?: string;
    orgName: string;
    date?: string;
    department?: string;
    phone?: string;
  }): Promise<Buffer> {
    const children: Array<Paragraph | Table> = [];

    children.push(this.garudaPara(GARUDA_LG));

    if (data.documentNo) {
      children.push(this.p([this.t(`ที่  ${data.documentNo}`)]));
    }
    if (data.recipient) {
      children.push(this.field('ถึง', data.recipient));
    }
    children.push(this.blank(SPC_SM));

    if (data.body) children.push(...this.bodyParas(data.body));

    children.push(this.blank(SPC_LG));

    // ── กล่องตรายาง (bordered box กึ่งกลาง) ─────────────────────────────────
    children.push(
      new Table({
        alignment: AlignmentType.CENTER,
        width: { size: convertMillimetersToTwip(45), type: WidthType.DXA },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: {
                  top:    { style: BorderStyle.DOUBLE, size: 6, color: '000000' },
                  bottom: { style: BorderStyle.DOUBLE, size: 6, color: '000000' },
                  left:   { style: BorderStyle.DOUBLE, size: 6, color: '000000' },
                  right:  { style: BorderStyle.DOUBLE, size: 6, color: '000000' },
                },
                shading: { type: ShadingType.CLEAR, color: 'FFFFFF', fill: 'FFFFFF' },
                margins: { top: convertMillimetersToTwip(5), bottom: convertMillimetersToTwip(5), left: convertMillimetersToTwip(5), right: convertMillimetersToTwip(5) },
                children: [
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [this.t(data.orgName, FS_BODY, true)] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [this.t('(ตราชื่อส่วนราชการ)', FS_SMALL, false, '#888888')] }),
                ],
              }),
            ],
          }),
        ],
      }),
    );

    children.push(this.blank(SPC_SM));
    if (data.date) {
      children.push(this.p([this.t(data.date)], AlignmentType.CENTER));
    }
    children.push(this.blank(SPC_LG));
    children.push(...this.contactParas(data.department, data.phone));

    return this.toDocx(children, 'หนังสือประทับตรา');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // แบบที่ 4 — หนังสือสั่งการ: คำสั่ง / ระเบียบ / ข้อบังคับ
  // ═══════════════════════════════════════════════════════════════════════════
  async generateDirective(data: {
    orgName: string;
    subject?: string;
    body?: string;
    date?: string;
    signerName?: string;
    signerPosition?: string;
    directiveType?: 'คำสั่ง' | 'ระเบียบ' | 'ข้อบังคับ';
    orderNo?: string;
    preamble?: string;
  }): Promise<Buffer> {
    const children: Paragraph[] = [];
    const type = data.directiveType ?? 'คำสั่ง';

    children.push(this.garudaPara(GARUDA_LG));

    // ── หัวเรื่อง ──────────────────────────────────────────────────────────
    children.push(this.p([this.t(`${type}${data.orgName}`, FS_TITLE, true)], AlignmentType.CENTER));

    if (data.orderNo) {
      children.push(this.p([this.t(data.orderNo)], AlignmentType.CENTER));
    }
    if (data.subject) {
      children.push(this.p([this.t(`เรื่อง  ${data.subject}`)], AlignmentType.CENTER));
    }

    children.push(this.hRule());
    children.push(this.blank(SPC_SM));

    if (data.preamble) children.push(...this.bodyParas(data.preamble));

    if (data.body) children.push(...this.bodyParas(data.body));

    children.push(this.blank(SPC_MD));

    if (data.date) {
      const verb = type === 'คำสั่ง' ? 'สั่ง' : 'ประกาศ';
      children.push(this.p([this.t(`${verb} ณ วันที่  ${data.date}`)], AlignmentType.RIGHT));
    }

    children.push(this.blank(SPC_SIG));
    children.push(...this.signatureRightParas(data.signerName, data.signerPosition));

    return this.toDocx(children, type);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // แบบที่ 5 — หนังสือประชาสัมพันธ์: ประกาศ / แถลงการณ์ / ข่าว
  // ═══════════════════════════════════════════════════════════════════════════
  async generatePublicRelation(data: {
    orgName: string;
    prType?: 'ประกาศ' | 'แถลงการณ์' | 'ข่าว';
    subject?: string;
    body?: string;
    date?: string;
    signerName?: string;
    signerPosition?: string;
  }): Promise<Buffer> {
    const children: Paragraph[] = [];
    const type = data.prType ?? 'ประกาศ';

    if (type === 'ประกาศ') children.push(this.garudaPara(GARUDA_LG));

    // ── หัว "ประกาศ[ชื่อหน่วยงาน]" ─────────────────────────────────────────
    children.push(this.p([this.t(`${type}${data.orgName}`, FS_TITLE, true)], AlignmentType.CENTER));

    // ── เรื่อง (ตัด prefix ซ้ำ) ───────────────────────────────────────────────
    if (data.subject) {
      let subj = data.subject.trim();
      const prefix = `${type}${data.orgName}`;
      if (subj.startsWith(prefix)) subj = subj.slice(prefix.length).trim();
      subj = subj.replace(/^เรื่อง\s+/, '').trim();
      if (subj) {
        children.push(this.p([this.t(`เรื่อง  ${subj}`)], AlignmentType.CENTER, SPC_SM));
      }
    }

    children.push(this.hRule());
    children.push(this.blank(SPC_SM));

    if (data.body) children.push(...this.bodyParas(data.body));

    children.push(this.blank(SPC_MD));

    if (data.date) {
      const verb = type === 'ประกาศ' ? 'ประกาศ ณ วันที่' : 'วันที่';
      children.push(this.p([this.t(`${verb}  ${data.date}`)], AlignmentType.RIGHT));
    }

    children.push(this.blank(SPC_SIG));
    children.push(...this.signatureRightParas(data.signerName, data.signerPosition));

    return this.toDocx(children, type);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // แบบที่ 6 — หนังสือรับรอง (Certificate)
  // ═══════════════════════════════════════════════════════════════════════════
  async generateCertificate(data: {
    orgName: string;
    orgAddress?: string;
    documentNo?: string;
    date?: string;
    subject?: string;
    body?: string;
    signerName?: string;
    signerPosition?: string;
    phone?: string;
  }): Promise<Buffer> {
    const children: Paragraph[] = [];

    children.push(this.garudaPara(GARUDA_LG));

    children.push(this.metaRow(
      data.documentNo ? `ที่  ${data.documentNo}` : '',
      data.orgName,
    ));
    if (data.orgAddress) {
      children.push(this.p([this.t(data.orgAddress, FS_SMALL, false, '#444')], AlignmentType.CENTER));
    }
    if (data.date) {
      children.push(this.p([this.t(data.date)], AlignmentType.RIGHT, SPC_SM));
    }

    children.push(this.blank(SPC_MD));
    children.push(this.p([this.t('หนังสือรับรอง', FS_TITLE, true)], AlignmentType.CENTER));

    if (data.subject) {
      children.push(this.p([this.t(data.subject)], AlignmentType.CENTER, SPC_SM));
    }

    children.push(this.hRule());
    children.push(this.blank(SPC_SM));

    if (data.body) children.push(...this.bodyParas(data.body));

    children.push(this.blank(SPC_SIG));
    children.push(...this.signatureParas(data.signerName, data.signerPosition));

    children.push(this.blank(SPC_LG));
    children.push(...this.contactParas(undefined, data.phone));

    return this.toDocx(children, 'หนังสือรับรอง');
  }
}
