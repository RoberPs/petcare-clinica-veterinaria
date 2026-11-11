import { describe, expect, it } from 'vitest';
import { checkPassword, PASSWORD_MAX, PASSWORD_MESSAGES } from '@/domain/password-policy';

describe('política de contraseñas (A7)', () => {
  it('acepta una contraseña larga y poco común, sin reglas de composición', () => {
    expect(checkPassword('caballo bateria grapa', 'ana@example.test')).toBe('ok');
    expect(checkPassword('solominusculasaqui', 'ana@example.test')).toBe('ok');
  });

  it('exige entre 10 y 128 caracteres, contando caracteres reales', () => {
    expect(checkPassword('corta1234', 'ana@example.test')).toBe('too_short');
    expect(checkPassword('x'.repeat(10), 'ana@example.test')).toBe('ok');
    expect(checkPassword('🐶'.repeat(9), 'ana@example.test')).toBe('too_short');
    expect(checkPassword('y'.repeat(PASSWORD_MAX), 'ana@example.test')).toBe('ok');
    expect(checkPassword('y'.repeat(PASSWORD_MAX + 1), 'ana@example.test')).toBe('too_long');
  });

  it('rechaza las contraseñas comunes sin distinguir mayúsculas', () => {
    expect(checkPassword('1234567890', 'ana@example.test')).toBe('common');
    expect(checkPassword('QwertyUiop', 'ana@example.test')).toBe('common');
  });

  it('rechaza la que contiene la parte local del correo', () => {
    expect(checkPassword('mi-anagarcia-2026', 'AnaGarcia@example.test')).toBe('contains_email');
    // Una parte local muy corta no se busca.
    expect(checkPassword('banana-split-2026', 'an@example.test')).toBe('ok');
  });

  it('tiene un mensaje en español para cada fallo', () => {
    expect(PASSWORD_MESSAGES.too_short).toBe('Usa al menos 10 caracteres.');
    expect(PASSWORD_MESSAGES.common).toBe('Esa contraseña es muy común; elige otra.');
  });
});
