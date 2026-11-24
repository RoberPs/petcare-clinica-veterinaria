import { Temporal } from '@js-temporal/polyfill';
import { z } from 'zod';
import { adminFieldErrors, checkbox, dateParam, formObject, uuid } from './admin-schemas';
import { normalizeCode } from './discount';
import { ORDER_STATUSES } from './order-status';
import { MAX_STOCK_DELTA, STOCK_ADJUST_REASONS } from './stock';
import { CLINIC_TZ } from './time';
import { VAT_RATES } from './vat';

// Esquemas Zod de la tienda en el panel (feature 008, data-model.md "Reglas de validación").
// Los mensajes, en español. Lo comparten las Server Actions y los tests.

export { adminFieldErrors, checkbox, formObject, uuid };

/** Valor vacío de un formulario (cadena en blanco o ausente) como `undefined`. */
export const blankToUndefined = (v: unknown) => (v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EUROS_RE =/^\d{1,7}([.,]\d{1,2})?$/;

/**
 * "12,50" o "12.50" → 1250. Devuelve null si el formato no es válido (más de dos decimales,
 * signos, letras). Acepta coma o punto decimal, porque el teclado español escribe coma.
 */
export function eurosToCents(text: string): number | null {
  const t = text.trim();
  if (!EUROS_RE.test(t)) return null;
  const [whole, decimals = ''] = t.replace(',', '.').split('.');
  return Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
}

/** Importe en euros de un formulario, en céntimos, de `minCents` a `maxCents`. */
export const eurosField = (message: string, { minCents = 1, maxCents = 999_999 } = {}) =>
  z
    .string({ error: message })
    .trim()
    .transform((v, ctx) => {
      const cents = eurosToCents(v);
      if (cents === null || cents < minCents || cents > maxCents) {
        ctx.addIssue({ code: 'custom', message });
        return z.NEVER;
      }
      return cents;
    });

/** Entero de un formulario, de `min` a `max`. */
export const intField = (min: number, max: number, message: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' && /^-?\d+$/.test(v.trim()) ? Number(v.trim()) : v),
    z.number({ error: message }).int(message).min(min, message).max(max, message),
  );

/** Texto con longitud acotada (recortado). */
export const textField = (min: number, max: number, message: string) =>
  z.string({ error: message }).trim().min(min, message).max(max, message);

/** Texto opcional: vacío → null. */
export const optionalText = (max: number, message: string) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max, message).optional()).transform((v) => v ?? null);

// ---------- Producto (US1, data-model.md, G2 y G3) ----------

export const PRODUCT_LIMITS = {
  name: [2, 80],
  shortDescription: [10, 200],
  descriptionMd: [20, 5000],
  extraMd: 3000,
  maxPriceCents: 999_999,
  maxStock: 99_999,
  maxPosition: 9999,
  imageAlt: [3, 150],
} as const;

const L = PRODUCT_LIMITS;

/**
 * Formulario del producto. `has_image` no viene del formulario: lo fija la acción (foto nueva, o
 * foto actual que no se quita) para exigir el texto alternativo. `stock_initial` solo cuenta en el
 * alta. Los importes se devuelven en céntimos.
 */
export const productSchema = z
  .object({
    id: uuid.optional(),
    name: textField(L.name[0], L.name[1], `El nombre tiene que tener entre ${L.name[0]} y ${L.name[1]} caracteres.`),
    short_description: textField(
      L.shortDescription[0],
      L.shortDescription[1],
      `La descripción corta tiene que tener entre ${L.shortDescription[0]} y ${L.shortDescription[1]} caracteres.`,
    ),
    description_md: textField(
      L.descriptionMd[0],
      L.descriptionMd[1],
      `La descripción tiene que tener entre ${L.descriptionMd[0]} y ${L.descriptionMd[1]} caracteres.`,
    ),
    ingredients_md: optionalText(L.extraMd, `La composición admite como mucho ${L.extraMd} caracteres.`),
    usage_md: optionalText(L.extraMd, `El modo de uso admite como mucho ${L.extraMd} caracteres.`),
    category_id: z.string({ error: 'Elige una categoría.' }).trim().regex(UUID_RE, 'Elige una categoría.'),
    pet_ids: z
      .array(uuid, { error: 'Elige al menos una mascota.' })
      .min(1, 'Elige al menos una mascota.')
      .transform((ids) => [...new Set(ids)]),
    price: eurosField('El precio tiene que ser un importe mayor que 0 y de como mucho 9.999,99 € (con dos decimales como mucho).', {
      maxCents: L.maxPriceCents,
    }),
    on_sale: checkbox,
    compare_at: z.preprocess(blankToUndefined, z.string().optional()),
    vat_rate: z.preprocess(
      (v) => (typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v.trim()) : v),
      z.literal([...VAT_RATES], { error: `Elige un IVA válido (${VAT_RATES.join(', ')} %).` }),
    ),
    stock_initial: z.preprocess(blankToUndefined, intField(0, L.maxStock, `El stock inicial tiene que ser un número entero de 0 a ${L.maxStock}.`).optional()),
    is_new: checkbox,
    published: checkbox,
    position: intField(0, L.maxPosition, `La posición tiene que ser un número de 0 a ${L.maxPosition}.`),
    image_alt: optionalText(L.imageAlt[1], `El texto alternativo tiene que tener entre ${L.imageAlt[0]} y ${L.imageAlt[1]} caracteres.`),
    remove_image: checkbox,
    has_image: z.boolean().default(false),
  })
  .transform((v, ctx) => {
    let compareAtCents: number | null = null;
    if (v.on_sale) {
      const cents = v.compare_at === undefined ? null : eurosToCents(v.compare_at);
      if (cents === null || cents <= 0 || cents > L.maxPriceCents) {
        ctx.addIssue({ code: 'custom', path: ['compare_at'], message: 'Con «Oferta», escribe el precio anterior.' });
      } else if (cents <= v.price) {
        ctx.addIssue({ code: 'custom', path: ['compare_at'], message: 'El precio anterior tiene que ser mayor que el precio actual.' });
      } else compareAtCents = cents;
    }
    if (!v.id && v.stock_initial === undefined) {
      ctx.addIssue({ code: 'custom', path: ['stock_initial'], message: `El stock inicial tiene que ser un número entero de 0 a ${L.maxStock}.` });
    }
    if (v.has_image && (v.image_alt === null || v.image_alt.length < L.imageAlt[0])) {
      ctx.addIssue({
        code: 'custom',
        path: ['image_alt'],
        message: `Describe la foto: el texto alternativo tiene que tener entre ${L.imageAlt[0]} y ${L.imageAlt[1]} caracteres.`,
      });
    }
    return {
      id: v.id,
      name: v.name,
      shortDescription: v.short_description,
      descriptionMd: v.description_md,
      ingredientsMd: v.ingredients_md,
      usageMd: v.usage_md,
      categoryId: v.category_id,
      petIds: v.pet_ids,
      priceCents: v.price,
      compareAtCents,
      vatRate: v.vat_rate,
      stockInitial: v.stock_initial ?? 0,
      isNew: v.is_new,
      published: v.published,
      position: v.position,
      imageAlt: v.has_image ? v.image_alt : null,
      removeImage: v.remove_image,
    };
  });

export type ProductInput = z.output<typeof productSchema>;

// ---------- Pedidos (US2 y US3) ----------

/**
 * Enlace "Volver" del detalle de un pedido (G6): solo la lista del panel con su query, para no abrir
 * una redirección a otra parte. Cualquier otro valor vuelve a la lista sin filtros.
 */
export function ordersBackPath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 300) return '/admin/pedidos';
  if (value === '/admin/pedidos') return value;
  if (!value.startsWith('/admin/pedidos?')) return '/admin/pedidos';
  const query = value.slice('/admin/pedidos?'.length);
  // Solo los parámetros de la lista, reconstruidos: nada de "//", "\\" ni fragmentos.
  const src = new URLSearchParams(query);
  const out = new URLSearchParams();
  for (const key of ['estado', 'numero', 'pagina']) {
    const v = src.get(key);
    if (v && /^[A-Za-z0-9_ -]{1,30}$/.test(v)) out.set(key, v);
  }
  const s = out.toString();
  return s ? `/admin/pedidos?${s}` : '/admin/pedidos';
}

const orderStatusField = z.enum(ORDER_STATUSES, { error: 'Estado no válido.' });

/** Cambio de estado desde el detalle (G8: `from` es el estado que vio el administrador). */
export const orderStatusSchema = z.object({ id: uuid, from: orderStatusField, to: orderStatusField });

export const CANCEL_NOTE_LIMITS = [3, 200] as const;

/** Cancelación por la clínica (G10): motivo interno obligatorio. */
export const orderCancelSchema = z.object({
  id: uuid,
  from: orderStatusField,
  note: textField(CANCEL_NOTE_LIMITS[0], CANCEL_NOTE_LIMITS[1], `Escribe el motivo, de ${CANCEL_NOTE_LIMITS[0]} a ${CANCEL_NOTE_LIMITS[1]} caracteres.`),
});

/** Confirmación del pago en la clínica (US5): `deliver` entrega a la vez. */
export const inClinicPaymentSchema = z.object({ id: uuid, from: orderStatusField, deliver: checkbox });

// ---------- Ajuste de stock (US4, G5) ----------

export { MAX_STOCK_DELTA, STOCK_ADJUST_REASONS, STOCK_REASON_LABELS, type StockAdjustReason } from './stock';

export const stockAdjustSchema = z
  .object({
    id: uuid,
    delta: z.preprocess(
      (v) => (typeof v === 'string' && /^[+-]?\d+$/.test(v.trim()) ? Number(v.trim()) : v),
      z
        .number({ error: `Escribe un número entero distinto de 0, de −${MAX_STOCK_DELTA} a ${MAX_STOCK_DELTA}.` })
        .int(`Escribe un número entero distinto de 0, de −${MAX_STOCK_DELTA} a ${MAX_STOCK_DELTA}.`)
        .min(-MAX_STOCK_DELTA, `Escribe un número entero distinto de 0, de −${MAX_STOCK_DELTA} a ${MAX_STOCK_DELTA}.`)
        .max(MAX_STOCK_DELTA, `Escribe un número entero distinto de 0, de −${MAX_STOCK_DELTA} a ${MAX_STOCK_DELTA}.`)
        .refine((n) => n !== 0, 'La cantidad no puede ser 0.'),
    ),
    reason: z.enum(STOCK_ADJUST_REASONS, { error: 'Elige un motivo.' }),
    note: optionalText(200, 'La nota admite como mucho 200 caracteres.'),
  })
  .superRefine((v, ctx) => {
    if (v.reason === 'other' && !v.note) ctx.addIssue({ code: 'custom', path: ['note'], message: 'Con el motivo «Otro», explica el ajuste en la nota.' });
  });

export type StockAdjustInput = z.output<typeof stockAdjustSchema>;

// ---------- Códigos de descuento (US6, G12) ----------

/** "2026-12-01" a las 00:00:00 (o 23:59:59 con `endOfDay`) en Europe/Madrid. */
export function madridDayBoundary(isoDate: string, endOfDay = false): Date {
  const zdt = Temporal.PlainDate.from(isoDate).toZonedDateTime({
    timeZone: CLINIC_TZ,
    plainTime: endOfDay ? Temporal.PlainTime.from('23:59:59') : undefined,
  });
  return new Date(zdt.epochMilliseconds);
}

const optionalDate = z.preprocess(blankToUndefined, dateParam.optional());

export const discountSchema = z
  .object({
    code: z.string({ error: 'Escribe el código.' }).transform((v, ctx) => {
      const code = normalizeCode(v);
      if (!code) {
        ctx.addIssue({ code: 'custom', message: 'El código tiene que tener de 3 a 20 letras (sin tildes) o números.' });
        return z.NEVER;
      }
      return code;
    }),
    kind: z.enum(['percent', 'fixed'], { error: 'Elige el tipo de descuento.' }),
    value: z.string({ error: 'Escribe el valor del descuento.' }).trim(),
    starts_on: optionalDate,
    ends_on: optionalDate,
    min_subtotal: z.preprocess(blankToUndefined, z.string().trim().optional()),
    max_uses: z.preprocess(blankToUndefined, intField(1, 1_000_000, 'Los usos máximos tienen que ser un número entero mayor que 0.').optional()),
  })
  .transform((v, ctx) => {
    let value = 0;
    if (v.kind === 'percent') {
      const n = /^\d{1,3}$/.test(v.value) ? Number(v.value) : NaN;
      if (!Number.isInteger(n) || n < 1 || n > 100) ctx.addIssue({ code: 'custom', path: ['value'], message: 'El porcentaje tiene que ser un número entero de 1 a 100.' });
      else value = n;
    } else {
      const cents = eurosToCents(v.value);
      if (cents === null || cents <= 0) ctx.addIssue({ code: 'custom', path: ['value'], message: 'El importe tiene que ser mayor que 0 € (con dos decimales como mucho).' });
      else value = cents;
    }
    let minSubtotalCents: number | null = null;
    if (v.min_subtotal !== undefined) {
      const cents = eurosToCents(v.min_subtotal);
      if (cents === null || cents <= 0) ctx.addIssue({ code: 'custom', path: ['min_subtotal'], message: 'El pedido mínimo tiene que ser mayor que 0 €.' });
      else minSubtotalCents = cents;
    }
    if (v.starts_on && v.ends_on && v.ends_on < v.starts_on) {
      ctx.addIssue({ code: 'custom', path: ['ends_on'], message: 'La fecha de fin no puede ser anterior a la de inicio.' });
    }
    return {
      code: v.code,
      kind: v.kind,
      value,
      startsAt: v.starts_on ? madridDayBoundary(v.starts_on) : null,
      endsAt: v.ends_on ? madridDayBoundary(v.ends_on, true) : null,
      minSubtotalCents,
      maxUses: v.max_uses ?? null,
    };
  });

export type DiscountInput = z.output<typeof discountSchema>;
