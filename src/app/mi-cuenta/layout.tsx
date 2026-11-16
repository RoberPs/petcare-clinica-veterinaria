import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AccountHero } from '@/components/AccountHero';
import { AccountNav } from '@/components/AccountNav';
import { isSectionEnabled, sectionHref } from '@/domain/sections';
import { isShopEnabled } from '@/db/queries/checkout-config';
import { getSiteData } from '@/db/queries/site';
import { privateMetadata } from '@/lib/auth/private-metadata';
import { requireCustomer } from '@/lib/auth/require-customer';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { ...privateMetadata, title: 'Mi cuenta' };

// Área personal (A3): sin sesión vigente redirige a iniciar sesión. Cada página y cada acción vuelven
// a comprobarlo, porque el layout no se ejecuta en las Server Actions.
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const customer = await requireCustomer();
  const [{ sections }, shopOn] = await Promise.all([getSiteData(), isShopEnabled()]);
  // "Mis citas" (B14): la lista propia si la reserva está activa; si no, "Próximamente".
  const appointmentsHref = isSectionEnabled('reservas', sections)
    ? '/mi-cuenta/citas'
    : sectionHref('reservas', sections);
  // "Mis pedidos" (US5): la lista propia si la compra está activa; si no, "Próximamente".

  return (
    <>
      <AccountHero firstName={customer.firstName} />
      <div className="container account-grid">
        <AccountNav appointmentsHref={appointmentsHref} ordersHref={shopOn ? '/mi-cuenta/pedidos' : sectionHref('carrito', sections)} />
        <div className="account-main">{children}</div>
      </div>
    </>
  );
}
