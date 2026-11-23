import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppointmentList, type ListedAppointment } from '@/components/AppointmentList';
import { Notice } from '@/components/Notice';
import { appointmentView } from '@/domain/appointment-view';
import { sectionHref } from '@/domain/sections';
import { listCustomerAppointments } from '@/db/queries/appointments';
import { getBookingConfig } from '@/db/queries/booking-config';
import { privateMetadata } from '@/lib/auth/private-metadata';
import { requireCustomer } from '@/lib/auth/require-customer';
import { getNow } from '@/lib/clock';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { ...privateMetadata, title: 'Mis citas' };

type Props = { searchParams: Promise<{ aviso?: string | string[] }> };

// Mis citas (US3, FR-021 y FR-022). Solo las citas con el customer_id de la sesión (A9).
export default async function AppointmentsPage({ searchParams }: Props) {
  const customer = await requireCustomer();
  const [{ aviso }, config, now] = await Promise.all([searchParams, getBookingConfig(), getNow()]);
  if (!config || !config.site.sections.find((s) => s.key === 'reservas')?.href) notFound();
  const { clinic, sections } = config.site;

  const all: ListedAppointment[] = (await listCustomerAppointments(customer.id)).map((a) => ({
    ...a,
    view: appointmentView(a, now, config.rules.changeCutoffHours),
  }));
  // Próximas: las que aún no han empezado (o están en curso), la más cercana primero.
  const upcoming = all
    .filter((a) => a.startsAt > now || (a.status === 'confirmed' && a.endsAt > now))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  // Anteriores: el resto, la más reciente primero (la consulta ya viene así).
  const past = all.filter((a) => !upcoming.includes(a));

  return (
    <>
      <Notice code={aviso} />
      {all.length === 0 ? (
        <div className="empty-state">
          <h2>Aún no tienes citas</h2>
          <p>Cuando pidas cita con tu cuenta, la verás aquí.</p>
          <Link prefetch={false} className="btn btn--sky" href={sectionHref('reservas', sections)}>
            Pide cita
          </Link>
        </div>
      ) : (
        <>
          <h2>Próximas</h2>
          {upcoming.length > 0 ? (
            <AppointmentList
              caption="Próximas citas"
              appointments={upcoming}
              phoneDisplay={clinic.phoneDisplay}
              phoneE164={clinic.phoneE164}
            />
          ) : (
            <div className="empty-state">
              <p>No tienes citas próximas.</p>
              <Link prefetch={false} className="btn btn--sky" href={sectionHref('reservas', sections)}>
                Pide cita
              </Link>
            </div>
          )}
          <p className="product__meta">
            Puedes cancelar o cambiar una cita hasta {config.rules.changeCutoffHours} horas antes. Después,
            llámanos al <a href={`tel:${clinic.phoneE164}`}>{clinic.phoneDisplay}</a>.
          </p>
          {past.length > 0 ? (
            <>
              <h2>Anteriores</h2>
              <AppointmentList
                caption="Citas anteriores"
                appointments={past}
                phoneDisplay={clinic.phoneDisplay}
                phoneE164={clinic.phoneE164}
              />
            </>
          ) : null}
        </>
      )}
    </>
  );
}
