import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, notInArray, sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { parse as parseYaml } from 'yaml';
import type { Db } from '@/db/client';
import * as s from '@/db/schema';
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

export interface LoadSummary {
  services: number;
  team: number;
  faqs: number;
  closures: number;
}

export async function loadContent(db: Db, content: ContentFile): Promise<LoadSummary> {
  const c = content.clinic;
  await db.transaction(async (tx) => {
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

    for (const [i, m] of content.team.entries()) {
      const v = {
        slug: m.slug,
        name: m.name,
        specialty: m.specialty,
        photoPath: toPublic(m.photo),
        photoAlt: m.photo_alt ?? null,
        position: i,
        published: true,
      };
      await tx.insert(s.teamMembers).values(v).onConflictDoUpdate({ target: s.teamMembers.slug, set: { ...v, updatedAt: now } });
    }
    await unpublishMissing(tx, s.teamMembers, content.team.map((x) => x.slug));

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
  });

  return {
    services: content.services.length,
    team: content.team.length,
    faqs: content.faq_topics.reduce((n, t) => n + t.faqs.length, 0),
    closures: content.closures.length,
  };
}

/** Lee, valida, comprueba imágenes y carga. Es lo que usan el script y las pruebas. */
export async function loadContentFile(
  db: Db,
  file: string,
  options: { env?: Record<string, string | undefined>; publicDir?: string } = {},
): Promise<LoadSummary> {
  const content = readContentFile(file, options.env ?? process.env);
  const missing = checkImages(content, options.publicDir);
  if (missing.length > 0) throw new ContentValidationError(missing);
  return loadContent(db, content);
}
