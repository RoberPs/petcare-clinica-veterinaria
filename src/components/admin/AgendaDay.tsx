import type { AgendaColumn } from '@/domain/agenda-view';
import { AgendaEntries } from './AgendaEntries';

// Vista de día (FR-007): una columna por veterinario, apiladas por debajo de 900 px.
export function AgendaDay({ columns }: { columns: readonly AgendaColumn[] }) {
  if (columns.length === 0) return <p>No hay veterinarios que reciban reservas.</p>;
  return (
    <div className="agenda-day">
      {columns.map((c) => (
        <section key={c.staff.id} className="agenda-col" aria-labelledby={`agenda-${c.staff.id}`}>
          <h3 id={`agenda-${c.staff.id}`}>{c.staff.name}</h3>
          <AgendaEntries day={c.days[0]!} />
        </section>
      ))}
    </div>
  );
}
