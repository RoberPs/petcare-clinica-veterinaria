import { Temporal } from '@js-temporal/polyfill';
import {
  availableSlots,
  bookingWindow,
  nextAvailableDate,
  parseIsoDate,
  type BookableService,
  type Slot,
} from '@/domain/availability';
import { expandBlocks, expandBlocksRange, type BlockInterval } from '@/domain/blocks';
import { getDb, type DbOrTx } from '@/db/client';
import { busyIntervalsForDay } from '@/db/queries/appointments';
import { blocksForDay, blocksForRange } from '@/db/queries/schedule-blocks';
import type { BookingConfig } from '@/db/queries/booking-config';

// Horas libres para pintar el paso 2 (y el cambio de cita): la misma función pura que al confirmar
// (B3) sobre las citas confirmadas del día. `excludeId` deja fuera la cita que se está cambiando.

export interface DayQuery {
  service: BookableService;
  /** null = "Sin preferencia". */
  staffId: string | null;
  now: Date;
  excludeId?: string;
}

export async function slotsForDay(
  config: BookingConfig,
  q: DayQuery & { date: string },
  db: DbOrTx = getDb(),
): Promise<Slot[]> {
  const [busy, blocks] = await Promise.all([
    busyIntervalsForDay(db, q.date, { excludeId: q.excludeId }),
    dayBlockIntervals(q.date, db),
  ]);
  return availableSlots({
    ...config,
    date: q.date,
    service: q.service,
    staffId: q.staffId,
    blocks,
    busy,
    now: q.now,
  });
}

/** Bloqueos del día ya expandidos a intervalos (F7, F8). */
export async function dayBlockIntervals(dateIso: string, db: DbOrTx = getDb()): Promise<BlockInterval[]> {
  if (!parseIsoDate(dateIso)) return [];
  return expandBlocks(await blocksForDay(dateIso, db), dateIso);
}

/** Primer día con huecos desde `from` (incluido) hasta el horizonte, o null. */
export async function nextDateWithSlots(
  config: BookingConfig,
  q: DayQuery & { from: string },
  db: DbOrTx = getDb(),
): Promise<string | null> {
  const { today, lastDay } = bookingWindow(q.now, config.rules);
  const from = q.from < today ? today : q.from;
  if (from > lastDay) return null;
  const days = Temporal.PlainDate.from(from).until(Temporal.PlainDate.from(lastDay)).days + 1;
  const until = Temporal.PlainDate.from(lastDay).add({ days: 1 }).toString();
  const [busy, blockRows] = await Promise.all([
    busyIntervalsForDay(db, from, { days, excludeId: q.excludeId }),
    blocksForRange(from, until, db),
  ]);
  const blocks = expandBlocksRange(blockRows, from, days);
  return nextAvailableDate({ ...config, from, service: q.service, staffId: q.staffId, blocks, busy, now: q.now });
}
