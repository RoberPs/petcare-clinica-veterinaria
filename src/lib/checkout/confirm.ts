import { createHash } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import { and, eq, sql } from 'drizzle-orm';
import { normalizeEmail } from '@/domain/account-schemas';
import { checkoutFingerprint } from '@/domain/cart-rules';
import { validateCheckout, type CheckoutData } from '@/domain/checkout-schemas';
import { cartTotals } from '@/domain/pricing';
import { CLINIC_TZ, todayInClinic } from '@/domain/time';
import { getDb, type DbOrTx } from '@/db/client';
import { findCart, lockCart, type CartKind, type CartOwner } from '@/db/queries/cart';
import { getCheckoutConfig, isShopEnabled, type CheckoutConfig } from '@/db/queries/checkout-config';
import { countPending, getOrderBySubmission, latestPayment, pendingCardOrderForCart, type OrderRow } from '@/db/queries/orders';
import { recordHit } from '@/db/queries/rate-limit';
import { carts, discountCodes, orderItems, orderStatusHistory, orders, payments } from '@/db/schema';
import { sendEmailsSoon } from '@/email/outbox';
import { checkPolicy, formField, formRecord, isHoneypotFilled, policyBucket } from '@/lib/account/common';
import { emptyCart, readCart, type CartView } from '@/lib/cart/cart';
import { hashCartToken } from '@/lib/cart/cookie';
import { verifySubmissionToken } from '@/lib/form-token';
import { logger } from '@/lib/logger';
import { signOrderRef } from '@/lib/orders/access';
import { enqueueOrderEmails } from '@/lib/orders/emails';
import { transitionOrder } from '@/lib/orders/transition';
import { getPaymentProvider, sessionExpiry } from '@/lib/payments/provider';
import { reserveStock, StockUnavailableError } from './reserve';

// Confirmación del pedido (contracts/routes.md, D4, D6, D10, D11, D12). Orden: guarda de la
// tienda → campo trampa → token → Zod → idempotencia (submission_id) → límite por origen →
// revalidación del carrito → límite de pendientes → transacción (bloqueo del carrito, pedido
// pendiente del mismo carrito, reserva de stock ordenada, uso del código, número, copia de líneas,
// historial y correos) → sesión de la pasarela fuera de la transacción, con compensación si falla.
// En los logs solo van ids y códigos (FR-032).

export interface ConfirmContext {
  ip: string;
  /** Hora de negocio (getNow(): admite x-test-now en las pruebas). */
  now: Date;
  customer: { id: string; email: string } | null;
  cartToken: string | null;
  /** Hora real para la antigüedad del token anti-robots (por defecto, new Date()). */
  realNow?: Date;
}

export type ConfirmResult =
  /** Pedido creado o reutilizado: url de la pasarela o de la confirmación. */
  | { status: 'ok'; url: string; orderId: string }
  | { status: 'invalid'; fieldErrors: Record<string, string>; values: Record<string, string> }
  /** El carrito ha cambiado (precio, cantidad o código): vuelta al carrito con el aviso. */
  | { status: 'cart_changed'; url: string }
  /** No queda stock para alguna línea: cantidades ajustadas y vuelta al carrito. */
  | { status: 'stock_unavailable'; url: string }
  /** Carrito vacío o inexistente. */
  | { status: 'empty'; url: string }
  | { status: 'rate_limited'; retryMinutes: number }
  | { status: 'limit_reached' }
  | { status: 'expired_token' }
  | { status: 'error' };

class DiscountGoneError extends Error {
  constructor() {
    super('discount_gone');
  }
}

const siteUrl = () => (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
export const confirmationUrl = (orderId: string, now: Date) => `/pedido/confirmado?ref=${signOrderRef(orderId, now)}`;
const cartUrl = (kind: CartKind) => (kind === 'direct' ? '/finalizar-compra?directa=1&aviso=carrito-ajustado' : '/carrito?aviso=carrito-ajustado');

/** Fin del día de recogida: inicio del día (hoy + pickup_days + 1) en Europe/Madrid (exclusivo). */
export function pickupDeadline(now: Date, pickupDays: number): Date {
  const day = Temporal.PlainDate.from(todayInClinic(now)).add({ days: pickupDays + 1 });
  return new Date(day.toZonedDateTime({ timeZone: CLINIC_TZ }).epochMilliseconds);
}

export const fingerprintHash = (canonical: string) => createHash('sha256').update(canonical).digest('hex');

/**
 * Sesión de pago del pedido (D8): una por pedido. Si hay una abierta y vigente se reutiliza; si no,
 * se crea (la pasarela es idempotente por pedido) y se guarda en payments.
 */
export async function ensureCheckoutSession(order: OrderRow, now: Date): Promise<string> {
  const existing = await latestPayment(order.id);
  if (existing && existing.status === 'open' && existing.expiresAt.getTime() > now.getTime()) return existing.checkoutUrl;
  const provider = await getPaymentProvider();
  const ref = signOrderRef(order.id, now);
  const expiresAt = sessionExpiry(order.reservationExpiresAt ?? now, now);
  const session = await provider.createCheckout({
    orderId: order.id,
    orderNumber: order.number,
    amountCents: order.totalCents,
    email: order.contactEmail ?? '',
    expiresAt,
    successUrl: `${siteUrl()}/pedido/confirmado?ref=${ref}${provider.name === 'stripe' ? '&session_id={CHECKOUT_SESSION_ID}' : ''}`,
    cancelUrl: `${siteUrl()}/pedido/pago-no-completado?ref=${ref}`,
  });
  await getDb()
    .insert(payments)
    .values({
      orderId: order.id,
      provider: provider.name,
      providerSessionId: session.sessionId,
      checkoutUrl: session.url,
      amountCents: order.totalCents,
      status: 'open',
      expiresAt,
    })
    .onConflictDoNothing();
  logger.info({ event: 'payment_session_created', order_id: order.id });
  return session.url;
}

/** Resultado para un pedido ya creado (reenvío del mismo formulario o misma huella). */
async function resultFor(order: OrderRow, now: Date): Promise<ConfirmResult> {
  if (order.paymentMethod === 'card' && order.status === 'pending_payment') {
    return { status: 'ok', url: await ensureCheckoutSession(order, now), orderId: order.id };
  }
  return { status: 'ok', url: confirmationUrl(order.id, now), orderId: order.id };
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const pg = e?.code ? e : e?.cause;
  return pg?.code === '23505' && pg.constraint === constraint;
}

interface CreateInput {
  ctx: ConfirmContext;
  config: CheckoutConfig;
  owner: CartOwner;
  kind: CartKind;
  view: CartView;
  data: CheckoutData;
  submissionId: string;
  fingerprint: string;
  bucket: string;
}

/** Transacción del pedido. Devuelve el pedido creado o el pendiente reutilizado (misma huella). */
async function createOrder(tx: DbOrTx, input: CreateInput): Promise<{ order: OrderRow; reused: boolean; emailIds: string[] }> {
  const { ctx, config, data, view } = input;
  const cart = await lockCart(input.owner, input.kind, tx);
  if (!cart || cart.id !== view.cart.id) throw new Error('cart_gone');
  const email = ctx.customer ? ctx.customer.email : data.email!;
  const contact = {
    contactEmail: email,
    contactEmailNormalized: normalizeEmail(email),
    firstName: data.firstName,
    lastName: data.lastName,
    addressLine: data.addressLine,
    postalCode: data.postalCode,
    city: data.city,
  };

  // FR-012 (D10): un solo pedido con tarjeta pendiente por carrito.
  if (data.paymentMethod === 'card') {
    const pending = await pendingCardOrderForCart(cart.id, tx);
    if (pending && pending.checkoutFingerprint === input.fingerprint && pending.shippingMethodCode === data.shippingMethod) {
      const [updated] = await tx.update(orders).set({ ...contact, updatedAt: ctx.now }).where(eq(orders.id, pending.id)).returning();
      return { order: updated!, reused: true, emailIds: [] };
    }
    if (pending) {
      await transitionOrder(tx, pending.id, 'cancelled', 'system', { now: ctx.now, reason: 'replaced', note: 'sustituido por un pedido nuevo' });
    }
  }

  const lines = view.lines.filter((l) => !l.unavailable);
  await reserveStock(tx, lines.map((l) => ({ productId: l.productId, quantity: l.quantity })));

  if (view.discount) {
    const taken = await tx
      .update(discountCodes)
      .set({ usesCount: sql`${discountCodes.usesCount} + 1` })
      .where(
        and(
          eq(discountCodes.id, view.discount.id),
          eq(discountCodes.enabled, true),
          sql`(${discountCodes.maxUses} is null or ${discountCodes.usesCount} < ${discountCodes.maxUses})`,
          sql`(${discountCodes.startsAt} is null or ${discountCodes.startsAt} <= ${ctx.now})`,
          sql`(${discountCodes.endsAt} is null or ${discountCodes.endsAt} > ${ctx.now})`,
        ),
      )
      .returning({ id: discountCodes.id });
    if (taken.length === 0) throw new DiscountGoneError();
  }

  const method = config.shippingMethods.find((m) => m.code === data.shippingMethod)!;
  const totals = cartTotals(
    lines.map((l) => ({ unitPriceCents: l.unitPriceCents, quantity: l.quantity, vatRate: l.vatRate })),
    view.discount?.rule ?? null,
    { costCents: method.costCents, vatRate: method.vatRate },
  );
  const seq = await tx.execute<{ n: string }>(sql`select nextval('order_number_seq')::text as n`);
  const number = `${config.settings.orderPrefix}${seq.rows[0]!.n.padStart(6, '0')}`;
  const card = data.paymentMethod === 'card';

  const [order] = await tx
    .insert(orders)
    .values({
      number,
      submissionId: input.submissionId,
      customerId: ctx.customer?.id ?? null,
      cartId: cart.id,
      checkoutFingerprint: input.fingerprint,
      ...contact,
      shippingMethodCode: method.code,
      shippingName: method.name,
      shippingKind: method.kind,
      shippingCostCents: method.costCents,
      shippingVatRate: method.vatRate,
      paymentMethod: data.paymentMethod,
      discountCode: view.discount?.code ?? null,
      discountCodeId: view.discount?.id ?? null,
      subtotalCents: totals.subtotalCents,
      discountCents: totals.discountCents,
      totalCents: totals.totalCents,
      vatCents: totals.vatCents,
      status: 'pending_payment',
      reservationStatus: 'held',
      reservationExpiresAt: card ? new Date(ctx.now.getTime() + config.settings.reservationMinutes * 60_000) : null,
      pickupDeadline: card ? null : pickupDeadline(ctx.now, config.settings.pickupDays),
      lastStatusAt: ctx.now,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .returning();

  await tx.insert(orderItems).values(
    lines.map((l, i) => ({
      orderId: order!.id,
      productId: l.productId,
      productName: l.name,
      productSlug: l.slug,
      unitPriceCents: l.unitPriceCents,
      vatRate: l.vatRate,
      quantity: l.quantity,
      discountShareCents: totals.lines[i]!.discountShareCents,
      lineTotalCents: totals.lines[i]!.netCents,
      vatCents: totals.lines[i]!.vatCents,
      position: i,
    })),
  );
  await tx.insert(orderStatusHistory).values({ orderId: order!.id, fromStatus: null, toStatus: 'pending_payment', actor: 'customer', createdAt: ctx.now });
  await recordHit(input.bucket, ctx.now, tx);

  let emailIds: string[] = [];
  if (!card) {
    // Pago en clínica (D11): no hay pasarela; el carrito se vacía ya y se avisa al comprador y a la clínica.
    await emptyCart(cart.id, tx);
    emailIds = await enqueueOrderEmails(tx, order!.id, ['order_received', 'clinic_order']);
  }
  return { order: order!, reused: false, emailIds };
}

export async function confirmOrder(form: FormData, ctx: ConfirmContext): Promise<ConfirmResult> {
  const kind: CartKind = formField(form, 'cart') === 'direct' ? 'direct' : 'main';
  try {
    const config = await getCheckoutConfig();
    if (!config || !(await isShopEnabled())) return { status: 'error' };
    // Campo trampa: un robot vuelve al carrito sin crear nada.
    if (isHoneypotFilled(form)) return { status: 'empty', url: '/carrito' };
    const token = verifySubmissionToken(formField(form, 'token'), ctx.realNow ?? new Date());
    if (!token.ok) return { status: 'expired_token' };

    const validation = validateCheckout(formRecord(form), {
      shippingMethods: config.shippingMethods,
      paymentMethods: config.paymentMethods,
      guest: !ctx.customer,
    });
    if (!validation.ok) return { status: 'invalid', fieldErrors: validation.fieldErrors, values: validation.values };
    const data = validation.data;

    // Reenvío del mismo formulario: el mismo pedido.
    const previous = await getOrderBySubmission(token.submissionId);
    if (previous) return await resultFor(previous, ctx.now);

    const bucket = policyBucket('checkout_origin', ctx.ip);
    const retryMinutes = await checkPolicy('checkout_origin', bucket, ctx.now);
    if (retryMinutes !== null) return { status: 'rate_limited', retryMinutes };

    const owner: CartOwner | null = ctx.customer
      ? { customerId: ctx.customer.id }
      : ctx.cartToken
        ? { tokenHash: hashCartToken(ctx.cartToken) }
        : null;
    const cart = owner ? await findCart(owner, kind) : null;
    if (!owner || !cart) return { status: 'empty', url: kind === 'direct' ? '/carrito' : '/carrito' };
    const view = await readCart(cart, config, ctx.now);
    if (!view.canCheckout) return { status: 'empty', url: '/carrito' };

    // Lo que el comprador vio ya no es lo que hay (precio, cantidad o código): vuelve a revisarlo.
    const method = config.shippingMethods.find((m) => m.code === data.shippingMethod)!;
    const lines = view.lines.filter((l) => !l.unavailable);
    const totals = cartTotals(
      lines.map((l) => ({ unitPriceCents: l.unitPriceCents, quantity: l.quantity, vatRate: l.vatRate })),
      view.discount?.rule ?? null,
      { costCents: method.costCents, vatRate: method.vatRate },
    );
    const expected = formField(form, 'expected_total');
    const changed =
      view.notices.length > 0 ||
      lines.some((l) => l.notices.length > 0) ||
      // expected_total: importe de los productos que vio el comprador (subtotal − descuento, sin envío).
      (expected !== undefined && expected !== '' && Number(expected) !== totals.subtotalCents - totals.discountCents);
    if (changed) return { status: 'cart_changed', url: cartUrl(kind) };

    // Límite de pedidos pendientes (sin contar el que se sustituiría en este carrito).
    const replaceable = data.paymentMethod === 'card' ? await pendingCardOrderForCart(cart.id) : null;
    const pending = ctx.customer
      ? await countPending({ customerId: ctx.customer.id })
      : await countPending({ emailNormalized: data.emailNormalized! });
    const max = ctx.customer ? config.settings.maxPendingPerCustomer : config.settings.maxPendingPerEmail;
    if (pending - (replaceable ? 1 : 0) >= max) return { status: 'limit_reached' };

    const fingerprint = fingerprintHash(
      checkoutFingerprint({ lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })), shippingMethod: data.shippingMethod, discountCode: view.discount?.code ?? null }),
    );

    let created: { order: OrderRow; reused: boolean; emailIds: string[] };
    try {
      created = await getDb().transaction((tx) =>
        createOrder(tx, { ctx, config, owner, kind, view, data, submissionId: token.submissionId, fingerprint, bucket }),
      );
    } catch (error) {
      if (error instanceof StockUnavailableError) {
        // Ajusta las cantidades del carrito al stock real y vuelve a él con el aviso.
        await readCart(cart, config, ctx.now);
        logger.info({ event: 'checkout_stock_unavailable', products: error.productIds.length });
        return { status: 'stock_unavailable', url: cartUrl(kind) };
      }
      if (error instanceof DiscountGoneError) {
        await getDb().update(carts).set({ discountCodeId: null }).where(eq(carts.id, cart.id));
        return { status: 'cart_changed', url: cartUrl(kind) };
      }
      if (isUniqueViolation(error, 'orders_submission_id_unique')) {
        const same = await getOrderBySubmission(token.submissionId);
        if (same) return await resultFor(same, ctx.now);
      }
      throw error;
    }
    sendEmailsSoon(created.emailIds);
    const { order } = created;
    if (!created.reused) logger.info({ event: 'order_created', order_id: order.id, payment: order.paymentMethod });
    if (order.paymentMethod === 'in_clinic') return { status: 'ok', url: confirmationUrl(order.id, ctx.now), orderId: order.id };

    try {
      return { status: 'ok', url: await ensureCheckoutSession(order, ctx.now), orderId: order.id };
    } catch (error) {
      // Compensación: sin sesión de pago, el pedido no puede seguir; se libera la reserva sin correo.
      logger.error({ event: 'payment_session_failed', order_id: order.id, code: error instanceof Error ? error.message.slice(0, 80) : 'unknown' });
      if (!created.reused) {
        await getDb().transaction((tx) =>
          transitionOrder(tx, order.id, 'cancelled', 'system', { now: ctx.now, reason: 'expired', note: 'no se pudo abrir la pasarela', skipEmail: true }),
        );
      }
      return { status: 'error' };
    }
  } catch (error) {
    logger.error({ event: 'checkout_failed', code: error instanceof Error ? error.message.slice(0, 80) : 'unknown' });
    return { status: 'error' };
  }
}
