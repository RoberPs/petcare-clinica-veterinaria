import { formatSlots, weeklyHours } from '@/domain/hours';
import type { OpeningSlot } from '@/db/queries/site';

// Horario de los 7 días, con "Cerrado" en los días sin tramos y varios tramos por día (FR-016).
export function WeeklyHours({ hours }: { hours: OpeningSlot[] }) {
  return (
    <dl className="hours">
      {weeklyHours(hours).map((day) => (
        <div key={day.weekday} className="hours__row">
          <dt>{day.name}</dt>
          <dd>{day.slots.length === 0 ? 'Cerrado' : formatSlots(day.slots)}</dd>
        </div>
      ))}
    </dl>
  );
}
