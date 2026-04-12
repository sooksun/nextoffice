import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'fs';
import { join } from 'path';

@Injectable()
export class HandoverService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: number) {
    const records = await this.prisma.handoverRecord.findMany({
      where: { organizationId: BigInt(organizationId) },
      include: {
        createdBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => ({
      id: Number(r.id),
      handoverNo: r.handoverNo,
      handoverDate: r.handoverDate,
      recipientOrg: r.recipientOrg,
      recipientName: r.recipientName,
      description: r.description,
      status: r.status,
      itemCount: r._count.items,
      createdByName: r.createdBy?.fullName,
      approvedByName: r.approvedBy?.fullName,
      approvedAt: r.approvedAt,
      completedAt: r.completedAt,
      createdAt: r.createdAt,
    }));
  }

  async findOne(id: number) {
    const record = await this.prisma.handoverRecord.findUnique({
      where: { id: BigInt(id) },
      include: {
        createdBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
        items: {
          include: {
            documentRegistry: {
              select: {
                id: true, registryNo: true, documentNo: true, subject: true,
                documentDate: true, fromOrg: true, retentionEndDate: true,
                folder: { select: { name: true, code: true } },
              },
            },
          },
        },
      },
    });
    if (!record) throw new NotFoundException(`Handover #${id} not found`);

    return {
      id: Number(record.id),
      handoverNo: record.handoverNo,
      handoverDate: record.handoverDate,
      recipientOrg: record.recipientOrg,
      recipientName: record.recipientName,
      description: record.description,
      status: record.status,
      remarks: record.remarks,
      createdByName: record.createdBy?.fullName,
      approvedByName: record.approvedBy?.fullName,
      approvedAt: record.approvedAt,
      completedAt: record.completedAt,
      items: record.items.map((item) => ({
        id: Number(item.id),
        registryId: Number(item.documentRegistryId),
        registryNo: item.documentRegistry.registryNo,
        documentNo: item.documentRegistry.documentNo,
        subject: item.documentRegistry.subject,
        documentDate: item.documentRegistry.documentDate,
        fromOrg: item.documentRegistry.fromOrg,
        retentionEndDate: item.documentRegistry.retentionEndDate,
        folderName: item.documentRegistry.folder?.name,
      })),
    };
  }

  async getEligibleDocuments(organizationId: number) {
    const docs = await this.prisma.documentRegistry.findMany({
      where: {
        organizationId: BigInt(organizationId),
        archivedAt: { not: null },
        retentionEndDate: { lte: new Date() },
      },
      select: {
        id: true, registryNo: true, documentNo: true, subject: true,
        documentDate: true, fromOrg: true, retentionEndDate: true,
        folder: { select: { name: true, code: true } },
      },
      orderBy: { retentionEndDate: 'asc' },
      take: 100,
    });

    return docs.map((d) => ({
      id: Number(d.id),
      registryNo: d.registryNo,
      documentNo: d.documentNo,
      subject: d.subject,
      documentDate: d.documentDate,
      fromOrg: d.fromOrg,
      retentionEndDate: d.retentionEndDate,
      folderName: d.folder?.name,
    }));
  }

  async create(organizationId: number, userId: number, dto: {
    recipientOrg: string;
    recipientName: string;
    description?: string;
    registryIds: number[];
  }) {
    if (!dto.registryIds?.length) throw new BadRequestException('กรุณาเลือกเอกสารอย่างน้อย 1 รายการ');

    const handoverNo = await this.getNextSequence(BigInt(organizationId), 'handover');

    const record = await this.prisma.handoverRecord.create({
      data: {
        organizationId: BigInt(organizationId),
        handoverNo,
        handoverDate: new Date(),
        recipientOrg: dto.recipientOrg,
        recipientName: dto.recipientName,
        description: dto.description || null,
        createdByUserId: BigInt(userId),
        items: {
          create: dto.registryIds.map((rid) => ({
            documentRegistryId: BigInt(rid),
          })),
        },
      },
    });

    return { id: Number(record.id), handoverNo: record.handoverNo };
  }

  async approve(id: number, userId: number) {
    const record = await this.prisma.handoverRecord.findUnique({ where: { id: BigInt(id) } });
    if (!record) throw new NotFoundException(`Handover #${id} not found`);
    if (record.status !== 'draft') throw new BadRequestException('สถานะไม่ถูกต้อง');

    const updated = await this.prisma.handoverRecord.update({
      where: { id: BigInt(id) },
      data: { status: 'approved', approvedByUserId: BigInt(userId), approvedAt: new Date() },
    });
    return { id: Number(updated.id), status: updated.status };
  }

  async complete(id: number) {
    const record = await this.prisma.handoverRecord.findUnique({ where: { id: BigInt(id) } });
    if (!record) throw new NotFoundException(`Handover #${id} not found`);
    if (record.status !== 'approved') throw new BadRequestException('ต้องอนุมัติก่อน');

    const updated = await this.prisma.handoverRecord.update({
      where: { id: BigInt(id) },
      data: { status: 'completed', completedAt: new Date() },
    });
    return { id: Number(updated.id), status: updated.status };
  }

  async generatePdf(id: number): Promise<Buffer> {
    const detail = await this.findOne(id);

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const fontPath = join(process.cwd(), 'stamps', 'fonts', 'Sarabun-Regular.ttf');
    const boldPath = join(process.cwd(), 'stamps', 'fonts', 'Sarabun-Bold.ttf');
    const font = await pdfDoc.embedFont(readFileSync(fontPath));
    const boldFont = await pdfDoc.embedFont(readFileSync(boldPath));

    const A4_W = 841.89; // landscape
    const A4_H = 595.28;
    const page = pdfDoc.addPage([A4_W, A4_H]);
    const black = rgb(0, 0, 0);
    const gray = rgb(0.5, 0.5, 0.5);

    let y = A4_H - 50;
    const draw = (text: string, x: number, yy: number, size = 12, f = font) => {
      page.drawText(text, { x, y: yy, size, font: f, color: black });
    };

    draw('บัญชีส่งมอบหนังสือครบ 20 ปี', A4_W / 2 - 100, y, 18, boldFont);
    y -= 30;
    draw(`เลขที่: ${detail.handoverNo}`, 50, y);
    draw(`วันที่: ${new Date(detail.handoverDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}`, 300, y);
    y -= 20;
    draw(`ผู้รับ: ${detail.recipientOrg}  (${detail.recipientName})`, 50, y);
    y -= 20;
    if (detail.description) {
      draw(`รายละเอียด: ${detail.description}`, 50, y);
      y -= 20;
    }
    y -= 10;

    // Table header
    const cols = [50, 90, 180, 280, 500, 630, 730];
    const headers = ['ลำดับ', 'ทะเบียนที่', 'เลขที่หนังสือ', 'เรื่อง', 'จาก', 'ลงวันที่', 'แฟ้ม'];
    const lineY = y - 2;
    page.drawLine({ start: { x: 45, y: lineY }, end: { x: A4_W - 40, y: lineY }, thickness: 0.5, color: black });
    y -= 16;
    headers.forEach((h, i) => draw(h, cols[i], y, 11, boldFont));
    y -= 4;
    page.drawLine({ start: { x: 45, y }, end: { x: A4_W - 40, y }, thickness: 0.5, color: black });

    // Table rows
    for (let i = 0; i < detail.items.length; i++) {
      y -= 18;
      if (y < 50) break; // page overflow guard
      const item = detail.items[i];
      draw(`${i + 1}`, cols[0] + 8, y, 10);
      draw(item.registryNo || '-', cols[1], y, 10);
      draw(item.documentNo || '-', cols[2], y, 10);
      draw((item.subject || '-').substring(0, 35), cols[3], y, 10);
      draw((item.fromOrg || '-').substring(0, 20), cols[4], y, 10);
      draw(item.documentDate ? new Date(item.documentDate).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-', cols[5], y, 10);
      draw(item.folderName || '-', cols[6], y, 10);
    }

    y -= 30;
    page.drawLine({ start: { x: 45, y }, end: { x: A4_W - 40, y }, thickness: 0.5, color: black });
    y -= 20;
    draw(`จำนวนทั้งหมด ${detail.items.length} รายการ`, 50, y, 11);

    y -= 50;
    draw('ผู้ส่งมอบ ............................................', 100, y);
    draw('ผู้รับมอบ ............................................', 500, y);
    y -= 18;
    draw(`(${detail.createdByName || '...'})`, 150, y, 10, font);
    draw(`(${detail.recipientName})`, 550, y, 10, font);

    if (detail.status !== 'draft') {
      y -= 40;
      draw(`อนุมัติโดย: ${detail.approvedByName || '-'}`, 50, y, 10, font);
      if (detail.approvedAt) {
        draw(`วันที่อนุมัติ: ${new Date(detail.approvedAt).toLocaleDateString('th-TH')}`, 300, y, 10, font);
      }
    }

    return Buffer.from(await pdfDoc.save());
  }

  private async getNextSequence(organizationId: bigint, counterType: string): Promise<string> {
    const buddhistYear = new Date().getFullYear() + 543;
    const counter = await this.prisma.registrationCounter.upsert({
      where: {
        organizationId_year_counterType: {
          organizationId,
          year: buddhistYear,
          counterType,
        },
      },
      create: { organizationId, year: buddhistYear, counterType, lastSeq: 1 },
      update: { lastSeq: { increment: 1 } },
    });
    return `${String(counter.lastSeq).padStart(3, '0')}/${buddhistYear}`;
  }
}
