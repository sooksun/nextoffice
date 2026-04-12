import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'fs';
import { join } from 'path';

@Injectable()
export class DispatchService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: number, status?: string) {
    const where: any = { organizationId: BigInt(organizationId) };
    if (status) where.status = status;

    const items = await this.prisma.dispatchEntry.findMany({
      where,
      include: {
        registry: { select: { subject: true, documentNo: true, registryNo: true } },
        sentBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return items.map((d) => ({
      id: Number(d.id),
      dispatchNo: d.dispatchNo,
      dispatchDate: d.dispatchDate,
      recipientOrg: d.recipientOrg,
      recipientName: d.recipientName,
      deliveryMethod: d.deliveryMethod,
      status: d.status,
      receivedBy: d.receivedBy,
      receivedAt: d.receivedAt,
      remarks: d.remarks,
      registrySubject: d.registry?.subject,
      registryDocNo: d.registry?.documentNo,
      sentByName: d.sentBy?.fullName,
      createdAt: d.createdAt,
    }));
  }

  async create(organizationId: number, userId: number, dto: {
    registryId: number;
    recipientOrg: string;
    recipientName?: string;
    deliveryMethod: string;
    remarks?: string;
  }) {
    const registry = await this.prisma.documentRegistry.findUnique({
      where: { id: BigInt(dto.registryId) },
    });
    if (!registry || Number(registry.organizationId) !== organizationId) {
      throw new NotFoundException('ไม่พบทะเบียนเอกสาร');
    }

    const dispatchNo = await this.getNextSequence(BigInt(organizationId), 'dispatch');

    const entry = await this.prisma.dispatchEntry.create({
      data: {
        organizationId: BigInt(organizationId),
        dispatchNo,
        dispatchDate: new Date(),
        registryId: BigInt(dto.registryId),
        recipientOrg: dto.recipientOrg,
        recipientName: dto.recipientName || null,
        deliveryMethod: dto.deliveryMethod,
        sentByUserId: BigInt(userId),
        remarks: dto.remarks || null,
      },
    });

    return { id: Number(entry.id), dispatchNo: entry.dispatchNo };
  }

  async markDelivered(id: number, receivedBy: string) {
    const entry = await this.prisma.dispatchEntry.findUnique({ where: { id: BigInt(id) } });
    if (!entry) throw new NotFoundException(`Dispatch #${id} not found`);

    const updated = await this.prisma.dispatchEntry.update({
      where: { id: BigInt(id) },
      data: { status: 'delivered', receivedBy, receivedAt: new Date() },
    });

    return { id: Number(updated.id), status: updated.status };
  }

  async generateReceiptPdf(id: number): Promise<Buffer> {
    const entry = await this.prisma.dispatchEntry.findUnique({
      where: { id: BigInt(id) },
      include: {
        registry: { select: { subject: true, documentNo: true, registryNo: true, fromOrg: true } },
        sentBy: { select: { fullName: true } },
        organization: { select: { name: true } },
      },
    });
    if (!entry) throw new NotFoundException(`Dispatch #${id} not found`);

    const doc = PDFDocument.create();
    (await doc).registerFontkit(fontkit);
    const pdfDoc = await doc;
    const fontPath = join(process.cwd(), 'stamps', 'fonts', 'Sarabun-Regular.ttf');
    const fontBytes = readFileSync(fontPath);
    const font = await pdfDoc.embedFont(fontBytes);
    const boldPath = join(process.cwd(), 'stamps', 'fonts', 'Sarabun-Bold.ttf');
    const boldBytes = readFileSync(boldPath);
    const boldFont = await pdfDoc.embedFont(boldBytes);

    const A4_W = 595.28;
    const A4_H = 841.89;
    const page = pdfDoc.addPage([A4_W, A4_H]);
    const black = rgb(0, 0, 0);

    let y = A4_H - 60;
    const drawText = (text: string, x: number, yPos: number, size = 14, f = font) => {
      page.drawText(text, { x, y: yPos, size, font: f, color: black });
    };

    drawText('ใบรับหนังสือ', A4_W / 2 - 50, y, 20, boldFont);
    y -= 40;
    drawText(`เลขที่ส่ง: ${entry.dispatchNo}`, 72, y);
    y -= 24;
    drawText(`วันที่ส่ง: ${entry.dispatchDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}`, 72, y);
    y -= 24;
    drawText(`หน่วยงานผู้ส่ง: ${entry.organization?.name || '-'}`, 72, y);
    y -= 24;
    drawText(`ผู้ส่ง: ${entry.sentBy?.fullName || '-'}`, 72, y);
    y -= 24;
    drawText(`วิธีการส่ง: ${entry.deliveryMethod}`, 72, y);
    y -= 36;

    drawText('รายละเอียดเอกสาร', 72, y, 16, boldFont);
    y -= 24;
    drawText(`เลขที่หนังสือ: ${entry.registry?.documentNo || '-'}`, 72, y);
    y -= 24;
    drawText(`เรื่อง: ${entry.registry?.subject || '-'}`, 72, y);
    y -= 24;
    drawText(`จาก: ${entry.registry?.fromOrg || '-'}`, 72, y);
    y -= 24;
    drawText(`ถึง: ${entry.recipientOrg}`, 72, y);
    y -= 48;

    drawText('ผู้รับ: ............................................', 72, y);
    y -= 24;
    drawText('วันที่รับ: ............................................', 72, y);
    y -= 24;
    drawText('ลงชื่อ: ............................................', 72, y);

    if (entry.remarks) {
      y -= 36;
      drawText(`หมายเหตุ: ${entry.remarks}`, 72, y, 12);
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
