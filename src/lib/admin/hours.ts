import { and, eq, gt } from 'drizzle-orm';
import { getDb, type DbOrTx } from '@/db/client';
import { loadStaffHours } from '@/db/queries/booking-config';
import { blocksForRange } from '@/db/queries/schedule-blocks';
import { getSiteData } from '@/db/queries/site';
import { appointments, closures, staffHours, teamMembers } from '@/db/schema';
import { weekFieldName } from '@/domain/admin-schemas';
import { localDateTime } from '@/domain/availability';
import type { ClosureRange, WeeklySlot } from '@/domain/open-status';
import { countAffected, windowsResolver, type ScheduledAppointment } from '@/domain/outside-schedule';
import { outsideClinic, validateWeek, type WeekInput } from '@/domain/staff-schedule';
import { addDays, todayInClinic } from '@/domain/time';
import { errorCode } from '@/lib/account/common';
import { logger } from '@/lib/logger';
import { recordAdminAction } from './audit';
import type { AdminActor } from './common';

// Horario semanal de un veterinario (US3, FR-016, FR-019, F6). Se guarda la semana entera en una
// transacción (borrar y volver a crear). Las citas que quedan fuera se mantienen y se cuentan.

export type SaveHoursResult =
  | { status: 'ok'; affected: number; outsideClinic: boolean }
  | { status: 'invalid'; fieldErrors: Record<string, string> }
  | { status: 'not_found' }
  | { status: 'error' };

export async function publishedClosures(db: DbOrTx = getDb()): Promise<ClosureRange[]> {
  return db.select({ startsOn: closures.startsOn, endsOn: closures.endsOn }).from(closures).where(eq(closures.published, true));
}

/** Citas confirmadas y futuras (de un veterinario, si se indica) para contar las afectadas. */
export async function futureAppointments(now: Date, staffId: string | null, db: DbOrTx = getDb()): Promise<ScheduledAppointment[]> {
  const where = [eq(appointments.status, 'confirmed'), gt(appointments.startsAt, now)];
  if (staffId) where.push(eq(appointments.teamMemberId, staffId));
  return db
    .select({
      id: appointments.id,
      teamMemberId: appointments.teamMemberId,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      status: appointments.status,
    })
    .from(appointments)
    .where(and(...where));
}

export async function saveStaffHours(
  admin: AdminActor,
  staffId: string,
  week: WeekInput,
  options: { now: Date },
): Promise<SaveHoursResult> {
  const { now } = options;
  const v = validateWeek(week);
  if (!v.ok) {
    // "1.0.opens" → "d1_0_opens", el nombre del campo de la rejilla.
    const fieldErrors: Record<string, string> = {};
    for (const [k, msg] of Object.entries(v.errors)) {
      const [d, i, f] = k.split('.');
      fieldErrors[weekFieldName(Number(d), Number(i), f as 'opens' | 'closes')] = msg;
    }
    return { status: 'invalid', fieldErrors };
  }
  try {
    const site = await getSiteData();
    return await getDb().transaction(async (tx): Promise<SaveHoursResult> => {
      const [member] = await tx.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.id, staffId)).for('update').limit(1);
      if (!member) return { status: 'not_found' };
      const beforeHours = (await loadStaffHours(tx)).get(staffId) ?? [];
      const appts = await futureAppointments(now, staffId, tx);
      const today = todayInClinic(now);
      const lastDay = appts.reduce((max, a) => (localDateTime(a.startsAt).date > max ? localDateTime(a.startsAt).date : max), today);
      const [blocks, closureRows] = await Promise.all([blocksForRange(today, addDays(lastDay, 1), tx), publishedClosures(tx)]);
      const snapshot = (hours: readonly WeeklySlot[]) =>
        windowsResolver({ clinicHours: site.hours, staffHours: new Map([[staffId, hours]]), closures: closureRows, blocks });
      const affected = countAffected(appts, snapshot(beforeHours), snapshot(v.slots), now);

      await tx.delete(staffHours).where(eq(staffHours.teamMemberId, staffId));
      if (v.slots.length > 0) {
        await tx.insert(staffHours).values(v.slots.map((s) => ({ teamMemberId: staffId, weekday: s.weekday, opensAt: s.opensAt, closesAt: s.closesAt })));
      }
      const fmt = (h: readonly WeeklySlot[]) => h.map((s) => `${s.weekday} ${s.opensAt.slice(0, 5)}-${s.closesAt.slice(0, 5)}`);
      if (JSON.stringify(fmt(beforeHours)) !== JSON.stringify(fmt(v.slots))) {
        await recordAdminAction(tx, {
          actorId: admin.id,
          action: 'staff.hours',
          entityType: 'team_member',
          entityId: staffId,
          changes: { hours: { before: fmt(beforeHours), after: fmt(v.slots) } },
        });
      }
      logger.info({ admin_id: admin.id, staff_id: staffId, code: 'hours_saved' }, 'admin_staff_hours_saved');
      return { status: 'ok', affected: affected.count, outsideClinic: outsideClinic(v.slots, site.hours).length > 0 };
    });
  } catch (error) {
    logger.error({ admin_id: admin.id, code: errorCode(error) }, 'admin_staff_hours_failed');
    return { status: 'error' };
  }
}
