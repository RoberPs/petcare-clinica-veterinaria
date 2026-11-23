import Link from 'next/link';
import { STATE_LABEL, type AgendaDay } from '@/domain/agenda-view';

// Contenido de un día de un veterinario en la agenda (FR-009, FR-011): citas, bloqueos y tramos sin
// horario, por hora. Los estados y marcas van en texto, no solo en color.

type Entry =
  | { kind: 'item'; start: string; item: AgendaDay['items'][number] }
  | { kind: 'block'; start: string; block: AgendaDay['blocks'][number] }
  | { kind: 'off'; start: string; end: string };

function hoursText(day: AgendaDay): string {
  if (day.clinicClosed) return 'Clínica cerrada';
  if (day.hours.length === 0) return 'Sin horario este día';
  return `Atiende: ${day.hours.map((h) => `${h.start}–${h.end}`).join(' y ')}`;
}

export function AgendaEntries({ day, compact = false }: { day: AgendaDay; compact?: boolean }) {
  const entries: Entry[] = [
    ...day.items.map((item) => ({ kind: 'item' as const, start: item.start, item })),
    ...day.blocks.map((block) => ({ kind: 'block' as const, start: block.start, block })),
    ...day.off.map((o) => ({ kind: 'off' as const, start: o.start, end: o.end })),
  ].sort((a, b) => a.start.localeCompare(b.start));

  return (
    <>
      <p className="agenda-col__hours">{hoursText(day)}</p>
      {day.items.length === 0 ? <p className="agenda-empty">No hay citas</p> : null}
      {entries.length > 0 ? (
        <ul className="agenda-list">
          {entries.map((e) => {
            if (e.kind === 'item') {
              const i = e.item;
              return (
                <li key={`i-${i.id}`} className={i.state === 'cancelada' ? 'agenda-slot agenda-slot--cancelled' : 'agenda-slot'}>
                  <span className="agenda-slot__time">
                    <time dateTime={i.startsAt.toISOString()}>{i.start}</time>–{i.end}
                  </span>
                  <Link prefetch={false} href={`/admin/citas/${i.id}`}>
                    {i.serviceName}
                  </Link>
                  <span>
                    {i.petName} ({i.petSpeciesLabel}){compact ? null : <> · {i.ownerName ?? 'Datos anonimizados'}</>}
                  </span>
                  <span className="agenda-slot__marks">
                    <span className={i.state === 'confirmada' ? 'badge' : 'badge badge--muted'}>{STATE_LABEL[i.state]}</span>
                    {i.outsideSchedule ? <span className="badge badge--urgent">Fuera de horario</span> : null}
                    {i.serviceInactive ? <span className="badge badge--muted">Servicio inactivo</span> : null}
                  </span>
                </li>
              );
            }
            if (e.kind === 'block') {
              const b = e.block;
              return (
                <li key={`b-${b.id}-${b.start}`} className="agenda-slot agenda-slot--block">
                  <span className="agenda-slot__time">
                    {b.start}–{b.end}
                  </span>
                  <span>
                    <strong>{b.clinicWide ? 'Bloqueo de la clínica' : 'Bloqueo'}</strong>: {b.reason}
                  </span>
                  <Link prefetch={false} href={`/admin/bloqueos/${b.id}`}>
                    Editar bloqueo
                  </Link>
                </li>
              );
            }
            return (
              <li key={`o-${e.start}`} className="agenda-slot agenda-slot--off">
                <span className="agenda-slot__time">
                  {e.start}–{e.end}
                </span>
                <span>Sin horario</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}
