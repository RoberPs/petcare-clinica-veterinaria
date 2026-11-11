import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AccountHero } from '@/components/AccountHero';
import { AccountNav } from '@/components/AccountNav';
import { sectionHref } from '@/domain/sections';
import { getSiteData } from '@/db/queries/site';
import { privateMetadata } from '@/lib/auth/private-metadata';
import { requireCustomer } from '@/lib/auth/require-customer';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { ...privateMetadata, title: 'Mi cuenta' };

// Área personal (A3): sin sesión vigente redirige a iniciar sesión. Cada página y cada acción vuelven
// a comprobarlo, porque el layout no se ejecuta en las Server Actions.
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const customer = await requireCustomer();
  const { sections } = await getSiteData();

  return (
    <>
      <AccountHero firstName={customer.firstName} />
      <div className="container account-grid">
        <AccountNav appointmentsHref={sectionHref('reservas', sections)} ordersHref={sectionHref('tienda', sections)} />
        <div className="account-main">{children}</div>
      </div>
    </>
  );
}
