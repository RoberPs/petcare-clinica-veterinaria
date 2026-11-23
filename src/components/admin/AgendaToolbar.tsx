import Link from 'next/link';
import { agendaHref, agendaRange, shiftAgenda, type AgendaParams, type AgendaStaff } from '@/domain/agenda-view';
import { longDateLabel } from '@/domain/availability';
import { addDays, formatLongDate } from '@/domain/time';

// Navegación de la agenda (F16): pestañas Día / Semana, anterior / hoy / siguiente (enlaces) y un
// formulario GET con fecha, veterinario y canceladas. Los filtros viajan en la URL, sin JavaScript.

interface Props {
  params: AgendaParams;
  today: string;
  staff: readonly AgendaStaff[];
}

export function periodLabel(p: AgendaParams): string {
  const { from, days } = agendaRange(p);
  if (days === 1) return longDateLabel(from);
  return `Semana del ${formatLongDate(from)} al ${formatLongDate(addDays(from, 6))}`;
}

export function AgendaToolbar({ params, today, staff }: Props) {
  const unit = params.view === 'semana' ? 'semana' : 'día';
  return (
    <div className="admin-toolbar">
      <nav className="tabs" aria-label="Vista de la agenda">
        <Link prefetch={false} href={agendaHref(params, { view: 'dia' })} aria-current={params.view === 'dia' ? 'true' : undefined}>
          Día
        </Link>
        <Link prefetch={false} href={agendaHref(params, { view: 'semana' })} aria-current={params.view === 'semana' ? 'true' : undefined}>
          Semana
        </Link>
      </nav>
      <nav className="admin-toolbar__nav" aria-label="Periodo">
        <Link prefetch={false} className="btn btn--ghost" href={agendaHref(params, { date: shiftAgenda(params, -1) })}>
          <span aria-hidden="true">←</span> {params.view === 'semana' ? 'Semana anterior' : 'Día anterior'}
        </Link>
        <Link prefetch={false} className="btn btn--ghost" href={agendaHref(params, { date: today })}>
          Hoy
        </Link>
        <Link prefetch={false} className="btn btn--ghost" href={agendaHref(params, { date: shiftAgenda(params, 1) })}>
          {params.view === 'semana' ? 'Semana siguiente' : 'Día siguiente'} <span aria-hidden="true">→</span>
        </Link>
      </nav>
      <form method="get" action="/admin/agenda" aria-label={`Elegir ${unit} y filtros`}>
        {params.view === 'semana' ? <input type="hidden" name="vista" value="semana" /> : null}
        <div className="field">
          <label htmlFor="agenda-fecha">Ir a fecha</label>
          <input id="agenda-fecha" type="date" name="fecha" defaultValue={params.date} required />
        </div>
        <div className="field">
          <label htmlFor="agenda-veterinario">Veterinario</label>
          <select id="agenda-veterinario" name="veterinario" defaultValue={params.staff ?? ''}>
            <option value="">Todos</option>
            {staff.map((m) => (
              <option key={m.id} value={m.slug}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <label className="check">
          <input type="checkbox" name="canceladas" value="1" defaultChecked={params.includeCancelled} />
          <span>Mostrar canceladas</span>
        </label>
        <button className="btn" type="submit">
          Ver
        </button>
      </form>
    </div>
  );
}
