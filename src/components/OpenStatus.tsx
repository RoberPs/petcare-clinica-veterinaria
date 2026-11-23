import { getOpenStatus, type ClinicMoment } from '@/domain/open-status';
import { formatDayMonth, weekdayName } from '@/domain/time';
import type { Closure, OpeningSlot } from '@/db/queries/site';
import { getNow } from '@/lib/clock';

function whenOpens(m: ClinicMoment): string {
  if (m.daysFromToday === 0) return `abre hoy a las ${m.time}`;
  if (m.daysFromToday <= 6) return `abre el ${weekdayName(m.weekday)} a las ${m.time}`;
  return `abre el ${weekdayName(m.weekday)} ${formatDayMonth(m.date)} a las ${m.time}`;
}

/** "Abierto ahora · cierra a las HH:MM" o "Cerrado ahora · abre el <día> a las HH:MM" (FR-018). */
export async function OpenStatus({ hours, closures }: { hours: OpeningSlot[]; closures: Closure[] }) {
  const status = getOpenStatus(await getNow(), hours, closures);
  if (status.state === 'open') {
    const closesToday = status.closesAt.daysFromToday === 0;
    return (
      <p className="open-status open-status--open">
        Abierto ahora · cierra {closesToday ? '' : `el ${weekdayName(status.closesAt.weekday)} `}a las {status.closesAt.time}
      </p>
    );
  }
  return (
    <p className="open-status open-status--closed">
      Cerrado ahora{status.opensAt ? ` · ${whenOpens(status.opensAt)}` : ''}
    </p>
  );
}
