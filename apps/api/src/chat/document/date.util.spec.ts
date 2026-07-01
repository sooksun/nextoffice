import {
  normalizeIsoDate,
  daysBetweenInclusive,
  bangkokTodayIso,
  toThaiDisplay,
  thaiWeekday,
  isValidTime,
} from './date.util';

describe('date.util', () => {
  describe('normalizeIsoDate', () => {
    it('keeps a valid CE ISO date', () => {
      expect(normalizeIsoDate('2026-07-05')).toBe('2026-07-05');
    });
    it('converts a BE year to CE', () => {
      expect(normalizeIsoDate('2569-07-05')).toBe('2026-07-05');
    });
    it('converts Thai digits + BE', () => {
      expect(normalizeIsoDate('๒๕๖๙-๐๗-๐๕')).toBe('2026-07-05');
    });
    it('parses DD/MM/YYYY (BE)', () => {
      expect(normalizeIsoDate('05/07/2569')).toBe('2026-07-05');
    });
    it('pads single-digit month/day', () => {
      expect(normalizeIsoDate('2026-7-5')).toBe('2026-07-05');
    });
    it('rejects an impossible calendar date', () => {
      expect(normalizeIsoDate('2026-02-31')).toBeNull();
    });
    it('rejects free text', () => {
      expect(normalizeIsoDate('พรุ่งนี้')).toBeNull();
    });
    it('returns null for empty/nullish', () => {
      expect(normalizeIsoDate('')).toBeNull();
      expect(normalizeIsoDate(null)).toBeNull();
      expect(normalizeIsoDate(undefined)).toBeNull();
    });
  });

  describe('daysBetweenInclusive', () => {
    it('counts inclusive range', () => {
      expect(daysBetweenInclusive('2026-07-05', '2026-07-07')).toBe(3);
    });
    it('single day = 1', () => {
      expect(daysBetweenInclusive('2026-07-05', '2026-07-05')).toBe(1);
    });
    it('clamps reversed range to 1', () => {
      expect(daysBetweenInclusive('2026-07-07', '2026-07-05')).toBe(1);
    });
  });

  describe('bangkokTodayIso', () => {
    it('rolls to next day in Asia/Bangkok (UTC+7)', () => {
      // 2026-07-19 20:00 UTC → 2026-07-20 03:00 Bangkok
      expect(bangkokTodayIso(new Date('2026-07-19T20:00:00Z'))).toBe('2026-07-20');
    });
    it('same civil day when well inside the day', () => {
      expect(bangkokTodayIso(new Date('2026-07-20T05:00:00Z'))).toBe('2026-07-20');
    });
  });

  describe('toThaiDisplay', () => {
    it('formats CE ISO as short Thai BE', () => {
      expect(toThaiDisplay('2026-07-05')).toBe('5 ก.ค. 2569');
    });
    it('empty for invalid', () => {
      expect(toThaiDisplay('nope')).toBe('');
    });
  });

  describe('thaiWeekday', () => {
    it('returns a weekday name for a valid date', () => {
      expect(thaiWeekday('2026-07-20')).not.toBe('');
    });
    it('empty for invalid', () => {
      expect(thaiWeekday('nope')).toBe('');
    });
  });

  describe('isValidTime', () => {
    it.each(['08:30', '00:00', '23:59'])('accepts %s', (t) => {
      expect(isValidTime(t)).toBe(true);
    });
    it.each(['8:30', '24:00', '23:60', '', null, undefined])('rejects %s', (t) => {
      expect(isValidTime(t as string)).toBe(false);
    });
  });
});
