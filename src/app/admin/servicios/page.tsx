import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { listServicesWithStats } from '@/lib/admin/services';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';

export const metadata: Metadata = { title: 'Servicios' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Servicios reservables (US3, FR-012 a FR-014).
export default async function AdminServicesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const [sp, now] = await Promise.all([searchParams, getNow()]);
  const services = await listServicesWithStats(now);
  return (
    <>
      <div className="admin-heading">
        <h2>Servicios</h2>
        <Link prefetch={false} className="btn" href="/admin/servicios/nuevo">
          Nuevo servicio
        </Link>
      </div>
      <AdminNotice searchParams={sp} context="service" />
      {services.length === 0 ? (
        <p>Aún no hay servicios reservables.</p>
      ) : (
        <table className="orders orders--stack" role="table">
          <caption className="visually-hidden">Servicios reservables</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">Servicio</th>
              <th scope="col" role="columnheader">Duración</th>
              <th scope="col" role="columnheader">Estado</th>
              <th scope="col" role="columnheader">Orden</th>
              <th scope="col" role="columnheader">Veterinarios</th>
              <th scope="col" role="columnheader">Citas futuras</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {services.map((s) => (
              <tr key={s.id} role="row">
                <td role="cell" data-label="Servicio">
                  <Link prefetch={false} href={`/admin/servicios/${s.id}`}>
                    {s.name}
                  </Link>
                </td>
                <td role="cell" data-label="Duración">{s.durationMinutes} min</td>
                <td role="cell" data-label="Estado">
                  <span className={s.published ? 'badge' : 'badge badge--muted'}>{s.published ? 'Activo' : 'Inactivo'}</span>
                </td>
                <td role="cell" data-label="Orden">{s.position}</td>
                <td role="cell" data-label="Veterinarios">{s.staffNames.length ? s.staffNames.join(', ') : 'Ninguno'}</td>
                <td role="cell" data-label="Citas futuras">{s.futureCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
