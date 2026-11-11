import Link from 'next/link';
import type { AppointmentView } from '@/domain/appointment-view';
import { describeWhen } from '@/domain/availability';
import type { CustomerAppointment } from '@/db/queries/appointments';
import { AppointmentStatus } from './AppointmentStatus';

export interface ListedAppointment extends CustomerAppointment {
  view: AppointmentView;
}

interface Props {
  caption: string;
  appointments: ListedAppointment[];
  phoneDisplay: string;
  phoneE164: string;
}

// Tabla de citas (design/cuenta.html: table.orders): mascota, servicio, profesional, fecha, hora y
// estado. Las acciones solo aparecen dentro de plazo; fuera de él, el teléfono (FR-023). Los roles
// explícitos mantienen la semántica de tabla cuando, en móvil, las filas se apilan con CSS.
export function AppointmentList({ caption, appointments, phoneDisplay, phoneE164 }: Props) {
  return (
    <table className="orders orders--stack" role="table">
        <caption className="visually-hidden">{caption}</caption>
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">Mascota</th>
            <th scope="col" role="columnheader">Servicio</th>
            <th scope="col" role="columnheader">Profesional</th>
            <th scope="col" role="columnheader">Fecha</th>
            <th scope="col" role="columnheader">Hora</th>
            <th scope="col" role="columnheader">Estado</th>
            <th scope="col" role="columnheader">Acciones</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {appointments.map((a) => {
            const when = describeWhen(a.startsAt);
            const label = `${a.serviceName} del ${when.longDate} a las ${when.time}`;
            return (
              <tr key={a.id} role="row">
                <td role="cell" data-label="Mascota">{a.petName}</td>
                <td role="cell" data-label="Servicio">{a.serviceName}</td>
                <td role="cell" data-label="Profesional">{a.staffName}</td>
                <td role="cell" data-label="Fecha">{when.longDate}</td>
                <td role="cell" data-label="Hora">{when.time}</td>
                <td role="cell" data-label="Estado">
                  <AppointmentStatus state={a.view.state} />
                </td>
                <td role="cell" data-label="Acciones">
                  {a.view.canChange ? (
                    <span className="appointment-actions">
                      <Link prefetch={false} href={`/mi-cuenta/citas/${a.id}/cambiar`}>
                        Cambiar<span className="visually-hidden"> la cita de {label}</span>
                      </Link>
                      <Link prefetch={false} href={`/mi-cuenta/citas/${a.id}/cancelar`}>
                        Cancelar<span className="visually-hidden"> la cita de {label}</span>
                      </Link>
                    </span>
                  ) : a.view.upcoming ? (
                    <span>
                      Para cambiarla, llama al <a href={`tel:${phoneE164}`}>{phoneDisplay}</a>
                    </span>
                  ) : (
                    <>
                      <span aria-hidden="true">—</span>
                      <span className="visually-hidden">Sin acciones</span>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
    </table>
  );
}
