import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteSession } from '@/db/queries/sessions';
import { hashToken, lookupSession, startSession } from '@/lib/auth/session';
import { createCustomer, q, resetAccountState, setupTestDb, teardownTestDb } from './helpers/db';

// Vigencia de las sesiones (US2, A2).

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const t0 = new Date('2026-11-11T09:00:00Z');
const at = (ms: number) => new Date(t0.getTime() + ms);

describe('sesiones (US2)', () => {
  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await resetAccountState();
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  it('sin "Recordarme" caduca tras 2 h sin actividad', async () => {
    const c = await createCustomer();
    const { token } = await startSession(c.id, false, t0);
    expect(await lookupSession(token, at(119 * MIN))).toMatchObject({ id: c.id, remember: false });
    // La actividad a los 119 minutos renueva la ventana de inactividad.
    expect(await lookupSession(token, at(119 * MIN + 2 * HOUR - MIN))).not.toBeNull();
    const other = await startSession(c.id, false, t0);
    expect(await lookupSession(other.token, at(2 * HOUR))).toBeNull();
    // Una sesión caducada se borra.
    expect(await q('SELECT token_hash FROM customer_sessions WHERE token_hash = $1', [other.tokenHash])).toEqual([]);
  });

  it('sin "Recordarme" tiene un tope de 12 h aunque haya actividad', async () => {
    const c = await createCustomer();
    const { token } = await startSession(c.id, false, t0);
    for (let h = 1; h < 12; h++) expect(await lookupSession(token, at(h * HOUR))).not.toBeNull();
    expect(await lookupSession(token, at(12 * HOUR))).toBeNull();
  });

  it('con "Recordarme" dura 30 días y la inactividad no la cierra', async () => {
    const c = await createCustomer();
    const { token } = await startSession(c.id, true, t0);
    expect(await lookupSession(token, at(29 * DAY))).toMatchObject({ remember: true });
    expect(await lookupSession(token, at(30 * DAY))).toBeNull();
  });

  it('last_seen_at no se reescribe antes de un minuto', async () => {
    const c = await createCustomer();
    const { token, tokenHash } = await startSession(c.id, false, t0);
    const seen = async () => new Date((await q('SELECT last_seen_at FROM customer_sessions WHERE token_hash = $1', [tokenHash]))[0]!.last_seen_at).getTime();
    await lookupSession(token, at(30_000));
    expect(await seen()).toBe(t0.getTime());
    await lookupSession(token, at(MIN));
    expect(await seen()).toBe(at(MIN).getTime());
  });

  it('cerrar sesión borra la fila y el token deja de valer', async () => {
    const c = await createCustomer();
    const { token } = await startSession(c.id, false, t0);
    await deleteSession(hashToken(token));
    expect(await lookupSession(token, at(MIN))).toBeNull();
  });

  it('nunca devuelve el hash de la contraseña y rechaza tokens absurdos', async () => {
    const c = await createCustomer();
    const { token } = await startSession(c.id, false, t0);
    const s = await lookupSession(token, at(MIN));
    expect(s).not.toHaveProperty('passwordHash');
    expect(await lookupSession('x'.repeat(500), at(MIN))).toBeNull();
    expect(await lookupSession('', at(MIN))).toBeNull();
  });

  it('una cuenta sin verificar no tiene sesión aunque exista la fila', async () => {
    const c = await createCustomer({ verified: false });
    const { token } = await startSession(c.id, false, t0);
    expect(await lookupSession(token, at(MIN))).toBeNull();
  });
});
