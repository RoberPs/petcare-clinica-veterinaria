import { Temporal } from '@js-temporal/polyfill';
import Link from 'next/link';
import { agendaHref, type AgendaColumn, type AgendaParams } from '@/domain/agenda-view';
import { formatDayMonth, weekdayName } from '@/domain/time';
import { AgendaEntries } from './AgendaEntries';

// Vista de semana (FR-007): por veterinario, de lunes a domingo; cada día enlaza a su vista de día.
export function AgendaWeek({ columns, params }: { columns: readonly AgendaColumn[]; params: AgendaParams }) {
  if (columns.length === 0) return <p>No hay veterinarios que reciban reservas.</p>;
  return (
    <div className="agenda-week">
      {columns.map((c) => (
        <section key={c.staff.id} aria-labelledby={`agenda-${c.staff.id}`}>
          <h3 id={`agenda-${c.staff.id}`}>{c.staff.name}</h3>
          <div className="agenda-week__days">
            {c.days.map((d) => (
              <div key={d.date} className="agenda-col">
                <h4>
                  <Link prefetch={false} href={agendaHref(params, { view: 'dia', date: d.date })}>
                    <time dateTime={d.date}>
                      {weekdayName(Temporal.PlainDate.from(d.date).dayOfWeek)} {formatDayMonth(d.date)}
                    </time>
                  </Link>
                </h4>
                <AgendaEntries day={d} compact />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
