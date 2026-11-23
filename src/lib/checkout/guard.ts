import { isShopEnabled, type CheckoutConfig } from '@/db/queries/checkout-config';

// Guarda de la tienda (contracts/routes.md). El 404 del middleware no cubre las Server Actions,
// porque se envían a la ruta de la página que las contiene (p. ej. /productos): todas las acciones
// de la feature 005 llaman a assertShopEnabled() antes de tocar la base de datos.

export class ShopDisabledError extends Error {
  constructor() {
    super('shop_disabled');
    this.name = 'ShopDisabledError';
  }
}

/** Lanza ShopDisabledError si la compra está desactivada (sections.carrito.href nulo). */
export async function assertShopEnabled(): Promise<void> {
  if (!(await isShopEnabled())) throw new ShopDisabledError();
}

/** ¿Está activo el método de envío o de pago recibido? (aunque se envíe a mano). */
export function isMethodEnabled(config: CheckoutConfig, kind: 'shipping' | 'payment', code: string): boolean {
  if (kind === 'shipping') return config.shippingMethods.some((m) => m.code === code);
  return (config.paymentMethods as string[]).includes(code);
}
