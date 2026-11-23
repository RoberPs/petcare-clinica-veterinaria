import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminNav } from '@/components/admin/AdminNav';
import { privateMetadata } from '@/lib/auth/private-metadata';
import { requireAdmin } from '@/lib/auth/require-admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  ...privateMetadata,
  title: { default: 'Panel de administración', template: '%s · Panel de administración' },
  robots: { index: false, follow: false },
};

// Panel de administración (F2, F15): solo cuentas verificadas con rol. Sin sesión redirige a
// iniciar sesión; con otra cuenta, el 404 normal. Cada página y cada acción vuelven a comprobarlo,
// porque el layout no se ejecuta en las Server Actions.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <>
      <section className="page-hero page-hero--compact">
        <div className="container">
          <h1>Panel de administración</h1>
        </div>
      </section>
      <div className="container account-grid">
        <AdminNav />
        <div className="account-main">{children}</div>
      </div>
    </>
  );
}
