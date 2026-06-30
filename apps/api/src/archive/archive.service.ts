import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ArchiveService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Folders ───────────────────────────────

  async listFolders(organizationId: number) {
    const folders = await this.prisma.documentFolder.findMany({
      where: { organizationId: BigInt(organizationId) },
      include: { _count: { select: { registries: true } } },
      orderBy: { code: 'asc' },
    });
    return folders.map((f) => ({
      id: Number(f.id),
      organizationId: Number(f.organizationId),
      parentId: f.parentId ? Number(f.parentId) : null,
      name: f.name,
      code: f.code,
      retentionYears: f.retentionYears,
      description: f.description,
      documentCount: f._count.registries,
      createdAt: f.createdAt,
    }));
  }

  async createFolder(organizationId: number, dto: {
    name: string;
    code: string;
    parentId?: number;
    retentionYears?: number;
    description?: string;
  }) {
    const folder = await this.prisma.documentFolder.create({
      data: {
        organizationId: BigInt(organizationId),
        name: dto.name,
        code: dto.code,
        parentId: dto.parentId ? BigInt(dto.parentId) : undefined,
        retentionYears: dto.retentionYears ?? 10,
        description: dto.description,
      },
    });
    return { id: Number(folder.id), code: folder.code };
  }

  // ─── Archive Documents ─────────────────────

  async archiveDocument(registryId: number, folderId: number, organizationId: number) {
    const folder = await this.prisma.documentFolder.findFirst({
      where: { id: BigInt(folderId), organizationId: BigInt(organizationId) },
    });
    if (!folder) throw new NotFoundException('Folder not found');

    const registry = await this.prisma.documentRegistry.findFirst({
      where: { id: BigInt(registryId), organizationId: BigInt(organizationId) },
      select: { id: true },
    });
    if (!registry) throw new NotFoundException('Document not found');

    const retentionEndDate = new Date();
    retentionEndDate.setFullYear(retentionEndDate.getFullYear() + folder.retentionYears);

    const updated = await this.prisma.documentRegistry.update({
      where: { id: BigInt(registryId) },
      data: {
        folderId: BigInt(folderId),
        archivedAt: new Date(),
        retentionEndDate,
      },
    });
    return {
      id: Number(updated.id),
      folderId: Number(folderId),
      retentionEndDate,
    };
  }

  async listArchivedDocuments(organizationId: number, folderId?: number) {
    const where: any = {
      organizationId: BigInt(organizationId),
      archivedAt: { not: null },
    };
    if (folderId) where.folderId = BigInt(folderId);

    const docs = await this.prisma.documentRegistry.findMany({
      where,
      include: {
        folder: { select: { name: true, code: true } },
        inboundCase: { select: { id: true, title: true } },
        outboundDoc: { select: { id: true, subject: true } },
      },
      orderBy: { archivedAt: 'desc' },
    });
    return docs.map((d) => ({
      id: Number(d.id),
      registryType: d.registryType,
      registryNo: d.registryNo,
      documentNo: d.documentNo,
      subject: d.subject,
      archivedAt: d.archivedAt,
      retentionEndDate: d.retentionEndDate,
      folder: d.folder ? { name: d.folder.name, code: d.folder.code } : null,
      inboundCase: d.inboundCase ? { id: Number(d.inboundCase.id), title: d.inboundCase.title } : null,
      outboundDoc: d.outboundDoc ? { id: Number(d.outboundDoc.id), subject: d.outboundDoc.subject } : null,
    }));
  }

  async getExpiringDocuments(organizationId: number, daysAhead: number = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + daysAhead);

    return this.prisma.documentRegistry.findMany({
      where: {
        organizationId: BigInt(organizationId),
        retentionEndDate: { lte: cutoff, not: null },
        archivedAt: { not: null },
      },
      include: { folder: { select: { name: true } } },
      orderBy: { retentionEndDate: 'asc' },
    });
  }

  /**
   * Move an archived document into a 20-year retention account:
   *   keep_self → บัญชีหนังสือครบ ๒๐ ปีที่ขอเก็บเอง (แบบ ๒๒)
   *   deposit   → บัญชีฝากหนังสือ (แบบ ๒๓)
   *   archive   → revert back to the ordinary stored register (แบบ ๒๐)
   */
  async setDisposition(
    registryId: number,
    disposition: 'keep_self' | 'deposit' | 'archive',
    organizationId: number,
    remarks?: string,
  ) {
    const registry = await this.prisma.documentRegistry.findFirst({
      where: { id: BigInt(registryId), organizationId: BigInt(organizationId) },
      select: { id: true, archivedAt: true, registryType: true },
    });
    if (!registry) throw new NotFoundException('Document not found');
    if (!registry.archivedAt) {
      throw new BadRequestException('เอกสารยังไม่ได้จัดเก็บเข้าแฟ้ม จึงยังกำหนดการจัดเก็บครบ ๒๐ ปีไม่ได้');
    }

    const updated = await this.prisma.documentRegistry.update({
      where: { id: BigInt(registryId) },
      data: {
        registryType: disposition,
        remarks: remarks ?? undefined,
      },
    });
    return { id: Number(updated.id), registryType: updated.registryType };
  }

  // ─── Destruction Workflow ──────────────────

  async createDestructionRequest(organizationId: number, userId: number, registryIds: number[]) {
    const request = await this.prisma.destructionRequest.create({
      data: {
        organizationId: BigInt(organizationId),
        requestedByUserId: BigInt(userId),
        items: {
          create: registryIds.map((rid) => ({
            documentRegistryId: BigInt(rid),
          })),
        },
      },
      include: { _count: { select: { items: true } } },
    });
    return { id: Number(request.id), itemCount: request._count.items, status: request.status };
  }

  async listDestructionRequests(organizationId: number) {
    const requests = await this.prisma.destructionRequest.findMany({
      where: { organizationId: BigInt(organizationId) },
      include: {
        requestedBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return requests.map((r) => ({
      id: Number(r.id),
      status: r.status,
      requestedBy: r.requestedBy.fullName,
      approvedBy: r.approvedBy?.fullName ?? null,
      approvedAt: r.approvedAt,
      destroyedAt: r.destroyedAt,
      itemCount: r._count.items,
      remarks: r.remarks,
      createdAt: r.createdAt,
    }));
  }

  async approveDestruction(requestId: number, approvedByUserId: number, organizationId: number) {
    const request = await this.prisma.destructionRequest.findFirst({
      where: { id: BigInt(requestId), organizationId: BigInt(organizationId) },
      select: { id: true },
    });
    if (!request) throw new NotFoundException('Request not found');

    const updated = await this.prisma.destructionRequest.update({
      where: { id: BigInt(requestId) },
      data: {
        status: 'approved',
        approvedByUserId: BigInt(approvedByUserId),
        approvedAt: new Date(),
      },
    });
    return { id: Number(updated.id), status: 'approved' };
  }

  async confirmDestruction(requestId: number, organizationId: number, remarks?: string) {
    const request = await this.prisma.destructionRequest.findFirst({
      where: { id: BigInt(requestId), organizationId: BigInt(organizationId) },
      include: { items: true },
    });
    if (!request) throw new NotFoundException('Request not found');

    // Update registry entries to destroy type — scoped to the request's organization
    const registryIds = request.items.map((item) => item.documentRegistryId);
    if (registryIds.length) {
      await this.prisma.documentRegistry.updateMany({
        where: { id: { in: registryIds }, organizationId: BigInt(organizationId) },
        data: { registryType: 'destroy' },
      });
    }

    const updated = await this.prisma.destructionRequest.update({
      where: { id: BigInt(requestId) },
      data: {
        status: 'destroyed',
        destroyedAt: new Date(),
        remarks: remarks ?? request.remarks,
      },
    });
    return { id: Number(updated.id), status: 'destroyed', destroyedCount: request.items.length };
  }
}
