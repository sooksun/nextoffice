import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OutboundService } from './outbound.service';
import { OutboundPdfRenderer } from './outbound-pdf.renderer';

describe('OutboundService document rendering', () => {
  let prisma: any;
  let templates: any;
  let storage: any;
  let pdfRenderer: { render: jest.Mock };
  let service: OutboundService;

  const outboundDoc = {
    id: BigInt(7),
    organizationId: BigInt(3),
    letterType: 'external_letter',
    documentNo: 'SCH 0007/2569',
    documentDate: new Date('2026-03-15T00:00:00.000Z'),
    subject: 'เรื่อง ขออนุมัติ',
    bodyText: 'ทดสอบการสร้างเอกสารส่งออก',
    recipientName: 'เรียน ผู้อำนวยการ',
    recipientOrg: 'ถึง สำนักงานเขต',
    organization: {
      name: 'โรงเรียนทดสอบ',
      address: '1 ถนนทดสอบ',
      phone: '02-000-0000',
      orgCode: 'SCH',
    },
    approvedBy: {
      fullName: 'สมชาย ทดสอบ',
      positionTitle: 'ผู้อำนวยการ',
    },
    createdBy: {
      fullName: 'สมหญิง ทดสอบ',
      positionTitle: 'เจ้าหน้าที่',
    },
    relatedInboundCase: null,
  };

  beforeEach(() => {
    prisma = {
      outboundDocument: {
        findUnique: jest.fn().mockResolvedValue(outboundDoc),
        update: jest.fn().mockResolvedValue(outboundDoc),
      },
    };
    templates = {
      generateKrut: jest.fn().mockResolvedValue(Buffer.from('PK fake docx')),
      generateMemo: jest.fn().mockResolvedValue(Buffer.from('PK memo')),
      generateStampLetter: jest.fn().mockResolvedValue(Buffer.from('PK stamp')),
      generateDirective: jest.fn().mockResolvedValue(Buffer.from('PK order')),
      generatePublicRelation: jest.fn().mockResolvedValue(Buffer.from('PK ann')),
    };
    storage = {
      saveBuffer: jest.fn().mockResolvedValue(undefined),
    };
    pdfRenderer = {
      render: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 fake')),
    };
    service = new OutboundService(
      prisma,
      {} as any,
      { add: jest.fn() } as any,
      undefined as any,
      storage,
      templates,
      {} as any,
      undefined as any,
      undefined as any,
      pdfRenderer as unknown as OutboundPdfRenderer,
    );
  });

  it('generates DOCX without saving it as the outbound PDF storage path', async () => {
    const result = await service.generateDocx(7, 3);

    expect(result.toString()).toBe('PK fake docx');
    expect(templates.generateKrut).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'ขออนุมัติ',
        recipient: 'ผู้อำนวยการ',
        documentNo: 'SCH 0007/2569',
      }),
    );
    expect(storage.saveBuffer).not.toHaveBeenCalled();
    expect(prisma.outboundDocument.update).not.toHaveBeenCalled();
    expect(pdfRenderer.render).not.toHaveBeenCalled();
  });

  it('generates PDF via renderer and stores with PDF content type', async () => {
    const result = await service.generatePdf(7, 3);

    expect(result.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(templates.generateKrut).not.toHaveBeenCalled();
    expect(pdfRenderer.render).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'ขออนุมัติ',
        recipientStamp: 'สำนักงานเขต',
        recipientDisplay: 'ผู้อำนวยการ',
        letterType: 'external_letter',
      }),
    );
    expect(storage.saveBuffer).toHaveBeenCalledWith(
      'outbound/3/7.pdf',
      expect.any(Buffer),
      'application/pdf',
    );
    expect(prisma.outboundDocument.update).toHaveBeenCalledWith({
      where: { id: BigInt(7) },
      data: { storagePath: 'outbound/3/7.pdf' },
    });
  });

  it('rejects cross-org render', async () => {
    await expect(service.generateDocx(7, 99)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.generatePdf(7, 99)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects missing document', async () => {
    prisma.outboundDocument.findUnique.mockResolvedValue(null);
    await expect(service.generateDocx(7, 3)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('dispatches stamp_letter to stamp template with org-preferring recipient', async () => {
    prisma.outboundDocument.findUnique.mockResolvedValue({
      ...outboundDoc,
      letterType: 'stamp_letter',
    });

    await service.generateDocx(7, 3);

    expect(templates.generateStampLetter).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: 'สำนักงานเขต',
      }),
    );
  });
});
