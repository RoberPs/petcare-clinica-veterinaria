import { and, asc, eq, inArray } from 'drizzle-orm';
import { cache } from 'react';
import type { BookableService, BookableStaff, BookingRules } from '@/domain/availability';
import type { ClosureRange, WeeklySlot } from '@/domain/open-status';
import { getDb, type DbOrTx } from '../client';
import { bookingServices, bookingServiceStaff, bookingSettings, closures, teamMembers } from '../schema';
import { getSiteData, type SiteData } from './site';

// Configuración de la reserva (B1): reglas, servicios publicados con su reparto de profesionales,
// profesionales reservables y el horario y los cierres publicados.

export interface BookingConfig {
  rules: BookingRules;
  services: BookableService[];
  /** Publicados y con al menos un servicio publicado, por `position`. */
  staff: BookableStaff[];
  weeklyHours: WeeklySlot[];
  closures: ClosureRange[];
  site: SiteData;
}

export async function loadBookingConfig(
  db: DbOrTx = getDb(),
  site?: SiteData,
): Promise<BookingConfig | null> {
  const [settings] = await db.select().from(bookingSettings).limit(1);
  if (!settings) return null;
  const [serviceRows, links, staffRows, closureRows, siteData] = await Promise.all([
    db
      .select({
        id: bookingServices.id,
        slug: bookingServices.slug,
        name: bookingServices.name,
        durationMinutes: bookingServices.durationMinutes,
      })
      .from(bookingServices)
      .where(eq(bookingServices.published, true))
      .orderBy(asc(bookingServices.position), asc(bookingServices.slug)),
    db.select().from(bookingServiceStaff),
    db
      .select({
        id: teamMembers.id,
        slug: teamMembers.slug,
        name: teamMembers.name,
        position: teamMembers.position,
      })
      .from(teamMembers)
      .where(eq(teamMembers.published, true))
      .orderBy(asc(teamMembers.position), asc(teamMembers.slug)),
    // Todos los cierres publicados: son pocos y el horizonte puede llegar a un año.
    db
      .select({ startsOn: closures.startsOn, endsOn: closures.endsOn })
      .from(closures)
      .where(eq(closures.published, true)),
    site ? Promise.resolve(site) : getSiteData(),
  ]);

  const publishedStaff = new Set(staffRows.map((m) => m.id));
  const services: BookableService[] = serviceRows
    .map((s) => ({
      ...s,
      staffIds: links
        .filter((l) => l.bookingServiceId === s.id && publishedStaff.has(l.teamMemberId))
        .map((l) => l.teamMemberId),
    }))
    .filter((s) => s.staffIds.length > 0);
  const bookable = new Set(services.flatMap((s) => s.staffIds));

  return {
    rules: {
      slotStepMinutes: settings.slotStepMinutes,
      minLeadMinutes: settings.minLeadMinutes,
      horizonDays: settings.horizonDays,
      changeCutoffHours: settings.changeCutoffHours,
      maxActivePerEmail: settings.maxActivePerEmail,
      maxActivePerCustomer: settings.maxActivePerCustomer,
      reminderHoursBefore: settings.reminderHoursBefore,
      retentionMonths: settings.retentionMonths,
    },
    services,
    staff: staffRows.filter((m) => bookable.has(m.id)),
    weeklyHours: siteData.hours,
    closures: closureRows,
    site: siteData,
  };
}

/** Una vez por petición. null si la reserva no está configurada (sin bloque booking:). */
export const getBookingConfig = cache(() => loadBookingConfig());

/** Nombres de servicios y profesionales (también despublicados) para mostrar citas existentes. */
export async function namesFor(
  serviceIds: string[],
  staffIds: string[],
  db: DbOrTx = getDb(),
): Promise<{ services: Map<string, string>; staff: Map<string, string> }> {
  const [s, m] = await Promise.all([
    serviceIds.length
      ? db
          .select({ id: bookingServices.id, name: bookingServices.name })
          .from(bookingServices)
          .where(inArray(bookingServices.id, serviceIds))
      : [],
    staffIds.length
      ? db
          .select({ id: teamMembers.id, name: teamMembers.name })
          .from(teamMembers)
          .where(and(inArray(teamMembers.id, staffIds)))
      : [],
  ]);
  return { services: new Map(s.map((r) => [r.id, r.name])), staff: new Map(m.map((r) => [r.id, r.name])) };
}
