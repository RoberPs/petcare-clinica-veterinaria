import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXIT, runAdminCli } from '@/lib/admin/cli';
import { logger } from '@/lib/logger';
import { createCustomer, q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// npm run admin (F14, contracts/cli-and-content.md): grant, revoke y list con sus códigos de salida.

async function run(...args: string[]): Promise<{ code: number; text: string }> {
  const lines: string[] = [];
  const code = await runAdminCli(args, (l) => lines.push(l), new Date());
  return { code, text: lines.join('\n') };
}

describe('npm run admin', () => {
  const logged: unknown[] = [];
  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await truncateAll();
    logged.length = 0;
    for (const level of ['info', 'warn', 'error'] as const) {
      vi.spyOn(logger, level).mockImplementation(((...args: unknown[]) => {
        logged.push(args);
      }) as never);
    }
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  it('grant da el rol, escribe el log de auditoría con actor_label y no pone el correo en los logs', async () => {
    const c = await createCustomer({ email: 'recepcion@example.test' });
    const r = await run('grant', 'Recepcion@Example.test', '--by', 'Operador');
    expect(r.code).toBe(EXIT.ok);
    expect(r.text).toContain('recepcion@example.test');
    expect(await q('SELECT is_admin FROM customers WHERE id = $1', [c.id])).toEqual([{ is_admin: true }]);
    const audit = await q('SELECT action, entity_type, entity_id, actor_id, actor_label, changes FROM admin_audit_log');
    expect(audit).toEqual([
      {
        action: 'role.grant',
        entity_type: 'customer',
        entity_id: c.id,
        actor_id: null,
        actor_label: 'Operador',
        changes: { isAdmin: { before: false, after: true } },
      },
    ]);
    expect(JSON.stringify(logged)).not.toContain('recepcion@example.test');
    // Repetir no hace nada (código 0, sin otra fila).
    expect((await run('grant', 'recepcion@example.test', '--by', 'Operador')).code).toBe(EXIT.ok);
    expect(await q('SELECT count(*)::int AS n FROM admin_audit_log')).toEqual([{ n: 1 }]);
  });

  it('list muestra los administradores; revoke retira el rol', async () => {
    await createCustomer({ email: 'a@example.test' });
    await run('grant', 'a@example.test', '--by', 'Operador');
    const list = await run('list');
    expect(list.code).toBe(EXIT.ok);
    expect(list.text).toMatch(/^a@example\.test \| Cliente De Pruebas \| desde /);
    const r = await run('revoke', 'a@example.test', '--by', 'Operador');
    expect(r.code).toBe(EXIT.ok);
    expect(await q("SELECT action FROM admin_audit_log ORDER BY at")).toEqual([{ action: 'role.grant' }, { action: 'role.revoke' }]);
    expect((await run('list')).text).toBe('No hay administradores.');
  });

  it('código 2 sin --by, con un correo no válido o con una orden desconocida', async () => {
    await createCustomer({ email: 'a@example.test' });
    expect((await run('grant', 'a@example.test')).code).toBe(EXIT.usage);
    expect((await run('grant', 'no-es-correo', '--by', 'X')).code).toBe(EXIT.usage);
    expect((await run('borrar')).code).toBe(EXIT.usage);
    expect((await run()).code).toBe(EXIT.usage);
    expect(await q('SELECT count(*)::int AS n FROM admin_audit_log')).toEqual([{ n: 0 }]);
  });

  it('código 3 si la cuenta no existe o no está verificada', async () => {
    await createCustomer({ email: 'sin-verificar@example.test', verified: false });
    expect((await run('grant', 'nadie@example.test', '--by', 'X')).code).toBe(EXIT.notFound);
    expect((await run('grant', 'sin-verificar@example.test', '--by', 'X')).code).toBe(EXIT.notFound);
    expect(await q('SELECT count(*)::int AS n FROM customers WHERE is_admin')).toEqual([{ n: 0 }]);
  });
});
