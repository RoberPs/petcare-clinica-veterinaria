import { createHash, randomBytes } from 'node:crypto';
import { loadContentFile, type LoadSummary } from '@/content/load';
import { getDb } from '@/db/client';
import { petcareContent, writeVariant, type Content } from './catalog';
import { createSubmissionToken } from '@/lib/form-token';
import { formData, q } from './db';

// Ayudas de las pruebas de integración del carrito y el pago (feature 005).

/** Prefijos de la península (sin Baleares 07, Las Palmas 35, Santa Cruz 38, Ceuta 51 ni Melilla 52). */
export const PENINSULA_PREFIXES = Array.from({ length: 50 }, (_, i) => String(i + 1).padStart(2, '0')).filter(
  (p) => !['07', '35', '38'].includes(p),
);

/** Carga content/petcare.yaml (tienda y checkout activos) con los cambios de `mutate`. */
export async function seedShop(mutate?: (content: Content) => void): Promise<LoadSummary> {
  const content = petcareContent();
  mutate?.(content);
  return loadContentFile(getDb(), writeVariant(content));
}

export interface CheckoutSeedOptions {
  /** Prefijos del envío a domicilio (null = toda España). */
  postalPrefixes?: string[] | null;
  mutate?: (checkout: Content, content: Content) => void;
}

/** Carga la demo con el bloque checkout: ajustado. */
export async function seedCheckoutConfig(options: CheckoutSeedOptions = {}): Promise<LoadSummary> {
  return seedShop((content) => {
    if (options.postalPrefixes !== undefined) {
      content.checkout.shipping_methods.find((m: Content) => m.kind === 'home_delivery').postal_prefixes =
        options.postalPrefixes;
    }
    options.mutate?.(content.checkout, content);
  });
}

/** Desactiva la compra (sections.carrito.href nulo) sin tocar la tienda. */
export async function disableShop(): Promise<void> {
  await q(`UPDATE sections SET href = NULL WHERE key = 'carrito'`);
}

export interface ProductRow {
  id: string;
  slug: string;
  name: string;
  price_cents: number;
  vat_rate: number;
  stock: number;
}

export async function productBySlug(slug: string): Promise<ProductRow> {
  const [row] = await q<ProductRow>('SELECT id, slug, name, price_cents, vat_rate, stock FROM products WHERE slug = $1', [slug]);
  if (!row) throw new Error(`No existe el producto ${slug}`);
  return row;
}

export async function setStock(slug: string, stock: number): Promise<void> {
  await q('UPDATE products SET stock = $2 WHERE slug = $1', [slug, stock]);
}

/** Token de cookie pc_cart nuevo y su hash (lo que se guarda en carts.token_hash). */
export function newCartToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: createHash('sha256').update(token).digest('hex') };
}

export interface MakeCartOptions {
  customerId?: string;
  tokenHash?: string;
  kind?: 'main' | 'direct';
  /** `seenPriceCents`: precio que vio el comprador (por defecto, el actual). */
  items: { slug: string; quantity: number; seenPriceCents?: number }[];
  discountCode?: string;
}

/** Crea un carrito con líneas directamente en la base (sin pasar por las acciones). */
export async function makeCart(options: MakeCartOptions): Promise<string> {
  const tokenHash = options.customerId ? null : (options.tokenHash ?? newCartToken().hash);
  const discountId = options.discountCode
    ? (await q<{ id: string }>('SELECT id FROM discount_codes WHERE code = $1', [options.discountCode]))[0]!.id
    : null;
  const [cart] = await q<{ id: string }>(
    `INSERT INTO carts (kind, customer_id, token_hash, discount_code_id) VALUES ($1, $2, $3, $4) RETURNING id`,
    [options.kind ?? 'main', options.customerId ?? null, tokenHash, discountId],
  );
  for (const [i, item] of options.items.entries()) {
    const p = await productBySlug(item.slug);
    await q(
      `INSERT INTO cart_items (cart_id, product_id, quantity, unit_price_cents, added_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(secs => $5))`,
      [cart!.id, p.id, item.quantity, item.seenPriceCents ?? p.price_cents, i],
    );
  }
  return cart!.id;
}

export async function cartLines(cartId: string): Promise<{ slug: string; quantity: number }[]> {
  return q(
    `SELECT p.slug, ci.quantity FROM cart_items ci JOIN products p ON p.id = ci.product_id
     WHERE ci.cart_id = $1 ORDER BY ci.added_at`,
    [cartId],
  );
}

export async function orderRow(orderId: string): Promise<Record<string, any>> {
  const [row] = await q('SELECT * FROM orders WHERE id = $1', [orderId]);
  if (!row) throw new Error(`No existe el pedido ${orderId}`);
  return row;
}

export async function outboxKinds(orderId: string): Promise<string[]> {
  return (await q<{ kind: string }>('SELECT kind FROM email_outbox WHERE order_id = $1 ORDER BY created_at, kind', [orderId])).map(
    (r) => r.kind,
  );
}

// ---------- Checkout ----------

/** Token del formulario con 5 s de antigüedad (supera el tiempo mínimo anti-robots). */
export function checkoutToken(): string {
  return createSubmissionToken(new Date(Date.now() - 5_000));
}

export const HOME_FIELDS = {
  first_name: 'Ana',
  last_name: 'Pruebas',
  shipping_method: 'domicilio',
  payment_method: 'card',
  address_line: 'Calle de las Pruebas 1',
  postal_code: '28001',
  city: 'Madrid',
};

/** FormData del checkout de un invitado con envío a domicilio y tarjeta (con cambios). */
export function checkoutForm(overrides: Record<string, string | undefined> = {}): FormData {
  return formData({ token: checkoutToken(), email: 'comprador@example.test', ...HOME_FIELDS, ...overrides });
}

let ipCounter = 0;
/** Contexto de un invitado con su cookie de carrito y una IP distinta en cada llamada. */
export function guestCtx(cartToken: string, now = new Date()) {
  ipCounter += 1;
  return { ip: `203.0.113.${ipCounter % 250}`, now, customer: null, cartToken };
}

export function customerCtx(customer: { id: string; email: string }, now = new Date()) {
  ipCounter += 1;
  return { ip: `198.51.100.${ipCounter % 250}`, now, customer: { id: customer.id, email: customer.email }, cartToken: null };
}

/** Carrito de invitado con su token en claro (para el contexto). */
export async function guestCart(items: MakeCartOptions['items'], extra: Partial<MakeCartOptions> = {}): Promise<{ token: string; cartId: string }> {
  const { token, hash } = newCartToken();
  const cartId = await makeCart({ ...extra, tokenHash: hash, items });
  return { token, cartId };
}

/** Pedido con tarjeta pendiente de un invitado, creado con confirmOrder (sesión simulada abierta). */
export async function cardOrder(
  items: MakeCartOptions['items'] = [{ slug: 'pienso-perro-adulto', quantity: 1 }],
  options: { now?: Date; email?: string; fields?: Record<string, string> } = {},
): Promise<{ orderId: string; sessionId: string; amountCents: number; cartId: string }> {
  const { confirmOrder } = await import('@/lib/checkout/confirm');
  const { token, cartId } = await guestCart(items);
  const result = await confirmOrder(
    checkoutForm({ email: options.email ?? 'comprador@example.test', ...options.fields }),
    guestCtx(token, options.now ?? new Date()),
  );
  if (result.status !== 'ok') throw new Error(`confirmOrder: ${result.status}`);
  const [p] = await q<{ provider_session_id: string; amount_cents: number }>(
    'SELECT provider_session_id, amount_cents FROM payments WHERE order_id = $1',
    [result.orderId],
  );
  return { orderId: result.orderId, sessionId: p!.provider_session_id, amountCents: p!.amount_cents, cartId };
}
