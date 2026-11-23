import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { cache } from 'react';
import type { Section } from '@/domain/sections';
import { addDays, todayInClinic } from '@/domain/time';
import { getDb } from '../client';
import { clinic, closures, openingHours, sections } from '../schema';

export type ClinicRow = typeof clinic.$inferSelect;
export interface OpeningSlot {
  weekday: number;
  opensAt: string;
  closesAt: string;
}
export interface Closure {
  slug: string;
  startsOn: string;
  endsOn: string;
  reason: string;
}

export interface SiteData {
  clinic: ClinicRow;
  hours: OpeningSlot[];
  /** Cierres vigentes o que empiezan en los próximos 30 días. */
  closures: Closure[];
  sections: Section[];
}

export class ClinicNotLoadedError extends Error {
  constructor() {
    super('No hay datos de la clínica. Ejecuta npm run content:load -- --file content/<clinica>.yaml');
  }
}

/** Datos comunes del layout, la cabecera y el pie: una consulta por tabla y una vez por petición. */
export const getSiteData = cache(async (): Promise<SiteData> => {
  const db = getDb();
  const today = todayInClinic();
  const [clinicRows, hours, closureRows, sectionRows] = await Promise.all([
    db.select().from(clinic).limit(1),
    db
      .select({ weekday: openingHours.weekday, opensAt: openingHours.opensAt, closesAt: openingHours.closesAt })
      .from(openingHours)
      .orderBy(asc(openingHours.weekday), asc(openingHours.opensAt)),
    db
      .select({ slug: closures.slug, startsOn: closures.startsOn, endsOn: closures.endsOn, reason: closures.reason })
      .from(closures)
      .where(and(eq(closures.published, true), gte(closures.endsOn, today), lte(closures.startsOn, addDays(today, 30))))
      .orderBy(asc(closures.startsOn)),
    db.select({ key: sections.key, label: sections.label, href: sections.href }).from(sections),
  ]);
  const row = clinicRows[0];
  if (!row) throw new ClinicNotLoadedError();
  return { clinic: row, hours, closures: closureRows, sections: sectionRows };
});
