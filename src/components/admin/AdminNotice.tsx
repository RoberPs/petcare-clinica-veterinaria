// Avisos del panel tras un POST-Redirect-GET (?aviso=<clave>, contracts/routes.md). El éxito va en
// menta con role="status"; los problemas, con role="alert".

import { NoticeBox } from './NoticeBox';

type SearchParams =Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const OK: Record<string, string> = {
  guardado: 'Cambios guardados.',
  cancelada: 'Cita cancelada. Se ha avisado al cliente por correo.',
  movida: 'Cita movida. Se ha avisado al cliente por correo.',
  'bloqueo-guardado': 'Bloqueo guardado.',
  'bloqueo-borrado': 'Bloqueo borrado.',
  // Tienda (feature 008, contracts/routes.md)
  'stock-ajustado': 'Stock ajustado.',
  'estado-cambiado': 'Estado del pedido cambiado. Se ha avisado al comprador por correo.',
  'pago-confirmado': 'Pago confirmado. Se ha avisado al comprador por correo.',
  'pago-y-entrega': 'Pago y entrega confirmados. Se ha avisado al comprador por correo.',
  cancelado: 'Pedido cancelado. Se ha avisado al comprador por correo.',
  'cancelado-reembolso': 'Pedido cancelado y reembolso iniciado. Se ha avisado al comprador por correo.',
  'reembolso-reintentado': 'Se ha vuelto a intentar el reembolso.',
  creado: 'Código de descuento creado.',
};

/** Avisos que dependen de la pantalla: el producto y el código de descuento comparten clave. */
const OK_BY_CONTEXT: Record<string, Record<string, string>> = {
  product: {
    desactivado: 'Producto desactivado: ya no aparece en el catálogo ni se puede comprar.',
    reactivado: 'Producto reactivado: vuelve a aparecer en el catálogo.',
  },
  discount: {
    desactivado: 'Código desactivado: deja de aplicarse en los carritos.',
    reactivado: 'Código reactivado.',
  },
};

const PROBLEM: Record<string, string> = {
  'cita-cambiada': 'La cita ha cambiado mientras la mirabas. Revisa su estado actual antes de volver a intentarlo.',
  'no-modificable': 'Esta cita ya no se puede modificar: está cancelada o ya ha pasado.',
  'franja-ocupada': 'Esa franja ya no está libre. Elige otra.',
  'elige-franja': 'Elige una fecha, un veterinario que atienda el servicio y una franja libre.',
  'afectadas-cambiadas': 'Las citas afectadas han cambiado. Revísalas de nuevo antes de guardar.',
  'elige-decision': 'Elige qué hacer con las citas afectadas: mantenerlas o cancelarlas todas.',
  'pedido-cambiado': 'El pedido ha cambiado mientras lo mirabas. Revisa su estado actual antes de volver a intentarlo.',
  'transicion-no-permitida': 'Ese cambio de estado ya no está permitido para este pedido.',
  'pedido-no-vigente': 'Este pedido ya no está pendiente de pago en la clínica: ha caducado o se ha cancelado.',
  'stock-insuficiente': 'No hay unidades suficientes para restar esa cantidad.',
  'no-encontrado': 'No se ha encontrado lo que buscabas: puede que ya no exista.',
  caducado: 'El formulario ha caducado. Vuelve a enviarlo.',
  error: 'No se ha podido guardar. Inténtalo de nuevo en unos minutos.',
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function AdminNotice({
  searchParams,
  context = 'schedule',
}: {
  searchParams: SearchParams;
  context?: 'schedule' | 'service' | 'product' | 'discount' | 'order';
}) {
  const key = first(searchParams.aviso);
  if (!key) return null;
  if (PROBLEM[key]) {
    const max = Number(first(searchParams.max));
    return (
      <NoticeBox className="notice" role="alert" focusKey={`${key}:${max}`}>
        <p>{PROBLEM[key]}</p>
        {key === 'stock-insuficiente' && Number.isInteger(max) && max >= 0 ? (
          <p>Como mucho puedes restar {max} {plural(max, 'unidad', 'unidades')}.</p>
        ) : null}
      </NoticeBox>
    );
  }
  const message = OK_BY_CONTEXT[context]?.[key] ?? OK[key];
  if (!message) return null;
  const affected = Number(first(searchParams.afectadas) ?? 0);
  const cancelled = Number(first(searchParams['canceladas-n']) ?? 0);
  const extra: string[] = [];
  if (Number.isInteger(affected) && affected > 0)
    extra.push(
      context === 'service'
        ? `El servicio tiene ${affected} ${plural(affected, 'cita futura', 'citas futuras')}: se mantienen tal como estaban.`
        : `${affected} ${plural(affected, 'cita futura queda', 'citas futuras quedan')} fuera de horario: se mantienen y aparecen marcadas en la agenda.`,
    );
  if (first(searchParams['sin-franjas']) === '1')
    extra.push('Ningún tramo de horario de sus veterinarios admite esta duración: el servicio no se puede reservar.');
  if (first(searchParams['fuera-clinica']) === '1')
    extra.push('Parte del horario queda fuera del horario de la clínica: esa parte no se ofrece en la reserva.');
  if (Number.isInteger(cancelled) && cancelled > 0)
    extra.push(
      plural(
        cancelled,
        'Se ha cancelado 1 cita y se ha avisado al cliente por correo.',
        `Se han cancelado ${cancelled} citas y se ha avisado a los clientes por correo.`,
      ),
    );
  return (
    <NoticeBox className="status-ok" role="status" focusKey={`${key}:${extra.join('|')}`}>
      <p>{message}</p>
      {extra.map((t) => (
        <p key={t}>{t}</p>
      ))}
    </NoticeBox>
  );
}
