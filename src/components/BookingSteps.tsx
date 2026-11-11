import Link from 'next/link';

interface Props {
  current: 1 | 2 | 3;
  /** Enlaces a los pasos ya hechos (para volver sin perder lo elegido). */
  hrefs: { 1?: string; 2?: string };
}

const LABELS = { 1: '1 Servicio', 2: '2 Fecha y hora', 3: '3 Tus datos' } as const;

// Pasos de la reserva (design/cita.html: .steps). El actual lleva aria-current="step".
export function BookingSteps({ current, hrefs }: Props) {
  return (
    <ol className="steps" aria-label="Pasos de la reserva">
      {([1, 2, 3] as const).map((n) => {
        const href = n < current ? hrefs[n as 1 | 2] : undefined;
        if (n === current) {
          return (
            <li key={n} className="steps__item">
              <span className="is-active" aria-current="step">
                {LABELS[n]}
              </span>
            </li>
          );
        }
        return (
          <li key={n} className="steps__item">
            {href ? (
              <Link prefetch={false} href={href}>
                {LABELS[n]}
              </Link>
            ) : (
              <span>{LABELS[n]}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
