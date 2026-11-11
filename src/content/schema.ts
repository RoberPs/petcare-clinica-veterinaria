import { z } from 'zod';

// Esquema del archivo de contenido por clínica (contracts/content-file.md). Mensajes en español.

const LEGAL_KINDS = ['aviso-legal', 'privacidad', 'cookies', 'terminos'] as const;
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

export const contentSchema = z.object({
  clinic: clinicSchema,
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
      for (const kind of LEGAL_KINDS) {
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
});

export type ContentFile = z.infer<typeof contentSchema>;

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
