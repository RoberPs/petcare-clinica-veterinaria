import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CartSummary } from '@/components/CartSummary';
import { DiscountForm } from '@/components/DiscountForm';
import { Notice } from '@/components/Notice';
import { PLACEHOLDER_ALT, PRODUCT_PLACEHOLDER } from '@/components/ProductCard';
import { QuantityField } from '@/components/QuantityField';
import { formatEur } from '@/domain/money';
import { findCart } from '@/db/queries/cart';
import { getCheckoutConfig, isShopEnabled } from '@/db/queries/checkout-config';
import { privateMetadata } from '@/lib/auth/private-metadata';
import { readCart, type CartView } from '@/lib/cart/cart';
import { currentCartOwner } from '@/lib/cart/owner';
import { getNow } from '@/lib/clock';
import { removeCartLine, updateCartLine } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { ...privateMetadata, title: 'Tu carrito' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function loadCart(): Promise<CartView | null> {
  const config = await getCheckoutConfig();
  if (!config || !(await isShopEnabled())) notFound();
  const { owner } = await currentCartOwner();
  const cart = owner ? await findCart(owner, 'main') : null;
  if (!cart) return null;
  const view = await readCart(cart, config, await getNow());
  return view.lines.length > 0 ? view : null;
}

// Carrito (US2, contracts/routes.md, design/carrito.html): todo con formularios POST y PRG, sin JavaScript.
export default async function CartPage({ searchParams }: Props) {
  const [view, sp] = await Promise.all([loadCart(), searchParams]);

  return (
    <>
      <section className="page-hero page-hero--compact">
        <div className="container">
          <h1>Tu carrito</h1>
        </div>
      </section>
      <div className="container">
        <Notice code={sp.aviso} />
        {view?.notices.map((text) => (
          <p key={text} className="line-notice" role="status">
            {text}
          </p>
        ))}
      </div>

      {!view ? (
        <div className="container section">
          <div className="empty-state">
            <p>Tu carrito está vacío.</p>
            <Link prefetch={false} className="btn" href="/productos">
              Ver productos
            </Link>
          </div>
        </div>
      ) : (
        <div className="container cart-layout">
          <section aria-labelledby="lineas">
            <h2 id="lineas" className="visually-hidden">
              Productos del carrito
            </h2>
            {view.lines.map((line) => (
              <article key={line.productId} className={line.unavailable ? 'cart-item cart-item--unavailable' : 'cart-item'}>
                <div className="cart-item__img">
                  <Image
                    src={line.imagePath ?? PRODUCT_PLACEHOLDER}
                    alt={line.imagePath ? (line.imageAlt ?? '') : PLACEHOLDER_ALT}
                    width={96}
                    height={96}
                  />
                </div>
                <div className="cart-item__body">
                  <h3>
                    <Link prefetch={false} href={`/productos/${line.slug}`}>
                      {line.name}
                    </Link>
                  </h3>
                  <span className="product__meta">
                    {line.categoryName}
                    {line.pets.length > 0 ? ` · ${line.pets.join(', ')}` : ''}
                  </span>
                  <span className="product__meta">{formatEur(line.unitPriceCents)} / unidad</span>
                  {line.notices.map((text) => (
                    <p key={text} className="line-notice">
                      {text}
                    </p>
                  ))}
                </div>
                <div className="cart-item__actions">
                  {line.unavailable ? null : (
                    <form action={updateCartLine} className="cart-item__update">
                      <input type="hidden" name="product_id" value={line.productId} />
                      <QuantityField
                        id={`cantidad-${line.productId}`}
                        label={`Cantidad de ${line.name}`}
                        hiddenLabel
                        defaultValue={line.quantity}
                        max={line.maxQuantity}
                        min={0}
                      />
                      <button type="submit" className="btn btn--ghost btn--sm">
                        Actualizar<span className="visually-hidden"> la cantidad de {line.name}</span>
                      </button>
                    </form>
                  )}
                  <span className="cart-item__total">{line.unavailable ? 'No disponible' : formatEur(line.lineTotalCents)}</span>
                  <form action={removeCartLine}>
                    <input type="hidden" name="product_id" value={line.productId} />
                    <button type="submit" className="remove">
                      Eliminar<span className="visually-hidden"> {line.name}</span>
                    </button>
                  </form>
                </div>
              </article>
            ))}
            <Link prefetch={false} className="link-back" href="/productos">
              ← Seguir comprando
            </Link>
          </section>

          <CartSummary figures={view.totals} discountCode={view.discount?.code}>
            <DiscountForm applied={view.discount?.code ?? null} />
            {view.canCheckout ? (
              <Link prefetch={false} className="btn btn--block" href="/finalizar-compra">
                Finalizar compra
              </Link>
            ) : null}
          </CartSummary>
        </div>
      )}
    </>
  );
}
