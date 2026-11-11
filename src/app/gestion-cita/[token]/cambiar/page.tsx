import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppointmentDetails } from '@/components/AppointmentDetails';
import { Notice } from '@/components/Notice';
import { RescheduleStep } from '@/components/RescheduleStep';
import { getBookingConfig } from '@/db/queries/booking-config';
import { privateMetadata } from '@/lib/auth/private-metadata';
import { readManagedAppointment } from '@/lib/booking/clinic-manage';
import { rescheduleView } from '@/lib/booking/reschedule-view';
import { getNow } from '@/lib/clock';
import { clinicRescheduleAppointment } from '../actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { ...privateMetadata, title: 'Cambiar cita', referrer: 'same-origin' };

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Cambiar una cita con el enlace de la clínica: el paso de fecha y hora con el servicio fijo y sin
// el plazo de 24 h. Tras el cambio se redirige al enlace de la versión nueva.
export default async function ClinicReschedulePage({ params, searchParams }: Props) {
  const [{ token: raw }, query, config, now] = await Promise.all([params, searchParams, getBookingConfig(), getNow()]);
  if (!config) notFound();
  // El token solo usa caracteres seguros en una URL (base64url y punto): no hay que decodificarlo.
  const token = raw;
  const managed = await readManagedAppointment(token, now);
  const step = managed.status === 'ok' ? await rescheduleView(config, managed.appointment, query, now) : null;
  const base = `/gestion-cita/${encodeURIComponent(token)}`;

  return (
    <>
      <section className="page-hero page-hero--compact">
        <div className="container">
          <h1>Cambiar cita</h1>
        </div>
      </section>
      <section className="section">
        <div className="container account-main">
          <Notice code={query.aviso} />
          {managed.status === 'ok' && step ? (
            <>
              <section className="panel" aria-labelledby="titulo-cita-actual">
                <h2 id="titulo-cita-actual">Cita actual</h2>
                <AppointmentDetails
                  serviceName={managed.serviceName}
                  staffName={managed.staffName}
                  petName={managed.appointment.petName}
                  petSpeciesLabel={managed.appointment.petSpeciesLabel}
                  startsAt={managed.appointment.startsAt}
                />
              </section>
              <RescheduleStep view={step} path={`${base}/cambiar`} action={clinicRescheduleAppointment} identity={{ token }} />
              <p>
                <Link prefetch={false} href={base}>
                  Volver
                </Link>
              </p>
            </>
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
