import { randomUUID } from 'node:crypto';
import { and, asc, count, eq, gt, inArray } from 'drizzle-orm';
import { getDb, type DbOrTx } from '@/db/client';
import { appointments, bookingServices, bookingServiceStaff, staffHours, teamMembers } from '@/db/schema';
import type { StaffFormData } from '@/domain/admin-schemas';
import { errorCode } from '@/lib/account/common';
import { logger } from '@/lib/logger';
import { diffChanges, recordAdminAction } from './audit';
import { slugify, uniqueSlug, type AdminActor } from './common';

// Veterinarios reservables desde el panel (US3, FR-015, F5). Un alta nace sin publicar (no sale en
// la página del equipo) y sin foto; la ficha pública sigue en el YAML. No se borran: dejan de ser
// reservables y sus citas futuras se mantienen.

export type SaveStaffResult =
  | { status: 'ok'; id: string; created: boolean }
  | { status: 'invalid'; fieldErrors: Record<string, string> }
  | { status: 'not_found' }
  | { status: 'error' };

/** Especialidad obligatoria de team_members para un alta del panel (no se publica). */
const PANEL_SPECIALTY = 'Sin especificar';

export async function saveStaff(
  admin: AdminActor,
  input: StaffFormData,
  options: { now: Date; submissionId?: string },
): Promise<SaveStaffResult> {
  const { now } = options;
  try {
    const db = getDb();
    if (input.service_ids.length > 0) {
      const found = await db.select({ id: bookingServices.id }).from(bookingServices).where(inArray(bookingServices.id, input.service_ids));
      if (found.length !== input.service_ids.length) return { status: 'invalid', fieldErrors: { service_ids: 'Algún servicio ya no existe.' } };
    }
    return await db.transaction(async (tx): Promise<SaveStaffResult> => {
      const values = { name: input.name, bookable: input.bookable, bookingPosition: input.booking_position };
      let id = input.id;
      let created = false;
      let before: (typeof values & { serviceIds: string[] }) | null = null;
      if (id) {
        const [row] = await tx.select().from(teamMembers).where(eq(teamMembers.id, id)).for('update').limit(1);
        if (!row) return { status: 'not_found' };
        const links = await tx.select().from(bookingServiceStaff).where(eq(bookingServiceStaff.teamMemberId, id));
        before = { name: row.name, bookable: row.bookable, bookingPosition: row.bookingPosition, serviceIds: links.map((l) => l.bookingServiceId).sort() };
        await tx.update(teamMembers).set({ ...values, updatedAt: now }).where(eq(teamMembers.id, id));
      } else {
        id = options.submissionId ?? randomUUID();
        const [existing] = await tx.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.id, id)).limit(1);
        if (existing) return { status: 'ok', id, created: false };
        const taken = new Set((await tx.select({ slug: teamMembers.slug }).from(teamMembers)).map((r) => r.slug));
        await tx.insert(teamMembers).values({
          id,
          slug: uniqueSlug(slugify(input.name), taken),
          ...values,
          specialty: PANEL_SPECIALTY,
          photoPath: null,
          photoAlt: null,
          published: false,
          createdAt: now,
          updatedAt: now,
        });
        created = true;
      }
      await tx.delete(bookingServiceStaff).where(eq(bookingServiceStaff.teamMemberId, id));
      if (input.service_ids.length > 0) {
        await tx.insert(bookingServiceStaff).values(input.service_ids.map((bookingServiceId) => ({ bookingServiceId, teamMemberId: id! })));
      }
      const changes = diffChanges(before, { ...values, serviceIds: [...input.service_ids].sort() });
      if (created || Object.keys(changes).length > 0) {
        await recordAdminAction(tx, {
          actorId: admin.id,
          action: created ? 'staff.create' : 'staff.update',
          entityType: 'team_member',
          entityId: id,
          changes,
        });
      }
      logger.info({ admin_id: admin.id, staff_id: id, code: created ? 'created' : 'updated' }, 'admin_staff_saved');
      return { status: 'ok', id, created };
    });
  } catch (error) {
    logger.error({ admin_id: admin.id, code: errorCode(error) }, 'admin_staff_failed');
    return { status: 'error' };
  }
}

export interface StaffListItem {
  id: string;
  slug: string;
  name: string;
  bookable: boolean;
  bookingPosition: number;
  published: boolean;
  serviceNames: string[];
  hourRanges: number;
  futureCount: number;
}

/** Todo el equipo (reservables primero), con servicios, tramos y citas futuras. */
export async function listStaffWithStats(now: Date, db: DbOrTx = getDb()): Promise<StaffListItem[]> {
  const [members, links, hours, counts] = await Promise.all([
    db.select().from(teamMembers).orderBy(asc(teamMembers.bookingPosition), asc(teamMembers.name)),
    db
      .select({ staffId: bookingServiceStaff.teamMemberId, name: bookingServices.name })
      .from(bookingServiceStaff)
      .innerJoin(bookingServices, eq(bookingServices.id, bookingServiceStaff.bookingServiceId))
      .orderBy(asc(bookingServices.position), asc(bookingServices.name)),
    db.select({ staffId: staffHours.teamMemberId, n: count() }).from(staffHours).groupBy(staffHours.teamMemberId),
    db
      .select({ staffId: appointments.teamMemberId, n: count() })
      .from(appointments)
      .where(and(eq(appointments.status, 'confirmed'), gt(appointments.startsAt, now)))
      .groupBy(appointments.teamMemberId),
  ]);
  const h = new Map(hours.map((r) => [r.staffId, r.n]));
  const f = new Map(counts.map((r) => [r.staffId, r.n]));
  return members
    .map((m) => ({
      id: m.id,
      slug: m.slug,
      name: m.name,
      bookable: m.bookable,
      bookingPosition: m.bookingPosition,
      published: m.published,
      serviceNames: links.filter((l) => l.staffId === m.id).map((l) => l.name),
      hourRanges: h.get(m.id) ?? 0,
      futureCount: f.get(m.id) ?? 0,
    }))
    .sort((a, b) => Number(b.bookable) - Number(a.bookable));
}

export async function staffForEdit(id: string, db: DbOrTx = getDb()) {
  const [row] = await db.select().from(teamMembers).where(eq(teamMembers.id, id)).limit(1);
  if (!row) return null;
  const links = await db.select().from(bookingServiceStaff).where(eq(bookingServiceStaff.teamMemberId, id));
  return { ...row, serviceIds: links.map((l) => l.bookingServiceId) };
}
