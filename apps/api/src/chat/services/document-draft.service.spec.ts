import { BadRequestException } from '@nestjs/common';
import { DocumentDraftService, AutoFillContext } from './document-draft.service';
import { ExtractedFields } from './document-intent.service';

function fields(p: Partial<ExtractedFields> = {}): ExtractedFields {
  return {
    leaveType: null,
    startDate: null,
    endDate: null,
    reason: null,
    contactPhone: null,
    contactAddress: null,
    travelDate: null,
    destination: null,
    purpose: null,
    departureTime: null,
    returnTime: null,
    returnSameDay: null,
    ...p,
  };
}

function makeCtx(over: Partial<AutoFillContext> = {}): AutoFillContext {
  return {
    userId: 5,
    organizationId: 3,
    fullName: 'ครูเอ',
    positionTitle: 'ครูชำนาญการ',
    phone: '0812345678',
    org: {
      name: 'ร.ร.บ้านพญาไพร',
      address: '123 ม.1 ต.แม่จัน',
      province: 'เชียงราย',
      district: 'แม่จัน',
      phone: '053-111222',
    },
    ...over,
  };
}

const NOW = new Date('2026-07-20T05:00:00Z'); // Bangkok today = 2026-07-20

describe('DocumentDraftService', () => {
  let leaveCreate: jest.Mock;
  let getBalance: jest.Mock;
  let travelCreate: jest.Mock;
  let service: DocumentDraftService;

  beforeEach(() => {
    leaveCreate = jest.fn(async (_u: number, _o: number, data: any) => ({ id: 1, ...data }));
    getBalance = jest.fn(async () => []);
    travelCreate = jest.fn(async (_u: number, _o: number, data: any) => ({ id: 2, ...data }));
    service = new DocumentDraftService(
      { create: leaveCreate, getBalance } as any,
      { create: travelCreate } as any,
    );
  });

  // ─── Leave ──────────────────────────────────────────────────────────

  it('builds a complete leave draft with system autofill', async () => {
    const res = await service.build(
      'leave',
      fields({ leaveType: 'sick', startDate: '2026-07-05', endDate: '2026-07-07', reason: 'มีไข้' }),
      makeCtx(),
      NOW,
    );

    expect(res.missingFields).toHaveLength(0);
    const payload = leaveCreate.mock.calls[0][2];
    expect(payload.leaveType).toBe('sick');
    expect(payload.startDate).toBe('2026-07-05');
    expect(payload.endDate).toBe('2026-07-07');
    expect(payload.totalDays).toBe(3);
    // autofill จากระบบ
    expect(payload.positionTitle).toBe('ครูชำนาญการ');
    expect(payload.contactPhone).toBe('0812345678');
    expect(payload.contactAddress).toBe('123 ม.1 ต.แม่จัน');
    expect(res.draftId).toBe(1);
    expect(res.formUrl).toBe('/leave/new?draftId=1');
  });

  it('flags missing leaveType and stores empty placeholder', async () => {
    const res = await service.build(
      'leave',
      fields({ leaveType: null, startDate: '2026-07-05', endDate: '2026-07-05' }),
      makeCtx(),
      NOW,
    );
    expect(res.missingFields.map((m) => m.key)).toContain('leaveType');
    expect(leaveCreate.mock.calls[0][2].leaveType).toBe('');
  });

  it('user-stated contact info overrides system autofill (E8)', async () => {
    await service.build(
      'leave',
      fields({ leaveType: 'sick', startDate: '2026-07-05', endDate: '2026-07-05', contactPhone: '0899999999' }),
      makeCtx(),
      NOW,
    );
    expect(leaveCreate.mock.calls[0][2].contactPhone).toBe('0899999999');
  });

  // Regression: bug 1 — endDate ต้องไม่ถูกทิ้งเมื่อ startDate ขาด (เทียบกับ placeholder today)
  it('preserves a user-given endDate when startDate is missing', async () => {
    const res = await service.build(
      'leave',
      fields({ leaveType: 'sick', startDate: null, endDate: '2026-07-05' }),
      makeCtx(),
      NOW,
    );
    const missingKeys = res.missingFields.map((m) => m.key);
    expect(missingKeys).toContain('startDate');
    expect(missingKeys).not.toContain('endDate'); // ไม่ false-positive
    const payload = leaveCreate.mock.calls[0][2];
    expect(payload.startDate).toBe('2026-07-20'); // placeholder today
    expect(payload.endDate).toBe('2026-07-05'); // ค่าผู้ใช้ถูกเก็บไว้ ไม่ถูก clamp
  });

  // Regression: bug (review round 2) — formUrl ต้องพา missing field keys ไปด้วย
  // เพื่อให้หน้าฟอร์มรู้ว่าต้อง "ไม่" prefill ฟิลด์ placeholder (เช่น วันที่ = วันนี้)
  it('encodes missing field keys into formUrl so the form can skip prefilling them', async () => {
    const res = await service.build(
      'leave',
      fields({ leaveType: null, startDate: null }),
      makeCtx(),
      NOW,
    );
    expect(res.formUrl).toBe(`/leave/new?draftId=${res.draftId}&missing=leaveType,startDate`);
  });

  it('formUrl has no missing param when the draft is complete', async () => {
    const res = await service.build(
      'leave',
      fields({ leaveType: 'sick', startDate: '2026-07-05', endDate: '2026-07-05' }),
      makeCtx(),
      NOW,
    );
    expect(res.formUrl).toBe(`/leave/new?draftId=${res.draftId}`);
  });

  it('warns when leave balance is insufficient (E5)', async () => {
    getBalance.mockResolvedValueOnce([
      { leaveType: 'sick', label: 'ลาป่วย', totalAllowed: 60, totalUsed: 59, remaining: 1 },
    ]);
    const res = await service.build(
      'leave',
      fields({ leaveType: 'sick', startDate: '2026-07-05', endDate: '2026-07-07' }),
      makeCtx(),
      NOW,
    );
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.warnings[0]).toContain('ไม่เพียงพอ');
  });

  // ─── Travel ─────────────────────────────────────────────────────────

  it('flags missing purpose/destination with empty placeholders', async () => {
    const res = await service.build(
      'travel',
      fields({ travelDate: '2026-07-10', destination: null, purpose: null }),
      makeCtx(),
      NOW,
    );
    const keys = res.missingFields.map((m) => m.key);
    expect(keys).toEqual(expect.arrayContaining(['destination', 'purpose']));
    const payload = travelCreate.mock.calls[0][2];
    expect(payload.destination).toBe('');
    expect(payload.purpose).toBe('');
  });

  // Regression: bug 2 — returnSameDay=false ต้องถูกส่งลง DB และสะท้อนใน summary
  it('threads returnSameDay=false (overnight) through to create + summary', async () => {
    const res = await service.build(
      'travel',
      fields({ travelDate: '2026-07-10', destination: 'สพป.', purpose: 'ประชุม', returnSameDay: false }),
      makeCtx(),
      NOW,
    );
    expect(travelCreate.mock.calls[0][2].returnSameDay).toBe(false);
    const rsd = res.filledFields.find((f) => f.key === 'returnSameDay');
    expect(rsd?.value).toBe('ค้างคืน');
  });

  // ─── Guards ─────────────────────────────────────────────────────────

  it('rejects when the user has no organization', async () => {
    await expect(
      service.build('leave', fields({ leaveType: 'sick' }), makeCtx({ organizationId: null }), NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(leaveCreate).not.toHaveBeenCalled();
  });
});
