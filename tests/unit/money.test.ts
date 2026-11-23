import { describe, expect, it } from 'vitest';
import { formatEur, parseEuros, priceLabel } from '@/domain/money';

const NBSP = ' ';

describe('formatEur', () => {
  it.each([
    [0, '0,00'],
    [990, '9,90'],
    [100, '1,00'],
    [123456, '1.234,56'],
    [12345678, '123.456,78'],
    [100000000, '1.000.000,00'],
  ])('%i céntimos → %s €', (cents, text) => {
    expect(formatEur(cents)).toBe(`${text}${NBSP}€`);
  });

  it('usa un espacio de no separación antes de €', () => {
    expect(formatEur(990)).not.toContain(' €');
    expect(formatEur(990).at(-2)).toBe(NBSP);
  });
});

describe('parseEuros', () => {
  it.each([
    ['39.90', 3990],
    ['5', 500],
    ['0.5', 50],
    ['12345.67', 1234567],
  ])('%s → %i céntimos', (text, cents) => {
    expect(parseEuros(text)).toBe(cents);
  });

  it.each(['1.234', '-1', '0', '0.00', '1.999', '', 'abc', '1,50', '123456'])('rechaza %j', (text) => {
    expect(parseEuros(text)).toBeNull();
  });
});

describe('priceLabel', () => {
  it('anuncia el precio anterior y el actual', () => {
    expect(priceLabel(990, 1200)).toBe(`Antes 12,00${NBSP}€, ahora 9,90${NBSP}€`);
  });
});
