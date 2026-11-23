import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatEur } from '@/domain/money';
import { getOrder, paymentBySession } from '@/db/queries/orders';
import { privateMetadata } from '@/lib/auth/private-metadata';
import { getNow } from '@/lib/clock';
import { getEnv } from '@/lib/env';
import { isFakeSession } from '@/lib/payments/fake';
import { cancelFake, declineFake, payFake } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { ...privateMetadata, title: 'Pago simulado' };

type Props = {
  params: Promise<{ session: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Pasarela de pago simulada (D2): solo con PAYMENT_PROVIDER=fake (el middleware da 404 si no).
// Hace el papel de la página de Stripe Checkout en local y en las pruebas: no pide ningún dato.
export default async function FakePaymentPage({ params, searchParams }: Props) {
  if (getEnv().PAYMENT_PROVIDER !== 'fake') notFound();
  const [{ session }, sp, now] = await Promise.all([params, searchParams, getNow()]);
  if (!isFakeSession(session)) notFound();
  const payment = await paymentBySession(session);
  const order = payment ? await getOrder(payment.orderId) : null;
  if (!payment || !order) notFound();
  const open = payment.status === 'open' && payment.expiresAt.getTime() > now.getTime();
  const declined = sp.resultado === 'rechazada';

  return (
    <div className="container">
      <section className="panel pay-sim" aria-labelledby="pago-simulado">
        <p className="badge badge--muted">Simulación: no es una pasarela real</p>
        <h1 id="pago-simulado">Pasarela de pago simulada</h1>
        <p>Pedido {order.number}</p>
        <p className="pay-sim__amount">{formatEur(payment.amountCents)}</p>
        {declined ? (
          <p className="form-summary" role="alert">
            Tarjeta rechazada (simulación). Puedes volver a intentarlo o cancelar.
          </p>
        ) : null}
        {open ? (
          <div className="form-actions">
            <form action={payFake}>
              <input type="hidden" name="session" value={payment.providerSessionId} />
              <button className="btn btn--mint" type="submit">
                Pagar
              </button>
            </form>
            <form action={declineFake}>
              <input type="hidden" name="session" value={payment.providerSessionId} />
              <button className="btn btn--ghost" type="submit">
                Simular rechazo
              </button>
            </form>
            <form action={cancelFake}>
              <input type="hidden" name="session" value={payment.providerSessionId} />
              <button className="btn btn--ghost" type="submit">
                Cancelar
              </button>
            </form>
          </div>
        ) : (
          <p role="status">Esta sesión de pago ya no está abierta.</p>
        )}
        <p className="product__meta">En esta simulación no se pide ni se guarda ningún dato de tarjeta.</p>
      </section>
    </div>
  );
}
