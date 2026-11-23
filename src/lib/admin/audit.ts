import { z } from 'zod';
import type { DbOrTx } from '@/db/client';
import { adminAuditLog } from '@/db/schema';

// Registro de acciones del panel y de la CLI (F13). `changes` guarda solo campos de configuración
// (antes y después), nunca datos de clientes: las claves fuera de la lista se rechazan.

export const ADMIN_AUDIT_ACTIONS = [
  'service.create',
  'service.update',
  'staff.create',
  'staff.update',
  'staff.hours',
  'block.create',
  'block.update',
  'block.delete',
  'role.grant',
  'role.revoke',
] as const;

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

/** Campos de configuración que pueden aparecer en `changes`. */
export const AUDIT_CHANGE_KEYS = [
  // Servicios
  'name',
  'durationMinutes',
  'published',
  'position',
  'staffIds',
  // Veterinarios
  'bookable',
  'bookingPosition',
  'serviceIds',
  // Horario
  'hours',
  // Bloqueos
  'scope',
  'teamMemberId',
  'kind',
  'startsAt',
  'endsAt',
  'fromDate',
  'untilDate',
  'weekdays',
  'startTime',
  'endTime',
  'reason',
  'decision',
  'cancelledCount',
  // Rol
  'isAdmin',
] as const;

const actionSchema = z.enum(ADMIN_AUDIT_ACTIONS);
const changeKeys = new Set<string>(AUDIT_CHANGE_KEYS);

export interface AdminAuditEntry {
  actorId?: string | null;
  actorLabel?: string | null;
  action: AdminAuditAction;
  entityType: 'booking_service' | 'team_member' | 'schedule_block' | 'customer';
  entityId: string;
  /** { campo: { before, after } } o { campo: valor }. */
  changes: Record<string, unknown>;
}

export class AuditValidationError extends Error {}

export async function recordAdminAction(tx: DbOrTx, entry: AdminAuditEntry): Promise<void> {
  const action = actionSchema.safeParse(entry.action);
  if (!action.success) throw new AuditValidationError('invalid_audit_action');
  if (!entry.actorId && !entry.actorLabel) throw new AuditValidationError('missing_audit_actor');
  for (const key of Object.keys(entry.changes)) {
    if (!changeKeys.has(key)) throw new AuditValidationError(`invalid_audit_change_key:${key}`);
  }
  await tx.insert(adminAuditLog).values({
    actorId: entry.actorId ?? null,
    actorLabel: entry.actorLabel ?? null,
    action: action.data,
    entityType: entry.entityType,
    entityId: entry.entityId,
    changes: entry.changes,
  });
}

/** Solo los campos que cambian, como { campo: { before, after } }. */
export function diffChanges<T extends Record<string, unknown>>(before: Partial<T> | null, after: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(after)) {
    const prev = before?.[k];
    if (JSON.stringify(prev) !== JSON.stringify(v)) out[k] = before ? { before: prev ?? null, after: v } : v;
  }
  return out;
}
