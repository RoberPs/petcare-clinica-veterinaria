import Link from 'next/link';
import { describeWhen } from '@/domain/availability';
import type { CustomerAppointment } from '@/db/queries/appointments';

interface Props {
  appointment: CustomerAppointment | null;
  /** Destino de "Pide cita" (sectionHref). */
  bookHref: string;
}

// "Tu próxima cita" en el resumen de la cuenta (FR-021).
export function NextAppointment({ appointment, bookHref }: Props) {
  if (!appointment) {
    return (
      <section className="next-appointment" aria-labelledby="proxima-cita">
        <h2 id="proxima-cita">Tu próxima cita</h2>
        <p>No tienes ninguna cita pendiente.</p>
        <p>
          <Link prefetch={false} href={bookHref}>
            Pide cita
          </Link>
        </p>
      </section>
    );
  }
  const when = describeWhen(appointment.startsAt);
  return (
    <section className="next-appointment" aria-labelledby="proxima-cita">
      <h2 id="proxima-cita">Tu próxima cita</h2>
      <p>
        <strong>
          {when.longDate}, a las {when.time}
        </strong>
      </p>
      <p>
        {appointment.serviceName} para {appointment.petName}, con {appointment.staffName}.
      </p>
      <p>
        <Link prefetch={false} href="/mi-cuenta/citas">
          Ver mis citas
        </Link>
      </p>
    </section>
  );
}
