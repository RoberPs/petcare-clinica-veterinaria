import { aliasedTable, and, asc, eq, gte, inArray, lt, ne, or, type SQL } from 'drizzle-orm';
import type { AgendaAppointment, AgendaStaff } from '@/domain/agenda-view';
import { getDb, type DbOrTx } from '../client';
import { appointmentEvents, appointments, bookingServices, customers, teamMembers } from '../schema';

// Lecturas de la agenda del panel (US2, F16, F17). La agenda solo lleva el nombre del responsable;
// el contacto sale únicamente en el detalle de la cita.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Citas con `starts_at` en [from, to), por veterinario y hora. */
export async function agendaForRange(
  from: Date,
  to: Date,
  options: { staffId?: string | null; includeCancelled: boolean },
  db: DbOrTx = getDb(),
): Promise<AgendaAppointment[]> {
  const where: SQL[] = [gte(appointments.startsAt, from), lt(appointments.startsAt, to)];
  if (options.staffId) where.push(eq(appointments.teamMemberId, options.staffId));
  if (!options.includeCancelled) where.push(ne(appointments.status, 'cancelled'));
  const rows = await db
    .select({
      id: appointments.id,
      teamMemberId: appointments.teamMemberId,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      status: appointments.status,
      serviceName: bookingServices.name,
      servicePublished: bookingServices.published,
      petName: appointments.petName,
      petSpeciesLabel: appointments.petSpeciesLabel,
      ownerName: appointments.contactName,
    })
    .from(appointments)
    .innerJoin(bookingServices, eq(bookingServices.id, appointments.bookingServiceId))
    .where(and(...where))
    .orderBy(asc(appointments.startsAt));
  return rows;
}

/**
 * Columnas de la agenda: los veterinarios reservables (por `booking_position`) y los que tienen
 * citas en el periodo aunque ya no sean reservables.
 */
export async function agendaStaff(withAppointments: readonly string[], db: DbOrTx = getDb()): Promise<AgendaStaff[]> {
  return db
    .select({ id: teamMembers.id, slug: teamMembers.slug, name: teamMembers.name })
    .from(teamMembers)
    .where(
      withAppointments.length
        ? or(eq(teamMembers.bookable, true), inArray(teamMembers.id, [...withAppointments]))
        : eq(teamMembers.bookable, true),
    )
    .orderBy(asc(teamMembers.bookingPosition), asc(teamMembers.slug));
}

export async function staffBySlug(slug: string, db: DbOrTx = getDb()): Promise<AgendaStaff | null> {
  const [row] = await db
    .select({ id: teamMembers.id, slug: teamMembers.slug, name: teamMembers.name })
    .from(teamMembers)
    .where(eq(teamMembers.slug, slug))
    .limit(1);
  return row ?? null;
}

export interface AppointmentEventView {
  at: Date;
  kind: 'created' | 'rescheduled' | 'cancelled';
  actor: 'customer' | 'guest_link' | 'clinic_link' | 'admin' | 'system';
  adminName: string | null;
  fromStartsAt: Date | null;
  toStartsAt: Date | null;
  fromStaffName: string | null;
  toStaffName: string | null;
  note: string | null;
}

export interface AppointmentDetail {
  id: string;
  status: 'confirmed' | 'cancelled';
  startsAt: Date;
  endsAt: Date;
  bookingServiceId: string;
  serviceName: string;
  servicePublished: boolean;
  teamMemberId: string;
  staffName: string;
  bookedAs: 'guest' | 'customer';
  petName: string;
  petSpeciesLabel: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  reason: string | null;
  anonymizedAt: Date | null;
  manageVersion: number;
  createdAt: Date;
  events: AppointmentEventView[];
}

/** Detalle de una cita con contacto, versión e historial ordenado. null si no existe. */
export async function appointmentDetail(id: string, db: DbOrTx = getDb()): Promise<AppointmentDetail | null> {
  if (!UUID_RE.test(id)) return null;
  const [row] = await db
    .select({
      id: appointments.id,
      status: appointments.status,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      bookingServiceId: appointments.bookingServiceId,
      serviceName: bookingServices.name,
      servicePublished: bookingServices.published,
      teamMemberId: appointments.teamMemberId,
      staffName: teamMembers.name,
      bookedAs: appointments.bookedAs,
      petName: appointments.petName,
      petSpeciesLabel: appointments.petSpeciesLabel,
      contactName: appointments.contactName,
      contactEmail: appointments.contactEmail,
      contactPhone: appointments.contactPhone,
      reason: appointments.reason,
      anonymizedAt: appointments.anonymizedAt,
      manageVersion: appointments.manageVersion,
      createdAt: appointments.createdAt,
    })
    .from(appointments)
    .innerJoin(bookingServices, eq(bookingServices.id, appointments.bookingServiceId))
    .innerJoin(teamMembers, eq(teamMembers.id, appointments.teamMemberId))
    .where(eq(appointments.id, id))
    .limit(1);
  if (!row) return null;
  const fromStaff = aliasedTable(teamMembers, 'from_staff');
  const toStaff = aliasedTable(teamMembers, 'to_staff');
  const events = await db
    .select({
      at: appointmentEvents.at,
      kind: appointmentEvents.kind,
      actor: appointmentEvents.actor,
      adminName: customers.firstName,
      fromStartsAt: appointmentEvents.fromStartsAt,
      toStartsAt: appointmentEvents.toStartsAt,
      fromStaffName: fromStaff.name,
      toStaffName: toStaff.name,
      note: appointmentEvents.note,
    })
    .from(appointmentEvents)
    .leftJoin(customers, eq(customers.id, appointmentEvents.adminId))
    .leftJoin(fromStaff, eq(fromStaff.id, appointmentEvents.fromStaffId))
    .leftJoin(toStaff, eq(toStaff.id, appointmentEvents.toStaffId))
    .where(eq(appointmentEvents.appointmentId, id))
    .orderBy(asc(appointmentEvents.at));
  return { ...row, events };
}
