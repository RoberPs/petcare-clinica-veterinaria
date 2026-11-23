import { asc, eq, inArray } from 'drizzle-orm';
import { getDb, type DbOrTx, type Tx } from '@/db/client';
import { loadStaffHours } from '@/db/queries/booking-config';
import { blockById, blocksForRange, type ScheduleBlockRecord } from '@/db/queries/schedule-blocks';
import { getSiteData } from '@/db/queries/site';
import { appointments, bookingServices, scheduleBlocks, teamMembers } from '@/db/schema';
import type { BlockDraft } from '@/domain/admin-schemas';
import { localDateTime } from '@/domain/availability';
import { blocksOverlapRange, type ScheduleBlock } from '@/domain/blocks';
import { countAffected, windowsResolver } from '@/domain/outside-schedule';
import { addDays, todayInClinic } from '@/domain/time';
import { getEmailContext } from '@/email/outbox';
import { errorCode } from '@/lib/account/common';
import { cancelAppointment } from '@/lib/booking/cancel';
import { withDayLocks } from '@/lib/booking/transaction';
import { logger } from '@/lib/logger';
import { recordAdminAction } from './audit';
import type { AdminActor } from './common';
import { futureAppointments, publishedClosures } from './hours';

// Bloqueos de agenda (US5, F8, F10). Revisar (GET) calcula las citas que quedarían fuera; guardar
// (POST) las vuelve a calcular dentro de la transacción y, si no coinciden con las revisadas, no
// guarda nada. Con "cancel_all" cancela cada una (actor admin, correo con la variante de la
// clínica) en la misma transacción, bajo el bloqueo por día de esas citas.

export interface AffectedAppointment {
  id: string;
  startsAt: Date;
  staffName: string;
  serviceName: string;
  petName: string;
}

const DRAFT_ID = '00000000-0000-4000-8000-000000000000';

function asBlock(draft: BlockDraft, id: string): ScheduleBlock {
  return { ...draft, id };
}

/** Último día (de la clínica) que toca un bloqueo. */
function lastDayOf(draft: BlockDraft): string {
  return draft.kind === 'once' ? localDateTime(new Date(draft.endsAt.getTime() - 1)).date : draft.untilDate;
}

/** Ids de las citas confirmadas y futuras que el bloqueo dejaría fuera de horario. */
async function affectedIds(draft: BlockDraft, editingId: string | null, now: Date, db: DbOrTx): Promise<string[]> {
  const today = todayInClinic(now);
  const until = addDays(lastDayOf(draft), 1);
  const block = asBlock(draft, editingId ?? DRAFT_ID);
  const candidates = (await futureAppointments(now, draft.teamMemberId, db)).filter((a) => blocksOverlapRange(block, a.startsAt, a.endsAt));
  if (candidates.length === 0) return [];
  const [site, staffHours, existing, closureRows] = await Promise.all([
    getSiteData(),
    loadStaffHours(db),
    blocksForRange(today, until < today ? addDays(today, 1) : until, db),
    publishedClosures(db),
  ]);
  const others = existing.filter((b) => b.id !== editingId);
  const base = { clinicHours: site.hours, staffHours, closures: closureRows };
  return countAffected(candidates, windowsResolver({ ...base, blocks: existing }), windowsResolver({ ...base, blocks: [...others, block] }), now).ids;
}

async function describeAppointments(ids: readonly string[], db: DbOrTx = getDb()): Promise<AffectedAppointment[]> {
  if (ids.length === 0) return [];
  return db
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      staffName: teamMembers.name,
      serviceName: bookingServices.name,
      petName: appointments.petName,
    })
    .from(appointments)
    .innerJoin(teamMembers, eq(teamMembers.id, appointments.teamMemberId))
    .innerJoin(bookingServices, eq(bookingServices.id, appointments.bookingServiceId))
    .where(inArray(appointments.id, [...ids]))
    .orderBy(asc(appointments.startsAt));
}

/** Paso de revisión (GET): citas que el bloqueo dejaría fuera de horario. */
export async function previewBlock(draft: BlockDraft, options: { now: Date; editingId?: string | null }): Promise<AffectedAppointment[]> {
  return describeAppointments(await affectedIds(draft, options.editingId ?? null, options.now, getDb()));
}

export type SaveBlockResult =
  | { status: 'ok'; blockId: string; startDate: string; cancelledCount: number; emailIds: string[] }
  | { status: 'affected_changed' }
  | { status: 'decision_required' }
  | { status: 'invalid'; fieldErrors: Record<string, string> }
  | { status: 'not_found' }
  | { status: 'error' };

export interface SaveBlockInput {
  /** Bloqueo que se edita; sin él, se crea con id = submission_id (idempotente). */
  id?: string | null;
  submissionId: string;
  draft: BlockDraft;
  decision?: 'keep' | 'cancel_all';
  /** Citas afectadas que se mostraron al revisar. */
  affectedIds: readonly string[];
}

function columns(draft: BlockDraft) {
  return draft.kind === 'once'
    ? { kind: 'once' as const, startsAt: draft.startsAt, endsAt: draft.endsAt, fromDate: null, untilDate: null, weekdays: null, startTime: null, endTime: null }
    : {
        kind: 'weekly' as const,
        startsAt: null,
        endsAt: null,
        fromDate: draft.fromDate,
        untilDate: draft.untilDate,
        weekdays: draft.weekdays,
        startTime: draft.startTime,
        endTime: draft.endTime,
      };
}

function auditView(b: BlockDraft | ScheduleBlockRecord) {
  return b.kind === 'once'
    ? { scope: b.teamMemberId ? 'staff' : 'clinic', teamMemberId: b.teamMemberId, kind: b.kind, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), reason: b.reason }
    : {
        scope: b.teamMemberId ? 'staff' : 'clinic',
        teamMemberId: b.teamMemberId,
        kind: b.kind,
        fromDate: b.fromDate,
        untilDate: b.untilDate,
        weekdays: b.weekdays,
        startTime: b.startTime.slice(0, 5),
        endTime: b.endTime.slice(0, 5),
        reason: b.reason,
      };
}

const sameBlock = (a: BlockDraft | ScheduleBlockRecord, b: BlockDraft) => JSON.stringify(auditView(a)) === JSON.stringify(auditView(b));

export const startDateOf = (draft: BlockDraft) => (draft.kind === 'once' ? localDateTime(draft.startsAt).date : draft.fromDate);

export async function saveBlock(
  admin: AdminActor,
  input: SaveBlockInput,
  options: { now: Date; onEmails?: (ids: string[]) => void | Promise<void> },
): Promise<SaveBlockResult> {
  const { now } = options;
  const { draft } = input;
  const blockId = input.id ?? input.submissionId;
  try {
    const db = getDb();
    if (draft.teamMemberId) {
      const [m] = await db.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.id, draft.teamMemberId)).limit(1);
      if (!m) return { status: 'invalid', fieldErrors: { staff_id: 'Ese veterinario ya no existe.' } };
    }
    // Bloqueos por día de las citas revisadas: nadie puede reservar ni mover en esos días a la vez.
    const reviewed = await db
      .select({ startsAt: appointments.startsAt })
      .from(appointments)
      .where(inArray(appointments.id, input.affectedIds.length ? [...input.affectedIds] : [DRAFT_ID]));
    const days = reviewed.map((r) => localDateTime(r.startsAt).date);
    const emailCtx = await getEmailContext();

    const result = await withDayLocks(db, days, async (tx: Tx): Promise<SaveBlockResult> => {
      const [current] = await tx.select().from(scheduleBlocks).where(eq(scheduleBlocks.id, blockId)).for('update').limit(1);
      const currentBlock = current ? await blockById(blockId, tx) : null;
      if (input.id && !currentBlock) return { status: 'not_found' };
      // Reenvío de lo ya guardado (FR-023): mismo resultado, sin repetir cancelaciones ni correos.
      if (currentBlock && sameBlock(currentBlock, draft)) {
        return { status: 'ok', blockId, startDate: startDateOf(draft), cancelledCount: 0, emailIds: [] };
      }
      const ids = await affectedIds(draft, input.id ?? null, now, tx);
      const reviewedIds = [...new Set(input.affectedIds)].sort();
      if (JSON.stringify(ids) !== JSON.stringify(reviewedIds)) return { status: 'affected_changed' };
      if (ids.length > 0 && !input.decision) return { status: 'decision_required' };

      const values = { teamMemberId: draft.teamMemberId, ...columns(draft), reason: draft.reason, updatedAt: now };
      if (currentBlock) await tx.update(scheduleBlocks).set(values).where(eq(scheduleBlocks.id, blockId));
      else await tx.insert(scheduleBlocks).values({ id: blockId, ...values, createdBy: admin.id, createdAt: now });

      const emailIds: string[] = [];
      let cancelledCount = 0;
      if (input.decision === 'cancel_all') {
        for (const id of ids) {
          const r = await cancelAppointment(tx, id, 'clinic', now, {
            enforceCutoff: false,
            cutoffHours: 0,
            emailCtx,
            eventActor: 'admin',
            adminId: admin.id,
            byClinic: true,
          });
          if (r.status === 'ok') {
            cancelledCount += 1;
            emailIds.push(...r.emailIds);
          }
        }
      }
      const after = auditView(draft);
      await recordAdminAction(tx, {
        actorId: admin.id,
        action: currentBlock ? 'block.update' : 'block.create',
        entityType: 'schedule_block',
        entityId: blockId,
        changes: {
          ...(currentBlock
            ? Object.fromEntries(
                Object.entries(after)
                  .filter(([k, v]) => JSON.stringify((auditView(currentBlock) as Record<string, unknown>)[k]) !== JSON.stringify(v))
                  .map(([k, v]) => [k, { before: (auditView(currentBlock) as Record<string, unknown>)[k] ?? null, after: v }]),
              )
            : after),
          ...(ids.length > 0 ? { decision: input.decision, cancelledCount } : {}),
        },
      });
      return { status: 'ok', blockId, startDate: startDateOf(draft), cancelledCount, emailIds };
    });
    if (result.status === 'slot_taken') return { status: 'affected_changed' };
    logger.info({ admin_id: admin.id, block_id: blockId, code: result.status }, 'admin_block_saved');
    if (result.status === 'ok' && result.emailIds.length > 0 && options.onEmails) await options.onEmails(result.emailIds);
    return result;
  } catch (error) {
    logger.error({ admin_id: admin.id, block_id: blockId, code: errorCode(error) }, 'admin_block_failed');
    return { status: 'error' };
  }
}

export async function deleteBlock(admin: AdminActor, id: string): Promise<{ status: 'ok' | 'not_found' | 'error' }> {
  try {
    return await getDb().transaction(async (tx) => {
      const block = await blockById(id, tx);
      if (!block) return { status: 'not_found' as const };
      await tx.delete(scheduleBlocks).where(eq(scheduleBlocks.id, id));
      await recordAdminAction(tx, { actorId: admin.id, action: 'block.delete', entityType: 'schedule_block', entityId: id, changes: auditView(block) });
      logger.info({ admin_id: admin.id, block_id: id, code: 'deleted' }, 'admin_block_deleted');
      return { status: 'ok' as const };
    });
  } catch (error) {
    logger.error({ admin_id: admin.id, block_id: id, code: errorCode(error) }, 'admin_block_delete_failed');
    return { status: 'error' };
  }
}
