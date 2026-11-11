import type { Metadata } from 'next';
import Link from 'next/link';
import { AppointmentDetails } from '@/components/AppointmentDetails';
import { privateMetadata } from '@/lib/auth/private-metadata';
import { requireOwnAppointment } from '@/lib/booking/own-appointment';
import { cancelOwnAppointment } from '../../actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { ...privateMetadata, title: 'Cancelar cita' };

type Props = { params: Promise<{ id: string }> };

// Confirmación de cancelar (FR-025): un solo botón neutro y "Volver". Fuera de plazo, el teléfono.
export default async function CancelAppointmentPage({ params }: Props) {
  const { appt, config, view } = await requireOwnAppointment((await params).id);
  const { clinic } = config.site;

  return (
    <section className="panel" aria-labelledby="titulo-cancelar">
      <h2 id="titulo-cancelar">¿Cancelar esta cita?</h2>
      <AppointmentDetails {...appt} />
      {view.canChange ? (
        <>
          <p>La hora quedará libre para otra persona. Te enviaremos la confirmación por correo.</p>
          <form action={cancelOwnAppointment} className="form-actions">
            <input type="hidden" name="cita" value={appt.id} />
            <button className="btn" type="submit">
              Sí, cancelar la cita
            </button>
            <Link prefetch={false} className="btn btn--ghost" href="/mi-cuenta/citas">
              Volver
            </Link>
          </form>
        </>
      ) : (
        <>
          <p>
            {view.upcoming
              ? `Faltan menos de ${config.rules.changeCutoffHours} horas: ya no se puede cancelar desde la web.`
              : 'Esta cita ya está cancelada o ha pasado.'}{' '}
            Si lo necesitas, llámanos al <a href={`tel:${clinic.phoneE164}`}>{clinic.phoneDisplay}</a>.
          </p>
          <Link prefetch={false} className="btn btn--ghost" href="/mi-cuenta/citas">
            Volver a mis citas
          </Link>
        </>
      )}
    </section>
  );
}
