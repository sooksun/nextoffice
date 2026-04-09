import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { FileStorageService } from '../intake/services/file-storage.service';
import { QUEUE_AI_PROCESSING } from '../queue/queue.constants';

@Injectable()
export class KnowledgeImportService {
  private readonly logger = new Logger(KnowledgeImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    @InjectQueue(QUEUE_AI_PROCESSING) private readonly aiQueue: Queue,
  ) {}

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

    // Dispatch embedding job
    await this.aiQueue.add('knowledge.import.embed', {
      itemId: item.id.toString(),
    });

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
    });

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
      createdAt: i.createdAt,
      uploadedBy: { id: Number(i.uploadedBy.id), fullName: i.uploadedBy.fullName },
    }));
  }

  async findOne(id: number) {
    const item = await this.prisma.userKnowledgeItem.findUnique({
      where: { id: BigInt(id) },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });
    if (!item) throw new NotFoundException(`Knowledge item #${id} not found`);
    return {
      id: Number(item.id),
      title: item.title,
      category: item.category,
      description: item.description,
      sourceType: item.sourceType,
      status: item.status,
      chunkCount: item.chunkCount,
      embeddedAt: item.embeddedAt,
      createdAt: item.createdAt,
      uploadedBy: { id: Number(item.uploadedBy.id), fullName: item.uploadedBy.fullName },
    };
  }
}
