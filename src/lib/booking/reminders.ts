import { and, eq, gt, isNull, lte, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { appointments, bookingSettings } from '@/db/schema';
import { getEmailContext } from '@/email/outbox';
import { logger } from '@/lib/logger';
import { enqueueReminderEmail } from './emails';

// Recordatorio por correo (B17, FR-034): cada pasada de email:dispatch encola un único recordatorio
// por cita confirmada que empieza dentro de reminder_hours_before. Encolar y marcar
// reminder_sent_at van en la misma transacción, con FOR UPDATE SKIP LOCKED: dos pasadas a la vez no
// duplican nada. No se recuerda una cita reservada con menos antelación que la configurada.

const BATCH = 200;

export async function enqueueDueReminders(db: Db, now: Date): Promise<string[]> {
  return db.transaction(async (tx) => {
    const [settings] = await tx.select().from(bookingSettings).limit(1);
    const hours = settings?.reminderHoursBefore ?? 0;
    if (!settings || hours === 0) return [];
    const until = new Date(now.getTime() + hours * 3_600_000);

    const due = await tx
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.status, 'confirmed'),
          isNull(appointments.reminderSentAt),
          isNull(appointments.anonymizedAt),
          gt(appointments.startsAt, now),
          lte(appointments.startsAt, until),
          lte(appointments.createdAt, sql`${appointments.startsAt} - make_interval(hours => ${hours})`),
        ),
      )
      .orderBy(appointments.startsAt)
      .limit(BATCH)
      .for('update', { skipLocked: true });
    if (due.length === 0) return [];

    const emailCtx = await getEmailContext(tx);
    const ids: string[] = [];
    for (const row of due) {
      const id = await enqueueReminderEmail(tx, row, emailCtx, settings.changeCutoffHours);
      await tx.update(appointments).set({ reminderSentAt: now }).where(eq(appointments.id, row.id));
      if (id) ids.push(id);
    }
    logger.info({ count: ids.length }, 'appointment_reminders_enqueued');
    return ids;
  });
}
