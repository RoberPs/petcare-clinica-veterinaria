import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { adminAuditLog, customers } from '@/db/schema';
import { formatDateTime } from '@/domain/time';
import { errorCode } from '@/lib/account/common';
import { logger } from '@/lib/logger';
import { recordAdminAction } from './audit';

// npm run admin (F14, contracts/cli-and-content.md): list, grant y revoke del rol de administrador.
// El correo sale por la terminal (la ve el operador), nunca en los logs.

export const EXIT = { ok: 0, error: 1, usage: 2, notFound: 3 } as const;

const USAGE = [
  'Uso: npm run admin -- <orden>',
  '  list                               administradores actuales',
  '  grant <correo> --by "<quién>"      da el rol a una cuenta verificada',
  '  revoke <correo> --by "<quién>"     retira el rol',
].join('\n');

const emailSchema = z.string().trim().toLowerCase().email().max(254);

function option(args: string[], name: string): string | null {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const v = args[i + 1];
  return v && !v.startsWith('--') ? v.trim() : null;
}

export async function runAdminCli(argv: string[], out: (line: string) => void, now: Date = new Date()): Promise<number> {
  const [command, ...rest] = argv;
  try {
    if (command === 'list') return await list(out);
    if (command === 'grant' || command === 'revoke') {
      const email = emailSchema.safeParse(rest[0] ?? '');
      const by = option(rest, '--by');
      if (!email.success || !by || by.length > 120) {
        out(!email.success ? 'El correo no es válido.' : 'Falta --by "<quién>".');
        out(USAGE);
        return EXIT.usage;
      }
      return await setRole(command === 'grant', email.data, by, out, now);
    }
    out(USAGE);
    return EXIT.usage;
  } catch (error) {
    logger.error({ code: errorCode(error) }, 'admin_cli_failed');
    out('No se ha podido completar la orden.');
    return EXIT.error;
  }
}

async function list(out: (line: string) => void): Promise<number> {
  const db = getDb();
  const admins = await db
    .select({ id: customers.id, email: customers.email, firstName: customers.firstName, lastName: customers.lastName })
    .from(customers)
    .where(eq(customers.isAdmin, true))
    .orderBy(asc(customers.emailNormalized));
  if (admins.length === 0) {
    out('No hay administradores.');
    return EXIT.ok;
  }
  const grants = await db
    .select({ entityId: adminAuditLog.entityId, at: adminAuditLog.at })
    .from(adminAuditLog)
    .where(and(eq(adminAuditLog.action, 'role.grant'), inArray(adminAuditLog.entityId, admins.map((a) => a.id))))
    .orderBy(desc(adminAuditLog.at));
  const since = new Map<string, Date>();
  for (const g of grants) if (!since.has(g.entityId)) since.set(g.entityId, g.at);
  for (const a of admins) {
    const at = since.get(a.id);
    out(`${a.email} | ${a.firstName} ${a.lastName} | ${at ? `desde ${formatDateTime(at)}` : 'sin fecha'}`);
  }
  return EXIT.ok;
}

async function setRole(grant: boolean, emailNormalized: string, by: string, out: (line: string) => void, now: Date): Promise<number> {
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .select({ id: customers.id, isAdmin: customers.isAdmin, verified: customers.emailVerifiedAt })
      .from(customers)
      .where(eq(customers.emailNormalized, emailNormalized))
      .for('update')
      .limit(1);
    if (!row || (grant && !row.verified)) {
      out(row ? 'La cuenta no tiene el correo verificado.' : 'No existe ninguna cuenta con ese correo.');
      return EXIT.notFound;
    }
    if (row.isAdmin === grant) {
      out(grant ? 'La cuenta ya era administradora.' : 'La cuenta no era administradora.');
      return EXIT.ok;
    }
    await tx.update(customers).set({ isAdmin: grant, updatedAt: now }).where(eq(customers.id, row.id));
    await recordAdminAction(tx, {
      actorLabel: by,
      action: grant ? 'role.grant' : 'role.revoke',
      entityType: 'customer',
      entityId: row.id,
      changes: { isAdmin: { before: !grant, after: grant } },
    });
    logger.info({ admin_id: row.id, code: grant ? 'role_granted' : 'role_revoked' }, 'admin_role_changed');
    out(grant ? `Rol de administrador dado a ${emailNormalized}.` : `Rol de administrador retirado a ${emailNormalized}.`);
    return EXIT.ok;
  });
}
