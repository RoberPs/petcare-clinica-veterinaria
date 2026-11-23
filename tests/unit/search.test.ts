import { describe, expect, it } from 'vitest';
import { escapeLike, normalizeSearch } from '@/domain/search';

describe('normalizeSearch', () => {
  it('quita tildes y mayúsculas', () => {
    expect(normalizeSearch('Champú')).toBe('champu');
    expect(normalizeSearch('ÁÉÍÓÚ Ü')).toBe('aeiou u');
  });

  it('convierte la ñ en n (nombre y término se normalizan igual)', () => {
    expect(normalizeSearch('Año ÑU')).toBe('ano nu');
  });

  it('recorta y colapsa los espacios', () => {
    expect(normalizeSearch('  pienso   para\tgato  ')).toBe('pienso para gato');
    expect(normalizeSearch('   ')).toBe('');
  });
});

describe('escapeLike', () => {
  it('escapa %, _ y \\', () => {
    expect(escapeLike('50%_a\\b')).toBe('50\\%\\_a\\\\b');
  });

  it('deja igual un texto sin comodines', () => {
    expect(escapeLike('champu')).toBe('champu');
  });
});
