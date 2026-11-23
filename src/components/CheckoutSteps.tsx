import Link from 'next/link';

const LABELS = { 1: '1 Carrito', 2: '2 Datos y pago', 3: '3 Confirmación' } as const;

// Pasos de la compra (design/checkout.html: .steps). El actual lleva aria-current="step".
export function CheckoutSteps({ current, cartHref = '/carrito' }: { current: 1 | 2 | 3; cartHref?: string | null }) {
  return (
    <ol className="steps" aria-label="Pasos de la compra">
      {([1, 2, 3] as const).map((n) => (
        <li key={n} className="steps__item">
          {n === current ? (
            <span className="is-active" aria-current="step">
              {LABELS[n]}
            </span>
          ) : n === 1 && current === 2 && cartHref ? (
            <Link prefetch={false} href={cartHref}>
              {LABELS[n]}
            </Link>
          ) : (
            <span>{LABELS[n]}</span>
          )}
        </li>
      ))}
    </ol>
  );
}
