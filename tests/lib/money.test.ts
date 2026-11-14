import { describe, it, expect } from 'vitest';
import { add, subtract, multiply, format, equals } from '@/lib/money/decimal';
import { Prisma } from '@prisma/client';

describe('Money Decimal Math', () => {
  it('prevents floating-point errors in addition', () => {
    // Classic JS error: 0.1 + 0.2 = 0.30000000000000004
    const result = add(0.1, 0.2);
    expect(result.toNumber()).toBe(0.3);
    expect(equals(result, 0.3)).toBe(true);
  });

  it('handles large amounts correctly', () => {
    const result = add(1234567.89, 9876543.21);
    expect(format(result)).toBe('11,111,111.10');
  });

  it('prevents rounding errors in subtraction', () => {
    const result = subtract(1.0, 0.9);
    expect(result.toNumber()).toBe(0.1);
  });

  it('handles multiplication correctly', () => {
    const result = multiply(100, 0.15);
    expect(result.toNumber()).toBe(15);
  });

  it('formats with thousands separators', () => {
    expect(format(1234.56)).toBe('1,234.56');
    expect(format(1000000)).toBe('1,000,000.00');
    expect(format(0.5)).toBe('0.50');
  });

  it('works with Prisma.Decimal inputs', () => {
    const a = new Prisma.Decimal('1234.56');
    const b = new Prisma.Decimal('789.01');
    const result = add(a, b);
    expect(result.toNumber()).toBe(2023.57);
  });
});
