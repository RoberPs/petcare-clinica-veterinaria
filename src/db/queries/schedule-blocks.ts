import { and, asc, eq, gt, gte, lt, lte, or, sql } from 'drizzle-orm';
import { dayBounds } from '@/domain/availability';
import type { ScheduleBlock } from '@/domain/blocks';
import { getDb, type DbOrTx } from '../client';
import { scheduleBlocks } from '../schema';

// Bloqueos de agenda (F8). Los `once` se buscan por rango de instantes y los `weekly` por fechas
// (y, para un día, por su día ISO de la semana). La expansión la hace src/domain/blocks.ts.

export type ScheduleBlockRow = typeof scheduleBlocks.$inferSelect;

export type ScheduleBlockRecord = ScheduleBlock & { createdAt: Date; updatedAt: Date };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toScheduleBlock(r: ScheduleBlockRow): ScheduleBlockRecord {
  const base = { id: r.id, teamMemberId: r.teamMemberId, reason: r.reason, createdAt: r.createdAt, updatedAt: r.updatedAt };
  if (r.kind === 'once') return { ...base, kind: 'once', startsAt: r.startsAt!, endsAt: r.endsAt! };
  return {
    ...base,
    kind: 'weekly',
    fromDate: r.fromDate!,
    untilDate: r.untilDate!,
    weekdays: [...(r.weekdays ?? [])].sort((a, b) => a - b),
    startTime: r.startTime!.slice(0, 5),
    endTime: r.endTime!.slice(0, 5),
  };
}

/** Bloqueos que tocan el día "AAAA-MM-DD" de la clínica. */
export async function blocksForDay(dayIso: string, db: DbOrTx = getDb()): Promise<ScheduleBlockRecord[]> {
  const { start, end } = dayBounds(dayIso);
  const rows = await db
    .select()
    .from(scheduleBlocks)
    .where(
      or(
        and(eq(scheduleBlocks.kind, 'once'), lt(scheduleBlocks.startsAt, end), gt(scheduleBlocks.endsAt, start)),
        and(
          eq(scheduleBlocks.kind, 'weekly'),
          lte(scheduleBlocks.fromDate, dayIso),
          gte(scheduleBlocks.untilDate, dayIso),
          sql`extract(isodow from ${dayIso}::date)::smallint = any(${scheduleBlocks.weekdays})`,
        ),
      ),
    );
  return rows.map(toScheduleBlock);
}

/** Bloqueos que tocan los días [fromIso, toIso) de la clínica (`toIso` excluido). */
export async function blocksForRange(fromIso: string, toIso: string, db: DbOrTx = getDb()): Promise<ScheduleBlockRecord[]> {
  const start = dayBounds(fromIso).start;
  const end = dayBounds(toIso).start;
  const rows = await db
    .select()
    .from(scheduleBlocks)
    .where(
      or(
        and(eq(scheduleBlocks.kind, 'once'), lt(scheduleBlocks.startsAt, end), gt(scheduleBlocks.endsAt, start)),
        and(eq(scheduleBlocks.kind, 'weekly'), lt(scheduleBlocks.fromDate, toIso), gte(scheduleBlocks.untilDate, fromIso)),
      ),
    );
  return rows.map(toScheduleBlock);
}

export async function blockById(id: string, db: DbOrTx = getDb()): Promise<ScheduleBlockRecord | null> {
  if (!UUID_RE.test(id)) return null;
  const [row] = await db.select().from(scheduleBlocks).where(eq(scheduleBlocks.id, id)).limit(1);
  return row ? toScheduleBlock(row) : null;
}

/**
 * Bloqueos vigentes y futuros (los `once` que no han terminado y los `weekly` hasta hoy o después),
 * o los pasados con `past`. Ordenados por inicio.
 */
export async function listBlocks(
  options: { past: boolean; now: Date; todayIso: string },
  db: DbOrTx = getDb(),
): Promise<ScheduleBlockRecord[]> {
  const { past, now, todayIso } = options;
  const rows = await db
    .select()
    .from(scheduleBlocks)
    .where(
      past
        ? or(
            and(eq(scheduleBlocks.kind, 'once'), lte(scheduleBlocks.endsAt, now)),
            and(eq(scheduleBlocks.kind, 'weekly'), lt(scheduleBlocks.untilDate, todayIso)),
          )
        : or(
            and(eq(scheduleBlocks.kind, 'once'), gt(scheduleBlocks.endsAt, now)),
            and(eq(scheduleBlocks.kind, 'weekly'), gte(scheduleBlocks.untilDate, todayIso)),
          ),
    )
    .orderBy(asc(sql`coalesce(${scheduleBlocks.startsAt}, ${scheduleBlocks.fromDate}::timestamptz)`));
  return rows.map(toScheduleBlock);
}
