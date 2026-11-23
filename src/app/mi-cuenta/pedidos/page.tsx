import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Notice } from '@/components/Notice';
import { OrderTable } from '@/components/OrderTable';
import { isShopEnabled } from '@/db/queries/checkout-config';
import { listCustomerOrders, ORDERS_PAGE_SIZE } from '@/db/queries/orders';
import { privateMetadata } from '@/lib/auth/private-metadata';
import { requireCustomer } from '@/lib/auth/require-customer';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { ...privateMetadata, title: 'Mis pedidos' };

type Props = { searchParams: Promise<{ pagina?: string | string[]; aviso?: string | string[] }> };

// Mis pedidos (US5, FR-024): solo los pedidos con el customer_id de la sesión, del más reciente al
// más antiguo, de 10 en 10.
export default async function OrdersPage({ searchParams }: Props) {
  const customer = await requireCustomer();
  if (!(await isShopEnabled())) notFound();
  const sp = await searchParams;
  const raw = Number(Array.isArray(sp.pagina) ? sp.pagina[0] : sp.pagina);
  const page = Number.isInteger(raw) && raw > 0 ? raw : 1;
  const { items, total } = await listCustomerOrders(customer.id, page);
  const pages = Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE));
  if (page > pages) notFound();

  return (
    <>
      <Notice code={sp.aviso} />
      <h2>Mis pedidos</h2>
      {items.length === 0 ? (
        <div className="empty-state">
          <p>Aún no has hecho ningún pedido.</p>
          <Link prefetch={false} className="btn" href="/productos">
            Ver la tienda
          </Link>
        </div>
      ) : (
        <>
          <OrderTable caption="Mis pedidos" orders={items} />
          {pages > 1 ? (
            <nav className="pagination" aria-label="Paginación">
              <ul>
                {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                  <li key={n}>
                    <a href={`/mi-cuenta/pedidos?pagina=${n}`} aria-label={`Página ${n}`} aria-current={n === page ? 'page' : undefined}>
                      {n}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
