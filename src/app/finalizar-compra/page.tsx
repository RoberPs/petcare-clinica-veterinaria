import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { CartSummary } from '@/components/CartSummary';
import { CheckoutForm, type CheckoutPrefill } from '@/components/CheckoutForm';
import { CheckoutSteps } from '@/components/CheckoutSteps';
import { Notice } from '@/components/Notice';
import { formatEur } from '@/domain/money';
import { findCart, type CartKind } from '@/db/queries/cart';
import { getCheckoutConfig, isShopEnabled } from '@/db/queries/checkout-config';
import { lastCustomerOrder } from '@/db/queries/orders';
import { privateMetadata } from '@/lib/auth/private-metadata';
import { loginUrl } from '@/lib/auth/require-customer';
import { readCart } from '@/lib/cart/cart';
import { currentCartOwner } from '@/lib/cart/owner';
import { getNow } from '@/lib/clock';
import { createSubmissionToken } from '@/lib/form-token';
import { clinicPickupInfo } from '@/lib/orders/clinic-info';
import { confirmCheckout } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { ...privateMetadata, title: 'Finalizar compra' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Finalizar compra (US3, contracts/routes.md, design/checkout.html). ?directa=1 usa el carrito de
// "Comprar ahora" (US8). Sin productos que se puedan comprar, vuelve al carrito.
export default async function CheckoutPage({ searchParams }: Props) {
  const sp = await searchParams;
  const config = await getCheckoutConfig();
  if (!config || !(await isShopEnabled())) notFound();
  const kind: CartKind = sp.directa === '1' ? 'direct' : 'main';
  const { owner, customer } = await currentCartOwner();
  const cart = owner ? await findCart(owner, kind) : null;
  const view = cart ? await readCart(cart, config, await getNow()) : null;
  if (!view || !view.canCheckout) redirect('/carrito');

  const [clinic, last] = await Promise.all([clinicPickupInfo(), customer ? lastCustomerOrder(customer.id) : null]);
  const prefill: CheckoutPrefill = customer
    ? {
        firstName: last?.firstName ?? customer.firstName,
        lastName: last?.lastName ?? customer.lastName,
        addressLine: last?.addressLine ?? customer.addressLine ?? undefined,
        postalCode: last?.postalCode ?? customer.postalCode ?? undefined,
        city: last?.city ?? customer.city ?? undefined,
      }
    : {};
  const lines = view.lines.filter((l) => !l.unavailable);
  const returnTo = kind === 'direct' ? '/finalizar-compra?directa=1' : '/finalizar-compra';

  return (
    <>
      <section className="page-hero page-hero--compact">
        <div className="container">
          <h1>Finalizar compra</h1>
        </div>
      </section>
      <div className="container">
        <Notice code={sp.aviso} />
        {view.notices.map((text) => (
          <p key={text} className="line-notice" role="status">
            {text}
          </p>
        ))}
      </div>
      <div className="container cart-layout section">
        <div>
          <CheckoutSteps current={2} cartHref={kind === 'direct' ? null : '/carrito'} />
          <CheckoutForm
            action={confirmCheckout}
            token={createSubmissionToken()}
            cart={kind}
            expectedTotalCents={view.totals.subtotalCents - view.totals.discountCents}
            shippingMethods={config.shippingMethods.map((m) => ({
              code: m.code,
              kind: m.kind,
              name: m.name,
              description: m.description,
              costCents: m.costCents,
            }))}
            paymentMethods={config.paymentMethods}
            accountEmail={customer?.email ?? null}
            loginHref={loginUrl(returnTo)}
            registerHref="/crear-cuenta"
            prefill={prefill}
            noticeText={config.settings.checkoutNoticeText}
            phone={{ display: clinic.phoneDisplay, e164: clinic.phoneE164 }}
          />
        </div>
        <CartSummary
          title="Tu pedido"
          figures={view.totals}
          discountCode={view.discount?.code ?? null}
          shippingLabel={null}
        >
          <ul className="order-lines" aria-label="Productos">
            {lines.map((l) => (
              <li key={l.productId}>
                <span>
                  {l.name} × {l.quantity}
                </span>
                <span>{formatEur(l.lineTotalCents)}</span>
              </li>
            ))}
          </ul>
        </CartSummary>
      </div>
    </>
  );
}
