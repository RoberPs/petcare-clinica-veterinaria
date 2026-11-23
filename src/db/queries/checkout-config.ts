import { asc, eq, sql } from 'drizzle-orm';
import type { PaymentMethod, ShippingKind } from '@/domain/order-status';
import { getDb } from '../client';
import { sections, shippingMethods, shopSettings } from '../schema';

// Configuración del carrito y el pago (bloque checkout: del YAML, cargado en la BD).

export interface ShippingMethodView {
  id: string;
  code: string;
  kind: ShippingKind;
  name: string;
  description: string;
  costCents: number;
  vatRate: number;
  postalPrefixes: string[] | null;
}

export interface CheckoutSettings {
  cardEnabled: boolean;
  inClinicEnabled: boolean;
  reservationMinutes: number;
  pickupDays: number;
  cartRetentionDays: number;
  maxQtyPerLine: number;
  maxPendingPerEmail: number;
  maxPendingPerCustomer: number;
  orderPrefix: string;
  guestLinkDays: number;
  checkoutNoticeText: string | null;
}

export interface CheckoutConfig {
  settings: CheckoutSettings;
  /** Métodos de envío activos, en su orden. */
  shippingMethods: ShippingMethodView[];
  /** Métodos de pago activos. */
  paymentMethods: PaymentMethod[];
}

/** ¿Está activa la compra? Sección "carrito" con href, sección "tienda" con href y ajustes cargados. */
export async function isShopEnabled(): Promise<boolean> {
  const result = await getDb().execute<{ ok: boolean }>(sql`select (
      exists (select 1 from ${sections} where ${sections.key} = 'carrito' and ${sections.href} is not null)
      and exists (select 1 from ${sections} where ${sections.key} = 'tienda' and ${sections.href} is not null)
      and exists (select 1 from ${shopSettings})
    ) as ok`);
  return result.rows[0]?.ok === true;
}

/** Ajustes de la tienda, o null si no están cargados. */
export async function getCheckoutSettings(): Promise<CheckoutSettings | null> {
  const [row] = await getDb()
    .select({
      cardEnabled: shopSettings.cardEnabled,
      inClinicEnabled: shopSettings.inClinicEnabled,
      reservationMinutes: shopSettings.reservationMinutes,
      pickupDays: shopSettings.pickupDays,
      cartRetentionDays: shopSettings.cartRetentionDays,
      maxQtyPerLine: shopSettings.maxQtyPerLine,
      maxPendingPerEmail: shopSettings.maxPendingPerEmail,
      maxPendingPerCustomer: shopSettings.maxPendingPerCustomer,
      orderPrefix: shopSettings.orderPrefix,
      guestLinkDays: shopSettings.guestLinkDays,
      checkoutNoticeText: shopSettings.checkoutNoticeText,
    })
    .from(shopSettings)
    .limit(1);
  return row ?? null;
}

export async function getCheckoutConfig(): Promise<CheckoutConfig | null> {
  const settings = await getCheckoutSettings();
  if (!settings) return null;
  const methods = await getDb()
    .select({
      id: shippingMethods.id,
      code: shippingMethods.code,
      kind: shippingMethods.kind,
      name: shippingMethods.name,
      description: shippingMethods.description,
      costCents: shippingMethods.costCents,
      vatRate: shippingMethods.vatRate,
      postalPrefixes: shippingMethods.postalPrefixes,
    })
    .from(shippingMethods)
    .where(eq(shippingMethods.enabled, true))
    .orderBy(asc(shippingMethods.position), asc(shippingMethods.code));
  const paymentMethods: PaymentMethod[] = [];
  if (settings.cardEnabled) paymentMethods.push('card');
  if (settings.inClinicEnabled && methods.some((m) => m.kind === 'clinic_pickup')) paymentMethods.push('in_clinic');
  return { settings, shippingMethods: methods, paymentMethods };
}

/** Envío más barato activo: es el que se muestra en el resumen del carrito antes de elegir. */
export function cheapestShipping(config: CheckoutConfig): ShippingMethodView | null {
  return config.shippingMethods.reduce<ShippingMethodView | null>(
    (best, m) => (best === null || m.costCents < best.costCents ? m : best),
    null,
  );
}
