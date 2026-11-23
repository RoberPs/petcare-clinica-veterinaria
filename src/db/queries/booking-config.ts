import { and, asc, eq, inArray } from 'drizzle-orm';
import { cache } from 'react';
import type { BookableService, BookableStaff, BookingRules } from '@/domain/availability';
import type { ClosureRange, WeeklySlot } from '@/domain/open-status';
import { getDb, type DbOrTx } from '../client';
import { bookingServices, bookingServiceStaff, bookingSettings, closures, staffHours, teamMembers } from '../schema';
import { getSiteData, type SiteData } from './site';

// Configuración de la reserva (B1): reglas, servicios publicados con su reparto de profesionales,
// profesionales reservables y el horario y los cierres publicados.

export interface BookingConfig {
  rules: BookingRules;
  services: BookableService[];
  /** Reservables, con tramos y con al menos un servicio publicado, por `booking_position`. */
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
    // Feature 007 (F5): reservables (no hace falta que salgan en la página del equipo).
    db
      .select({
        id: teamMembers.id,
        slug: teamMembers.slug,
        name: teamMembers.name,
        position: teamMembers.bookingPosition,
      })
      .from(teamMembers)
      .where(eq(teamMembers.bookable, true))
      .orderBy(asc(teamMembers.bookingPosition), asc(teamMembers.slug)),
    // Todos los cierres publicados: son pocos y el horizonte puede llegar a un año.
    db
      .select({ startsOn: closures.startsOn, endsOn: closures.endsOn })
      .from(closures)
      .where(eq(closures.published, true)),
    site ? Promise.resolve(site) : getSiteData(),
  ]);

  const hoursById = await loadStaffHours(db);
  // Un veterinario sin tramos no se ofrece ni se asigna con "Sin preferencia" (FR-017).
  const withHours = new Set(staffRows.filter((m) => (hoursById.get(m.id) ?? []).length > 0).map((m) => m.id));
  const services: BookableService[] = serviceRows
    .map((s) => ({
      ...s,
      staffIds: links
        .filter((l) => l.bookingServiceId === s.id && withHours.has(l.teamMemberId))
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
    staff: staffRows.filter((m) => bookable.has(m.id)).map((m) => ({ ...m, hours: hoursById.get(m.id) ?? [] })),
    weeklyHours: siteData.hours,
    closures: closureRows,
    site: siteData,
  };
}

/** Horario semanal de cada veterinario (F6), por id. */
export async function loadStaffHours(db: DbOrTx = getDb()): Promise<Map<string, WeeklySlot[]>> {
  const rows = await db
    .select({
      teamMemberId: staffHours.teamMemberId,
      weekday: staffHours.weekday,
      opensAt: staffHours.opensAt,
      closesAt: staffHours.closesAt,
    })
    .from(staffHours)
    .orderBy(asc(staffHours.weekday), asc(staffHours.opensAt));
  const out = new Map<string, WeeklySlot[]>();
  for (const r of rows) {
    const slot = { weekday: r.weekday, opensAt: r.opensAt.slice(0, 5), closesAt: r.closesAt.slice(0, 5) };
    out.set(r.teamMemberId, [...(out.get(r.teamMemberId) ?? []), slot]);
  }
  return out;
}

/**
 * Vuelve a leer los tramos de los veterinarios de la configuración (dentro del bloqueo por día de
 * la reserva, F7), para no confirmar con un horario que acaba de cambiar.
 */
export async function refreshStaffHours(config: BookingConfig, db: DbOrTx): Promise<BookingConfig> {
  const hoursById = await loadStaffHours(db);
  return { ...config, staff: config.staff.map((m) => ({ ...m, hours: hoursById.get(m.id) ?? [] })) };
}

/**
 * Servicio (aunque esté inactivo) y veterinarios reservables que lo atienden, con sus tramos: lo que
 * usa el panel para mover una cita (F11). null si el servicio no existe.
 */
export async function loadServiceForAdmin(
  serviceId: string,
  db: DbOrTx = getDb(),
): Promise<{ service: BookableService; staff: BookableStaff[]; published: boolean } | null> {
  const [svc] = await db.select().from(bookingServices).where(eq(bookingServices.id, serviceId)).limit(1);
  if (!svc) return null;
  const [links, members, hoursById] = await Promise.all([
    db.select().from(bookingServiceStaff).where(eq(bookingServiceStaff.bookingServiceId, serviceId)),
    db
      .select({ id: teamMembers.id, slug: teamMembers.slug, name: teamMembers.name, position: teamMembers.bookingPosition })
      .from(teamMembers)
      .where(eq(teamMembers.bookable, true))
      .orderBy(asc(teamMembers.bookingPosition), asc(teamMembers.slug)),
    loadStaffHours(db),
  ]);
  const assigned = new Set(links.map((l) => l.teamMemberId));
  const staff = members.filter((m) => assigned.has(m.id)).map((m) => ({ ...m, hours: hoursById.get(m.id) ?? [] }));
  return {
    service: { id: svc.id, slug: svc.slug, name: svc.name, durationMinutes: svc.durationMinutes, staffIds: staff.map((m) => m.id) },
    staff,
    published: svc.published,
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
