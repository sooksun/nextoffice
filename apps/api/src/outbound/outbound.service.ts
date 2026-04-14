import { Injectable, Logger, Optional, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_OUTBOUND } from '../queue/queue.constants';
import { PdfSigningService } from '../digital-signature/pdf-signing.service';
import { FileStorageService } from '../intake/services/file-storage.service';
import { TemplatesService } from '../templates/templates.service';
import { GeminiApiService } from '../gemini/gemini-api.service';

@Injectable()
export class OutboundService {
  private readonly logger = new Logger(OutboundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @InjectQueue(QUEUE_OUTBOUND) private readonly outboundQueue: Queue,
    @Optional() private readonly pdfSigning: PdfSigningService,
    @Optional() private readonly fileStorage: FileStorageService,
    private readonly templates: TemplatesService,
    private readonly gemini: GeminiApiService,
  ) {}

  private readonly CONFIDENTIAL_ROLES = ['ADMIN', 'DIRECTOR', 'VICE_DIRECTOR', 'CLERK'];
  private readonly RESTRICTED_LETTER_TYPES = ['secret_letter'];

  async findAll(organizationId: number, status?: string, letterType?: string, roleCode?: string) {
    const where: any = { organizationId: BigInt(organizationId) };
    if (status) where.status = status;
    if (letterType) where.letterType = letterType;

    // Restrict secret_letter and non-normal securityLevel to privileged roles
    if (roleCode && !this.CONFIDENTIAL_ROLES.includes(roleCode)) {
      where.letterType = { ...where.letterType, not: 'secret_letter' };
      where.securityLevel = 'normal';
    }

    const docs = await this.prisma.outboundDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        organization: { select: { id: true, name: true, shortName: true } },
        createdBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
        relatedInboundCase: { select: { id: true, title: true, registrationNo: true } },
      },
    });
    return docs.map((d) => this.serialize(d));
  }

  async findOne(id: number, roleCode?: string, userOrgId?: number) {
    const doc = await this.prisma.outboundDocument.findUnique({
      where: { id: BigInt(id) },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
        relatedInboundCase: { select: { id: true, title: true, registrationNo: true } },
        documentRegistries: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!doc) return null;

    // Enforce organization ownership (prevent cross-tenant access)
    if (userOrgId !== undefined && Number(doc.organizationId) !== Number(userOrgId)) {
      throw new ForbiddenException('ไม่สามารถเข้าถึงเอกสารขององค์กรอื่น');
    }

    // Block access to confidential docs for restricted roles
    if (roleCode && !this.CONFIDENTIAL_ROLES.includes(roleCode)) {
      if (doc.letterType === 'secret_letter' || doc.securityLevel !== 'normal') {
        return null;
      }
    }

    return this.serialize(doc);
  }

  private async assertDocBelongsToOrg(id: number, userOrgId: number) {
    const doc = await this.prisma.outboundDocument.findUnique({
      where: { id: BigInt(id) },
      select: { id: true, organizationId: true },
    });
    if (!doc) throw new NotFoundException(`Outbound document #${id} not found`);
    if (Number(doc.organizationId) !== Number(userOrgId)) {
      throw new ForbiddenException('ไม่สามารถเข้าถึงเอกสารขององค์กรอื่น');
    }
  }

  async create(dto: {
    organizationId: number;
    createdByUserId?: number;
    subject: string;
    bodyText?: string;
    recipientName?: string;
    recipientOrg?: string;
    recipientEmail?: string;
    urgencyLevel?: string;
    securityLevel?: string;
    letterType?: string;
    relatedInboundCaseId?: number;
    sentMethod?: string;
  }) {
    if (!dto.organizationId) {
      throw new ForbiddenException('ต้องระบุองค์กรของผู้ใช้');
    }

    // If creating from inbound case, verify it belongs to same org
    if (dto.relatedInboundCaseId) {
      const cas = await this.prisma.inboundCase.findUnique({
        where: { id: BigInt(dto.relatedInboundCaseId) },
        select: { organizationId: true },
      });
      if (cas && Number(cas.organizationId) !== Number(dto.organizationId)) {
        throw new ForbiddenException('ไม่สามารถอ้างอิงเคสขององค์กรอื่น');
      }
    }

    const doc = await this.prisma.outboundDocument.create({
      data: {
        organizationId: BigInt(dto.organizationId),
        createdByUserId: dto.createdByUserId ? BigInt(dto.createdByUserId) : undefined,
        subject: dto.subject,
        bodyText: dto.bodyText,
        recipientName: dto.recipientName,
        recipientOrg: dto.recipientOrg,
        recipientEmail: dto.recipientEmail,
        urgencyLevel: dto.urgencyLevel ?? 'normal',
        securityLevel: dto.securityLevel ?? 'normal',
        letterType: dto.letterType ?? 'external_letter',
        relatedInboundCaseId: dto.relatedInboundCaseId ? BigInt(dto.relatedInboundCaseId) : undefined,
        sentMethod: dto.sentMethod,
        status: 'draft',
      },
    });
    return { id: Number(doc.id) };
  }

  async approve(id: number, approvedByUserId: number, userOrgId?: number) {
    // Generate document number: <orgCode>/<sequence>/<buddhistYear>
    const doc = await this.prisma.outboundDocument.findUnique({
      where: { id: BigInt(id) },
      include: { organization: { select: { orgCode: true } } },
    });
    if (!doc) throw new NotFoundException(`Outbound document #${id} not found`);

    if (userOrgId !== undefined && Number(doc.organizationId) !== Number(userOrgId)) {
      throw new ForbiddenException('ไม่สามารถอนุมัติเอกสารขององค์กรอื่น');
    }

    const documentNo = await this.generateDocumentNo(doc.organizationId, doc.organization?.orgCode);
    const updated = await this.prisma.outboundDocument.update({
      where: { id: BigInt(id) },
      data: {
        status: 'approved',
        documentNo,
        approvedByUserId: BigInt(approvedByUserId),
        approvedAt: new Date(),
        documentDate: new Date(),
      },
    });
    // Apply digital signature to PDF if available
    if (doc.storagePath && this.pdfSigning && this.fileStorage) {
      try {
        const pdfBuf = await this.fileStorage.getBuffer(doc.storagePath);
        const signed = await this.pdfSigning.signPdf(pdfBuf, approvedByUserId, 'อนุมัติ (Approval)');
        await this.fileStorage.saveBuffer(doc.storagePath, signed, 'application/pdf');
        this.logger.log(`Digital signature applied to outbound doc #${id}`);
      } catch (e: any) {
        this.logger.warn(`Outbound PDF signing failed for doc #${id}: ${e.message}`);
      }
    }

    return { id: Number(updated.id), documentNo };
  }

  async send(id: number, sentMethod?: string, userOrgId?: number) {
    if (userOrgId !== undefined) {
      await this.assertDocBelongsToOrg(id, userOrgId);
    }

    const updateData: any = { status: 'sent', sentAt: new Date() };
    if (sentMethod) updateData.sentMethod = sentMethod;

    const updated = await this.prisma.outboundDocument.update({
      where: { id: BigInt(id) },
      data: updateData,
    });

    // Auto-create a DocumentRegistry entry
    const doc = await this.prisma.outboundDocument.findUnique({
      where: { id: BigInt(id) },
      include: { organization: { select: { orgCode: true, name: true } } },
    });
    if (doc) {
      const currentYear = await this.prisma.academicYear.findFirst({
        where: { isCurrent: true },
      });
      const regCount = await this.prisma.documentRegistry.count({
        where: { organizationId: doc.organizationId, registryType: 'outbound' },
      });
      await this.prisma.documentRegistry.create({
        data: {
          organizationId: doc.organizationId,
          registryType: 'outbound',
          registryNo: String(regCount + 1).padStart(4, '0'),
          documentNo: doc.documentNo,
          documentDate: doc.documentDate,
          fromOrg: doc.organization?.name,
          toOrg: doc.recipientOrg,
          subject: doc.subject,
          urgencyLevel: doc.urgencyLevel,
          outboundDocId: doc.id,
          academicYearId: currentYear?.id ?? undefined,
        },
      });
    }

    // Dispatch email job if sentMethod is email
    if (sentMethod === 'email' && doc?.recipientEmail) {
      await this.outboundQueue.add('send-email', { outboundDocId: id });
      this.logger.log(`Queued email send for outbound doc #${id}`);
    }

    return { id: Number(updated.id), status: 'sent' };
  }

  async getRegistry(organizationId: number, registryType?: string, academicYearId?: number) {
    const where: any = { organizationId: BigInt(organizationId) };
    if (registryType) where.registryType = registryType;
    if (academicYearId) where.academicYearId = BigInt(academicYearId);

    const entries = await this.prisma.documentRegistry.findMany({
      where,
      orderBy: [{ registryType: 'asc' }, { createdAt: 'desc' }],
      include: {
        inboundCase: { select: { id: true, title: true } },
        outboundDoc: { select: { id: true, subject: true } },
        academicYear: { select: { year: true, name: true } },
      },
    });
    return entries.map((e) => ({
      ...e,
      id: Number(e.id),
      organizationId: Number(e.organizationId),
      inboundCaseId: e.inboundCaseId ? Number(e.inboundCaseId) : null,
      outboundDocId: e.outboundDocId ? Number(e.outboundDocId) : null,
      academicYearId: e.academicYearId ? Number(e.academicYearId) : null,
      inboundCase: e.inboundCase ? { ...e.inboundCase, id: Number(e.inboundCase.id) } : null,
      outboundDoc: e.outboundDoc ? { ...e.outboundDoc, id: Number(e.outboundDoc.id) } : null,
    }));
  }

  /** Register an inbound case into the document registry */
  async registerInbound(inboundCaseId: number, userOrgId?: number) {
    const cas = await this.prisma.inboundCase.findUnique({
      where: { id: BigInt(inboundCaseId) },
      include: { academicYear: true },
    });
    if (!cas) throw new NotFoundException(`Inbound case #${inboundCaseId} not found`);

    if (userOrgId !== undefined && Number(cas.organizationId) !== Number(userOrgId)) {
      throw new ForbiddenException('ไม่สามารถลงทะเบียนเคสขององค์กรอื่น');
    }

    const regCount = await this.prisma.documentRegistry.count({
      where: { organizationId: cas.organizationId, registryType: 'inbound' },
    });
    const entry = await this.prisma.documentRegistry.create({
      data: {
        organizationId: cas.organizationId,
        registryType: 'inbound',
        registryNo: cas.registrationNo ?? String(regCount + 1).padStart(4, '0'),
        subject: cas.title,
        urgencyLevel: (cas as any).urgencyLevel ?? 'normal',
        inboundCaseId: cas.id,
        academicYearId: cas.academicYearId ?? undefined,
      },
    });
    return { id: Number(entry.id) };
  }

  // ─── V3: AI Document Generation ─────────────────

  private readonly LETTER_TYPE_PROMPTS: Record<string, string> = {
    external_letter: `สร้างหนังสือภายนอก (หนังสือราชการ) ตามระเบียบสารบรรณ
ตอบเป็น JSON เท่านั้น:
{
  "subject": "เรื่อง...",
  "recipientOrg": "หน่วยงานผู้รับ",
  "recipientName": "เรียน ตำแหน่งผู้รับ",
  "reference": "อ้างถึง (ถ้ามี ไม่มีให้เป็น null)",
  "attachments": "สิ่งที่ส่งมาด้วย (ถ้ามี ไม่มีให้เป็น null)",
  "bodyText": "เนื้อหาหนังสือ เริ่มจากย่อหน้าแรก ใช้ภาษาราชการ",
  "closing": "จึงเรียนมาเพื่อโปรดทราบ / จึงเรียนมาเพื่อโปรดพิจารณา"
}`,

    internal_memo: `สร้างบันทึกข้อความ (หนังสือภายใน) ตามระเบียบสารบรรณ
ตอบเป็น JSON เท่านั้น:
{
  "subject": "เรื่อง...",
  "recipientName": "ถึง ตำแหน่งผู้รับ (เช่น ผู้อำนวยการโรงเรียน...)",
  "bodyText": "เนื้อหาบันทึก เริ่มจากย่อหน้าแรก ใช้ภาษาราชการ",
  "closing": "จึงเรียนมาเพื่อโปรดทราบ / จึงเรียนมาเพื่อโปรดพิจารณา"
}`,

    stamp_letter: `สร้างหนังสือประทับตรา ตามระเบียบสารบรรณ (ใช้ประทับตราแทนลงนาม)
ตอบเป็น JSON เท่านั้น:
{
  "subject": "เรื่อง...",
  "recipientOrg": "ถึง หน่วยงานผู้รับ",
  "bodyText": "เนื้อหาหนังสือ สั้นกระชับ ใช้ภาษาราชการ"
}`,

    order: `สร้าง "คำสั่ง" ของส่วนราชการ ตามระเบียบสารบรรณ
คำสั่งใช้สำหรับสั่งการให้บุคคลหรือหน่วยงานดำเนินการตามที่ระบุ
ตอบเป็น JSON เท่านั้น:
{
  "subject": "เรื่อง... (เช่น แต่งตั้งคณะกรรมการ..., มอบหมายหน้าที่...)",
  "bodyText": "เนื้อหาคำสั่ง โดยเริ่มจากการอ้างเหตุผล/อำนาจหน้าที่ แล้วระบุข้อสั่งการเป็นข้อ ๆ (ข้อ ๑. ... ข้อ ๒. ...) พร้อมวันที่เริ่มใช้บังคับ ใช้ภาษาราชการ"
}`,

    announcement: `สร้าง "ประกาศ" ของส่วนราชการ ตามระเบียบสารบรรณ
ประกาศใช้สำหรับแจ้งให้ทราบโดยทั่วไป ไม่ใช่การสั่งการ
ตอบเป็น JSON เท่านั้น:
{
  "subject": "เรื่อง... (เช่น รับสมัคร..., ผลการคัดเลือก..., กำหนดการ...)",
  "bodyText": "เนื้อหาประกาศ อธิบายเรื่องที่ต้องการแจ้งให้ทราบทั่วไป ระบุรายละเอียด ข้อกำหนด เงื่อนไข กำหนดการ ใช้ภาษาราชการ"
}`,

    // Backward compat alias
    directive: `สร้างคำสั่ง/ประกาศ ของส่วนราชการ ตามระเบียบสารบรรณ
ตอบเป็น JSON เท่านั้น:
{
  "subject": "เรื่อง...",
  "bodyText": "เนื้อหาคำสั่ง/ประกาศ ระบุเหตุผล ข้อกำหนด ให้ครบถ้วน ใช้ภาษาราชการ"
}`,
  };

  /**
   * V3: Generate outbound document from user prompt (no inbound case required)
   */
  async generateFromPrompt(dto: {
    organizationId: number;
    userId: number;
    letterType: string;
    prompt: string;
  }) {
    const org = await this.prisma.organization.findUnique({
      where: { id: BigInt(dto.organizationId) },
      select: { id: true, name: true, orgCode: true, address: true, areaCode: true, phone: true },
    });
    if (!org) throw new Error('Organization not found');

    const typePrompt = this.LETTER_TYPE_PROMPTS[dto.letterType] ?? this.LETTER_TYPE_PROMPTS.external_letter;

    const systemPrompt = `คุณเป็นผู้เชี่ยวชาญด้านงานสารบรรณราชการไทย
ตามระเบียบสำนักนายกรัฐมนตรี ว่าด้วยงานสารบรรณ พ.ศ. 2526

ข้อมูลหน่วยงาน:
- ชื่อ: ${org.name}
- ที่อยู่: ${org.address ?? '-'}
- เขตพื้นที่: ${org.areaCode ?? '-'}

ตอบเป็น JSON เท่านั้น ไม่ต้องมี markdown code block`;

    const userMessage = `${dto.prompt}\n\n${typePrompt}`;

    try {
      const rawText = await this.gemini.generateText({
        system: systemPrompt,
        user: userMessage,
        maxOutputTokens: 4096,
        temperature: 0.3,
      });

      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      let parsed: any = {};
      try {
        parsed = JSON.parse(jsonMatch?.[0] ?? '{}');
      } catch {
        parsed = { bodyText: rawText };
      }

      // Create OutboundDocument draft
      const doc = await this.prisma.outboundDocument.create({
        data: {
          organizationId: BigInt(dto.organizationId),
          createdByUserId: BigInt(dto.userId),
          subject: parsed.subject ?? dto.prompt.substring(0, 200),
          bodyText: parsed.bodyText ?? '',
          recipientOrg: parsed.recipientOrg ?? null,
          recipientName: parsed.recipientName ?? null,
          letterType: dto.letterType,
          status: 'draft',
        },
      });

      return {
        id: Number(doc.id),
        ...parsed,
        letterType: dto.letterType,
        status: 'draft',
      };
    } catch (error: any) {
      this.logger.error(`AI prompt generation failed: ${error?.message}`);
      this.gemini.logAxiosError('generateFromPrompt', error);
      throw error;
    }
  }

  /**
   * V2: Generate AI draft from inbound case (existing, improved)
   */
  async generateAiDraft(caseId: number, draftType: string, additionalContext?: string, userOrgId?: number) {
    const cas = await this.prisma.inboundCase.findUnique({
      where: { id: BigInt(caseId) },
      include: {
        sourceDocument: true,
        topics: true,
        organization: { select: { id: true, name: true, orgCode: true } },
      },
    });
    if (!cas) throw new NotFoundException(`Inbound case #${caseId} not found`);

    if (userOrgId !== undefined && Number(cas.organizationId) !== Number(userOrgId)) {
      throw new ForbiddenException('ไม่สามารถสร้าง AI draft จากเคสขององค์กรอื่น');
    }

    // Gather document text from the latest DocumentIntake's aiResult
    let documentText = '';
    if (cas.sourceDocument) {
      const intake = await this.prisma.documentIntake.findFirst({
        where: { organizationId: cas.organizationId },
        include: { aiResult: true },
        orderBy: { createdAt: 'desc' },
      });
      if (intake?.aiResult?.extractedText) {
        documentText = intake.aiResult.extractedText;
      }
    }
    // Fallback to document fullText
    if (!documentText && cas.sourceDocument?.fullText) {
      documentText = cas.sourceDocument.fullText;
    }

    const topicNames = cas.topics?.map((t: any) => t.topicName || t.name).filter(Boolean).join(', ');

    const draftTypeToLetter: Record<string, string> = {
      memo: 'internal_memo',
      reply: 'external_letter',
      report: 'external_letter',
      order: 'order',
      announcement: 'announcement',
    };
    const letterType = draftTypeToLetter[draftType] ?? 'external_letter';
    const typePrompt = this.LETTER_TYPE_PROMPTS[letterType] ?? this.LETTER_TYPE_PROMPTS.external_letter;

    const prompt = `คุณเป็นผู้เชี่ยวชาญด้านงานสารบรรณราชการไทย
ตามระเบียบสำนักนายกรัฐมนตรี ว่าด้วยงานสารบรรณ พ.ศ. 2526

ข้อมูลหน่วยงาน: ${cas.organization?.name ?? ''}

เรื่องจากหนังสือรับ: ${cas.title}
${cas.description ? `รายละเอียด: ${cas.description}` : ''}
${topicNames ? `หัวข้อ: ${topicNames}` : ''}
${documentText ? `เนื้อหาต้นฉบับ:\n${documentText.substring(0, 3000)}` : ''}
${additionalContext ? `บริบทเพิ่มเติม: ${additionalContext}` : ''}

${typePrompt}

ตอบเป็น JSON เท่านั้น ไม่ต้องมี markdown code block`;

    try {
      const rawText = await this.gemini.generateText({
        user: prompt,
        maxOutputTokens: 4096,
        temperature: 0.3,
      });

      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      let parsed: any = {};
      try { parsed = JSON.parse(jsonMatch?.[0] ?? '{}'); } catch { parsed = { bodyText: rawText }; }

      // Create OutboundDocument with draft status
      const doc = await this.prisma.outboundDocument.create({
        data: {
          organizationId: cas.organizationId,
          createdByUserId: undefined,
          subject: parsed.subject ?? `[${draftType.toUpperCase()}] ${cas.title}`,
          bodyText: parsed.bodyText ?? rawText,
          recipientOrg: parsed.recipientOrg ?? null,
          recipientName: parsed.recipientName ?? null,
          letterType,
          status: 'draft',
          relatedInboundCaseId: cas.id,
          urgencyLevel: cas.urgencyLevel ?? 'normal',
          securityLevel: cas.securityLevel ?? 'normal',
        },
      });

      return {
        id: Number(doc.id),
        ...parsed,
        letterType,
        status: 'draft',
        relatedInboundCaseId: Number(cas.id),
      };
    } catch (error: any) {
      this.logger.error(`AI draft generation failed for case ${caseId}: ${error?.message}`);
      this.gemini.logAxiosError('generateAiDraft', error);
      throw error;
    }
  }

  /**
   * Generate PDF from outbound document data using the appropriate template
   */
  async generatePdf(id: number, userOrgId?: number): Promise<Buffer> {
    const doc = await this.prisma.outboundDocument.findUnique({
      where: { id: BigInt(id) },
      include: {
        organization: { select: { name: true, address: true, phone: true, orgCode: true } },
        approvedBy: { select: { fullName: true, positionTitle: true } },
        createdBy: { select: { fullName: true, positionTitle: true } },
      },
    });
    if (!doc) throw new NotFoundException(`Outbound document #${id} not found`);

    if (userOrgId !== undefined && Number(doc.organizationId) !== Number(userOrgId)) {
      throw new ForbiddenException('ไม่สามารถสร้าง PDF ของเอกสารขององค์กรอื่น');
    }

    const org = doc.organization;
    const signer = doc.approvedBy ?? doc.createdBy;
    const now = new Date();
    const buddhistYear = now.getFullYear() + 543;
    const thaiMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    const dateStr = `${now.getDate()} ${thaiMonths[now.getMonth()]} ${buddhistYear}`;

    let pdfBuffer: Buffer;

    switch (doc.letterType) {
      case 'internal_memo':
        pdfBuffer = await this.templates.generateMemo({
          department: org?.name,
          documentNo: doc.documentNo ?? undefined,
          date: dateStr,
          subject: doc.subject,
          recipient: doc.recipientName ?? undefined,
          body: doc.bodyText ?? undefined,
          signerName: signer?.fullName ?? undefined,
          signerPosition: signer?.positionTitle ?? undefined,
        });
        break;

      case 'stamp_letter':
        pdfBuffer = await this.templates.generateStampLetter({
          documentNo: doc.documentNo ?? undefined,
          recipient: doc.recipientOrg ?? doc.recipientName ?? undefined,
          body: doc.bodyText ?? undefined,
          orgName: org?.name ?? '',
          date: dateStr,
        });
        break;

      case 'order':
        pdfBuffer = await this.templates.generateDirective({
          orgName: org?.name ?? '',
          subject: doc.subject,
          body: doc.bodyText ?? undefined,
          date: dateStr,
          signerName: signer?.fullName ?? undefined,
          signerPosition: signer?.positionTitle ?? undefined,
          directiveType: 'คำสั่ง',
        });
        break;

      case 'announcement':
        pdfBuffer = await this.templates.generateDirective({
          orgName: org?.name ?? '',
          subject: doc.subject,
          body: doc.bodyText ?? undefined,
          date: dateStr,
          signerName: signer?.fullName ?? undefined,
          signerPosition: signer?.positionTitle ?? undefined,
          directiveType: 'ประกาศ',
        });
        break;

      // Backward compatibility — legacy "directive" type defaults to คำสั่ง
      case 'directive':
        pdfBuffer = await this.templates.generateDirective({
          orgName: org?.name ?? '',
          subject: doc.subject,
          body: doc.bodyText ?? undefined,
          date: dateStr,
          signerName: signer?.fullName ?? undefined,
          signerPosition: signer?.positionTitle ?? undefined,
          directiveType: 'คำสั่ง',
        });
        break;

      default: // external_letter
        pdfBuffer = await this.templates.generateKrut({
          documentNo: doc.documentNo ?? undefined,
          orgName: org?.name ?? '',
          orgAddress: org?.address ?? undefined,
          date: dateStr,
          recipient: doc.recipientName ?? undefined,
          subject: doc.subject,
          body: doc.bodyText ?? undefined,
          closing: 'ขอแสดงความนับถือ',
          signerName: signer?.fullName ?? undefined,
          signerPosition: signer?.positionTitle ?? undefined,
          department: org?.name ?? undefined,
          phone: org?.phone ?? undefined,
        });
        break;
    }

    // Save PDF to MinIO
    if (this.fileStorage) {
      const storagePath = `outbound/${Number(doc.organizationId)}/${id}.pdf`;
      await this.fileStorage.saveBuffer(storagePath, pdfBuffer, 'application/pdf');
      await this.prisma.outboundDocument.update({
        where: { id: BigInt(id) },
        data: { storagePath },
      });
      this.logger.log(`Generated PDF for outbound doc #${id} → ${storagePath}`);
    }

    return pdfBuffer;
  }

  async reject(id: number, note?: string, userOrgId?: number) {
    if (userOrgId !== undefined) {
      await this.assertDocBelongsToOrg(id, userOrgId);
    }
    const updated = await this.prisma.outboundDocument.update({
      where: { id: BigInt(id) },
      data: { status: 'draft', bodyText: note ? `[ส่งกลับแก้ไข]: ${note}` : undefined },
    });
    return { id: Number(updated.id), status: 'draft' };
  }

  private async generateDocumentNo(organizationId: bigint, orgCode?: string): Promise<string> {
    const now = new Date();
    const buddhistYear = now.getFullYear() + 543;
    const prefix = orgCode ?? 'ORG';

    const count = await this.prisma.outboundDocument.count({
      where: {
        organizationId,
        documentNo: { not: null },
        documentDate: {
          gte: new Date(`${now.getFullYear()}-01-01`),
          lte: new Date(`${now.getFullYear()}-12-31`),
        },
      },
    });
    const seq = String(count + 1).padStart(4, '0');
    return `${prefix} ${seq}/${buddhistYear}`;
  }

  private serialize(doc: any): any {
    return {
      ...doc,
      id: Number(doc.id),
      organizationId: Number(doc.organizationId),
      createdByUserId: doc.createdByUserId ? Number(doc.createdByUserId) : null,
      approvedByUserId: doc.approvedByUserId ? Number(doc.approvedByUserId) : null,
      relatedInboundCaseId: doc.relatedInboundCaseId ? Number(doc.relatedInboundCaseId) : null,
      createdBy: doc.createdBy ? { ...doc.createdBy, id: Number(doc.createdBy.id) } : null,
      approvedBy: doc.approvedBy ? { ...doc.approvedBy, id: Number(doc.approvedBy.id) } : null,
      organization: doc.organization
        ? { id: Number(doc.organization.id), name: doc.organization.name, shortName: doc.organization.shortName }
        : null,
      relatedInboundCase: doc.relatedInboundCase
        ? { ...doc.relatedInboundCase, id: Number(doc.relatedInboundCase.id) }
        : null,
      documentRegistries: doc.documentRegistries?.map((r: any) => ({
        ...r,
        id: Number(r.id),
        organizationId: Number(r.organizationId),
        inboundCaseId: r.inboundCaseId ? Number(r.inboundCaseId) : null,
        outboundDocId: r.outboundDocId ? Number(r.outboundDocId) : null,
        academicYearId: r.academicYearId ? Number(r.academicYearId) : null,
      })),
    };
  }
}
