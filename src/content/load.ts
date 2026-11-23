import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, count, eq, inArray, isNotNull, notInArray, sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { Temporal } from '@js-temporal/polyfill';
import { parse as parseYaml } from 'yaml';
import type { Db } from '@/db/client';
import * as s from '@/db/schema';
import { parseEuros } from '@/domain/money';
import { markdownToPlainText } from '@/domain/markdown-text';
import { normalizeSearch } from '@/domain/search';
import { CLINIC_TZ } from '@/domain/time';
import { parseContent, type ContentFile, type ContentIssue } from './schema';

// Carga idempotente del archivo de contenido en la base de datos (R3). Las páginas leen solo de la base.

export class ContentValidationError extends Error {
  constructor(public readonly issues: ContentIssue[]) {
    super(`El archivo de contenido no es válido (${issues.length} error(es)).`);
  }
}

const toPublic = (p: string | null | undefined) => (p ? `/${p}` : null);

/** Lee y valida un archivo YAML. Lanza ContentValidationError con la ruta exacta de cada error. */
export function readContentFile(file: string, env: Record<string, string | undefined> = process.env): ContentFile {
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new ContentValidationError([
      { path: '(archivo)', message: `no se puede leer el YAML: ${error instanceof Error ? error.message : String(error)}` },
    ]);
  }
  const result = parseContent(raw, env);
  if (!result.ok) throw new ContentValidationError(result.issues);
  return result.data;
}

/** Comprueba que todas las imágenes referenciadas existen en public/. */
export function checkImages(content: ContentFile, publicDir = join(process.cwd(), 'public')): ContentIssue[] {
  const refs: [string, string | null | undefined][] = [
    ['clinic.logo', content.clinic.logo],
    ['clinic.hero.image', content.clinic.hero.image],
    ['clinic.about.image', content.clinic.about?.image],
    ...content.team.map((m, i) => [`team[${i}].photo`, m.photo] as [string, string | null | undefined]),
    ...(content.shop?.products ?? []).map(
      (p, i) => [`shop.products[${i}].image`, p.image] as [string, string | null | undefined],
    ),
    ...content.posts.map((p, i) => [`posts[${i}].image`, p.image] as [string, string | null | undefined]),
  ];
  return refs
    .filter(([, p]) => p && !existsSync(join(publicDir, p)))
    .map(([path, p]) => ({ path, message: `no existe la imagen public/${p}` }));
}

type SlugTable = PgTable & { slug: PgColumn; published: PgColumn };

/** Despublica las filas cuyo slug ya no aparece en el archivo. */
async function unpublishMissing(tx: Db, table: SlugTable, slugs: string[]): Promise<void> {
  const where = slugs.length > 0 ? and(notInArray(table.slug, slugs), eq(table.published, true)) : eq(table.published, true);
  await tx.update(table).set({ published: false } as never).where(where);
}

const now = sql`now()`;

function compareAtIgnored(content: ContentFile): string[] {
  return (content.shop?.products ?? [])
    .filter((p) => p.compare_at_price && parseEuros(p.compare_at_price)! <= parseEuros(p.price)!)
    .map((p) => p.slug);
}

export interface LoadSummary {
  services: number;
  team: number;
  faqs: number;
  closures: number;
  species: number;
  /** Mascotas cuya especie ha desaparecido del archivo y pasan a "Otra" (species_key = NULL). */
  petsMovedToOther: number;
  shopCategories: number;
  shopPets: number;
  products: number;
  /** Productos que quedan despublicados en la base (los que ya no están en el archivo). */
  productsHidden: number;
  /** Productos con compare_at_price <= price: se cargan, pero no se muestran en oferta (FR-016). */
  compareAtIgnored: string[];
  /** Feature 006: publicaciones del archivo y las que quedan despublicadas en la base. */
  posts: number;
  postsHidden: number;
  postCategories: number;
  newsletterEnabled: boolean;
}

/** Bloque shop: (feature 004, C12). Sin bloque, el catálogo entero queda despublicado. */
async function loadShop(tx: Db, shop: ContentFile['shop']): Promise<void> {
  if (!shop) {
    await unpublishMissing(tx, s.products, []);
    await unpublishMissing(tx, s.productCategories, []);
    await unpublishMissing(tx, s.productPets, []);
    return;
  }
  const st = shop.settings;
  const settings = {
    singleton: true,
    shippingText: st.shipping_text,
    pageSize: st.page_size,
    demoNoticeEnabled: st.demo_notice.enabled,
    demoNoticeText: st.demo_notice.text ?? null,
    metaDescription: st.meta_description,
  };
  await tx
    .insert(s.shopSettings)
    .values(settings)
    .onConflictDoUpdate({ target: s.shopSettings.singleton, set: { ...settings, updatedAt: now } });

  const categoryIds = new Map<string, string>();
  for (const [i, cat] of shop.categories.entries()) {
    const v = { slug: cat.slug, name: cat.name, position: i, published: true };
    const [row] = await tx
      .insert(s.productCategories)
      .values(v)
      .onConflictDoUpdate({ target: s.productCategories.slug, set: { ...v, updatedAt: now } })
      .returning({ id: s.productCategories.id });
    categoryIds.set(cat.slug, row!.id);
  }
  await unpublishMissing(tx, s.productCategories, shop.categories.map((x) => x.slug));

  const petIds = new Map<string, string>();
  for (const [i, pet] of shop.pets.entries()) {
    const v = { slug: pet.slug, name: pet.name, position: i, published: true };
    const [row] = await tx
      .insert(s.productPets)
      .values(v)
      .onConflictDoUpdate({ target: s.productPets.slug, set: { ...v, updatedAt: now } })
      .returning({ id: s.productPets.id });
    petIds.set(pet.slug, row!.id);
  }
  await unpublishMissing(tx, s.productPets, shop.pets.map((x) => x.slug));

  for (const [i, p] of shop.products.entries()) {
    const v = {
      slug: p.slug,
      name: p.name,
      searchName: normalizeSearch(p.name),
      shortDescription: p.short_description,
      descriptionMd: p.description,
      ingredientsMd: p.ingredients?.trim() ? p.ingredients : null,
      usageMd: p.usage?.trim() ? p.usage : null,
      categoryId: categoryIds.get(p.category)!,
      priceCents: parseEuros(p.price)!,
      compareAtCents: p.compare_at_price ? parseEuros(p.compare_at_price)! : null,
      vatRate: p.vat_rate,
      stock: p.stock,
      isNew: p.is_new,
      position: i,
      imagePath: toPublic(p.image),
      imageAlt: p.image ? (p.image_alt ?? null) : null,
      published: true,
    };
    const [row] = await tx
      .insert(s.products)
      .values(v)
      .onConflictDoUpdate({ target: s.products.slug, set: { ...v, updatedAt: now } })
      .returning({ id: s.products.id });
    await tx.delete(s.productPetLinks).where(eq(s.productPetLinks.productId, row!.id));
    await tx.insert(s.productPetLinks).values(p.pets.map((pet) => ({ productId: row!.id, petId: petIds.get(pet)! })));
  }
  await unpublishMissing(tx, s.products, shop.products.map((x) => x.slug));
}

/** Inicio del día `isoDate` en Europe/Madrid (`nextDay` = inicio del día siguiente: fin inclusivo). */
function madridDayStart(isoDate: string, nextDay = false): Date {
  const day = Temporal.PlainDate.from(isoDate).add({ days: nextDay ? 1 : 0 });
  return new Date(day.toZonedDateTime({ timeZone: CLINIC_TZ }).epochMilliseconds);
}

/**
 * Bloque checkout: (feature 005, contracts/content-file.md). Upsert por `code`; lo que desaparece
 * del archivo pasa a enabled = false (los pedidos lo referencian) y uses_count nunca se toca. Sin
 * bloque, no queda ningún método ni código activo.
 */
async function loadCheckout(tx: Db, checkout: ContentFile['checkout']): Promise<void> {
  if (!checkout) {
    await tx.update(s.shippingMethods).set({ enabled: false, updatedAt: now }).where(eq(s.shippingMethods.enabled, true));
    await tx.update(s.discountCodes).set({ enabled: false, updatedAt: now }).where(eq(s.discountCodes.enabled, true));
    await tx.update(s.shopSettings).set({ cardEnabled: false, inClinicEnabled: false, checkoutNoticeText: null, updatedAt: now });
    return;
  }
  // Solo actualiza: la fila la crea el bloque shop: (el carrito exige la tienda).
  await tx.update(s.shopSettings).set({
    cardEnabled: checkout.payment_methods.card,
    inClinicEnabled: checkout.payment_methods.in_clinic,
    reservationMinutes: checkout.reservation_minutes,
    pickupDays: checkout.pickup_days,
    cartRetentionDays: checkout.cart_retention_days,
    maxQtyPerLine: checkout.max_qty_per_line,
    maxPendingPerEmail: checkout.max_pending_per_email,
    maxPendingPerCustomer: checkout.max_pending_per_customer,
    orderPrefix: checkout.order_prefix,
    guestLinkDays: checkout.guest_link_days,
    checkoutNoticeText: checkout.notice ?? null,
    updatedAt: now,
  });

  const shippingCodes = checkout.shipping_methods.map((m) => m.code);
  // Primero se desactivan los que desaparecen: así el índice único de la recogida activa no choca.
  await tx
    .update(s.shippingMethods)
    .set({ enabled: false, updatedAt: now })
    .where(shippingCodes.length > 0 ? notInArray(s.shippingMethods.code, shippingCodes) : sql`true`);
  for (const [i, m] of checkout.shipping_methods.entries()) {
    const v = {
      code: m.code,
      kind: m.kind,
      name: m.name,
      description: m.description,
      costCents: m.cost,
      vatRate: m.vat_rate,
      postalPrefixes: m.kind === 'home_delivery' ? (m.postal_prefixes ?? null) : null,
      enabled: true,
      position: i,
    };
    await tx.insert(s.shippingMethods).values(v).onConflictDoUpdate({ target: s.shippingMethods.code, set: { ...v, updatedAt: now } });
  }

  const discountCodes = checkout.discount_codes.map((d) => d.code);
  await tx
    .update(s.discountCodes)
    .set({ enabled: false, updatedAt: now })
    .where(discountCodes.length > 0 ? notInArray(s.discountCodes.code, discountCodes) : sql`true`);
  for (const d of checkout.discount_codes) {
    const v = {
      code: d.code,
      kind: d.kind,
      value: d.value,
      minSubtotalCents: d.min_subtotal ?? null,
      startsAt: d.starts_at ? madridDayStart(d.starts_at) : null,
      endsAt: d.ends_at ? madridDayStart(d.ends_at, true) : null,
      maxUses: d.max_uses ?? null,
      enabled: true,
    };
    // uses_count no se toca: ni al crear (0 por defecto) ni al actualizar.
    await tx.insert(s.discountCodes).values(v).onConflictDoUpdate({ target: s.discountCodes.code, set: { ...v, updatedAt: now } });
  }
}

/**
 * Categorías de consejos (feature 006): upsert por clave. Una categoría ausente del archivo se borra
 * si no tiene publicaciones; si las tiene, la carga falla con el slug de la primera.
 */
async function loadPostCategories(tx: Db, categories: ContentFile['post_categories']): Promise<void> {
  for (const [i, cat] of categories.entries()) {
    const v = { key: cat.key, label: cat.label, sortOrder: i };
    await tx
      .insert(s.postCategories)
      .values(v)
      .onConflictDoUpdate({ target: s.postCategories.key, set: { ...v, updatedAt: now } });
  }
}

async function deleteMissingPostCategories(tx: Db, categories: ContentFile['post_categories']): Promise<void> {
  const keys = categories.map((cat) => cat.key);
  const absent = keys.length > 0 ? notInArray(s.postCategories.key, keys) : undefined;
  const [inUse] = await tx
    .select({ key: s.posts.categoryKey, slug: s.posts.slug })
    .from(s.posts)
    .innerJoin(s.postCategories, eq(s.posts.categoryKey, s.postCategories.key))
    .where(absent)
    .orderBy(s.posts.slug)
    .limit(1);
  if (inUse) {
    throw new ContentValidationError([
      {
        path: 'post_categories',
        message: `no se puede quitar la categoría "${inUse.key}": la usa la publicación "${inUse.slug}"`,
      },
    ]);
  }
  await tx.delete(s.postCategories).where(absent);
}

/** Publicaciones (feature 006): upsert por slug; las ausentes del archivo quedan despublicadas. */
async function loadPosts(tx: Db, posts: ContentFile['posts']): Promise<void> {
  for (const p of posts) {
    const v = {
      slug: p.slug,
      kind: p.kind,
      categoryKey: p.category ?? null,
      title: p.title,
      lead: p.lead,
      bodyMd: p.body_md,
      image: toPublic(p.image),
      imageAlt: p.image ? (p.image_alt ?? null) : null,
      metaDescription: p.meta_description,
      searchText: normalizeSearch(`${p.title} ${p.lead} ${markdownToPlainText(p.body_md)}`),
      published: p.published,
      publishedAt: madridDayStart(p.published_on),
    };
    await tx.insert(s.posts).values(v).onConflictDoUpdate({ target: s.posts.slug, set: { ...v, updatedAt: now } });
  }
  await unpublishMissing(tx, s.posts, posts.map((x) => x.slug));
}

/** Bloque newsletter: (feature 006, E13). Sin bloque, el boletín queda desactivado. */
async function loadNewsletter(tx: Db, newsletter: ContentFile['newsletter']): Promise<void> {
  const v = newsletter
    ? { id: 1, enabled: newsletter.enabled, title: newsletter.title, text: newsletter.text }
    : { id: 1, enabled: false, title: 'Boletín', text: 'Boletín desactivado.' };
  if (!newsletter) {
    // Si ya había una fila, se conservan sus textos y solo se desactiva.
    await tx
      .insert(s.newsletterSettings)
      .values(v)
      .onConflictDoUpdate({ target: s.newsletterSettings.id, set: { enabled: false, updatedAt: now } });
    return;
  }
  await tx
    .insert(s.newsletterSettings)
    .values(v)
    .onConflictDoUpdate({ target: s.newsletterSettings.id, set: { ...v, updatedAt: now } });
}

export interface LoadOptions {
  /**
   * --force-booking (F4): sobrescribe servicios reservables, nombre y `bookable` del equipo, y
   * borra y vuelve a sembrar los horarios por veterinario y los bloqueos. Sin él, el YAML siembra.
   */
  forceBooking?: boolean;
}

/** Modo por defecto de `content:load` (F4): el YAML siembra y no sobrescribe la agenda del panel. */
export const DEFAULT_FORCE_BOOKING = false;

export async function loadContent(db: Db, content: ContentFile, options: LoadOptions = {}): Promise<LoadSummary> {
  const forceBooking = options.forceBooking ?? DEFAULT_FORCE_BOOKING;
  const c = content.clinic;
  let petsMovedToOther = 0;
  let productsHidden = 0;
  let postsHidden = 0;
  await db.transaction(async (tx) => {
    await loadShop(tx, content.shop);
    await loadPostCategories(tx, content.post_categories);
    await loadPosts(tx, content.posts);
    await deleteMissingPostCategories(tx, content.post_categories);
    await loadNewsletter(tx, content.newsletter);
    const [postsOff] = await tx.select({ n: count() }).from(s.posts).where(eq(s.posts.published, false));
    postsHidden = postsOff?.n ?? 0;
    await loadCheckout(tx, content.checkout);
    const [hidden] = await tx.select({ n: count() }).from(s.products).where(eq(s.products.published, false));
    productsHidden = hidden?.n ?? 0;

    const clinicValues = {
      singleton: true,
      name: c.name,
      logoPath: toPublic(c.logo),
      heroTitle: c.hero.title,
      heroText: c.hero.text,
      heroImagePath: toPublic(c.hero.image),
      heroImageAlt: c.hero.image_alt ?? null,
      aboutTitle: c.about?.title ?? null,
      aboutText: c.about?.text ?? null,
      aboutImagePath: toPublic(c.about?.image),
      aboutImageAlt: c.about?.image_alt ?? null,
      addressLine: c.address.line,
      postalCode: c.address.postal_code,
      city: c.address.city,
      province: c.address.province,
      latitude: c.geo ? c.geo.lat.toFixed(6) : null,
      longitude: c.geo ? c.geo.lng.toFixed(6) : null,
      phoneE164: c.phone.e164,
      phoneDisplay: c.phone.display,
      publicEmail: c.public_email ?? null,
      inboxEmail: c.inbox_email,
      responseTimeText: c.response_time_text,
      legalOwnerName: c.legal.owner_name,
      legalOwnerTaxId: c.legal.tax_id ?? null,
      legalOwnerAddress: c.legal.address ?? null,
      legalContactEmail: c.legal.contact_email,
      demoBannerEnabled: c.demo_banner_enabled,
    };
    await tx
      .insert(s.clinic)
      .values(clinicValues)
      .onConflictDoUpdate({ target: s.clinic.singleton, set: { ...clinicValues, updatedAt: now } });

    // El horario no tiene clave estable: se sustituye entero.
    await tx.delete(s.openingHours);
    if (content.opening_hours.length > 0) {
      await tx
        .insert(s.openingHours)
        .values(content.opening_hours.map((h) => ({ weekday: h.weekday, opensAt: h.opens, closesAt: h.closes })));
    }

    for (const cl of content.closures) {
      const v = { slug: cl.slug, startsOn: cl.starts_on, endsOn: cl.ends_on, reason: cl.reason, published: true };
      await tx.insert(s.closures).values(v).onConflictDoUpdate({ target: s.closures.slug, set: { ...v, updatedAt: now } });
    }
    await unpublishMissing(tx, s.closures, content.closures.map((x) => x.slug));

    for (const [i, sv] of content.services.entries()) {
      const v = { slug: sv.slug, name: sv.name, description: sv.description, position: i, published: true };
      await tx.insert(s.services).values(v).onConflictDoUpdate({ target: s.services.slug, set: { ...v, updatedAt: now } });
    }
    await unpublishMissing(tx, s.services, content.services.map((x) => x.slug));

    // Equipo (F4): la ficha pública sale siempre del YAML. El nombre y `bookable` los gestiona el
    // panel: sin --force-booking solo se escriben al crear el miembro.
    const bookingStaffSlugs = new Set((content.booking?.services ?? []).flatMap((bs) => bs.staff));
    const existingTeam = new Set(
      (await tx.select({ slug: s.teamMembers.slug }).from(s.teamMembers)).map((m) => m.slug),
    );
    const createdBookable: string[] = [];
    for (const [i, m] of content.team.entries()) {
      const publicFields = {
        specialty: m.specialty,
        photoPath: toPublic(m.photo),
        photoAlt: m.photo_alt ?? null,
        position: i,
        published: true,
      };
      const agendaFields = { name: m.name, bookable: bookingStaffSlugs.has(m.slug), bookingPosition: i };
      const v = { slug: m.slug, ...publicFields, ...agendaFields };
      if (!existingTeam.has(m.slug) && agendaFields.bookable) createdBookable.push(m.slug);
      await tx
        .insert(s.teamMembers)
        .values(v)
        .onConflictDoUpdate({
          target: s.teamMembers.slug,
          set: forceBooking ? { ...v, updatedAt: now } : { ...publicFields, updatedAt: now },
        });
    }
    await unpublishMissing(tx, s.teamMembers, content.team.map((x) => x.slug));
    if (forceBooking) {
      // Quien no está en el reparto del YAML deja de ser reservable (no se borra: FK restrict).
      const keep = [...bookingStaffSlugs];
      await tx
        .update(s.teamMembers)
        .set({ bookable: false, updatedAt: now })
        .where(keep.length ? notInArray(s.teamMembers.slug, keep) : sql`true`);
    }

    const faqSlugs: string[] = [];
    for (const [i, t] of content.faq_topics.entries()) {
      const tv = { slug: t.slug, name: t.name, position: i, published: true };
      const [topic] = await tx
        .insert(s.faqTopics)
        .values(tv)
        .onConflictDoUpdate({ target: s.faqTopics.slug, set: { ...tv, updatedAt: now } })
        .returning({ id: s.faqTopics.id });
      for (const [j, f] of t.faqs.entries()) {
        faqSlugs.push(f.slug);
        const fv = { slug: f.slug, topicId: topic!.id, question: f.question, answerMd: f.answer_md, position: j, published: true };
        await tx.insert(s.faqs).values(fv).onConflictDoUpdate({ target: s.faqs.slug, set: { ...fv, updatedAt: now } });
      }
    }
    await unpublishMissing(tx, s.faqTopics, content.faq_topics.map((x) => x.slug));
    await unpublishMissing(tx, s.faqs, faqSlugs);

    for (const [i, st] of content.activity_stats.entries()) {
      const v = { slug: st.slug, valueText: st.value_text, label: st.label, description: st.description ?? null, position: i, published: true };
      await tx.insert(s.activityStats).values(v).onConflictDoUpdate({ target: s.activityStats.slug, set: { ...v, updatedAt: now } });
    }
    await unpublishMissing(tx, s.activityStats, content.activity_stats.map((x) => x.slug));

    for (const [i, n] of content.health_notices.entries()) {
      const v = { slug: n.slug, text: n.text, sourceLabel: n.source_label, sourceUrl: n.source_url, position: i, published: true };
      await tx.insert(s.healthNotices).values(v).onConflictDoUpdate({ target: s.healthNotices.slug, set: { ...v, updatedAt: now } });
    }
    await unpublishMissing(tx, s.healthNotices, content.health_notices.map((x) => x.slug));

    for (const [i, r] of content.contact_reasons.entries()) {
      const v = { slug: r.slug, label: r.label, position: i, published: true };
      await tx.insert(s.contactReasons).values(v).onConflictDoUpdate({ target: s.contactReasons.slug, set: { ...v, updatedAt: now } });
    }
    await unpublishMissing(tx, s.contactReasons, content.contact_reasons.map((x) => x.slug));

    for (const p of content.legal_pages) {
      const v = { kind: p.kind, title: p.title, bodyMd: p.body_md, version: p.version, updatedOn: p.updated_on };
      await tx.insert(s.legalPages).values(v).onConflictDoUpdate({ target: s.legalPages.kind, set: { ...v, updatedAt: now } });
    }

    for (const sec of content.sections) {
      const v = { key: sec.key, label: sec.label, href: sec.href };
      await tx.insert(s.sections).values(v).onConflictDoUpdate({ target: s.sections.key, set: { ...v, updatedAt: now } });
    }

    // Reserva de citas (feature 003): reglas, servicios reservables y su reparto de profesionales.
    // Nunca toca appointments (B15): un servicio que desaparece solo se despublica.
    if (content.booking) {
      const r = content.booking.rules;
      const rules = {
        singleton: true,
        slotStepMinutes: r.slot_step_minutes,
        minLeadMinutes: r.min_lead_minutes,
        horizonDays: r.horizon_days,
        changeCutoffHours: r.change_cutoff_hours,
        maxActivePerEmail: r.max_active_per_email,
        maxActivePerCustomer: r.max_active_per_customer,
        reminderHoursBefore: r.reminder_hours_before,
        retentionMonths: r.retention_months,
      };
      await tx
        .insert(s.bookingSettings)
        .values(rules)
        .onConflictDoUpdate({ target: s.bookingSettings.singleton, set: { ...rules, updatedAt: now } });

      const teamIds = new Map(
        (await tx.select({ id: s.teamMembers.id, slug: s.teamMembers.slug }).from(s.teamMembers)).map((m) => [m.slug, m.id]),
      );
      const serviceIds = new Map(
        (await tx.select({ id: s.services.id, slug: s.services.slug }).from(s.services)).map((m) => [m.slug, m.id]),
      );
      for (const [i, bs] of content.booking.services.entries()) {
        const v = {
          slug: bs.slug,
          name: bs.name,
          durationMinutes: bs.duration_minutes,
          serviceId: bs.service ? (serviceIds.get(bs.service) ?? null) : null,
          position: i,
          published: true,
        };
        const links = (id: string) => bs.staff.map((m) => ({ bookingServiceId: id, teamMemberId: teamIds.get(m)! }));
        if (forceBooking) {
          const [row] = await tx
            .insert(s.bookingServices)
            .values(v)
            .onConflictDoUpdate({ target: s.bookingServices.slug, set: { ...v, updatedAt: now } })
            .returning({ id: s.bookingServices.id });
          await tx.delete(s.bookingServiceStaff).where(eq(s.bookingServiceStaff.bookingServiceId, row!.id));
          await tx.insert(s.bookingServiceStaff).values(links(row!.id));
        } else {
          // Semilla (F4): solo los slugs nuevos. Si el nombre ya lo usa un servicio del panel, se omite.
          const [row] = await tx
            .insert(s.bookingServices)
            .values(v)
            .onConflictDoNothing()
            .returning({ id: s.bookingServices.id });
          if (row) await tx.insert(s.bookingServiceStaff).values(links(row.id));
        }
      }
      if (forceBooking) await unpublishMissing(tx, s.bookingServices, content.booking.services.map((x) => x.slug));
    } else if (forceBooking) {
      await unpublishMissing(tx, s.bookingServices, []);
    }

    // Horario por veterinario (F6): con --force-booking se borran tramos y bloqueos y se vuelven a
    // sembrar con el horario de la clínica; sin él, solo los reservables recién creados.
    const seedSlugs = forceBooking ? null : createdBookable;
    if (forceBooking) {
      await tx.delete(s.staffHours);
      await tx.delete(s.scheduleBlocks);
    }
    if (content.opening_hours.length > 0 && (seedSlugs === null || seedSlugs.length > 0)) {
      const members = await tx
        .select({ id: s.teamMembers.id })
        .from(s.teamMembers)
        .where(
          seedSlugs === null
            ? eq(s.teamMembers.bookable, true)
            : and(eq(s.teamMembers.bookable, true), inArray(s.teamMembers.slug, seedSlugs)),
        );
      const withHours = new Set((await tx.select({ id: s.staffHours.teamMemberId }).from(s.staffHours)).map((r) => r.id));
      const rows = members
        .filter((m) => !withHours.has(m.id))
        .flatMap((m) =>
          content.opening_hours.map((h) => ({ teamMemberId: m.id, weekday: h.weekday, opensAt: h.opens, closesAt: h.closes })),
        );
      if (rows.length > 0) await tx.insert(s.staffHours).values(rows);
    }

    // Especies (A10): upsert por clave y borrado de las ausentes. Sus mascotas pasan a "Otra"
    // por la clave foránea (ON DELETE SET NULL).
    for (const [i, sp] of content.species.entries()) {
      const v = { key: sp.key, label: sp.label, sortOrder: i };
      await tx.insert(s.species).values(v).onConflictDoUpdate({ target: s.species.key, set: v });
    }
    const keys = content.species.map((sp) => sp.key);
    const [moved] = await tx
      .select({ n: count() })
      .from(s.pets)
      .where(and(isNotNull(s.pets.speciesKey), notInArray(s.pets.speciesKey, keys)));
    petsMovedToOther = moved?.n ?? 0;
    await tx.delete(s.species).where(notInArray(s.species.key, keys));
  });

  if (petsMovedToOther > 0) {
    console.warn(
      `Aviso: ${petsMovedToOther} mascota(s) tenían una especie que ya no está en el archivo y pasan a "Otra".`,
    );
  }

  return {
    services: content.services.length,
    team: content.team.length,
    faqs: content.faq_topics.reduce((n, t) => n + t.faqs.length, 0),
    closures: content.closures.length,
    species: content.species.length,
    petsMovedToOther,
    shopCategories: content.shop?.categories.length ?? 0,
    shopPets: content.shop?.pets.length ?? 0,
    products: content.shop?.products.length ?? 0,
    productsHidden,
    compareAtIgnored: compareAtIgnored(content),
    posts: content.posts.length,
    postsHidden,
    postCategories: content.post_categories.length,
    newsletterEnabled: content.newsletter?.enabled ?? false,
  };
}

/** Lee, valida, comprueba imágenes y carga. Es lo que usan el script y las pruebas. */
export async function loadContentFile(
  db: Db,
  file: string,
  options: { env?: Record<string, string | undefined>; publicDir?: string } & LoadOptions = {},
): Promise<LoadSummary> {
  const content = readContentFile(file, options.env ?? process.env);
  const missing = checkImages(content, options.publicDir);
  if (missing.length > 0) throw new ContentValidationError(missing);
  // E7: con el boletín activo hace falta la clave de la huella anónima de las bajas.
  if (content.newsletter?.enabled && !(options.env ?? process.env).NEWSLETTER_HASH_KEY) {
    throw new ContentValidationError([
      { path: 'newsletter.enabled', message: 'el boletín está activo, pero falta la variable de entorno NEWSLETTER_HASH_KEY' },
    ]);
  }
  return loadContent(db, content, { forceBooking: options.forceBooking });
}
