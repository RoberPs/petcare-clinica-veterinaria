import { Temporal } from '@js-temporal/polyfill';
import {
  availableSlots,
  bookingWindow,
  nextAvailableDate,
  type BookableService,
  type Slot,
} from '@/domain/availability';
import { getDb, type DbOrTx } from '@/db/client';
import { busyIntervalsForDay } from '@/db/queries/appointments';
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
  const busy = await busyIntervalsForDay(db, q.date, { excludeId: q.excludeId });
  return availableSlots({
    ...config,
    date: q.date,
    service: q.service,
    staffId: q.staffId,
    busy,
    now: q.now,
  });
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
  const busy = await busyIntervalsForDay(db, from, { days, excludeId: q.excludeId });
  return nextAvailableDate({ ...config, from, service: q.service, staffId: q.staffId, busy, now: q.now });
}
