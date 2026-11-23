import { describe, expect, it } from 'vitest';
import { centimesToDzd, formatMoney, parseAmountToCentimes, percent } from '@/lib/money';

describe('money parsing', () => {
  it('parses plain integer amounts', () => {
    expect(parseAmountToCentimes('2500')).toBe(250000);
  });

  it('parses French/Arabic grouped amounts with comma decimals', () => {
    expect(parseAmountToCentimes('8 450,00')).toBe(845000);
    expect(parseAmountToCentimes('8.450,00')).toBe(845000);
    expect(parseAmountToCentimes('1,234.56')).toBe(123456);
  });

  it('parses Arabic-Indic digits', () => {
    expect(parseAmountToCentimes('٢٥٠٠')).toBe(250000);
  });

  it('rejects ambiguous or invalid input', () => {
    expect(parseAmountToCentimes('')).toBeNull();
    expect(parseAmountToCentimes('abc')).toBeNull();
    expect(parseAmountToCentimes('0')).toBeNull();
    expect(parseAmountToCentimes('-12')).toBeNull();
    expect(parseAmountToCentimes('12,3456')).toBeNull();
  });

  it('never loses precision through floating point for whole dinars', () => {
    for (const dzd of [1, 8450, 999999]) {
      const centimes = parseAmountToCentimes(String(dzd));
      expect(centimes).toBe(dzd * 100);
      expect(centimesToDzd(centimes as number)).toBe(dzd);
    }
  });
});

describe('money formatting', () => {
  it('formats with the requested currency label', () => {
    expect(formatMoney(845000, 'fr', 'DA')).toContain('8');
    expect(formatMoney(845000, 'ar', 'دج')).toContain('دج');
  });

  it('formats without decimals for whole amounts', () => {
    expect(formatMoney(250000, 'fr', 'DA')).not.toContain(',00');
  });
});

describe('percentage', () => {
  it('clamps between 0 and 100', () => {
    expect(percent(0, 100)).toBe(0);
    expect(percent(50, 100)).toBe(50);
    expect(percent(200, 100)).toBe(100);
    expect(percent(10, 0)).toBe(0);
  });
});
