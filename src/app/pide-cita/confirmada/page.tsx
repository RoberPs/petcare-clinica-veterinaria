import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumb } from '@/components/Breadcrumb';
import { describeWhen } from '@/domain/availability';
import { findAppointment } from '@/db/queries/appointments';
import { getBookingConfig, namesFor } from '@/db/queries/booking-config';
import { privateMetadata } from '@/lib/auth/private-metadata';
import { verifyConfirmationRef } from '@/lib/booking/confirmation-ref';
import { getNow } from '@/lib/clock';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { ...privateMetadata, title: 'Cita confirmada' };

// Confirmación (FR-017, B6). Con un ref válido de menos de 2 h, los datos de la cita; si no (o si
// está manipulado), un mensaje genérico sin datos. Cache-Control: no-store en next.config.ts.
export default async function ConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [config, now, sp] = await Promise.all([getBookingConfig(), getNow(), searchParams]);
  if (!config || !config.site.sections.find((s) => s.key === 'reservas')?.href) notFound();
  const { clinic } = config.site;
  const ref = Array.isArray(sp.ref) ? sp.ref[0] : sp.ref;
  const id = verifyConfirmationRef(ref, now);
  const appt = id ? await findAppointment(id) : null;
  const names = appt ? await namesFor([appt.bookingServiceId], [appt.teamMemberId]) : null;
  const when = appt ? describeWhen(appt.startsAt) : null;

  return (
    <>
      <section className="page-hero page-hero--compact">
        <div className="container">
          <Breadcrumb current="Cita confirmada" />
          <h1>Cita confirmada</h1>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="form-success" role="status">
            {appt && names && when ? (
              <>
                <h2>Te esperamos el {when.longDate}</h2>
                <dl className="appointment-details">
                  <dt>Servicio</dt>
                  <dd>{names.services.get(appt.bookingServiceId)}</dd>
                  <dt>Profesional</dt>
                  <dd>{names.staff.get(appt.teamMemberId)}</dd>
                  <dt>Mascota</dt>
                  <dd>
                    {appt.petName} ({appt.petSpeciesLabel})
                  </dd>
                  <dt>Fecha</dt>
                  <dd>{when.longDate}</dd>
                  <dt>Hora</dt>
                  <dd>{when.time}</dd>
                  <dt>Dirección</dt>
                  <dd>
                    {clinic.addressLine}, {clinic.postalCode} {clinic.city}
                  </dd>
                </dl>
                <p>Te hemos enviado la confirmación por correo.</p>
              </>
            ) : (
              <>
                <h2>Tu cita está confirmada</h2>
                <p>Revisa tu correo: ahí tienes todos los datos de la cita.</p>
              </>
            )}
            <p>
              Para cancelarla o cambiarla, {appt?.bookedAs === 'customer' ? 'entra en Mis citas o ' : ''}
              llámanos al <a href={`tel:${clinic.phoneE164}`}>{clinic.phoneDisplay}</a>.
            </p>
            <div className="form-actions">
              {appt?.bookedAs === 'customer' ? (
                <Link prefetch={false} className="btn" href="/mi-cuenta/citas">
                  Ver mis citas
                </Link>
              ) : null}
              <Link prefetch={false} className="btn btn--ghost" href="/">
                Volver al inicio
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
