import { Injectable, Logger, Optional, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_OUTBOUND } from '../queue/queue.constants';
import { PdfSigningService } from '../digital-signature/pdf-signing.service';
import { FileStorageService } from '../intake/services/file-storage.service';
import { TemplatesService } from '../templates/templates.service';
import { GeminiApiService } from '../gemini/gemini-api.service';
import { QueryCacheService } from '../rag/services/query-cache.service';

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
    @Optional() private readonly queryCache: QueryCacheService,
  ) {}

  private readonly CONFIDENTIAL_ROLES = ['ADMIN', 'DIRECTOR', 'VICE_DIRECTOR', 'CLERK'];
  private readonly RESTRICTED_LETTER_TYPES = ['secret_letter'];

  /**
   * Fire-and-forget: drop chat-cache entries for this outbound doc's pages.
   * Called after status transitions (approve/reject/send) so the next chat
   * query sees fresh state, not a 10-minute-stale summary.
   */
  private invalidateOutboundCache(id: number): void {
    if (!this.queryCache) return;
    const routes: Array<[string, number | null]> = [
      [`/outbound/${id}`, id],
      ['/outbound', null],
    ];
    for (const [route, entityId] of routes) {
      this.queryCache
        .invalidateByPage(route, entityId)
        .catch((err) => this.logger.warn(`Cache invalidate ${route}: ${err.message}`));
    }
  }

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
      take: 500, // defensive cap — list has no pagination yet
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

  /** Mark the parent inbound case as replied (best-effort, fail-soft). */
  private async markCaseAsReplied(caseId: bigint): Promise<void> {
    try {
      await this.prisma.inboundCase.update({
        where: { id: caseId },
        data: { hasBeenReplied: true, repliedAt: new Date() },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to mark case ${caseId} as replied: ${err?.message}`);
    }
  }

  /** Format nextActionJson into a readable bullet list for prompts. */
  private formatActions(json: string | null | undefined): string {
    if (!json) return '';
    try {
      const arr = JSON.parse(json);
      if (!Array.isArray(arr) || arr.length === 0) return '';
      return arr
        .map((item: any) => {
          if (typeof item === 'string') return `- ${item}`;
          if (item && typeof item === 'object') {
            const title = item.title ?? item.action ?? item.text ?? JSON.stringify(item);
            const due = item.dueDate ?? item.deadline;
            return `- ${title}${due ? ` (กำหนด: ${due})` : ''}`;
          }
          return `- ${String(item)}`;
        })
        .join('\n');
    } catch {
      return json.length > 500 ? json.substring(0, 500) + '...' : json;
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
    if (dto.relatedInboundCaseId) {
      await this.markCaseAsReplied(BigInt(dto.relatedInboundCaseId));
    }
    return { id: Number(doc.id) };
  }

  async submitForApproval(id: number, userOrgId?: number) {
    if (userOrgId !== undefined) {
      await this.assertDocBelongsToOrg(id, userOrgId);
    }
    const doc = await this.prisma.outboundDocument.findUnique({ where: { id: BigInt(id) } });
    if (!doc) throw new NotFoundException(`Outbound document #${id} not found`);
    if (doc.status !== 'draft') {
      throw new BadRequestException(`ไม่สามารถเสนอขออนุมัติ: สถานะปัจจุบัน "${doc.status}" ต้องเป็น "draft"`);
    }
    await this.prisma.outboundDocument.update({
      where: { id: BigInt(id) },
      data: { status: 'pending_approval' },
    });
    this.invalidateOutboundCache(id);
    return { id, status: 'pending_approval' };
  }

  async approve(id: number, approvedByUserId: number, userOrgId?: number) {
    // Generate document number: <orgCode>/<sequence>/<buddhistYear>
    const doc = await this.prisma.outboundDocument.findUnique({
      where: { id: BigInt(id) },
      include: { organization: { select: { orgCode: true, name: true } } },
    });
    if (!doc) throw new NotFoundException(`Outbound document #${id} not found`);

    if (userOrgId !== undefined && Number(doc.organizationId) !== Number(userOrgId)) {
      throw new ForbiddenException('ไม่สามารถอนุมัติเอกสารขององค์กรอื่น');
    }

    if (!['draft', 'pending_approval'].includes(doc.status)) {
      throw new BadRequestException(`ไม่สามารถอนุมัติ: สถานะปัจจุบัน "${doc.status}"`);
    }

    // Idempotency: re-use existing documentNo if already assigned (user clicks approve again)
    const documentNo = doc.documentNo ?? await this.generateDocumentNo(doc.organizationId, doc.organization?.orgCode);
    const now = new Date();
    const updated = await this.prisma.outboundDocument.update({
      where: { id: BigInt(id) },
      data: {
        status: 'approved',
        documentNo,
        approvedByUserId: BigInt(approvedByUserId),
        approvedAt: now,
        documentDate: doc.documentDate ?? now,
      },
    });

    // ── Register in ทะเบียนส่ง immediately on approval ──
    // "ได้เลขที่อัตโนมัติ" = ลงทะเบียนส่งด้วย
    const existingReg = await this.prisma.documentRegistry.findFirst({
      where: { outboundDocId: BigInt(id), registryType: 'outbound' },
    });
    if (!existingReg) {
      const currentYear = await this.prisma.academicYear.findFirst({ where: { isCurrent: true } });
      const regCount = await this.prisma.documentRegistry.count({
        where: { organizationId: doc.organizationId, registryType: 'outbound' },
      });
      await this.prisma.documentRegistry.create({
        data: {
          organizationId: doc.organizationId,
          registryType: 'outbound',
          registryNo: String(regCount + 1).padStart(4, '0'),
          documentNo,
          documentDate: updated.documentDate,
          fromOrg: doc.organization?.name,
          toOrg: doc.recipientOrg,
          subject: doc.subject,
          urgencyLevel: doc.urgencyLevel,
          outboundDocId: doc.id,
          academicYearId: currentYear?.id ?? undefined,
        },
      });
      this.logger.log(`DocumentRegistry created for outbound doc #${id} (documentNo=${documentNo})`);
    }

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

    this.invalidateOutboundCache(id);

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

    // DocumentRegistry is created on approve() — just update sentAt on the existing entry.
    // Safety net: if registry somehow missing (e.g. legacy doc approved before this fix),
    // create it now using the same logic as approve().
    const doc = await this.prisma.outboundDocument.findUnique({
      where: { id: BigInt(id) },
      include: { organization: { select: { orgCode: true, name: true } } },
    });
    if (doc) {
      const existingReg = await this.prisma.documentRegistry.findFirst({
        where: { outboundDocId: BigInt(id), registryType: 'outbound' },
      });
      if (!existingReg && doc.documentNo) {
        const currentYear = await this.prisma.academicYear.findFirst({ where: { isCurrent: true } });
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
        this.logger.log(`DocumentRegistry backfill-created for legacy outbound doc #${id}`);
      }

      // Dispatch email job if sentMethod is email
      if (sentMethod === 'email' && doc.recipientEmail) {
        await this.outboundQueue.add('send-email', { outboundDocId: id });
        this.logger.log(`Queued email send for outbound doc #${id}`);
      }
    }

    this.invalidateOutboundCache(id);

    return { id: Number(updated.id), status: 'sent' };
  }

  async getRegistry(organizationId: number, registryType?: string, academicYearId?: number) {
    const where: any = { organizationId: BigInt(organizationId) };
    if (registryType === 'archive') {
      // ทะเบียนหนังสือเก็บ / บัญชีหนังสือส่งเก็บ (แบบ ๑๙/๒๐): เอกสารที่จัดเก็บเข้าแฟ้มแล้ว
      // (archivedAt != null) และยังไม่ถูกจำหน่าย (ทำลาย/ขอเก็บเอง/ฝาก). เอกสารที่จัดเก็บยังคง
      // registryType เดิม (inbound/outbound) จึงต้องกรองด้วย archivedAt ไม่ใช่ registryType.
      where.archivedAt = { not: null };
      where.registryType = { notIn: ['destroy', 'keep_self', 'deposit'] };
    } else if (registryType) {
      where.registryType = registryType;
    }
    if (academicYearId) where.academicYearId = BigInt(academicYearId);

    const include: any = {
      inboundCase: { select: { id: true, title: true } },
      outboundDoc: { select: { id: true, subject: true } },
      academicYear: { select: { year: true, name: true } },
      folder: { select: { name: true, code: true } },
    };
    // Surface the committee decision (การพิจารณา) for the destruction register (แบบ ๒๕)
    if (registryType === 'destroy') {
      include.destructionItems = {
        take: 1,
        orderBy: { id: 'desc' },
        include: {
          destructionRequest: {
            select: {
              id: true,
              status: true,
              approvedAt: true,
              destroyedAt: true,
              remarks: true,
              createdAt: true,
              requestedBy: { select: { fullName: true } },
              approvedBy: { select: { fullName: true } },
            },
          },
        },
      };
    }

    const entries = await this.prisma.documentRegistry.findMany({
      where,
      orderBy: [{ registryType: 'asc' }, { createdAt: 'desc' }],
      include,
    });

    return entries.map((e: any) => {
      const dr = e.destructionItems?.[0]?.destructionRequest ?? null;
      return {
        id: Number(e.id),
        organizationId: Number(e.organizationId),
        registryType: e.registryType,
        registryNo: e.registryNo,
        documentNo: e.documentNo,
        documentDate: e.documentDate,
        fromOrg: e.fromOrg,
        toOrg: e.toOrg,
        subject: e.subject,
        urgencyLevel: e.urgencyLevel,
        actionTaken: e.actionTaken,
        remarks: e.remarks,
        archivedAt: e.archivedAt,
        retentionEndDate: e.retentionEndDate,
        folderId: e.folderId ? Number(e.folderId) : null,
        folder: e.folder ? { name: e.folder.name, code: e.folder.code } : null,
        inboundCaseId: e.inboundCaseId ? Number(e.inboundCaseId) : null,
        outboundDocId: e.outboundDocId ? Number(e.outboundDocId) : null,
        academicYearId: e.academicYearId ? Number(e.academicYearId) : null,
        academicYear: e.academicYear ?? null,
        inboundCase: e.inboundCase ? { id: Number(e.inboundCase.id), title: e.inboundCase.title } : null,
        outboundDoc: e.outboundDoc ? { id: Number(e.outboundDoc.id), subject: e.outboundDoc.subject } : null,
        trackingCode: e.trackingCode,
        createdAt: e.createdAt,
        destructionRequest: dr
          ? {
              id: Number(dr.id),
              status: dr.status,
              requestedBy: dr.requestedBy?.fullName ?? null,
              approvedBy: dr.approvedBy?.fullName ?? null,
              approvedAt: dr.approvedAt,
              destroyedAt: dr.destroyedAt,
              remarks: dr.remarks,
              createdAt: dr.createdAt,
            }
          : null,
      };
    });
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
ตอบเป็น JSON เท่านั้น — ห้ามขึ้นต้น subject ด้วย "เรื่อง" และห้ามขึ้นต้น recipientName ด้วย "เรียน"/"ถึง" (ระบบจะเติม prefix เอง):
{
  "subject": "ชื่อเรื่อง (ข้อความล้วน)",
  "recipientOrg": "หน่วยงานผู้รับ",
  "recipientName": "ตำแหน่งผู้รับ (ข้อความล้วน)",
  "reference": "อ้างถึง (ถ้ามี ไม่มีให้เป็น null)",
  "attachments": "สิ่งที่ส่งมาด้วย (ถ้ามี ไม่มีให้เป็น null)",
  "bodyText": "เนื้อหาหนังสือ เริ่มจากย่อหน้าแรก ใช้ภาษาราชการ",
  "closing": "จึงเรียนมาเพื่อโปรดทราบ / จึงเรียนมาเพื่อโปรดพิจารณา"
}`,

    internal_memo: `สร้างบันทึกข้อความ (หนังสือภายใน) ตามระเบียบสารบรรณ
ตอบเป็น JSON เท่านั้น — ห้ามขึ้นต้น subject ด้วย "เรื่อง" และห้ามขึ้นต้น recipientName ด้วย "เรียน"/"ถึง" (ระบบจะเติม prefix เอง):
{
  "subject": "ชื่อเรื่อง (ข้อความล้วน)",
  "recipientName": "ตำแหน่งผู้รับ (ข้อความล้วน เช่น ผู้อำนวยการโรงเรียน...)",
  "bodyText": "เนื้อหาบันทึก เริ่มจากย่อหน้าแรก ใช้ภาษาราชการ",
  "closing": "จึงเรียนมาเพื่อโปรดทราบ / จึงเรียนมาเพื่อโปรดพิจารณา"
}`,

    stamp_letter: `สร้างหนังสือประทับตรา ตามระเบียบสารบรรณ (ใช้ประทับตราแทนลงนาม)
ตอบเป็น JSON เท่านั้น — ห้ามขึ้นต้น subject ด้วย "เรื่อง" และห้ามขึ้นต้น recipientOrg ด้วย "ถึง" (ระบบจะเติม prefix เอง):
{
  "subject": "ชื่อเรื่อง (ข้อความล้วน)",
  "recipientOrg": "หน่วยงานผู้รับ (ข้อความล้วน)",
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
   * Pulls rich metadata from DocumentAiResult (เลขที่หนังสือ, วันที่, ผู้ส่ง, สรุป, action, deadline)
   * เพื่อให้ Gemini ร่างหนังสือส่งได้ตรงประเด็นและถูกระเบียบ
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

    // ─── Resolve DocumentAiResult via intake:{id} pattern in description ───
    // (เดิม findFirst by organizationId แล้ว orderBy createdAt — ดึง intake ผิดตัว)
    // Pattern เดียวกับ cases.service.ts:246
    const intakeMatch = cas.description?.match(/intake:(\d+)/);
    const aiResult = intakeMatch
      ? await this.prisma.documentAiResult.findUnique({
          where: { documentIntakeId: BigInt(intakeMatch[1]) },
        })
      : null;

    let documentText = aiResult?.extractedText ?? '';
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
    const draftTypeLabel: Record<string, string> = {
      memo: 'บันทึกข้อความ',
      reply: 'หนังสือตอบ',
      report: 'หนังสือรายงานผล',
      order: 'คำสั่ง',
      announcement: 'ประกาศ',
    };
    const letterType = draftTypeToLetter[draftType] ?? 'external_letter';
    const typePrompt = this.LETTER_TYPE_PROMPTS[letterType] ?? this.LETTER_TYPE_PROMPTS.external_letter;

    // ─── Build enriched prompt ───
    const docDateStr = aiResult?.documentDate
      ? aiResult.documentDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
      : '—';
    const deadlineStr = aiResult?.deadlineDate
      ? aiResult.deadlineDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
      : '';
    const actionsText = this.formatActions(aiResult?.nextActionJson);

    const prompt = `คุณเป็นผู้เชี่ยวชาญด้านงานสารบรรณราชการไทย
ตามระเบียบสำนักนายกรัฐมนตรี ว่าด้วยงานสารบรรณ พ.ศ. 2526

ข้อมูลหน่วยงานผู้ตอบ: ${cas.organization?.name ?? '—'}

═══ หนังสือต้นเรื่อง (สิ่งที่ต้องตอบ) ═══
เลขที่: ${aiResult?.documentNo ?? '—'}
ลงวันที่: ${docDateStr}
จาก: ${aiResult?.issuingAuthority ?? '—'}
ถึง: ${aiResult?.recipientText ?? '—'}
เรื่อง: ${aiResult?.subjectText ?? cas.title}

ประเภทการตอบสนอง: ${aiResult?.responseType ?? 'unknown'}
${aiResult?.responseRequirementReason ? `เหตุผล: ${aiResult.responseRequirementReason}` : ''}

สรุปเนื้อหา:
${aiResult?.summaryText ?? cas.description ?? '—'}
${deadlineStr ? `\nกำหนดที่ระบุ: ${deadlineStr}` : ''}
${actionsText ? `\nสิ่งที่ต้องทำ/ตอบ:\n${actionsText}` : ''}
${topicNames ? `\nหัวข้อ: ${topicNames}` : ''}
${documentText ? `\n--- เนื้อหาเต็ม (excerpt) ---\n${documentText.substring(0, 2500)}` : ''}
${additionalContext ? `\n═══ บริบทเพิ่มเติมจากผู้ใช้ ═══\n${additionalContext}` : ''}

═══ คำสั่ง ═══
ร่าง${draftTypeLabel[draftType] ?? 'หนังสือ'} เพื่อตอบสนองหนังสือต้นเรื่องข้างต้น
- ในย่อหน้าแรก ต้องอ้างอิงถึงเลขที่และวันที่ของหนังสือต้นเรื่อง (ถ้ามี)
- เนื้อหาต้องตอบ/ดำเนินการตามสิ่งที่หนังสือต้นเรื่องระบุ
- ใช้ภาษาราชการตามระเบียบสารบรรณ
- เลือก "เรียน" + คำลงท้ายให้เหมาะสมกับชั้นยศของผู้รับ

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

      // Defensive: strip any prefix the AI might still include even with updated prompt.
      // Templates always prepend "เรื่อง" / "เรียน" / "ถึง" labels, so stored data
      // must be bare values to avoid the "เรื่อง เรื่อง ..." duplication bug.
      const cleanSubject = this.stripFieldPrefix(parsed.subject, 'เรื่อง');
      const cleanRecipientName = this.stripFieldPrefix(parsed.recipientName, '(?:เรียน|ถึง)');
      const cleanRecipientOrg = this.stripFieldPrefix(parsed.recipientOrg, 'ถึง');

      // Create OutboundDocument with draft status
      const doc = await this.prisma.outboundDocument.create({
        data: {
          organizationId: cas.organizationId,
          createdByUserId: undefined,
          subject: cleanSubject ?? `[${draftType.toUpperCase()}] ${cas.title}`,
          bodyText: parsed.bodyText ?? rawText,
          recipientOrg: cleanRecipientOrg,
          recipientName: cleanRecipientName,
          letterType,
          status: 'draft',
          relatedInboundCaseId: cas.id,
          urgencyLevel: cas.urgencyLevel ?? 'normal',
          securityLevel: cas.securityLevel ?? 'normal',
        },
      });

      // Mark inbound case as replied (best-effort, fail-soft)
      await this.markCaseAsReplied(cas.id);

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
        relatedInboundCase: {
          select: {
            assignedTo: { select: { fullName: true, positionTitle: true } },
          },
        },
      },
    });
    if (!doc) throw new NotFoundException(`Outbound document #${id} not found`);

    if (userOrgId !== undefined && Number(doc.organizationId) !== Number(userOrgId)) {
      throw new ForbiddenException('ไม่สามารถสร้าง PDF ของเอกสารขององค์กรอื่น');
    }

    const org = doc.organization;
    // For internal_memo (หนังสือภายใน): signer = ผู้ได้รับมอบหมายจาก InboundCase.
    // ผู้ได้รับมอบหมายเป็นผู้ลงนาม ไม่ใช่ ผอ. ที่สั่งมอบหมาย
    const assignee = doc.relatedInboundCase?.assignedTo;
    const signer = doc.letterType === 'internal_memo'
      ? (assignee ?? doc.approvedBy ?? doc.createdBy)
      : (doc.approvedBy ?? doc.createdBy);
    const now = new Date();
    const buddhistYear = now.getFullYear() + 543;
    const thaiMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    const dateStr = `${now.getDate()} ${thaiMonths[now.getMonth()]} ${buddhistYear}`;

    let pdfBuffer: Buffer;

    // Defensive strip for legacy drafts created before prompt fix — templates
    // always prepend labels so we must pass bare values.
    const subj = this.stripFieldPrefix(doc.subject, 'เรื่อง') ?? '';
    const rcptName = this.stripFieldPrefix(doc.recipientName, '(?:เรียน|ถึง)') ?? undefined;
    const rcptOrg = this.stripFieldPrefix(doc.recipientOrg, 'ถึง') ?? undefined;

    switch (doc.letterType) {
      case 'internal_memo':
        pdfBuffer = await this.templates.generateMemo({
          department: org?.name,
          documentNo: doc.documentNo ?? undefined,
          date: dateStr,
          subject: subj,
          recipient: rcptName,
          body: doc.bodyText ?? undefined,
          signerName: signer?.fullName ?? undefined,
          signerPosition: signer?.positionTitle ?? undefined,
        });
        break;

      case 'stamp_letter':
        pdfBuffer = await this.templates.generateStampLetter({
          documentNo: doc.documentNo ?? undefined,
          recipient: rcptOrg ?? rcptName,
          body: doc.bodyText ?? undefined,
          orgName: org?.name ?? '',
          date: dateStr,
        });
        break;

      case 'order':
        pdfBuffer = await this.templates.generateDirective({
          orgName: org?.name ?? '',
          subject: subj,
          body: doc.bodyText ?? undefined,
          date: dateStr,
          signerName: signer?.fullName ?? undefined,
          signerPosition: signer?.positionTitle ?? undefined,
          directiveType: 'คำสั่ง',
        });
        break;

      case 'announcement':
        pdfBuffer = await this.templates.generatePublicRelation({
          orgName: org?.name ?? '',
          subject: subj,
          body: doc.bodyText ?? undefined,
          date: dateStr,
          signerName: signer?.fullName ?? undefined,
          signerPosition: signer?.positionTitle ?? undefined,
          prType: 'ประกาศ',
        });
        break;

      // Backward compatibility — legacy "directive" type defaults to คำสั่ง
      case 'directive':
        pdfBuffer = await this.templates.generateDirective({
          orgName: org?.name ?? '',
          subject: subj,
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
          recipient: rcptName,
          subject: subj,
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
    this.invalidateOutboundCache(id);
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

  async getByCase(caseId: number, orgId: number) {
    const docs = await this.prisma.outboundDocument.findMany({
      where: {
        relatedInboundCaseId: BigInt(caseId),
        organizationId: BigInt(orgId),
      },
      select: {
        id: true,
        subject: true,
        letterType: true,
        status: true,
        documentNo: true,
        createdAt: true,
        recipientName: true,
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return docs.map((d) => ({
      id: Number(d.id),
      subject: d.subject,
      letterType: d.letterType,
      status: d.status,
      documentNo: d.documentNo,
      createdAt: d.createdAt,
      recipientName: d.recipientName,
      createdBy: d.createdBy ? { id: Number(d.createdBy.id), fullName: d.createdBy.fullName } : null,
    }));
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

  /**
   * Strip a leading Thai form-field prefix (e.g. "เรื่อง", "เรียน", "ถึง")
   * plus optional separators from an AI-generated value. Returns null for
   * empty input. Case-insensitive, tolerant of spaces, colons, and "：" (Thai colon).
   *
   * Why: Word templates always render the label themselves, so stored data
   * must be bare. Without this, AI output like "เรื่อง ตอบรับ..." becomes
   * "เรื่อง  เรื่อง ตอบรับ..." in the document.
   */
  private stripFieldPrefix(text: string | null | undefined, prefixRegexSource: string): string | null {
    if (!text) return null;
    const re = new RegExp(`^\\s*${prefixRegexSource}[\\s:：]+`, 'i');
    const cleaned = String(text).replace(re, '').trim();
    return cleaned || null;
  }
}
