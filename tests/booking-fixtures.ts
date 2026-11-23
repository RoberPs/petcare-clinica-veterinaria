import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

// Fixtures de citas para las pruebas de integración y de extremo a extremo: crean citas
// directamente en la base de datos (sin pasar por la interfaz de reserva).

export interface CreateAppointmentOptions {
  /** slug de booking_services (por defecto, el primero publicado). */
  service?: string;
  /** slug de team_members (por defecto, el primero que atiende el servicio). */
  staff?: string;
  startsAt: Date;
  /** Por defecto, la duración del servicio. */
  durationMinutes?: number;
  status?: 'confirmed' | 'cancelled';
  cancelledBy?: 'customer' | 'clinic' | 'system';
  customerId?: string | null;
  petId?: string | null;
  petName?: string;
  petSpeciesLabel?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string | null;
  reason?: string | null;
  createdAt?: Date;
  reminderSentAt?: Date | null;
  manageVersion?: number;
}

export interface TestAppointment {
  id: string;
  bookingServiceId: string;
  teamMemberId: string;
  startsAt: Date;
  endsAt: Date;
}

export async function createAppointment(pool: Pool, o: CreateAppointmentOptions): Promise<TestAppointment> {
  const svc = await pool.query<{ id: string; duration_minutes: number }>(
    o.service
      ? 'SELECT id, duration_minutes FROM booking_services WHERE slug = $1'
      : 'SELECT id, duration_minutes FROM booking_services WHERE published ORDER BY position LIMIT 1',
    o.service ? [o.service] : [],
  );
  const service = svc.rows[0];
  if (!service) throw new Error(`No existe el servicio reservable ${o.service ?? '(ninguno)'}`);
  const staff = await pool.query<{ id: string }>(
    o.staff
      ? 'SELECT id FROM team_members WHERE slug = $1'
      : `SELECT t.id FROM team_members t JOIN booking_service_staff s ON s.team_member_id = t.id
         WHERE s.booking_service_id = $1 ORDER BY t.position LIMIT 1`,
    [o.staff ?? service.id],
  );
  const staffId = staff.rows[0]?.id;
  if (!staffId) throw new Error(`No existe el profesional ${o.staff ?? '(ninguno)'}`);
  const endsAt = new Date(o.startsAt.getTime() + (o.durationMinutes ?? service.duration_minutes) * 60_000);
  const status = o.status ?? 'confirmed';
  const cancelled = status === 'cancelled';
  const email = o.contactEmail ?? `invitado-${randomUUID().slice(0, 8)}@example.test`;
  const createdAt = o.createdAt ?? new Date(o.startsAt.getTime() - 7 * 24 * 3_600_000);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO appointments (submission_id, booking_service_id, team_member_id, starts_at, ends_at, status,
       cancelled_by, cancelled_at, booked_as, customer_id, pet_id, pet_name, pet_species_label, contact_name,
       contact_email, contact_email_normalized, contact_phone, reason, privacy_accepted_at, privacy_version,
       manage_version, reminder_sent_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 'pruebas', $20, $21, $19, $19)
     RETURNING id`,
    [
      randomUUID(),
      service.id,
      staffId,
      o.startsAt,
      endsAt,
      status,
      cancelled ? (o.cancelledBy ?? 'customer') : null,
      cancelled ? createdAt : null,
      o.customerId ? 'customer' : 'guest',
      o.customerId ?? null,
      o.petId ?? null,
      o.petName ?? 'Mascota de prueba',
      o.petSpeciesLabel ?? 'Perro',
      o.contactName ?? 'Persona de Prueba',
      email,
      email.trim().toLowerCase(),
      o.contactPhone === undefined ? '600 000 001' : o.contactPhone,
      o.reason ?? null,
      createdAt,
      o.manageVersion ?? 1,
      o.reminderSentAt ?? null,
    ],
  );
  return { id: rows[0]!.id, bookingServiceId: service.id, teamMemberId: staffId, startsAt: o.startsAt, endsAt };
}

/**
 * Variante de content/petcare.yaml para las pruebas de reserva: 2 profesionales, 3 servicios,
 * horario de lunes a viernes (09:30–14:00 y 16:30–20:00) y un cierre el 8 de diciembre de 2026.
 */
export function bookingContentVariant(content: Record<string, any>): void {
  content.team = content.team.filter((m: { slug: string }) => ['nerea-olmedo', 'inigo-barral'].includes(m.slug));
  content.opening_hours = [1, 2, 3, 4, 5].flatMap((weekday) => [
    { weekday, opens: '09:30', closes: '14:00' },
    { weekday, opens: '16:30', closes: '20:00' },
  ]);
  content.closures = [{ slug: 'cierre-pruebas', starts_on: '2026-12-08', ends_on: '2026-12-08', reason: 'Festivo' }];
  content.booking = {
    rules: {},
    services: [
      { slug: 'consulta-general', name: 'Consulta general', duration_minutes: 30, staff: ['nerea-olmedo', 'inigo-barral'] },
      { slug: 'cirugia', name: 'Cirugía', duration_minutes: 60, staff: ['inigo-barral'] },
      { slug: 'vacunacion', name: 'Vacunación', duration_minutes: 15, staff: ['nerea-olmedo', 'inigo-barral'] },
    ],
  };
}

// ---------- Panel de la agenda (feature 007) ----------

/** Sustituye el horario semanal de un veterinario (por slug). `[]` = sin tramos. */
export async function createStaffHours(
  pool: Pool,
  staffSlug: string,
  slots: { weekday: number; opens: string; closes: string }[],
): Promise<void> {
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM team_members WHERE slug = $1', [staffSlug]);
  const id = rows[0]?.id;
  if (!id) throw new Error(`No existe el profesional ${staffSlug}`);
  await pool.query('DELETE FROM staff_hours WHERE team_member_id = $1', [id]);
  for (const s of slots) {
    await pool.query('INSERT INTO staff_hours (team_member_id, weekday, opens_at, closes_at) VALUES ($1, $2, $3, $4)', [
      id,
      s.weekday,
      s.opens,
      s.closes,
    ]);
  }
}

export type CreateBlockOptions = { staff?: string | null; reason?: string } & (
  | { kind: 'once'; startsAt: Date; endsAt: Date }
  | { kind: 'weekly'; fromDate: string; untilDate: string; weekdays: number[]; startTime: string; endTime: string }
);

/** Crea un bloqueo (de un veterinario por slug, o de toda la clínica sin `staff`). */
export async function createBlock(pool: Pool, o: CreateBlockOptions): Promise<string> {
  let staffId: string | null = null;
  if (o.staff) {
    const { rows } = await pool.query<{ id: string }>('SELECT id FROM team_members WHERE slug = $1', [o.staff]);
    staffId = rows[0]?.id ?? null;
    if (!staffId) throw new Error(`No existe el profesional ${o.staff}`);
  }
  const id = randomUUID();
  if (o.kind === 'once') {
    await pool.query(
      `INSERT INTO schedule_blocks (id, team_member_id, kind, starts_at, ends_at, reason) VALUES ($1, $2, 'once', $3, $4, $5)`,
      [id, staffId, o.startsAt, o.endsAt, o.reason ?? 'Bloqueo de prueba'],
    );
  } else {
    await pool.query(
      `INSERT INTO schedule_blocks (id, team_member_id, kind, from_date, until_date, weekdays, start_time, end_time, reason)
       VALUES ($1, $2, 'weekly', $3, $4, $5, $6, $7, $8)`,
      [id, staffId, o.fromDate, o.untilDate, o.weekdays, o.startTime, o.endTime, o.reason ?? 'Bloqueo de prueba'],
    );
  }
  return id;
}

/** Lunes laborable de referencia para las pruebas de reserva (16/11/2026, 09:00 en Madrid). */
export const BOOKING_MONDAY_9AM = new Date('2026-11-16T08:00:00Z');

/** Instante de una hora local de Madrid en noviembre–marzo (UTC+1). */
export function madrid(date: string, time: string): Date {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const d = new Date(`${date}T00:00:00Z`);
  return new Date(d.getTime() + ((h - 1) * 60 + m) * 60_000);
}
