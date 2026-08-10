import { Injectable, Logger, Optional, ForbiddenException, NotFoundException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
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
import { nextRegistrationSeq } from '../common/registration-counter';
import { DifyApiService } from '../dify/dify-api.service';
import { OutboundPdfRenderer } from './outbound-pdf.renderer';
import {
  OUTBOUND_RENDER_INCLUDE,
  OutboundRenderSource,
  stripFieldPrefix,
  toOutboundRenderModel,
} from './outbound-render.model';

export type OutboundOutlineFields = {
  subject?: string;
  bodyText?: string;
  recipientOrg?: string;
  recipientName?: string;
  reference?: string;
  attachments?: string;
  closing?: string;
  letterType?: string;
};

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
    @Optional() private readonly dify: DifyApiService,
    private readonly pdfRenderer: OutboundPdfRenderer,
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
    // Generate document number: <orgCode> <sequence>/<buddhistYear>
    const doc = await this.prisma.outboundDocument.findUnique({
      where: { id: BigInt(id) },
      include: {
        organization: {
          select: {
            orgCode: true,
            name: true,
            activeAcademicYearId: true,
            activeAcademicYear: { select: { id: true, year: true } },
          },
        },
      },
    });
    if (!doc) throw new NotFoundException(`Outbound document #${id} not found`);

    if (userOrgId !== undefined && Number(doc.organizationId) !== Number(userOrgId)) {
      throw new ForbiddenException('ไม่สามารถอนุมัติเอกสารขององค์กรอื่น');
    }

    if (!['draft', 'pending_approval'].includes(doc.status)) {
      throw new BadRequestException(`ไม่สามารถอนุมัติ: สถานะปัจจุบัน "${doc.status}"`);
    }

    // Idempotency: re-use existing documentNo if already assigned (user clicks approve again).
    // New numbers come from RegistrationCounter (atomic upsert), not count()+1, so concurrent
    // approvals cannot mint the same official number.
    let documentNo = doc.documentNo;
    let registryNo = this.registryNoFromDocumentNo(documentNo);
    if (!documentNo) {
      const nextNumber = await this.generateDocumentNo(
        doc.organizationId,
        doc.organization?.orgCode,
        doc.organization?.activeAcademicYear?.year,
      );
      documentNo = nextNumber.documentNo;
      registryNo = nextNumber.registryNo;
    }
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
      const academicYearId =
        doc.organization?.activeAcademicYearId ??
        (await this.prisma.academicYear.findFirst({
          where: { isCurrent: true },
          select: { id: true },
        }))?.id;
      await this.prisma.documentRegistry.create({
        data: {
          organizationId: doc.organizationId,
          registryType: 'outbound',
          registryNo: registryNo ?? String(id).padStart(4, '0'),
          documentNo,
          documentDate: updated.documentDate,
          fromOrg: doc.organization?.name,
          toOrg: doc.recipientOrg,
          subject: doc.subject,
          urgencyLevel: doc.urgencyLevel,
          outboundDocId: doc.id,
          academicYearId: academicYearId ?? undefined,
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
        await this.prisma.documentRegistry.create({
          data: {
            organizationId: doc.organizationId,
            registryType: 'outbound',
            registryNo: this.registryNoFromDocumentNo(doc.documentNo) ?? String(id).padStart(4, '0'),
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
      take: 500, // defensive cap — registry list has no cursor pagination yet
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

    // Prefer case.registrationNo (minted by CaseWorkflowService). Fallback: same
    // inbound RegistrationCounter — never count()+1 (race-prone duplicates).
    let registryNo = cas.registrationNo;
    if (!registryNo) {
      const next = await nextRegistrationSeq(this.prisma, cas.organizationId, 'inbound', {
        knownYear: cas.academicYear?.year,
        pad: 3,
      });
      registryNo = next.formatted;
      await this.prisma.inboundCase.update({
        where: { id: cas.id },
        data: { registrationNo: registryNo },
      });
    }

    const entry = await this.prisma.documentRegistry.create({
      data: {
        organizationId: cas.organizationId,
        registryType: 'inbound',
        registryNo,
        subject: cas.title,
        urgencyLevel: (cas as any).urgencyLevel ?? 'normal',
        inboundCaseId: cas.id,
        academicYearId: cas.academicYearId ?? undefined,
      },
    });
    return { id: Number(entry.id), registryNo };
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
        disableThinking: true,
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
  async generateAiDraft(
    caseId: number,
    draftType: string,
    additionalContext?: string,
    userOrgId?: number,
    userId?: number,
  ) {
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
        disableThinking: true,
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

      // Create OutboundDocument with draft status (frontend must open this id —
      // do not POST /outbound/documents again or a second draft is created).
      const doc = await this.prisma.outboundDocument.create({
        data: {
          organizationId: cas.organizationId,
          createdByUserId: userId ? BigInt(userId) : undefined,
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
   * Phase 4: Dify Workflow → outbound draft outline (no documentNo).
   * Free-form user prompt → structured fields → OutboundDocument draft.
   */
  async generateDifyOutlineFromPrompt(dto: {
    organizationId: number;
    userId: number;
    letterType: string;
    prompt: string;
  }) {
    this.assertDifyOutlineReady();
    const org = await this.prisma.organization.findUnique({
      where: { id: BigInt(dto.organizationId) },
      select: { id: true, name: true, orgCode: true, address: true, areaCode: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const userKey = `user:${dto.userId}:org:${dto.organizationId}`;
    const wf = await this.dify!.runWorkflow({
      kind: 'outbound_outline',
      user: userKey,
      inputs: {
        prompt: dto.prompt,
        letter_type: dto.letterType,
        org_name: org.name ?? '',
        org_address: org.address ?? '',
        org_area: org.areaCode ?? '',
        org_id: String(dto.organizationId),
      },
    });

    const parsed = this.parseDifyOutline(wf.outputs, wf.text);
    const letterType = this.normalizeLetterType(parsed.letterType ?? dto.letterType);
    const fields = this.cleanOutlineFields(parsed);

    const doc = await this.prisma.outboundDocument.create({
      data: {
        organizationId: BigInt(dto.organizationId),
        createdByUserId: BigInt(dto.userId),
        subject: fields.subject ?? dto.prompt.substring(0, 200),
        bodyText: fields.bodyText ?? '',
        recipientOrg: fields.recipientOrg ?? null,
        recipientName: fields.recipientName ?? null,
        letterType,
        status: 'draft',
        // documentNo intentionally null — only assigned on approve
      },
    });

    this.logger.log(
      `Dify outline draft #${doc.id} from prompt (workflowRun=${wf.workflowRunId})`,
    );

    return {
      id: Number(doc.id),
      subject: fields.subject,
      bodyText: fields.bodyText,
      recipientOrg: fields.recipientOrg,
      recipientName: fields.recipientName,
      reference: fields.reference,
      attachments: fields.attachments,
      closing: fields.closing,
      letterType,
      status: 'draft' as const,
      provider: 'dify' as const,
      workflowRunId: wf.workflowRunId,
      latencyMs: wf.latencyMs,
    };
  }

  /**
   * Phase 4: Dify Workflow outline from inbound case → OutboundDocument draft.
   * Links relatedInboundCaseId; never invents registration/document numbers.
   */
  async generateDifyOutlineFromCase(dto: {
    caseId: number;
    userId: number;
    userOrgId?: number;
    draftType?: string;
    letterType?: string;
    additionalContext?: string;
  }) {
    this.assertDifyOutlineReady();

    const cas = await this.prisma.inboundCase.findUnique({
      where: { id: BigInt(dto.caseId) },
      include: {
        organization: { select: { id: true, name: true, orgCode: true, address: true, areaCode: true } },
        sourceDocument: true,
        topics: true,
      },
    });
    if (!cas) throw new NotFoundException(`Inbound case #${dto.caseId} not found`);
    if (dto.userOrgId !== undefined && Number(cas.organizationId) !== Number(dto.userOrgId)) {
      throw new ForbiddenException('ไม่สามารถสร้างร่างจากเคสขององค์กรอื่น');
    }

    const intakeMatch = cas.description?.match(/intake:(\d+)/);
    const aiResult = intakeMatch
      ? await this.prisma.documentAiResult.findUnique({
          where: { documentIntakeId: BigInt(intakeMatch[1]) },
        })
      : null;

    const draftTypeToLetter: Record<string, string> = {
      memo: 'internal_memo',
      reply: 'external_letter',
      report: 'external_letter',
      order: 'order',
      announcement: 'announcement',
    };
    const letterType = this.normalizeLetterType(
      dto.letterType ??
        (dto.draftType ? draftTypeToLetter[dto.draftType] : undefined) ??
        'external_letter',
    );

    const letterContext = [
      `เรื่อง: ${aiResult?.subjectText ?? cas.title}`,
      `เลขที่: ${aiResult?.documentNo ?? '—'}`,
      `จาก: ${aiResult?.issuingAuthority ?? '—'}`,
      `สรุป: ${aiResult?.summaryText ?? cas.description ?? '—'}`,
      aiResult?.nextActionJson ? `สิ่งที่ต้องทำ: ${this.formatActions(aiResult.nextActionJson)}` : '',
      dto.additionalContext ? `บริบทเพิ่ม: ${dto.additionalContext}` : '',
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, 6000);

    const org = cas.organization;
    const userKey = `user:${dto.userId}:org:${cas.organizationId}`;
    const wf = await this.dify!.runWorkflow({
      kind: 'outbound_outline',
      user: userKey,
      inputs: {
        prompt: `ร่างหนังสือตอบ/รายงานผลต่อหนังสือต้นเรื่องต่อไปนี้\n${letterContext}`,
        letter_type: letterType,
        letter_context: letterContext,
        case_id: String(dto.caseId),
        case_title: cas.title ?? '',
        org_name: org?.name ?? '',
        org_address: org?.address ?? '',
        org_area: org?.areaCode ?? '',
        org_id: String(cas.organizationId),
        draft_type: dto.draftType ?? 'reply',
      },
    });

    const parsed = this.parseDifyOutline(wf.outputs, wf.text);
    const fields = this.cleanOutlineFields(parsed);
    const resolvedType = this.normalizeLetterType(parsed.letterType ?? letterType);

    const doc = await this.prisma.outboundDocument.create({
      data: {
        organizationId: cas.organizationId,
        createdByUserId: BigInt(dto.userId),
        subject: fields.subject ?? `ตอบ: ${cas.title}`,
        bodyText: fields.bodyText ?? '',
        recipientOrg: fields.recipientOrg ?? aiResult?.issuingAuthority ?? null,
        recipientName: fields.recipientName ?? null,
        letterType: resolvedType,
        status: 'draft',
        relatedInboundCaseId: cas.id,
        urgencyLevel: cas.urgencyLevel ?? 'normal',
        securityLevel: cas.securityLevel ?? 'normal',
      },
    });

    await this.markCaseAsReplied(cas.id);

    this.logger.log(
      `Dify outline draft #${doc.id} from case #${dto.caseId} (workflowRun=${wf.workflowRunId})`,
    );

    return {
      id: Number(doc.id),
      subject: fields.subject,
      bodyText: fields.bodyText,
      recipientOrg: fields.recipientOrg,
      recipientName: fields.recipientName,
      reference: fields.reference,
      attachments: fields.attachments,
      closing: fields.closing,
      letterType: resolvedType,
      status: 'draft' as const,
      relatedInboundCaseId: Number(cas.id),
      provider: 'dify' as const,
      workflowRunId: wf.workflowRunId,
      latencyMs: wf.latencyMs,
    };
  }

  private assertDifyOutlineReady() {
    if (!this.dify) {
      throw new ServiceUnavailableException('Dify module ไม่พร้อม');
    }
    if (!this.dify.isEnabled() || !this.dify.isAppConfigured('outbound_outline')) {
      throw new ServiceUnavailableException(
        'Dify outbound outline ยังไม่พร้อม (ENABLE_DIFY + DIFY_API_KEY_OUTBOUND_OUTLINE หรือ DIFY_API_KEY_WORKFLOW)',
      );
    }
  }

  /** Parse workflow outputs into outline fields (JSON object or JSON-in-text). */
  private parseDifyOutline(
    outputs: Record<string, unknown>,
    text: string,
  ): OutboundOutlineFields {
    // Prefer structured fields on outputs
    if (outputs && typeof outputs === 'object') {
      if (
        typeof outputs.subject === 'string' ||
        typeof outputs.bodyText === 'string' ||
        typeof outputs.body_text === 'string'
      ) {
        return {
          subject: typeof outputs.subject === 'string' ? outputs.subject : undefined,
          bodyText:
            typeof outputs.bodyText === 'string'
              ? outputs.bodyText
              : typeof outputs.body_text === 'string'
                ? outputs.body_text
                : undefined,
          recipientOrg:
            typeof outputs.recipientOrg === 'string'
              ? outputs.recipientOrg
              : typeof outputs.recipient_org === 'string'
                ? outputs.recipient_org
                : undefined,
          recipientName:
            typeof outputs.recipientName === 'string'
              ? outputs.recipientName
              : typeof outputs.recipient_name === 'string'
                ? outputs.recipient_name
                : undefined,
          reference: typeof outputs.reference === 'string' ? outputs.reference : undefined,
          attachments:
            typeof outputs.attachments === 'string' ? outputs.attachments : undefined,
          closing: typeof outputs.closing === 'string' ? outputs.closing : undefined,
          letterType:
            typeof outputs.letterType === 'string'
              ? outputs.letterType
              : typeof outputs.letter_type === 'string'
                ? outputs.letter_type
                : undefined,
        };
      }
      // outputs.result / outputs.outline as JSON string
      for (const key of ['result', 'outline', 'json', 'text', 'answer', 'output']) {
        const v = outputs[key];
        if (typeof v === 'string') {
          const fromStr = this.tryParseJsonObject(v);
          if (fromStr) return fromStr;
        }
      }
    }
    const fromText = this.tryParseJsonObject(text);
    if (fromText) return fromText;
    // Fallback: treat whole text as body
    return { bodyText: text || '' };
  }

  private tryParseJsonObject(raw: string): OutboundOutlineFields | null {
    if (!raw?.trim()) return null;
    const normalized = raw
      .replace(/｛/g, '{')
      .replace(/｝/g, '}')
      .replace(/：/g, ':')
      .replace(/，/g, ',');
    const start = normalized.indexOf('{');
    const end = normalized.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      const obj = JSON.parse(normalized.slice(start, end + 1));
      if (!obj || typeof obj !== 'object') return null;
      return {
        subject: obj.subject != null ? String(obj.subject) : undefined,
        bodyText:
          obj.bodyText != null
            ? String(obj.bodyText)
            : obj.body_text != null
              ? String(obj.body_text)
              : undefined,
        recipientOrg:
          obj.recipientOrg != null
            ? String(obj.recipientOrg)
            : obj.recipient_org != null
              ? String(obj.recipient_org)
              : undefined,
        recipientName:
          obj.recipientName != null
            ? String(obj.recipientName)
            : obj.recipient_name != null
              ? String(obj.recipient_name)
              : undefined,
        reference: obj.reference != null ? String(obj.reference) : undefined,
        attachments: obj.attachments != null ? String(obj.attachments) : undefined,
        closing: obj.closing != null ? String(obj.closing) : undefined,
        letterType:
          obj.letterType != null
            ? String(obj.letterType)
            : obj.letter_type != null
              ? String(obj.letter_type)
              : undefined,
      };
    } catch {
      return null;
    }
  }

  private cleanOutlineFields(parsed: OutboundOutlineFields): OutboundOutlineFields {
    return {
      subject: this.stripFieldPrefix(parsed.subject, 'เรื่อง') ?? undefined,
      bodyText: parsed.bodyText?.trim() || undefined,
      recipientOrg: this.stripFieldPrefix(parsed.recipientOrg, 'ถึง') ?? undefined,
      recipientName: this.stripFieldPrefix(parsed.recipientName, '(?:เรียน|ถึง)') ?? undefined,
      reference: parsed.reference?.trim() || undefined,
      attachments: parsed.attachments?.trim() || undefined,
      closing: parsed.closing?.trim() || undefined,
      letterType: parsed.letterType,
    };
  }

  private normalizeLetterType(raw?: string): string {
    const allowed = new Set([
      'external_letter',
      'internal_memo',
      'stamp_letter',
      'order',
      'announcement',
      'pr_letter',
      'official_record',
      'secret_letter',
      'directive',
    ]);
    const t = (raw || 'external_letter').trim();
    return allowed.has(t) ? t : 'external_letter';
  }

  /**
   * Generate DOCX from outbound document data using the appropriate template.
   * Does not write storagePath (archive PDF is generatePdf only).
   */
  async generateDocx(id: number, userOrgId?: number): Promise<Buffer> {
    const doc = await this.loadForRender(id, userOrgId, 'DOCX');
    const model = toOutboundRenderModel(doc);
    const org = model.org;
    const signer = model.signer;
    const { dateStr, documentNo, subject, bodyOrUndefined } = model;

    switch (model.letterType) {
      case 'internal_memo':
        return this.templates.generateMemo({
          department: org?.name ?? undefined,
          documentNo: documentNo ?? undefined,
          date: dateStr,
          subject,
          recipient: model.recipientName,
          body: bodyOrUndefined,
          signerName: signer?.fullName ?? undefined,
          signerPosition: signer?.positionTitle ?? undefined,
        });

      case 'stamp_letter':
        return this.templates.generateStampLetter({
          documentNo: documentNo ?? undefined,
          recipient: model.recipientStamp,
          body: bodyOrUndefined,
          orgName: org?.name ?? '',
          date: dateStr,
        });

      case 'order':
      case 'directive': // legacy → คำสั่ง
        return this.templates.generateDirective({
          orgName: org?.name ?? '',
          subject,
          body: bodyOrUndefined,
          date: dateStr,
          signerName: signer?.fullName ?? undefined,
          signerPosition: signer?.positionTitle ?? undefined,
          directiveType: 'คำสั่ง',
        });

      case 'announcement':
        return this.templates.generatePublicRelation({
          orgName: org?.name ?? '',
          subject,
          body: bodyOrUndefined,
          date: dateStr,
          signerName: signer?.fullName ?? undefined,
          signerPosition: signer?.positionTitle ?? undefined,
          prType: 'ประกาศ',
        });

      default: // external_letter
        return this.templates.generateKrut({
          documentNo: documentNo ?? undefined,
          orgName: org?.name ?? '',
          orgAddress: org?.address ?? undefined,
          date: dateStr,
          recipient: model.recipientName,
          subject,
          body: bodyOrUndefined,
          closing: 'ขอแสดงความนับถือ',
          signerName: signer?.fullName ?? undefined,
          signerPosition: signer?.positionTitle ?? undefined,
          department: org?.name ?? undefined,
          phone: org?.phone ?? undefined,
        });
    }
  }

  /**
   * Generate a real PDF buffer for outbound documents and persist to MinIO.
   */
  async generatePdf(id: number, userOrgId?: number): Promise<Buffer> {
    const doc = await this.loadForRender(id, userOrgId, 'PDF');
    const model = toOutboundRenderModel(doc);
    const pdfBuffer = await this.pdfRenderer.render(model);

    if (this.fileStorage) {
      const storagePath = `outbound/${model.organizationId}/${id}.pdf`;
      await this.fileStorage.saveBuffer(storagePath, pdfBuffer, 'application/pdf');
      await this.prisma.outboundDocument.update({
        where: { id: BigInt(id) },
        data: { storagePath },
      });
      this.logger.log(`Generated PDF for outbound doc #${id} -> ${storagePath}`);
    }

    return pdfBuffer;
  }

  private async loadForRender(
    id: number,
    userOrgId: number | undefined,
    formatLabel: 'DOCX' | 'PDF',
  ): Promise<OutboundRenderSource> {
    const doc = await this.prisma.outboundDocument.findUnique({
      where: { id: BigInt(id) },
      include: OUTBOUND_RENDER_INCLUDE,
    });
    if (!doc) throw new NotFoundException(`Outbound document #${id} not found`);

    if (userOrgId !== undefined && Number(doc.organizationId) !== Number(userOrgId)) {
      throw new ForbiddenException(`ไม่สามารถสร้าง ${formatLabel} ของเอกสารขององค์กรอื่น`);
    }

    return doc as OutboundRenderSource;
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

  /**
   * Atomic sequence via RegistrationCounter (shared helper).
   * Keyed by org + Buddhist year + counterType='outbound'. Format: "ORG 0007/2569".
   */
  private async generateDocumentNo(
    organizationId: bigint,
    orgCode?: string | null,
    knownBuddhistYear?: number | null,
  ): Promise<{ documentNo: string; registryNo: string }> {
    const next = await nextRegistrationSeq(this.prisma, organizationId, 'outbound', {
      knownYear: knownBuddhistYear,
      pad: 4,
    });
    const prefix = orgCode ?? 'ORG';
    return {
      documentNo: `${prefix} ${next.padded}/${next.year}`,
      registryNo: next.padded,
    };
  }

  /** Extract sequence from formats like "ORG 0007/2569" or "0007/2569". */
  private registryNoFromDocumentNo(documentNo: string | null | undefined): string | null {
    const match = documentNo?.match(/(\d+)\s*\/\s*\d{4}\s*$/);
    return match ? match[1].padStart(4, '0') : null;
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
    return stripFieldPrefix(text, prefixRegexSource);
  }
}
