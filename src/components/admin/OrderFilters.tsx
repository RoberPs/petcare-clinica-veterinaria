import { ORDER_STATUSES, statusLabel, type OrderStatus } from '@/domain/order-status';

// Pestañas de estado de la lista de pedidos (US2, G16): enlaces GET con su recuento en texto y
// aria-current en el filtro activo. Funcionan sin JavaScript.

interface Props {
  current: OrderStatus | null;
  counts: Record<OrderStatus, number> & { all: number };
  /** Número buscado: se conserva al cambiar de pestaña. */
  number?: string;
}

export function OrderFilters({ current, counts, number }: Props) {
  const href = (status: OrderStatus | null) => {
    const p = new URLSearchParams();
    if (status) p.set('estado', status);
    if (number) p.set('numero', number);
    const s = p.toString();
    return s ? `/admin/pedidos?${s}` : '/admin/pedidos';
  };
  const tabs: { status: OrderStatus | null; label: string; n: number }[] = [
    { status: null, label: 'Todos', n: counts.all },
    ...ORDER_STATUSES.map((s) => ({ status: s, label: statusLabel(s), n: counts[s] })),
  ];
  return (
    <nav aria-label="Filtrar pedidos por estado">
      <ul className="admin-filters">
        {tabs.map((t) => (
          <li key={t.status ?? 'all'}>
            <a href={href(t.status)} aria-current={t.status === current ? 'page' : undefined}>
              {t.label}
              <span className="admin-filters__count">
                <span className="visually-hidden">: </span>
                {t.n}
                <span className="visually-hidden"> {t.n === 1 ? 'pedido' : 'pedidos'}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Color del estado (G16), siempre acompañado del texto. */
export function statusBadgeClass(status: OrderStatus): string {
  switch (status) {
    case 'pending_payment':
      return 'badge badge--amber';
    case 'paid':
    case 'preparing':
      return 'badge badge--navy';
    case 'shipped':
    case 'ready_for_pickup':
      return 'badge badge--sky';
    case 'delivered':
      return 'badge';
    case 'cancelled':
      return 'badge badge--muted';
  }
}
