import { Prisma } from '@prisma/client';

/**
 * Safe decimal math operations for money calculations.
 * Prevents floating-point errors that occur with Number arithmetic.
 * 
 * Usage:
 *   const total = add(amount1, amount2);
 *   const balance = subtract(total, payment);
 *   const display = format(total); // "1,234.56"
 */

type DecimalInput = Prisma.Decimal | number | string;

function toDecimal(value: DecimalInput): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return value;
  return new Prisma.Decimal(value.toString());
}

export function add(a: DecimalInput, b: DecimalInput): Prisma.Decimal {
  return toDecimal(a).add(toDecimal(b));
}

export function subtract(a: DecimalInput, b: DecimalInput): Prisma.Decimal {
  return toDecimal(a).sub(toDecimal(b));
}

export function multiply(a: DecimalInput, b: DecimalInput): Prisma.Decimal {
  return toDecimal(a).mul(toDecimal(b));
}

export function divide(a: DecimalInput, b: DecimalInput): Prisma.Decimal {
  return toDecimal(a).div(toDecimal(b));
}

export function equals(a: DecimalInput, b: DecimalInput): boolean {
  return toDecimal(a).equals(toDecimal(b));
}

export function greaterThan(a: DecimalInput, b: DecimalInput): boolean {
  return toDecimal(a).gt(toDecimal(b));
}

export function lessThan(a: DecimalInput, b: DecimalInput): boolean {
  return toDecimal(a).lt(toDecimal(b));
}

export function greaterThanOrEqual(a: DecimalInput, b: DecimalInput): boolean {
  return toDecimal(a).gte(toDecimal(b));
}

export function lessThanOrEqual(a: DecimalInput, b: DecimalInput): boolean {
  return toDecimal(a).lte(toDecimal(b));
}

export function isZero(value: DecimalInput): boolean {
  return toDecimal(value).isZero();
}

export function isNegative(value: DecimalInput): boolean {
  return toDecimal(value).isNegative();
}

export function abs(value: DecimalInput): Prisma.Decimal {
  return toDecimal(value).abs();
}

/**
 * Format a decimal as a display string with thousands separators.
 * Example: 1234.56 → "1,234.56"
 */
export function format(value: DecimalInput): string {
  const decimal = toDecimal(value);
  const [integer = '0', fraction = '00'] = decimal.toFixed(2).split('.');
  const withCommas = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${withCommas}.${fraction}`;
}

/**
 * Convert to a plain number for JSON serialization.
 * WARNING: Only use for display/API responses, never for further calculations.
 */
export function toNumber(value: DecimalInput): number {
  return toDecimal(value).toNumber();
}

/**
 * Convert to minor units (cents) for integer storage or API compatibility.
 * Example: 1234.56 → 123456
 */
export function toMinorUnits(value: DecimalInput): number {
  return Math.round(toDecimal(value).mul(100).toNumber());
}

/**
 * Create a Decimal from minor units (cents).
 * Example: 123456 → 1234.56
 */
export function fromMinorUnits(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents).div(100);
}