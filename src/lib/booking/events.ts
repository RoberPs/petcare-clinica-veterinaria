import type { DbOrTx } from '@/db/client';
import { appointmentEvents } from '@/db/schema';

// Historial de la cita (F12). Lo escriben las mismas funciones que cambian la cita, en su
// transacción: reserva, cancelación y cambio, sea quien sea el actor.

export type AppointmentEventActor = (typeof appointmentEvents.$inferInsert)['actor'];

export interface AppointmentEventInput {
  appointmentId: string;
  kind: 'created' | 'rescheduled' | 'cancelled';
  actor: AppointmentEventActor;
  at: Date;
  adminId?: string | null;
  fromStartsAt?: Date | null;
  toStartsAt?: Date | null;
  fromStaffId?: string | null;
  toStaffId?: string | null;
  note?: string | null;
}

export async function recordAppointmentEvent(tx: DbOrTx, e: AppointmentEventInput): Promise<void> {
  await tx.insert(appointmentEvents).values({
    appointmentId: e.appointmentId,
    kind: e.kind,
    actor: e.actor,
    at: e.at,
    adminId: e.actor === 'admin' ? (e.adminId ?? null) : null,
    fromStartsAt: e.fromStartsAt ?? null,
    toStartsAt: e.toStartsAt ?? null,
    fromStaffId: e.fromStaffId ?? null,
    toStaffId: e.toStaffId ?? null,
    note: e.note?.trim() ? e.note.trim() : null,
  });
}
