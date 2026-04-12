import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';
import * as QRCode from 'qrcode';

@Injectable()
export class TrackingService {
  constructor(private readonly prisma: PrismaService) {}

  async generateTrackingCode(registryId: number, baseUrl: string): Promise<{ trackingCode: string; qrBuffer: Buffer }> {
    const registry = await this.prisma.documentRegistry.findUnique({
      where: { id: BigInt(registryId) },
    });
    if (!registry) throw new NotFoundException(`Registry #${registryId} not found`);

    let trackingCode = registry.trackingCode;
    if (!trackingCode) {
      trackingCode = randomUUID();
      await this.prisma.documentRegistry.update({
        where: { id: BigInt(registryId) },
        data: { trackingCode },
      });
    }

    const trackUrl = `${baseUrl}/track/${trackingCode}`;
    const qrBuffer = await QRCode.toBuffer(trackUrl, { type: 'png', width: 300, margin: 2 });
    return { trackingCode, qrBuffer };
  }

  async getQrCode(registryId: number, baseUrl: string): Promise<Buffer> {
    const registry = await this.prisma.documentRegistry.findUnique({
      where: { id: BigInt(registryId) },
    });
    if (!registry) throw new NotFoundException(`Registry #${registryId} not found`);
    if (!registry.trackingCode) throw new NotFoundException('ยังไม่ได้สร้าง QR Code');

    const trackUrl = `${baseUrl}/track/${registry.trackingCode}`;
    return QRCode.toBuffer(trackUrl, { type: 'png', width: 300, margin: 2 });
  }

  async publicLookup(trackingCode: string) {
    const registry = await this.prisma.documentRegistry.findFirst({
      where: { trackingCode },
      include: {
        organization: { select: { name: true } },
        folder: { select: { name: true, code: true } },
        inboundCase: {
          select: {
            id: true,
            status: true,
            activities: {
              select: { action: true, detail: true, createdAt: true },
              orderBy: { createdAt: 'asc' },
              take: 20,
            },
          },
        },
      },
    });
    if (!registry) throw new NotFoundException('ไม่พบข้อมูลเอกสาร');

    return {
      registryType: registry.registryType,
      registryNo: registry.registryNo,
      documentNo: registry.documentNo,
      documentDate: registry.documentDate,
      subject: registry.subject,
      fromOrg: registry.fromOrg,
      toOrg: registry.toOrg,
      urgencyLevel: registry.urgencyLevel,
      organizationName: registry.organization?.name,
      folder: registry.folder ? { name: registry.folder.name, code: registry.folder.code } : null,
      archivedAt: registry.archivedAt,
      createdAt: registry.createdAt,
      timeline: registry.inboundCase?.activities?.map((a) => ({
        action: a.action,
        detail: a.detail,
        date: a.createdAt,
      })) || [],
      caseStatus: registry.inboundCase?.status || null,
    };
  }
}
