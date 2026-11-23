import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { agendaStaff } from '@/db/queries/admin-agenda';
import { listBlocks } from '@/db/queries/schedule-blocks';
import { blockSummary } from '@/domain/blocks';
import { todayInClinic } from '@/domain/time';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';

export const metadata: Metadata = { title: 'Bloqueos' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Bloqueos vigentes y futuros, o los pasados con ?pasados=1 (US5).
export default async function AdminBlocksPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const [sp, now] = await Promise.all([searchParams, getNow()]);
  const past = sp.pasados === '1';
  const [blocks, staff] = await Promise.all([listBlocks({ past, now, todayIso: todayInClinic(now) }), agendaStaff([])]);
  const allStaff = new Map(staff.map((m) => [m.id, m.name]));
  return (
    <>
      <div className="admin-heading">
        <h2>{past ? 'Bloqueos pasados' : 'Bloqueos vigentes y futuros'}</h2>
        <Link prefetch={false} className="btn" href="/admin/bloqueos/nuevo">
          Nuevo bloqueo
        </Link>
      </div>
      <AdminNotice searchParams={sp} />
      <p>
        <Link prefetch={false} href={past ? '/admin/bloqueos' : '/admin/bloqueos?pasados=1'}>
          {past ? 'Ver los vigentes y futuros' : 'Ver los pasados'}
        </Link>
      </p>
      {blocks.length === 0 ? (
        <p>{past ? 'No hay bloqueos pasados.' : 'No hay bloqueos vigentes ni futuros.'}</p>
      ) : (
        <table className="orders orders--stack" role="table">
          <caption className="visually-hidden">Bloqueos</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">Cuándo y a quién</th>
              <th scope="col" role="columnheader">Motivo interno</th>
              <th scope="col" role="columnheader">Acciones</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {blocks.map((b) => (
              <tr key={b.id} role="row">
                <td role="cell" data-label="Cuándo y a quién">
                  {blockSummary(b, b.teamMemberId ? (allStaff.get(b.teamMemberId) ?? null) : null)}
                </td>
                <td role="cell" data-label="Motivo interno">{b.reason}</td>
                <td role="cell" data-label="Acciones">
                  <Link prefetch={false} href={`/admin/bloqueos/${b.id}`}>
                    Editar o borrar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
