import {
  formatThaiDate,
  getOutboundSigner,
  stripFieldPrefix,
  toOutboundRenderModel,
  OutboundRenderSource,
} from './outbound-render.model';

function baseDoc(overrides: Partial<OutboundRenderSource> = {}): OutboundRenderSource {
  return {
    id: BigInt(7),
    organizationId: BigInt(3),
    letterType: 'external_letter',
    documentNo: 'SCH 0007/2569',
    documentDate: new Date('2026-03-15T00:00:00.000Z'),
    subject: 'เรื่อง ขออนุมัติ',
    bodyText: 'เนื้อหา',
    recipientName: 'เรียน ผู้อำนวยการ',
    recipientOrg: 'ถึง สำนักงานเขต',
    organization: {
      name: 'โรงเรียนทดสอบ',
      address: '1 ถนน',
      phone: '02-000',
      orgCode: 'SCH',
    },
    approvedBy: { fullName: 'สมชาย ผอ.', positionTitle: 'ผู้อำนวยการ' },
    createdBy: { fullName: 'สมหญิง เจ้าหน้าที่', positionTitle: 'เจ้าหน้าที่' },
    relatedInboundCase: null,
    ...overrides,
  };
}

describe('outbound-render.model', () => {
  it('strips Thai field prefixes', () => {
    expect(stripFieldPrefix('เรื่อง ขออนุมัติ', 'เรื่อง')).toBe('ขออนุมัติ');
    expect(stripFieldPrefix('เรียน ผู้อำนวยการ', '(?:เรียน|ถึง)')).toBe('ผู้อำนวยการ');
    expect(stripFieldPrefix('ถึง สำนักงานเขต', 'ถึง')).toBe('สำนักงานเขต');
  });

  it('prefers assignee as signer for internal_memo', () => {
    const doc = baseDoc({
      letterType: 'internal_memo',
      relatedInboundCase: {
        assignedTo: { fullName: 'ผู้รับมอบ', positionTitle: 'ครู' },
      },
    });
    expect(getOutboundSigner(doc)?.fullName).toBe('ผู้รับมอบ');
  });

  it('uses approvedBy for external letters', () => {
    const doc = baseDoc({ letterType: 'external_letter' });
    expect(getOutboundSigner(doc)?.fullName).toBe('สมชาย ผอ.');
  });

  it('builds one model: stamp prefers org, display prefers name, date from documentDate', () => {
    const model = toOutboundRenderModel(baseDoc());
    expect(model.subject).toBe('ขออนุมัติ');
    expect(model.subjectDisplay).toBe('ขออนุมัติ');
    expect(model.recipientName).toBe('ผู้อำนวยการ');
    expect(model.recipientStamp).toBe('สำนักงานเขต');
    expect(model.recipientDisplay).toBe('ผู้อำนวยการ');
    expect(model.dateStr).toContain('2569');
    expect(formatThaiDate(new Date('2026-01-01'))).toMatch(/2569|2026/);
  });
});
