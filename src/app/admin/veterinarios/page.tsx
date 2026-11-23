import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { listStaffWithStats } from '@/lib/admin/staff';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';

export const metadata: Metadata = { title: 'Veterinarios' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Veterinarios del equipo y su agenda (US3, FR-015, escenario 8).
export default async function AdminStaffPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const [sp, now] = await Promise.all([searchParams, getNow()]);
  const staff = await listStaffWithStats(now);
  return (
    <>
      <div className="admin-heading">
        <h2>Veterinarios</h2>
        <Link prefetch={false} className="btn" href="/admin/veterinarios/nuevo">
          Nuevo veterinario
        </Link>
      </div>
      <AdminNotice searchParams={sp} />
      <p>La ficha pública del equipo (foto, especialidad y presentación) se gestiona en el archivo de contenido.</p>
      <table className="orders orders--stack" role="table">
        <caption className="visually-hidden">Veterinarios</caption>
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">Veterinario</th>
            <th scope="col" role="columnheader">Reservable</th>
            <th scope="col" role="columnheader">Servicios</th>
            <th scope="col" role="columnheader">Horario</th>
            <th scope="col" role="columnheader">Citas futuras</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {staff.map((m) => (
            <tr key={m.id} role="row">
              <td role="cell" data-label="Veterinario">
                <Link prefetch={false} href={`/admin/veterinarios/${m.id}`}>
                  {m.name}
                </Link>
              </td>
              <td role="cell" data-label="Reservable">
                <span className={m.bookable ? 'badge' : 'badge badge--muted'}>{m.bookable ? 'Sí' : 'No'}</span>
              </td>
              <td role="cell" data-label="Servicios">{m.serviceNames.length ? m.serviceNames.join(', ') : 'Ninguno'}</td>
              <td role="cell" data-label="Horario">
                {m.hourRanges === 0 ? (
                  <span className="badge badge--urgent">Sin horario: no recibe reservas</span>
                ) : (
                  <Link prefetch={false} href={`/admin/veterinarios/${m.id}/horario`}>
                    {m.hourRanges} {m.hourRanges === 1 ? 'tramo' : 'tramos'} a la semana
                  </Link>
                )}
              </td>
              <td role="cell" data-label="Citas futuras">{m.futureCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
