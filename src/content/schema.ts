import { z } from 'zod';
import { parseEuros } from '@/domain/money';
import { VAT_RATES } from '@/domain/vat';

// Esquema del archivo de contenido por clínica (contracts/content-file.md). Mensajes en español.

const LEGAL_KINDS = ['aviso-legal', 'privacidad', 'cookies', 'terminos', 'condiciones-venta', 'boletin'] as const;
/** Páginas legales obligatorias siempre; condiciones-venta solo con el carrito activo (feature 005). */
const REQUIRED_LEGAL_KINDS = ['aviso-legal', 'privacidad', 'cookies', 'terminos'] as const;
const SECTION_KEYS = ['reservas', 'tienda', 'carrito', 'consejos', 'cuenta'] as const;

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'el slug debe estar en kebab-case (a-z, 0-9 y guiones)');
const text = (max: number, min = 1) =>
  z
    .string()
    .trim()
    .min(min, min === 1 ? 'no puede estar vacío' : `debe tener al menos ${min} caracteres`)
    .max(max, `no puede superar ${max} caracteres`);
const email = z.string().trim().email('no es un correo válido');
const imagePath = z
  .string()
  .regex(/^media\/[A-Za-z0-9/_.-]+\.(svg|png|jpe?g|webp|avif)$/, 'la imagen debe ser una ruta dentro de public/media/');
const isoDate = z.preprocess(
  (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'la fecha debe tener el formato AAAA-MM-DD'),
);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'la hora debe tener el formato HH:MM');

function uniqueBy<T>(items: T[], key: (item: T) => string, ctx: z.RefinementCtx, label: string): void {
  const seen = new Set<string>();
  items.forEach((item, i) => {
    const k = key(item);
    if (seen.has(k)) ctx.addIssue({ code: 'custom', path: [i], message: `${label} repetido: ${k}` });
    seen.add(k);
  });
}

const imageFields = { image: imagePath.nullish(), image_alt: text(200).nullish() };
const altRequired = (v: { image?: string | null; image_alt?: string | null }) => !v.image || !!v.image_alt;
const altIssue = { message: 'si hay imagen, image_alt es obligatorio', path: ['image_alt'] };

export const clinicSchema = z.object({
  name: text(80),
  demo_banner_enabled: z.boolean(),
  logo: imagePath.nullish(),
  hero: z.object({ title: text(120), text: text(300), ...imageFields }).refine(altRequired, altIssue),
  about: z.object({ title: text(120), text: text(600), ...imageFields }).refine(altRequired, altIssue).nullish(),
  address: z.object({ line: text(160), postal_code: text(10), city: text(80), province: text(80) }),
  geo: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .nullish(),
  phone: z.object({
    e164: z.string().regex(/^\+[1-9]\d{7,14}$/, 'el teléfono debe estar en formato E.164 (+34…)'),
    display: text(30),
  }),
  public_email: email.nullish(),
  inbox_email: email,
  response_time_text: text(120),
  legal: z.object({
    owner_name: text(160),
    contact_email: email,
    tax_id: z.string().trim().min(1).nullish(),
    address: z.string().trim().min(1).nullish(),
  }),
});

const openingSlot = z
  .object({ weekday: z.number().int().min(1, 'weekday va de 1 a 7').max(7, 'weekday va de 1 a 7'), opens: hhmm, closes: hhmm })
  .refine((s) => s.opens < s.closes, { message: 'la hora de apertura debe ser anterior a la de cierre', path: ['closes'] });

const closure = z
  .object({ slug, starts_on: isoDate, ends_on: isoDate, reason: text(120) })
  .refine((c) => c.starts_on <= c.ends_on, { message: 'starts_on no puede ser posterior a ends_on', path: ['ends_on'] });

// Especies de mascota (feature 002, contracts/content-file.md). "other" está reservada: es la opción
// "Otra" que añade la interfaz.
export const SPECIES_KEY_RE = /^[a-z][a-z0-9-]{0,31}$/;
const speciesItem = z.object({
  key: z
    .string()
    .regex(SPECIES_KEY_RE, 'la clave de la especie debe empezar por una letra y usar a-z, 0-9 y guiones (máximo 32)')
    .refine((k) => k !== 'other', 'la clave "other" está reservada para la opción "Otra"'),
  label: text(40),
});

// Reserva de citas (feature 003, contracts/content-file.md). Las reglas tienen valores por defecto.
const intIn = (min: number, max: number, def: number) =>
  z.number().int(`debe ser un número entero`).min(min, `debe estar entre ${min} y ${max}`).max(max, `debe estar entre ${min} y ${max}`).default(def);

export const bookingRulesSchema = z.object({
  slot_step_minutes: intIn(5, 120, 30),
  min_lead_minutes: intIn(0, 10_080, 120),
  horizon_days: intIn(1, 365, 60),
  change_cutoff_hours: intIn(0, 168, 24),
  max_active_per_email: intIn(1, 20, 3),
  max_active_per_customer: intIn(1, 50, 9),
  reminder_hours_before: intIn(0, 72, 24),
  retention_months: intIn(1, 60, 12),
});

const bookingService = z.object({
  slug: slug.refine((v) => v.length <= 60, 'el slug no puede superar 60 caracteres'),
  name: text(80),
  duration_minutes: z
    .number()
    .int('la duración debe ser un número entero de minutos')
    .min(5, 'la duración debe estar entre 5 y 480 minutos')
    .max(480, 'la duración debe estar entre 5 y 480 minutos')
    .refine((v) => v % 5 === 0, 'la duración debe ser un múltiplo de 5 minutos'),
  service: slug.nullish(),
  staff: z
    .array(slug, { error: 'falta la lista de profesionales (staff)' })
    .min(1, 'cada servicio necesita al menos un profesional')
    .max(20, 'no puede haber más de 20 profesionales por servicio')
    .superRefine((v, ctx) => uniqueBy(v, (x) => x, ctx, 'profesional')),
});

export const bookingSchema = z.object({
  rules: bookingRulesSchema.default(bookingRulesSchema.parse({})),
  services: z
    .array(bookingService, { error: 'falta la lista de servicios reservables (services)' })
    .min(1, 'tiene que haber al menos un servicio reservable')
    .max(20, 'no puede haber más de 20 servicios reservables')
    .superRefine((v, ctx) => uniqueBy(v, (sv) => sv.slug, ctx, 'slug')),
});

// Catálogo de la tienda (feature 004, contracts/content-file.md). Los precios van en euros como
// cadena ("39.90") y la carga los convierte a céntimos.
const euros = z
  .string({ error: 'el precio debe ir entre comillas, en euros con punto decimal (por ejemplo "39.90")' })
  .refine((v) => parseEuros(v) !== null, 'el precio debe ser mayor que 0, en euros con 2 decimales como máximo (por ejemplo "39.90")');
const markdown = z.string().nullish();

const shopTaxon = (maxName: number) =>
  z.object({ slug: slug.refine((v) => v.length <= 60, 'el slug no puede superar 60 caracteres'), name: text(maxName) });

const shopProduct = z
  .object({
    slug: slug.refine((v) => v.length <= 80, 'el slug no puede superar 80 caracteres'),
    name: text(120),
    category: slug,
    pets: z
      .array(slug, { error: 'falta la lista de mascotas (pets)' })
      .min(1, 'cada producto necesita al menos una mascota')
      .superRefine((v, ctx) => uniqueBy(v, (x) => x, ctx, 'mascota')),
    price: euros,
    compare_at_price: euros.nullish(),
    vat_rate: z.literal([...VAT_RATES], { error: `el IVA (vat_rate) debe ser ${VAT_RATES.join(', ')}` }),
    stock: z.number().int('el stock debe ser un número entero').min(0, 'el stock no puede ser negativo'),
    is_new: z.boolean().default(false),
    ...imageFields,
    short_description: text(300),
    description: text(20_000),
    ingredients: markdown,
    usage: markdown,
  })
  .refine(altRequired, altIssue);

export const shopSchema = z
  .object({
    settings: z.object({
      shipping_text: text(40),
      page_size: intIn(4, 48, 12),
      meta_description: text(300),
      demo_notice: z
        .object({ enabled: z.boolean(), text: text(200).nullish() })
        .refine((v) => !v.enabled || !!v.text, { message: 'si el aviso está activado, text es obligatorio', path: ['text'] })
        .default({ enabled: false }),
    }),
    categories: z
      .array(shopTaxon(60), { error: 'falta la lista de categorías (categories)' })
      .min(1, 'tiene que haber al menos una categoría')
      .max(20, 'no puede haber más de 20 categorías')
      .superRefine((v, ctx) => uniqueBy(v, (c) => c.slug, ctx, 'slug')),
    pets: z
      .array(shopTaxon(40), { error: 'falta la lista de mascotas (pets)' })
      .min(1, 'tiene que haber al menos una mascota')
      .max(10, 'no puede haber más de 10 mascotas')
      .superRefine((v, ctx) => uniqueBy(v, (p) => p.slug, ctx, 'slug')),
    products: z
      .array(shopProduct, { error: 'falta la lista de productos (products)' })
      .max(500, 'no puede haber más de 500 productos')
      .superRefine((v, ctx) => uniqueBy(v, (p) => p.slug, ctx, 'slug')),
  })
  .superRefine((shop, ctx) => {
    const categories = new Set(shop.categories.map((c) => c.slug));
    const pets = new Set(shop.pets.map((p) => p.slug));
    shop.products.forEach((p, i) => {
      if (!categories.has(p.category)) {
        ctx.addIssue({
          code: 'custom',
          path: ['products', i, 'category'],
          message: `${p.slug}: no existe la categoría "${p.category}" en categories`,
        });
      }
      p.pets.forEach((pet, j) => {
        if (!pets.has(pet)) {
          ctx.addIssue({ code: 'custom', path: ['products', i, 'pets', j], message: `${p.slug}: no existe la mascota "${pet}" en pets` });
        }
      });
    });
  });

export type ShopContent = z.infer<typeof shopSchema>;

// Carrito y pago (feature 005, contracts/content-file.md). Los importes van en euros con coma
// ("5,00"); también se admite el punto. Se guardan en céntimos.
const EUROS_TEXT = /^\d{1,5}([.,]\d{1,2})?$/;
const eurosToCents = (v: string) => {
  const [whole, decimals = ''] = v.split(/[.,]/);
  return Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
};
const eurosAmount = (positive: boolean) =>
  z
    .string({ error: 'el importe debe ir entre comillas, en euros con coma decimal (por ejemplo "5,00")' })
    .regex(EUROS_TEXT, 'el importe debe estar en euros con 2 decimales como máximo (por ejemplo "5,00")')
    .transform(eurosToCents)
    .refine((c) => !positive || c > 0, 'el importe debe ser mayor que 0');
const POSTAL_PREFIX_RE = /^(0[1-9]|[1-4]\d|5[0-2])$/;

const shippingMethodSchema = z.object({
  code: slug,
  kind: z.enum(['home_delivery', 'clinic_pickup'], { error: 'kind debe ser home_delivery o clinic_pickup' }),
  name: text(60),
  description: text(160),
  cost: eurosAmount(false),
  vat_rate: z.literal([...VAT_RATES], { error: `vat_rate debe ser ${VAT_RATES.join(', ')}` }).default(21),
  postal_prefixes: z
    .array(z.string().regex(POSTAL_PREFIX_RE, 'el prefijo postal debe ir entre "01" y "52"'))
    .min(1, 'si hay lista de prefijos, no puede estar vacía')
    .nullish(),
});

const discountCommon = {
  code: z.string().regex(/^[A-Z0-9]{3,20}$/, 'el código debe tener de 3 a 20 letras mayúsculas o números'),
  min_subtotal: eurosAmount(false).nullish(),
  starts_at: isoDate.nullish(),
  ends_at: isoDate.nullish(),
  max_uses: z.number().int('debe ser un número entero').positive('debe ser mayor que 0').nullish(),
};
const discountCodeSchema = z.discriminatedUnion(
  'kind',
  [
    z.object({
      ...discountCommon,
      kind: z.literal('percent'),
      value: z.number().int('debe ser un número entero').min(1, 'el porcentaje debe estar entre 1 y 100').max(100, 'el porcentaje debe estar entre 1 y 100'),
    }),
    z.object({ ...discountCommon, kind: z.literal('fixed'), value: eurosAmount(true) }),
  ],
  { error: 'kind debe ser percent o fixed' },
);

export const checkoutSchema = z
  .object({
    order_prefix: z.string().regex(/^[A-Z0-9-]{1,6}$/, 'order_prefix debe tener de 1 a 6 caracteres A-Z, 0-9 o guion'),
    reservation_minutes: intIn(30, 120, 30),
    pickup_days: intIn(1, 30, 7),
    cart_retention_days: intIn(1, 90, 30),
    max_qty_per_line: intIn(1, 99, 10),
    max_pending_per_email: intIn(1, 10, 3),
    max_pending_per_customer: intIn(1, 10, 3),
    guest_link_days: intIn(7, 365, 90),
    notice: text(300).nullish(),
    payment_methods: z.object({ card: z.boolean().default(false), in_clinic: z.boolean().default(false) }),
    shipping_methods: z
      .array(shippingMethodSchema, { error: 'falta la lista de métodos de envío (shipping_methods)' })
      .min(1, 'tiene que haber al menos un método de envío')
      .max(10, 'no puede haber más de 10 métodos de envío')
      .superRefine((v, ctx) => uniqueBy(v, (m) => m.code, ctx, 'código')),
    discount_codes: z
      .array(discountCodeSchema)
      .max(100, 'no puede haber más de 100 códigos')
      .default([])
      .superRefine((v, ctx) => uniqueBy(v, (d) => d.code, ctx, 'código')),
  })
  .superRefine((c, ctx) => {
    if (!c.payment_methods.card && !c.payment_methods.in_clinic) {
      ctx.addIssue({ code: 'custom', path: ['payment_methods'], message: 'tiene que haber al menos un método de pago activo' });
    }
    const pickups = c.shipping_methods.map((m, i) => ({ m, i })).filter(({ m }) => m.kind === 'clinic_pickup');
    if (c.payment_methods.in_clinic && pickups.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['payment_methods', 'in_clinic'],
        message: 'el pago en clínica necesita un método de envío clinic_pickup',
      });
    }
    pickups.slice(1).forEach(({ i }) =>
      ctx.addIssue({ code: 'custom', path: ['shipping_methods', i, 'kind'], message: 'solo puede haber un método clinic_pickup' }),
    );
    c.shipping_methods.forEach((m, i) => {
      if (m.kind === 'clinic_pickup' && m.postal_prefixes) {
        ctx.addIssue({ code: 'custom', path: ['shipping_methods', i, 'postal_prefixes'], message: 'la recogida no usa prefijos postales' });
      }
    });
    c.discount_codes.forEach((d, i) => {
      if (d.starts_at && d.ends_at && d.ends_at <= d.starts_at) {
        ctx.addIssue({ code: 'custom', path: ['discount_codes', i, 'ends_at'], message: 'ends_at debe ser posterior a starts_at' });
      }
    });
  });

export type CheckoutContent = z.infer<typeof checkoutSchema>;

// ---------- Consejos de salud y boletín (feature 006, contracts/content-file.md) ----------

export const POST_CATEGORY_KEY_RE = /^[a-z][a-z0-9-]{0,31}$/;
const postCategory = z.object({
  key: z.string().regex(POST_CATEGORY_KEY_RE, 'la clave debe empezar por una letra y usar a-z, 0-9 y guiones (máx. 32)'),
  label: text(40),
});

/** Recorta el preámbulo a 160 caracteres para la meta descripción por defecto. */
export function defaultMetaDescription(lead: string): string {
  const clean = lead.replace(/\s+/g, ' ').trim();
  if (clean.length <= 160) return clean;
  const cut = clean.slice(0, 159);
  const space = cut.lastIndexOf(' ');
  return `${(space > 100 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

const H1_RE = /^ {0,3}#(?!#)(\s|$)/m;

const postItem = z
  .object({
    slug: slug.refine((v) => v.length <= 80, 'el slug no puede superar 80 caracteres'),
    kind: z.enum(['article', 'news'], { error: 'kind debe ser article o news' }),
    category: z.string().nullish(),
    title: text(120),
    lead: text(400),
    published_on: isoDate,
    published: z.boolean().default(true),
    ...imageFields,
    meta_description: text(160).nullish(),
    body_md: z
      .string()
      .max(40_000, 'no puede superar 40000 caracteres')
      .refine((v) => !H1_RE.test(v), 'el cuerpo no puede tener encabezados # de nivel 1 (el título ya es el h1); usa ## y ###'),
  })
  .refine(altRequired, altIssue)
  .refine((p) => p.kind === 'news' || !!p.category, { message: 'la categoría es obligatoria en los artículos', path: ['category'] })
  .transform((p) => ({ ...p, meta_description: p.meta_description ?? defaultMetaDescription(p.lead) }));

export const newsletterSchema = z.object({
  enabled: z.boolean(),
  title: text(80),
  text: text(240),
});

export type PostContent = z.infer<typeof postItem>;

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

const contentObject = z.object({
  clinic: clinicSchema,
  species: z
    .array(speciesItem, { error: 'falta la lista de especies (species)' })
    .min(1, 'tiene que haber al menos una especie')
    .max(20, 'no puede haber más de 20 especies')
    .superRefine((v, ctx) => uniqueBy(v, (sp) => sp.key, ctx, 'key')),
  opening_hours: z.array(openingSlot).superRefine((slots, ctx) => {
    slots.forEach((a, i) => {
      slots.forEach((b, j) => {
        if (j <= i || a.weekday !== b.weekday) return;
        if (a.opens < b.closes && b.opens < a.closes) {
          ctx.addIssue({ code: 'custom', path: [j], message: `el tramo se solapa con otro del día ${a.weekday}` });
        }
      });
    });
  }),
  closures: z
    .array(closure)
    .default([])
    .superRefine((v, ctx) => uniqueBy(v, (c) => c.slug, ctx, 'slug')),
  services: z
    .array(z.object({ slug, name: text(80), description: text(600) }))
    .superRefine((v, ctx) => uniqueBy(v, (s) => s.slug, ctx, 'slug')),
  team: z
    .array(
      z
        .object({ slug, name: text(100), specialty: text(120), photo: imagePath.nullish(), photo_alt: text(200).nullish() })
        .refine((m) => !m.photo || !!m.photo_alt, { message: 'si hay foto, photo_alt es obligatorio', path: ['photo_alt'] }),
    )
    .default([])
    .superRefine((v, ctx) => uniqueBy(v, (m) => m.slug, ctx, 'slug')),
  faq_topics: z
    .array(
      z.object({
        slug,
        name: text(80),
        faqs: z
          .array(z.object({ slug, question: text(200), answer_md: text(4000) }))
          .default([]),
      }),
    )
    .default([])
    .superRefine((topics, ctx) => {
      uniqueBy(topics, (t) => t.slug, ctx, 'slug');
      const faqSlugs = new Set<string>();
      topics.forEach((t, i) =>
        t.faqs.forEach((f, j) => {
          if (faqSlugs.has(f.slug)) ctx.addIssue({ code: 'custom', path: [i, 'faqs', j], message: `slug repetido: ${f.slug}` });
          faqSlugs.add(f.slug);
        }),
      );
    }),
  activity_stats: z
    .array(z.object({ slug, value_text: text(20), label: text(80), description: text(300).nullish() }))
    .default([])
    .superRefine((v, ctx) => uniqueBy(v, (s) => s.slug, ctx, 'slug')),
  health_notices: z
    .array(
      z.object({
        slug,
        text: text(300),
        source_label: text(160, 1),
        source_url: z
          .string({ error: 'el aviso de salud necesita una fuente (source_url)' })
          .url('source_url no es una URL válida')
          .refine((u) => u.startsWith('https://'), 'source_url debe empezar por https://'),
      }),
    )
    .default([])
    .superRefine((v, ctx) => uniqueBy(v, (s) => s.slug, ctx, 'slug')),
  contact_reasons: z
    .array(z.object({ slug, label: text(80) }))
    .min(1, 'tiene que haber al menos un motivo de contacto')
    .superRefine((v, ctx) => uniqueBy(v, (r) => r.slug, ctx, 'slug')),
  legal_pages: z
    .array(
      z.object({
        kind: z.enum(LEGAL_KINDS, { error: `kind debe ser uno de: ${LEGAL_KINDS.join(', ')}` }),
        title: text(120),
        version: text(40),
        updated_on: isoDate,
        body_md: text(40_000),
      }),
    )
    .superRefine((pages, ctx) => {
      uniqueBy(pages, (p) => p.kind, ctx, 'kind');
      for (const kind of REQUIRED_LEGAL_KINDS) {
        if (!pages.some((p) => p.kind === kind)) ctx.addIssue({ code: 'custom', message: `falta la página legal "${kind}"` });
      }
    }),
  sections: z
    .array(
      z.object({
        key: z.enum(SECTION_KEYS, { error: `key debe ser uno de: ${SECTION_KEYS.join(', ')}` }),
        label: text(60),
        href: z
          .string()
          .regex(/^\/(?!\/)/, 'href debe ser una ruta interna que empiece por /')
          .nullable(),
      }),
    )
    .superRefine((list, ctx) => {
      uniqueBy(list, (s) => s.key, ctx, 'key');
      for (const key of SECTION_KEYS) {
        if (!list.some((s) => s.key === key)) ctx.addIssue({ code: 'custom', message: `falta la sección "${key}"` });
      }
    }),
  booking: bookingSchema.nullish(),
  shop: shopSchema.nullish(),
  checkout: checkoutSchema.nullish(),
  post_categories: z
    .array(postCategory)
    .default([])
    .superRefine((v, ctx) => uniqueBy(v, (c) => c.key, ctx, 'key')),
  posts: z
    .array(postItem)
    .default([])
    .superRefine((v, ctx) => uniqueBy(v, (p) => p.slug, ctx, 'slug')),
  newsletter: newsletterSchema.nullish(),
});

/** Comprobaciones que cruzan bloques: el de reservas con el equipo, los servicios, el horario y las secciones. */
export const contentSchema = contentObject.superRefine((c, ctx) => {
  checkPostsAndNewsletter(c, ctx);
  const tienda = c.sections.find((sec) => sec.key === 'tienda');
  const carrito = c.sections.find((sec) => sec.key === 'carrito');
  if (carrito?.href) {
    if (!c.checkout) {
      ctx.addIssue({ code: 'custom', path: ['checkout'], message: 'falta el bloque checkout: es obligatorio si sections.carrito.href no es nulo' });
    }
    if (!c.shop || !tienda?.href) {
      ctx.addIssue({ code: 'custom', path: ['shop'], message: 'el carrito necesita la tienda: bloque shop: y sections.tienda.href' });
    }
    if (!c.legal_pages.some((p) => p.kind === 'condiciones-venta')) {
      ctx.addIssue({ code: 'custom', path: ['legal_pages'], message: 'falta la página legal "condiciones-venta" (el carrito está activo)' });
    }
  }
  if (!c.shop && tienda?.href) {
    ctx.addIssue({
      code: 'custom',
      path: ['shop'],
      message: 'falta el bloque shop: es obligatorio si sections.tienda.href no es nulo',
    });
  }
  const reservas = c.sections.find((sec) => sec.key === 'reservas');
  if (!c.booking) {
    if (reservas?.href) {
      ctx.addIssue({
        code: 'custom',
        path: ['booking'],
        message: 'falta el bloque booking: es obligatorio si sections.reservas.href no es nulo',
      });
    }
    return;
  }
  const team = new Set(c.team.map((m) => m.slug));
  const services = new Set(c.services.map((sv) => sv.slug));
  const longest = c.opening_hours.reduce((max, h) => Math.max(max, toMinutes(h.closes) - toMinutes(h.opens)), 0);
  c.booking.services.forEach((sv, i) => {
    sv.staff.forEach((m, j) => {
      if (!team.has(m)) {
        ctx.addIssue({ code: 'custom', path: ['booking', 'services', i, 'staff', j], message: `no existe el profesional "${m}" en team` });
      }
    });
    if (sv.service && !services.has(sv.service)) {
      ctx.addIssue({ code: 'custom', path: ['booking', 'services', i, 'service'], message: `no existe el servicio "${sv.service}" en services` });
    }
    if (sv.duration_minutes > longest) {
      ctx.addIssue({
        code: 'custom',
        path: ['booking', 'services', i, 'duration_minutes'],
        message: `la duración (${sv.duration_minutes} min) no cabe en ningún tramo del horario (el más largo es de ${longest} min)`,
      });
    }
  });
});

export type ContentFile = z.infer<typeof contentSchema>;

/** Reglas cruzadas de la feature 006: categorías existentes, sección de consejos y política del boletín. */
function checkPostsAndNewsletter(c: z.infer<typeof contentObject>, ctx: z.RefinementCtx): void {
  const consejos = c.sections.find((sec) => sec.key === 'consejos');
  if (consejos?.href && c.post_categories.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['post_categories'],
      message: 'falta el bloque post_categories: es obligatorio si sections.consejos.href no es nulo',
    });
  }
  const categories = new Set(c.post_categories.map((cat) => cat.key));
  c.posts.forEach((p, i) => {
    if (p.category && !categories.has(p.category)) {
      ctx.addIssue({
        code: 'custom',
        path: ['posts', i, 'category'],
        message: `${p.slug}: no existe la categoría "${p.category}" en post_categories`,
      });
    }
  });
  if (c.newsletter?.enabled && !c.legal_pages.some((p) => p.kind === 'boletin')) {
    ctx.addIssue({
      code: 'custom',
      path: ['legal_pages'],
      message: 'falta la página legal "boletin" (el boletín está activo)',
    });
  }
}

export interface ContentIssue {
  path: string;
  message: string;
}

/** Sustituye los marcadores ${VAR} por variables de entorno. Devuelve los que faltan con su ruta. */
export function resolveEnvPlaceholders(
  value: unknown,
  env: Record<string, string | undefined>,
  path: (string | number)[] = [],
  issues: ContentIssue[] = [],
): { value: unknown; issues: ContentIssue[] } {
  if (typeof value === 'string') {
    const resolved = value.replace(/\$\{([A-Z0-9_]+)\}/g, (_m, name: string) => {
      const v = env[name];
      if (v === undefined || v === '') {
        issues.push({ path: formatPath(path), message: `falta la variable de entorno ${name}` });
        return '';
      }
      return v;
    });
    return { value: resolved, issues };
  }
  if (Array.isArray(value)) {
    return { value: value.map((v, i) => resolveEnvPlaceholders(v, env, [...path, i], issues).value), issues };
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveEnvPlaceholders(v, env, [...path, k], issues).value;
    return { value: out, issues };
  }
  return { value, issues };
}

export function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((acc, p) => (typeof p === 'number' ? `${acc}[${p}]` : acc ? `${acc}.${String(p)}` : String(p)), '');
}

/** Valida un objeto ya leído del YAML. */
export function parseContent(
  raw: unknown,
  env: Record<string, string | undefined> = process.env,
): { ok: true; data: ContentFile } | { ok: false; issues: ContentIssue[] } {
  const { value, issues } = resolveEnvPlaceholders(raw, env);
  if (issues.length > 0) return { ok: false, issues };
  const parsed = contentSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ path: formatPath(i.path) || '(raíz)', message: i.message })),
    };
  }
  return { ok: true, data: parsed.data };
}
