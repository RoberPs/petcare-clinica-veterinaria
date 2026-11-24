// Motivos y límites del stock (feature 008, G5). Sin dependencias: lo usan también los componentes
// de cliente del panel.

export const STOCK_ADJUST_REASONS = ['restock', 'count', 'damage', 'other'] as const;
export type StockAdjustReason = (typeof STOCK_ADJUST_REASONS)[number];

/** Etiquetas de los motivos de un movimiento de stock (también los automáticos). */
export const STOCK_REASON_LABELS = {
  initial: 'Alta del producto',
  restock: 'Reposición',
  count: 'Recuento',
  damage: 'Rotura o merma',
  other: 'Otro',
  order_reserved: 'Reservado por un pedido',
  order_released: 'Devuelto por un pedido cancelado',
  content_load: 'Carga del archivo de contenido',
} as const;

export const MAX_STOCK_DELTA = 99_999;
