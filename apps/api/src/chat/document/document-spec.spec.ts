import {
  canonicalLeaveType,
  looksLikeDocumentRequest,
  isSupportedDocType,
} from './document-spec';

describe('document-spec', () => {
  describe('canonicalLeaveType', () => {
    it('passes through canonical values', () => {
      expect(canonicalLeaveType('sick')).toBe('sick');
      expect(canonicalLeaveType('PERSONAL')).toBe('personal');
    });
    it.each([
      ['ลาป่วย', 'sick'],
      ['ป่วย', 'sick'],
      ['ลากิจ', 'personal'],
      ['ธุระส่วนตัว', 'personal'],
      ['ลาพักผ่อน', 'vacation'],
      ['ลาคลอด', 'maternity'],
      ['ลาบวช', 'ordination'],
      ['อุปสมบท', 'ordination'],
      ['ลาศึกษาต่อ', 'training'],
      ['อบรม', 'training'],
    ])('maps Thai synonym %s → %s', (input, expected) => {
      expect(canonicalLeaveType(input)).toBe(expected);
    });
    it('returns null for unknown / empty', () => {
      expect(canonicalLeaveType('xyz')).toBeNull();
      expect(canonicalLeaveType('')).toBeNull();
      expect(canonicalLeaveType(null)).toBeNull();
      expect(canonicalLeaveType(123)).toBeNull();
    });
  });

  describe('looksLikeDocumentRequest (keyword gate)', () => {
    it.each([
      'ขอลาป่วย 2 วัน เริ่มพรุ่งนี้',
      'อยากลากิจวันจันทร์',
      'ขอไปราชการที่ สพป. วันที่ 10',
      'ทำใบลาให้หน่อย',
    ])('triggers on "%s"', (msg) => {
      expect(looksLikeDocumentRequest(msg)).toBe(true);
    });
    it.each([
      'หนังสือราชการมีกี่ประเภท',
      'วันนี้อากาศเป็นอย่างไร',
      'สรุปเอกสารเข้าล่าสุด',
      'สวัสดีครับ',
    ])('does not trigger on "%s"', (msg) => {
      expect(looksLikeDocumentRequest(msg)).toBe(false);
    });
  });

  describe('isSupportedDocType', () => {
    it('accepts leave/travel', () => {
      expect(isSupportedDocType('leave')).toBe(true);
      expect(isSupportedDocType('travel')).toBe(true);
    });
    it('rejects everything else', () => {
      expect(isSupportedDocType('other')).toBe(false);
      expect(isSupportedDocType(null)).toBe(false);
      expect(isSupportedDocType('memo')).toBe(false);
    });
  });
});
