import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppointmentDetails } from '@/components/AppointmentDetails';
import { Notice } from '@/components/Notice';
import { getBookingConfig } from '@/db/queries/booking-config';
import { privateMetadata } from '@/lib/auth/private-metadata';
import { readManagedAppointment } from '@/lib/booking/clinic-manage';
import { getNow } from '@/lib/clock';
import { clinicCancelAppointment } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { ...privateMetadata, title: 'Gestionar cita', referrer: 'same-origin' };

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ aviso?: string | string[] }>;
};

// Enlace de gestión de la clínica (US5, FR-027). Abrir la página no hace nada: muestra la cita y
// las acciones, que son POST. Con un enlace no válido, antiguo, de una cita cancelada o pasada, no
// se muestra ningún dato. Cabeceras no-store, noindex y Referrer-Policy same-origin en next.config.ts.
export default async function ManageAppointmentPage({ params, searchParams }: Props) {
  const [{ token: raw }, { aviso }, config, now] = await Promise.all([params, searchParams, getBookingConfig(), getNow()]);
  if (!config) notFound();
  // El token solo usa caracteres seguros en una URL (base64url y punto): no hay que decodificarlo.
  const token = raw;
  const managed = await readManagedAppointment(token, now);

  return (
    <>
      <section className="page-hero page-hero--compact">
        <div className="container">
          <h1>Gestionar cita</h1>
        </div>
      </section>
      <section className="section">
        <div className="container account-main">
          <Notice code={aviso} />
          {managed.status === 'ok' ? (
            <section className="panel" aria-labelledby="titulo-gestion">
              <h2 id="titulo-gestion">Cita de {managed.appointment.contactName}</h2>
              <AppointmentDetails
                serviceName={managed.serviceName}
                staffName={managed.staffName}
                petName={managed.appointment.petName}
                petSpeciesLabel={managed.appointment.petSpeciesLabel}
                startsAt={managed.appointment.startsAt}
              />
              <p>
                Teléfono: {managed.appointment.contactPhone ?? 'no indicado'} ·{' '}
                {managed.appointment.bookedAs === 'customer' ? 'Cliente con cuenta' : 'Invitado (sin cuenta)'}
              </p>
              <p className="product__meta">
                Usa este enlace solo para atender a quien llame. Al cancelar o cambiar, le enviaremos un correo y este
                enlace dejará de valer.
              </p>
              <div className="form-actions">
                <form action={clinicCancelAppointment}>
                  <input type="hidden" name="token" value={token} />
                  <button className="btn" type="submit">
                    Cancelar cita
                  </button>
                </form>
                <Link prefetch={false} className="btn btn--ghost" href={`/gestion-cita/${encodeURIComponent(token)}/cambiar`}>
                  Cambiar fecha u hora
                </Link>
              </div>
            </section>
          ) : (
            <section className="empty-state" aria-labelledby="titulo-no-valido">
              <h2 id="titulo-no-valido">Este enlace ya no es válido</h2>
              <p>La cita se ha cancelado, ya ha pasado o se ha cambiado y hay un enlace más reciente en otro correo.</p>
            </section>
          )}
        </div>
      </section>
    </>
  );
}
