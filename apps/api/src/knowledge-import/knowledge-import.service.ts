import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { FileStorageService } from '../intake/services/file-storage.service';
import { VectorStoreService } from '../rag/services/vector-store.service';
import { QUEUE_AI_PROCESSING } from '../queue/queue.constants';

@Injectable()
export class KnowledgeImportService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly vectorStore: VectorStoreService,
    @InjectQueue(QUEUE_AI_PROCESSING) private readonly aiQueue: Queue,
  ) {}

  /**
   * ตอน API startup: reset items ที่ค้าง PROCESSING เกิน 10 นาที
   * (เกิดเมื่อ API restart ระหว่างประมวลผล — DB row ไม่ได้อัปเดตเป็น DONE/ERROR)
   */
  async onModuleInit() {
    try {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      const stuck = await this.prisma.userKnowledgeItem.findMany({
        where: {
          status: 'PROCESSING',
          updatedAt: { lt: tenMinAgo },
        },
        select: { id: true },
      });

      if (stuck.length > 0) {
        await this.prisma.userKnowledgeItem.updateMany({
          where: { id: { in: stuck.map((s) => s.id) } },
          data: {
            status: 'ERROR',
            errorMessage: 'Processing was interrupted (API restart). Please retry.',
          },
        });
        this.logger.warn(`Auto-reset ${stuck.length} stuck PROCESSING items to ERROR on startup`);
      }
    } catch (err: any) {
      this.logger.error(`Startup stuck-item reset failed: ${err?.message}`);
    }
  }

  async create(opts: {
    userId: number;
    orgId: number;
    title: string;
    category?: string;
    description?: string;
    file?: Express.Multer.File;
  }) {
    const { userId, orgId, title, category, description, file } = opts;

    if (!title?.trim()) throw new BadRequestException('กรุณาระบุชื่อเรื่อง');

    const sourceType = file
      ? file.mimetype === 'application/pdf'
        ? 'pdf'
        : 'image'
      : 'text';

    // Save record first
    const item = await this.prisma.userKnowledgeItem.create({
      data: {
        organizationId: BigInt(orgId),
        uploadedByUserId: BigInt(userId),
        title: title.trim(),
        category: category?.trim() || null,
        description: description?.trim() || null,
        sourceType,
        status: 'PENDING',
      },
    });

    // Upload file to MinIO if provided
    if (file) {
      const ext = file.mimetype === 'application/pdf' ? 'pdf'
        : file.mimetype === 'image/png' ? 'png'
        : file.mimetype === 'image/webp' ? 'webp'
        : 'jpg';
      const objectPath = `knowledge/${orgId}/${item.id}.${ext}`;
      await this.storage.saveBuffer(objectPath, file.buffer, file.mimetype);
      await this.prisma.userKnowledgeItem.update({
        where: { id: item.id },
        data: { storagePath: objectPath, mimeType: file.mimetype },
      });
    } else if (description?.trim()) {
      // Text-only: store text directly
      await this.prisma.userKnowledgeItem.update({
        where: { id: item.id },
        data: { extractedText: description.trim() },
      });
    }

    // Dispatch embedding job — attempts:1 prevents crash loop:
    // OOM crashes kill the process → Bull auto-retries → another OOM → loop.
    // User can retry manually via PATCH /knowledge-import/:id/retry.
    await this.aiQueue.add('knowledge.import.embed', {
      itemId: item.id.toString(),
    }, { attempts: 1, removeOnFail: true });

    this.logger.log(`Created UserKnowledgeItem #${item.id} for org ${orgId}, queued embed`);

    return { id: Number(item.id), status: 'PENDING', title: item.title };
  }

  async createFromLine(opts: {
    lineUserId: string;
    title: string;
    fileBuffer: Buffer;
    mimeType: string;
  }) {
    const { lineUserId, title, fileBuffer, mimeType } = opts;

    const lineUser = await this.prisma.lineUser.findUnique({
      where: { lineUserId },
      include: { user: true },
    });
    if (!lineUser?.user || !lineUser.organizationId) {
      this.logger.warn(`LINE user ${lineUserId} not linked or no org — skipping knowledge import`);
      return null;
    }

    const userId = Number(lineUser.user.id);
    const orgId = Number(lineUser.organizationId);

    const ext = mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/png' ? 'png' : 'jpg';
    const sourceType = mimeType === 'application/pdf' ? 'pdf' : 'image';

    const item = await this.prisma.userKnowledgeItem.create({
      data: {
        organizationId: BigInt(orgId),
        uploadedByUserId: BigInt(userId),
        title: title.trim(),
        sourceType,
        status: 'PENDING',
        mimeType,
      },
    });

    const objectPath = `knowledge/${orgId}/${item.id}.${ext}`;
    await this.storage.saveBuffer(objectPath, fileBuffer, mimeType);
    await this.prisma.userKnowledgeItem.update({
      where: { id: item.id },
      data: { storagePath: objectPath },
    });

    await this.aiQueue.add('knowledge.import.embed', {
      itemId: item.id.toString(),
    }, { attempts: 1, removeOnFail: true });

    this.logger.log(`LINE knowledge import #${item.id} created for org ${orgId}`);
    return { id: Number(item.id) };
  }

  async findAll(orgId: number) {
    const items = await this.prisma.userKnowledgeItem.findMany({
      where: { organizationId: BigInt(orgId) },
      include: {
        uploadedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return items.map((i) => ({
      id: Number(i.id),
      title: i.title,
      category: i.category,
      sourceType: i.sourceType,
      status: i.status,
      chunkCount: i.chunkCount,
      embeddedAt: i.embeddedAt,
      errorMessage: i.errorMessage ?? null,
      createdAt: i.createdAt,
      uploadedBy: { id: Number(i.uploadedBy.id), fullName: i.uploadedBy.fullName },
    }));
  }

  async retry(id: number, userOrgId: number) {
    const item = await this.prisma.userKnowledgeItem.findUnique({
      where: { id: BigInt(id) },
    });
    if (!item) throw new NotFoundException(`Knowledge item #${id} not found`);

    if (Number(item.organizationId) !== Number(userOrgId)) {
      throw new ForbiddenException('ไม่สามารถประมวลผลความรู้ขององค์กรอื่น');
    }

    await this.prisma.userKnowledgeItem.update({
      where: { id: BigInt(id) },
      data: { status: 'PENDING', chunkCount: 0, embeddedAt: null, errorMessage: null },
    });

    await this.aiQueue.add('knowledge.import.embed', {
      itemId: item.id.toString(),
    }, { attempts: 1, removeOnFail: true });

    this.logger.log(`Retrying knowledge import #${id}`);
    return { id: Number(item.id), status: 'PENDING' };
  }

  /** Auto-reset items stuck in PROCESSING for over 30 minutes (scoped to caller's org) */
  async resetStuckItems(userOrgId: number) {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const stuck = await this.prisma.userKnowledgeItem.findMany({
      where: {
        organizationId: BigInt(userOrgId),
        status: 'PROCESSING',
        updatedAt: { lt: thirtyMinAgo },
      },
    });

    for (const item of stuck) {
      await this.prisma.userKnowledgeItem.update({
        where: { id: item.id },
        data: { status: 'ERROR' },
      });
      this.logger.warn(`Auto-reset stuck knowledge import #${item.id} to ERROR`);
    }

    return stuck.length;
  }

  async delete(id: number, userOrgId: number) {
    const item = await this.prisma.userKnowledgeItem.findUnique({
      where: { id: BigInt(id) },
    });
    if (!item) throw new NotFoundException(`Knowledge item #${id} not found`);

    if (Number(item.organizationId) !== Number(userOrgId)) {
      throw new ForbiddenException('ไม่สามารถลบความรู้ขององค์กรอื่น');
    }

    // Delete vectors from Qdrant first
    if (item.chunkCount > 0) {
      await this.vectorStore.deleteByItemId(item.id).catch((e) =>
        this.logger.warn(`Qdrant cleanup on delete failed for item #${id}: ${e.message}`),
      );
    }

    // Delete file from MinIO if present
    if (item.storagePath) {
      await this.storage.deleteFile(item.storagePath).catch((e) =>
        this.logger.warn(`MinIO cleanup on delete failed for item #${id}: ${e.message}`),
      );
    }

    await this.prisma.userKnowledgeItem.delete({ where: { id: BigInt(id) } });
    this.logger.log(`Deleted knowledge item #${id} (org ${userOrgId})`);
    return { id };
  }

  async findOne(id: number, userOrgId?: number) {
    const item = await this.prisma.userKnowledgeItem.findUnique({
      where: { id: BigInt(id) },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });
    if (!item) throw new NotFoundException(`Knowledge item #${id} not found`);

    if (userOrgId !== undefined && Number(item.organizationId) !== Number(userOrgId)) {
      throw new ForbiddenException('ไม่สามารถเข้าถึงความรู้ขององค์กรอื่น');
    }

    return {
      id: Number(item.id),
      title: item.title,
      category: item.category,
      description: item.description,
      sourceType: item.sourceType,
      status: item.status,
      chunkCount: item.chunkCount,
      embeddedAt: item.embeddedAt,
      errorMessage: item.errorMessage ?? null,
      createdAt: item.createdAt,
      extractedText: item.extractedText ?? null,
      uploadedBy: { id: Number(item.uploadedBy.id), fullName: item.uploadedBy.fullName },
    };
  }

  /**
   * Fetch Qdrant chunks for an item — used by the inspection modal so users can
   * verify that OCR + chunking actually produced usable content.
   */
  async getChunks(id: number, userOrgId: number) {
    const item = await this.prisma.userKnowledgeItem.findUnique({
      where: { id: BigInt(id) },
    });
    if (!item) throw new NotFoundException(`Knowledge item #${id} not found`);
    if (Number(item.organizationId) !== Number(userOrgId)) {
      throw new ForbiddenException('ไม่สามารถเข้าถึงความรู้ขององค์กรอื่น');
    }

    const points = await this.vectorStore.listChunksByItemId(item.id, 500);
    const chunks = points
      .map((p) => ({
        id: p.id,
        chunkIndex: p.payload.chunkIndex ?? 0,
        sectionTitle: p.payload.sectionTitle ?? null,
        semanticLabel: p.payload.semanticLabel ?? null,
        breadcrumb: p.payload.breadcrumb ?? null,
        text: p.payload.text ?? '',
      }))
      .sort((a, b) => a.chunkIndex - b.chunkIndex);

    return {
      itemId: Number(item.id),
      storedChunkCount: item.chunkCount,
      qdrantChunkCount: chunks.length,
      extractedTextLength: item.extractedText?.length ?? 0,
      chunks,
    };
  }

  /**
   * ADMIN ONLY — reset knowledge RAG data for caller's org:
   * 1. Delete all Qdrant points belonging to this org's items
   * 2. Reset every item row (chunkCount=0, status=PENDING, embeddedAt=null)
   *
   * Does NOT delete DB rows or MinIO files — users can retry items afterwards.
   * For full-collection nuke use `adminResetQdrantCollection()` instead.
   */
  async adminResetOrgKnowledge(userOrgId: number) {
    // 1. Clear vectors in Qdrant (scoped by organizationId payload filter)
    await this.vectorStore.deleteKnowledgeByOrg(userOrgId).catch((e) =>
      this.logger.warn(`Qdrant org-scoped delete failed: ${e.message}`),
    );

    // 2. Reset DB rows so items can be re-embedded
    const result = await this.prisma.userKnowledgeItem.updateMany({
      where: { organizationId: BigInt(userOrgId) },
      data: { chunkCount: 0, embeddedAt: null, status: 'PENDING', errorMessage: null },
    });

    this.logger.warn(`[ADMIN] Reset org ${userOrgId} knowledge — ${result.count} items reset to PENDING`);
    return { itemsReset: result.count };
  }

  /**
   * ADMIN ONLY — drop & recreate the entire Qdrant `knowledge` collection (ALL orgs).
   * Use only for schema/embedding-model migrations. Resets every org's chunkCount to 0.
   */
  async adminResetQdrantCollection() {
    await this.vectorStore.resetKnowledgeCollection();

    const result = await this.prisma.userKnowledgeItem.updateMany({
      data: { chunkCount: 0, embeddedAt: null, status: 'PENDING', errorMessage: null },
    });

    this.logger.warn(`[ADMIN] Dropped & recreated knowledge collection — ${result.count} items reset`);
    return { itemsReset: result.count };
  }
}
