import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DownloadService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(f: any) {
    return {
      ...f,
      id: Number(f.id),
      organizationId: Number(f.organizationId),
      uploadedByUserId: Number(f.uploadedByUserId),
      fileSize: f.fileSize ? Number(f.fileSize) : null,
      uploadedBy: f.uploadedBy ? { ...f.uploadedBy, id: Number(f.uploadedBy.id) } : null,
    };
  }

  async findAll(orgId: bigint, query: { category?: string; search?: string }) {
    const { category, search } = query;
    const where: any = { organizationId: orgId };
    if (category) where.category = category;
    if (search) where.title = { contains: search };

    const [total, data] = await Promise.all([
      this.prisma.downloadFile.count({ where }),
      this.prisma.downloadFile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { uploadedBy: { select: { id: true, fullName: true } } },
      }),
    ]);
    return { total, data: data.map(this.serialize) };
  }

  async create(orgId: bigint, userId: bigint, body: {
    title: string;
    description?: string;
    category?: string;
    fileUrl: string;
    fileName: string;
    fileSize?: number;
    mimeType?: string;
  }) {
    const f = await this.prisma.downloadFile.create({
      data: {
        organizationId: orgId,
        uploadedByUserId: userId,
        title: body.title,
        description: body.description,
        category: body.category ?? 'general',
        fileUrl: body.fileUrl,
        fileName: body.fileName,
        fileSize: body.fileSize ? BigInt(body.fileSize) : null,
        mimeType: body.mimeType,
      },
    });
    return this.serialize(f);
  }

  async incrementDownload(id: bigint) {
    await this.prisma.downloadFile.update({
      where: { id },
      data: { downloadCount: { increment: 1 } },
    });
  }

  async delete(id: bigint, orgId: bigint) {
    const f = await this.prisma.downloadFile.findFirst({ where: { id, organizationId: orgId } });
    if (!f) throw new NotFoundException(`DownloadFile #${id} not found`);
    await this.prisma.downloadFile.delete({ where: { id } });
    return { success: true };
  }
}
