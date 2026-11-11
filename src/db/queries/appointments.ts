import { and, asc, count, desc, eq, gt, gte, lt, ne } from 'drizzle-orm';
import { dayBounds, type BusyInterval } from '@/domain/availability';
import { getDb, type DbOrTx } from '../client';
import { appointments, bookingServices, teamMembers } from '../schema';

// Consultas de citas (data-model.md). Las que leen citas de un cliente filtran SIEMPRE por su
// customerId (A9): una cita ajena se trata igual que una que no existe.

export type AppointmentRow = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isAppointmentId = (id: string) => UUID_RE.test(id);

/**
 * Citas confirmadas que tocan los días [dateIso, dateIso + days), por profesional. `excludeId`
 * deja fuera la propia cita al calcular un cambio.
 */
export async function busyIntervalsForDay(
  db: DbOrTx,
  dateIso: string,
  options: { days?: number; excludeId?: string } = {},
): Promise<BusyInterval[]> {
  const { start, end } = dayBounds(dateIso, options.days ?? 1);
  return db
    .select({
      teamMemberId: appointments.teamMemberId,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.status, 'confirmed'),
        lt(appointments.startsAt, end),
        gt(appointments.endsAt, start),
        options.excludeId ? ne(appointments.id, options.excludeId) : undefined,
      ),
    );
}

/** Número de citas confirmadas de cada profesional ese día (B4). */
export async function dayLoad(db: DbOrTx, dateIso: string, excludeId?: string): Promise<Map<string, number>> {
  const { start, end } = dayBounds(dateIso);
  const rows = await db
    .select({ id: appointments.teamMemberId, n: count() })
    .from(appointments)
    .where(
      and(
        eq(appointments.status, 'confirmed'),
        gte(appointments.startsAt, start),
        lt(appointments.startsAt, end),
        excludeId ? ne(appointments.id, excludeId) : undefined,
      ),
    )
    .groupBy(appointments.teamMemberId);
  return new Map(rows.map((r) => [r.id, r.n]));
}

/** Citas futuras confirmadas de un invitado, por su correo normalizado (B9). */
export async function countActiveByEmail(db: DbOrTx, emailNormalized: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(appointments)
    .where(
      and(
        eq(appointments.contactEmailNormalized, emailNormalized),
        eq(appointments.status, 'confirmed'),
        eq(appointments.bookedAs, 'guest'),
        gt(appointments.startsAt, now),
      ),
    );
  return row?.n ?? 0;
}

/** Citas futuras confirmadas de un cliente (B9). */
export async function countActiveByCustomer(db: DbOrTx, customerId: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(appointments)
    .where(
      and(
        eq(appointments.customerId, customerId),
        eq(appointments.status, 'confirmed'),
        gt(appointments.startsAt, now),
      ),
    );
  return row?.n ?? 0;
}

export async function findBySubmission(db: DbOrTx, submissionId: string): Promise<AppointmentRow | null> {
  const [row] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.submissionId, submissionId))
    .limit(1);
  return row ?? null;
}

/**
 * Inserta la cita. Si el submission_id ya existe, devuelve la existente (idempotencia, B6). Un
 * solape con otra cita confirmada lanza el error 23P01 de appointments_no_overlap.
 */
export async function insertAppointment(
  db: DbOrTx,
  values: NewAppointment,
): Promise<{ row: AppointmentRow; created: boolean }> {
  const [row] = await db
    .insert(appointments)
    .values(values)
    .onConflictDoNothing({ target: appointments.submissionId })
    .returning();
  if (row) return { row, created: true };
  const existing = await findBySubmission(db, values.submissionId);
  if (!existing) throw new Error('appointment_insert_failed');
  return { row: existing, created: false };
}

/** La cita bloqueada para cambiarla (SELECT … FOR UPDATE). */
export async function findAppointmentForUpdate(db: DbOrTx, id: string): Promise<AppointmentRow | null> {
  if (!isAppointmentId(id)) return null;
  const [row] = await db.select().from(appointments).where(eq(appointments.id, id)).for('update').limit(1);
  return row ?? null;
}

export async function findAppointment(id: string, db: DbOrTx = getDb()): Promise<AppointmentRow | null> {
  if (!isAppointmentId(id)) return null;
  const [row] = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
  return row ?? null;
}

// ---------- Mis citas (US3) ----------

export interface CustomerAppointment {
  id: string;
  status: 'confirmed' | 'cancelled';
  startsAt: Date;
  endsAt: Date;
  petName: string;
  petSpeciesLabel: string;
  serviceName: string;
  bookingServiceId: string;
  staffName: string;
  teamMemberId: string;
  cancelledBy: 'customer' | 'clinic' | 'system' | null;
  reason: string | null;
  contactPhone: string | null;
  createdAt: Date;
}

const customerColumns = {
  id: appointments.id,
  status: appointments.status,
  startsAt: appointments.startsAt,
  endsAt: appointments.endsAt,
  petName: appointments.petName,
  petSpeciesLabel: appointments.petSpeciesLabel,
  serviceName: bookingServices.name,
  bookingServiceId: appointments.bookingServiceId,
  staffName: teamMembers.name,
  teamMemberId: appointments.teamMemberId,
  cancelledBy: appointments.cancelledBy,
  reason: appointments.reason,
  contactPhone: appointments.contactPhone,
  createdAt: appointments.createdAt,
};

/** Todas las citas del cliente, de la más reciente a la más antigua. */
export async function listCustomerAppointments(
  customerId: string,
  db: DbOrTx = getDb(),
): Promise<CustomerAppointment[]> {
  return db
    .select(customerColumns)
    .from(appointments)
    .innerJoin(bookingServices, eq(bookingServices.id, appointments.bookingServiceId))
    .innerJoin(teamMembers, eq(teamMembers.id, appointments.teamMemberId))
    .where(eq(appointments.customerId, customerId))
    .orderBy(desc(appointments.startsAt));
}

/** La próxima cita confirmada que aún no ha empezado. */
export async function nextCustomerAppointment(
  customerId: string,
  now: Date,
  db: DbOrTx = getDb(),
): Promise<CustomerAppointment | null> {
  const [row] = await db
    .select(customerColumns)
    .from(appointments)
    .innerJoin(bookingServices, eq(bookingServices.id, appointments.bookingServiceId))
    .innerJoin(teamMembers, eq(teamMembers.id, appointments.teamMemberId))
    .where(
      and(
        eq(appointments.customerId, customerId),
        eq(appointments.status, 'confirmed'),
        gt(appointments.startsAt, now),
      ),
    )
    .orderBy(asc(appointments.startsAt))
    .limit(1);
  return row ?? null;
}

/** Una cita del cliente, o null si no existe o es ajena. */
export async function readOwnAppointment(
  customerId: string,
  id: string,
  db: DbOrTx = getDb(),
): Promise<CustomerAppointment | null> {
  if (!isAppointmentId(id)) return null;
  const [row] = await db
    .select(customerColumns)
    .from(appointments)
    .innerJoin(bookingServices, eq(bookingServices.id, appointments.bookingServiceId))
    .innerJoin(teamMembers, eq(teamMembers.id, appointments.teamMemberId))
    .where(and(eq(appointments.id, id), eq(appointments.customerId, customerId)))
    .limit(1);
  return row ?? null;
}

/** Citas futuras confirmadas de una mascota del cliente (aviso antes de eliminarla). */
export async function countUpcomingForPet(
  customerId: string,
  petId: string,
  now: Date,
  db: DbOrTx = getDb(),
): Promise<number> {
  if (!isAppointmentId(petId)) return 0;
  const [row] = await db
    .select({ n: count() })
    .from(appointments)
    .where(
      and(
        eq(appointments.customerId, customerId),
        eq(appointments.petId, petId),
        eq(appointments.status, 'confirmed'),
        gt(appointments.startsAt, now),
      ),
    );
  return row?.n ?? 0;
}

/** Ids de las citas futuras confirmadas del cliente (o solo de una mascota). */
export async function upcomingIds(
  db: DbOrTx,
  customerId: string,
  now: Date,
  petId?: string,
): Promise<string[]> {
  const rows = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.customerId, customerId),
        petId ? eq(appointments.petId, petId) : undefined,
        eq(appointments.status, 'confirmed'),
        gt(appointments.startsAt, now),
      ),
    )
    .orderBy(asc(appointments.startsAt));
  return rows.map((r) => r.id);
}
