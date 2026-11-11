import { hash } from '@node-rs/argon2';
import { describe, expect, it } from 'vitest';
import { hashPassword, needsRehash, verifyAgainstDummy, verifyPassword } from '@/lib/auth/password';

describe('hash de contraseñas (A1)', () => {
  it('genera un PHC de Argon2id con los parámetros de OWASP y una sal distinta cada vez', async () => {
    const a = await hashPassword('caballo bateria grapa');
    const b = await hashPassword('caballo bateria grapa');
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('caballo');
  });

  it('verifica la contraseña correcta y rechaza la incorrecta', async () => {
    const stored = await hashPassword('caballo bateria grapa');
    expect(await verifyPassword(stored, 'caballo bateria grapa')).toEqual({ ok: true, needsRehash: false });
    expect(await verifyPassword(stored, 'caballo bateria grap')).toEqual({ ok: false, needsRehash: false });
  });

  it('pide rehacer el hash si los parámetros guardados son más bajos', async () => {
    const weak = await hash('caballo bateria grapa', { algorithm: 2, memoryCost: 8192, timeCost: 1, parallelism: 1 });
    expect(needsRehash(weak)).toBe(true);
    expect(await verifyPassword(weak, 'caballo bateria grapa')).toEqual({ ok: true, needsRehash: true });
    expect(needsRehash(await hashPassword('x'))).toBe(false);
  });

  it('un hash corrupto cuenta como contraseña incorrecta', async () => {
    expect(await verifyPassword('no-es-un-hash', 'algo')).toEqual({ ok: false, needsRehash: false });
  });

  it('el hash ficticio siempre falla', async () => {
    expect(await verifyAgainstDummy('cualquier-cosa')).toBe(false);
    expect(await verifyAgainstDummy()).toBe(false);
  });
});
