// Estado visible de una cita (B10) y si el cliente aún puede cancelarla o cambiarla (B13).
// "Realizada" se deduce: confirmada y ya terminada.

export type AppointmentState = 'confirmed' | 'cancelled' | 'done';

export interface AppointmentViewInput {
  status: 'confirmed' | 'cancelled';
  startsAt: Date;
  endsAt: Date;
}

export interface AppointmentView {
  state: AppointmentState;
  /** Futura (aún no ha empezado) y confirmada. */
  upcoming: boolean;
  /** El cliente puede cancelarla o cambiarla: confirmada y a `cutoffHours` o más del inicio. */
  canChange: boolean;
}

export const STATE_LABELS: Record<AppointmentState, string> = {
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  done: 'Realizada',
};

/** El cliente puede actuar si faltan al menos `cutoffHours` horas (el límite exacto vale). */
export function isWithinChangeWindow(startsAt: Date, now: Date, cutoffHours: number): boolean {
  return startsAt.getTime() - now.getTime() >= cutoffHours * 3_600_000;
}

export function appointmentView(row: AppointmentViewInput, now: Date, cutoffHours: number): AppointmentView {
  if (row.status === 'cancelled') return { state: 'cancelled', upcoming: false, canChange: false };
  const state: AppointmentState = row.endsAt.getTime() <= now.getTime() ? 'done' : 'confirmed';
  const upcoming = row.startsAt.getTime() > now.getTime();
  return { state, upcoming, canChange: upcoming && isWithinChangeWindow(row.startsAt, now, cutoffHours) };
}
