import type { AppointmentEventView } from '@/db/queries/admin-agenda';
import { describeWhen } from '@/domain/availability';
import { formatDateTime } from '@/domain/time';

// Historial de una cita (FR-010, F12): qué pasó, cuándo y quién lo hizo.

const ACTOR: Record<AppointmentEventView['actor'], string> = {
  customer: 'el cliente, desde su cuenta',
  guest_link: 'el cliente, como invitado',
  clinic_link: 'la clínica, con el enlace de gestión',
  admin: 'la clínica, desde el panel',
  system: 'el sistema',
};

function who(e: AppointmentEventView): string {
  return e.actor === 'admin' && e.adminName ? `la clínica, desde el panel (${e.adminName})` : ACTOR[e.actor];
}

const when = (at: Date | null, staff: string | null) => {
  if (!at) return '—';
  const w = describeWhen(at);
  return `${w.longDate} a las ${w.time}${staff ? ` con ${staff}` : ''}`;
};

export function AppointmentHistory({ events }: { events: readonly AppointmentEventView[] }) {
  return (
    <>
      {events.length === 0 ? (
        <p>No hay cambios registrados.</p>
      ) : (
        <ol className="admin-history">
          {events.map((e, i) => (
            <li key={`${e.kind}-${e.at.toISOString()}-${i}`}>
              <p>
                <strong>
                  {e.kind === 'created' ? 'Creada' : e.kind === 'cancelled' ? 'Cancelada' : 'Movida'}
                </strong>{' '}
                por {who(e)} · <time dateTime={e.at.toISOString()}>{formatDateTime(e.at)}</time>
              </p>
              {e.kind === 'rescheduled' ? (
                <p>
                  De {when(e.fromStartsAt, e.fromStaffName)} a {when(e.toStartsAt, e.toStaffName)}.
                </p>
              ) : null}
              {e.kind === 'cancelled' && e.note ? <p>Mensaje al cliente: {e.note}</p> : null}
            </li>
          ))}
        </ol>
      )}
      <p className="agenda-col__hours">
        Los cambios hechos antes de que existiera el panel no constan: de esas citas solo se conservan la
        creación y, si la hubo, la cancelación.
      </p>
    </>
  );
}
