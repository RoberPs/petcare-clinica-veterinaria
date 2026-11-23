import { randomUUID } from 'node:crypto';
import { and, asc, count, eq, gt, inArray } from 'drizzle-orm';
import { getDb, type DbOrTx } from '@/db/client';
import { loadStaffHours } from '@/db/queries/booking-config';
import { getSiteData } from '@/db/queries/site';
import { appointments, bookingServices, bookingServiceStaff, teamMembers } from '@/db/schema';
import type { ServiceFormData } from '@/domain/admin-schemas';
import type { WeeklySlot } from '@/domain/open-status';
import { errorCode } from '@/lib/account/common';
import { logger } from '@/lib/logger';
import { diffChanges, recordAdminAction } from './audit';
import { isUniqueViolation, slugify, uniqueSlug, type AdminActor } from './common';

// Servicios reservables desde el panel (US3, FR-012 a FR-014). No se borran: se desactivan. Las
// citas futuras se mantienen tal como están (con su hora de fin) aunque cambie la duración.

export type SaveServiceResult =
  | { status: 'ok'; id: string; created: boolean; futureCount: number; noSlots: boolean }
  | { status: 'invalid'; fieldErrors: Record<string, string> }
  | { status: 'not_found' }
  | { status: 'error' };

const DUPLICATE = { name: 'Ya hay un servicio con ese nombre.' };

/** Citas confirmadas y futuras de un servicio. */
export async function futureAppointmentsCount(serviceId: string, now: Date, db: DbOrTx = getDb()): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(appointments)
    .where(and(eq(appointments.bookingServiceId, serviceId), eq(appointments.status, 'confirmed'), gt(appointments.startsAt, now)));
  return row?.n ?? 0;
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** ¿Algún tramo (clínica ∩ veterinario) de alguno de los veterinarios admite la duración? */
export function durationFits(duration: number, clinic: readonly WeeklySlot[], staffHours: readonly (readonly WeeklySlot[])[]): boolean {
  for (const hours of staffHours) {
    for (const s of hours) {
      for (const c of clinic.filter((x) => x.weekday === s.weekday)) {
        const len = Math.min(toMin(s.closesAt), toMin(c.closesAt)) - Math.max(toMin(s.opensAt), toMin(c.opensAt));
        if (len >= duration) return true;
      }
    }
  }
  return false;
}

export async function saveService(
  admin: AdminActor,
  input: ServiceFormData,
  options: { now: Date; submissionId?: string },
): Promise<SaveServiceResult> {
  const { now } = options;
  try {
    const db = getDb();
    if (input.staff_ids.length > 0) {
      const found = await db.select({ id: teamMembers.id }).from(teamMembers).where(inArray(teamMembers.id, input.staff_ids));
      if (found.length !== input.staff_ids.length) return { status: 'invalid', fieldErrors: { staff_ids: 'Algún veterinario ya no existe.' } };
    }
    const result = await db.transaction(async (tx): Promise<SaveServiceResult> => {
      const values = {
        name: input.name,
        durationMinutes: input.duration_minutes,
        published: input.active,
        position: input.position,
      };
      let id = input.id;
      let created = false;
      let before: (typeof values & { staffIds: string[] }) | null = null;
      if (id) {
        const [row] = await tx.select().from(bookingServices).where(eq(bookingServices.id, id)).for('update').limit(1);
        if (!row) return { status: 'not_found' };
        const links = await tx.select().from(bookingServiceStaff).where(eq(bookingServiceStaff.bookingServiceId, id));
        before = {
          name: row.name,
          durationMinutes: row.durationMinutes,
          published: row.published,
          position: row.position,
          staffIds: links.map((l) => l.teamMemberId).sort(),
        };
        await tx.update(bookingServices).set({ ...values, updatedAt: now }).where(eq(bookingServices.id, id));
      } else {
        // Alta idempotente: el id es el submission_id del token firmado (FR-023).
        id = options.submissionId ?? randomUUID();
        const [existing] = await tx.select({ id: bookingServices.id }).from(bookingServices).where(eq(bookingServices.id, id)).limit(1);
        if (existing) return { status: 'ok', id, created: false, futureCount: 0, noSlots: false };
        const taken = new Set((await tx.select({ slug: bookingServices.slug }).from(bookingServices)).map((r) => r.slug));
        await tx.insert(bookingServices).values({ id, slug: uniqueSlug(slugify(input.name), taken), ...values, createdAt: now, updatedAt: now });
        created = true;
      }
      await tx.delete(bookingServiceStaff).where(eq(bookingServiceStaff.bookingServiceId, id));
      if (input.staff_ids.length > 0) {
        await tx.insert(bookingServiceStaff).values(input.staff_ids.map((teamMemberId) => ({ bookingServiceId: id!, teamMemberId })));
      }
      const after = { ...values, staffIds: [...input.staff_ids].sort() };
      const changes = diffChanges(before, after);
      if (created || Object.keys(changes).length > 0) {
        await recordAdminAction(tx, {
          actorId: admin.id,
          action: created ? 'service.create' : 'service.update',
          entityType: 'booking_service',
          entityId: id,
          changes,
        });
      }
      // FR-014: citas futuras que se mantienen al desactivar o al cambiar la duración.
      const affects = before !== null && ((before.published && !input.active) || before.durationMinutes !== input.duration_minutes);
      const futureCount = affects ? await futureAppointmentsCount(id, now, tx) : 0;
      return { status: 'ok', id, created, futureCount, noSlots: false };
    });
    if (result.status !== 'ok' || !input.active) return result;
    // Aviso "sin franjas": ningún tramo de sus veterinarios reservables admite la duración.
    const [site, hours, bookable] = await Promise.all([
      getSiteData(),
      loadStaffHours(),
      input.staff_ids.length
        ? db.select({ id: teamMembers.id }).from(teamMembers).where(and(inArray(teamMembers.id, input.staff_ids), eq(teamMembers.bookable, true)))
        : Promise.resolve([]),
    ]);
    const noSlots = !durationFits(input.duration_minutes, site.hours, bookable.map((m) => hours.get(m.id) ?? []));
    logger.info({ admin_id: admin.id, service_id: result.id, code: result.created ? 'created' : 'updated' }, 'admin_service_saved');
    return { ...result, noSlots };
  } catch (error) {
    if (isUniqueViolation(error, 'booking_services_name_lower_uq')) return { status: 'invalid', fieldErrors: DUPLICATE };
    logger.error({ admin_id: admin.id, code: errorCode(error) }, 'admin_service_failed');
    return { status: 'error' };
  }
}

export interface ServiceListItem {
  id: string;
  name: string;
  durationMinutes: number;
  published: boolean;
  position: number;
  staffNames: string[];
  futureCount: number;
}

export async function listServicesWithStats(now: Date, db: DbOrTx = getDb()): Promise<ServiceListItem[]> {
  const [services, links, counts] = await Promise.all([
    db.select().from(bookingServices).orderBy(asc(bookingServices.position), asc(bookingServices.name)),
    db
      .select({ serviceId: bookingServiceStaff.bookingServiceId, name: teamMembers.name, position: teamMembers.bookingPosition })
      .from(bookingServiceStaff)
      .innerJoin(teamMembers, eq(teamMembers.id, bookingServiceStaff.teamMemberId))
      .orderBy(asc(teamMembers.bookingPosition), asc(teamMembers.name)),
    db
      .select({ serviceId: appointments.bookingServiceId, n: count() })
      .from(appointments)
      .where(and(eq(appointments.status, 'confirmed'), gt(appointments.startsAt, now)))
      .groupBy(appointments.bookingServiceId),
  ]);
  const future = new Map(counts.map((c) => [c.serviceId, c.n]));
  return services.map((s) => ({
    id: s.id,
    name: s.name,
    durationMinutes: s.durationMinutes,
    published: s.published,
    position: s.position,
    staffNames: links.filter((l) => l.serviceId === s.id).map((l) => l.name),
    futureCount: future.get(s.id) ?? 0,
  }));
}

export async function serviceForEdit(id: string, db: DbOrTx = getDb()) {
  const [row] = await db.select().from(bookingServices).where(eq(bookingServices.id, id)).limit(1);
  if (!row) return null;
  const links = await db.select().from(bookingServiceStaff).where(eq(bookingServiceStaff.bookingServiceId, id));
  return { ...row, staffIds: links.map((l) => l.teamMemberId) };
}
