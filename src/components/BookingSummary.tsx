import Link from 'next/link';

export interface SummaryRow {
  label: string;
  /** null = aún no elegido ("—"). */
  value: string | null;
  /** Enlace "Cambiar" al paso donde se elige. */
  changeHref?: string;
}

interface Props {
  title?: string;
  rows: SummaryRow[];
  footer?: React.ReactNode;
}

// Resumen siempre visible de la cita (FR-008, design/cita.html: aside.summary).
export function BookingSummary({ title = 'Resumen de tu cita', rows, footer }: Props) {
  return (
    <aside className="summary" aria-labelledby="resumen-cita">
      <h2 id="resumen-cita">{title}</h2>
      {rows.map((row) => (
        <div className="summary__row" key={row.label}>
          <span>{row.label}</span>
          <span>
            {row.value ?? '—'}
            {row.changeHref && row.value ? (
              <>
                <br />
                <Link prefetch={false} className="summary__change" href={row.changeHref}>
                  Cambiar<span className="visually-hidden"> {row.label.toLowerCase()}</span>
                </Link>
              </>
            ) : null}
          </span>
        </div>
      ))}
      {footer ? <p className="product__meta">{footer}</p> : null}
    </aside>
  );
}
