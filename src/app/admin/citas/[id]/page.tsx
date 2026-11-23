import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { AppointmentHistory } from '@/components/admin/AppointmentHistory';
import { appointmentDetail } from '@/db/queries/admin-agenda';
import { STATE_LABEL } from '@/domain/agenda-view';
import { describeWhen } from '@/domain/availability';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';

export const metadata: Metadata = { title: 'Detalle de la cita' };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Detalle de una cita (FR-010): servicio, veterinario, fecha, estado, motivo, contacto e historial.
export default async function AdminAppointmentPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  await requireAdmin();
  const [{ id }, sp, now] = await Promise.all([params, searchParams, getNow()]);
  const a = await appointmentDetail(id);
  if (!a) notFound();
  const start = describeWhen(a.startsAt);
  const end = describeWhen(a.endsAt);
  const state = a.status === 'cancelled' ? 'cancelada' : a.endsAt.getTime() <= now.getTime() ? 'realizada' : 'confirmada';
  const editable = a.status === 'confirmed' && a.startsAt.getTime() > now.getTime();
  const anonymized = a.anonymizedAt !== null;

  return (
    <>
      <div className="admin-heading">
        <h2>
          {a.serviceName} · {a.petName}
        </h2>
        <Link prefetch={false} className="btn btn--ghost" href={`/admin/agenda?fecha=${start.date}`}>
          Volver a la agenda
        </Link>
      </div>
      <AdminNotice searchParams={sp} />
      <section className="panel" aria-labelledby="cita-datos">
        <h2 id="cita-datos">Cita</h2>
        <dl className="admin-dl">
          <dt>Servicio</dt>
          <dd>
            {a.serviceName}
            {a.servicePublished ? null : (
              <>
                {' '}
                <span className="badge badge--muted">Servicio inactivo</span>
              </>
            )}
          </dd>
          <dt>Veterinario</dt>
          <dd>{a.staffName}</dd>
          <dt>Fecha y hora</dt>
          <dd>
            <time dateTime={a.startsAt.toISOString()}>
              {start.longDate}, de {start.time} a {end.time}
            </time>
          </dd>
          <dt>Estado</dt>
          <dd>
            <span className={state === 'confirmada' ? 'badge' : 'badge badge--muted'}>{STATE_LABEL[state]}</span>
          </dd>
          <dt>Motivo</dt>
          <dd>{a.reason ?? (anonymized ? 'Datos anonimizados' : 'Sin motivo')}</dd>
        </dl>
      </section>
      <section className="panel" aria-labelledby="cita-responsable">
        <h2 id="cita-responsable">Responsable y mascota</h2>
        {anonymized ? <p>Los datos personales de esta cita se han anonimizado.</p> : null}
        <dl className="admin-dl">
          <dt>Origen</dt>
          <dd>{a.bookedAs === 'customer' ? 'Cuenta de cliente' : 'Invitado'}</dd>
          <dt>Nombre</dt>
          <dd>{a.contactName ?? '—'}</dd>
          <dt>Teléfono</dt>
          <dd>{a.contactPhone ? <a href={`tel:${a.contactPhone.replace(/\s+/g, '')}`}>{a.contactPhone}</a> : '—'}</dd>
          <dt>Correo</dt>
          <dd>{a.contactEmail ? <a href={`mailto:${a.contactEmail}`}>{a.contactEmail}</a> : '—'}</dd>
          <dt>Mascota</dt>
          <dd>
            {a.petName} ({a.petSpeciesLabel})
          </dd>
        </dl>
      </section>
      {editable ? (
        <div className="form-actions">
          <Link prefetch={false} className="btn" href={`/admin/citas/${a.id}/mover`}>
            Mover
          </Link>
          <Link prefetch={false} className="btn btn--ghost" href={`/admin/citas/${a.id}/cancelar`}>
            Cancelar la cita
          </Link>
        </div>
      ) : null}
      <section className="panel" aria-labelledby="cita-historial">
        <h2 id="cita-historial">Historial</h2>
        <AppointmentHistory events={a.events} />
      </section>
    </>
  );
}
