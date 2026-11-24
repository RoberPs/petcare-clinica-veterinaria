import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { listDiscountCodesAdmin } from '@/db/queries/admin-discounts';
import { DISCOUNT_STATE_LABELS, discountState, type DiscountState } from '@/domain/discount';
import { formatEur } from '@/domain/money';
import { formatDateTime } from '@/domain/time';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';
import { createSubmissionToken } from '@/lib/form-token';
import { setDiscountEnabled } from './actions';

export const metadata: Metadata = { title: 'Descuentos' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const STATE_BADGE: Record<DiscountState, string> = {
  active: 'badge',
  scheduled: 'badge badge--sky',
  exhausted: 'badge badge--amber',
  expired: 'badge badge--muted',
  disabled: 'badge badge--muted',
};

// Códigos de descuento (US6, escenario 4): tipo, valor, condiciones, estado calculado y usos. No se
// editan: solo se desactivan o reactivan.
export default async function AdminDiscountsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const [sp, now] = await Promise.all([searchParams, getNow()]);
  const codes = await listDiscountCodesAdmin();
  const token = createSubmissionToken(now);
  return (
    <>
      <div className="admin-heading">
        <h2>Descuentos</h2>
        <Link prefetch={false} className="btn" href="/admin/descuentos/nuevo">
          Nuevo código
        </Link>
      </div>
      <AdminNotice searchParams={sp} context="discount" />
      {codes.length === 0 ? (
        <p>Aún no hay códigos de descuento.</p>
      ) : (
        <table className="orders orders--stack" role="table">
          <caption className="visually-hidden">Códigos de descuento</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">Código</th>
              <th scope="col" role="columnheader">Descuento</th>
              <th scope="col" role="columnheader">Condiciones</th>
              <th scope="col" role="columnheader">Usos</th>
              <th scope="col" role="columnheader">Estado</th>
              <th scope="col" role="columnheader">
                <span className="visually-hidden">Acción</span>
              </th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {codes.map((c) => {
              const state = discountState(c, now);
              const conditions = [
                c.minSubtotalCents ? `Pedido mínimo ${formatEur(c.minSubtotalCents)}` : null,
                c.startsAt ? `Desde ${formatDateTime(c.startsAt)}` : null,
                c.endsAt ? `Hasta ${formatDateTime(c.endsAt)}` : null,
              ].filter(Boolean);
              return (
                <tr key={c.id} role="row">
                  <td role="cell" data-label="Código">
                    <strong>{c.code}</strong>
                  </td>
                  <td role="cell" data-label="Descuento">{c.kind === 'percent' ? `${c.value} %` : formatEur(c.value)}</td>
                  <td role="cell" data-label="Condiciones">{conditions.length ? conditions.join(' · ') : 'Sin condiciones'}</td>
                  <td role="cell" data-label="Usos">
                    {c.usesCount}
                    {c.maxUses ? ` de ${c.maxUses}` : ' (sin límite)'}
                  </td>
                  <td role="cell" data-label="Estado">
                    <span className={STATE_BADGE[state]}>{DISCOUNT_STATE_LABELS[state]}</span>
                  </td>
                  <td role="cell" data-label="Acción">
                    <form action={setDiscountEnabled}>
                      <input type="hidden" name="submission" value={token} />
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="enabled" value={c.enabled ? '0' : '1'} />
                      <button className={c.enabled ? 'btn btn--ghost btn--sm' : 'btn btn--sm'} type="submit" aria-label={`${c.enabled ? 'Desactivar' : 'Reactivar'} ${c.code}`}>
                        {c.enabled ? 'Desactivar' : 'Reactivar'}
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
