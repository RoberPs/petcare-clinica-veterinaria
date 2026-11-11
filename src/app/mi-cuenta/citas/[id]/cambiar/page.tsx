import type { Metadata } from 'next';
import Link from 'next/link';
import { AppointmentDetails } from '@/components/AppointmentDetails';
import { Notice } from '@/components/Notice';
import { RescheduleStep } from '@/components/RescheduleStep';
import { privateMetadata } from '@/lib/auth/private-metadata';
import { requireOwnAppointment } from '@/lib/booking/own-appointment';
import { rescheduleView } from '@/lib/booking/reschedule-view';
import { rescheduleOwnAppointment } from '../../actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { ...privateMetadata, title: 'Cambiar cita' };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Cambiar una cita (FR-024): el paso de fecha y hora con el servicio fijo y la cita actual al lado.
export default async function RescheduleAppointmentPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { appt, config, now, view } = await requireOwnAppointment(id);
  const { clinic } = config.site;
  const step = view.canChange ? await rescheduleView(config, appt, query, now) : null;

  return (
    <>
      <Notice code={query.aviso} />
      <section className="panel" aria-labelledby="titulo-cita-actual">
        <h2 id="titulo-cita-actual">Tu cita actual</h2>
        <AppointmentDetails {...appt} />
      </section>
      {step ? (
        <RescheduleStep
          view={step}
          path={`/mi-cuenta/citas/${appt.id}/cambiar`}
          action={rescheduleOwnAppointment}
          identity={{ cita: appt.id }}
        />
      ) : (
        <section className="panel">
          <p>
            {view.upcoming
              ? `Faltan menos de ${config.rules.changeCutoffHours} horas: ya no se puede cambiar desde la web.`
              : 'Esta cita ya está cancelada o ha pasado.'}{' '}
            Si lo necesitas, llámanos al <a href={`tel:${clinic.phoneE164}`}>{clinic.phoneDisplay}</a>.
          </p>
        </section>
      )}
      <p>
        <Link prefetch={false} href="/mi-cuenta/citas">
          Volver a mis citas
        </Link>
      </p>
    </>
  );
}
