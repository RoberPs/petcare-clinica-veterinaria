import { STATE_LABELS, type AppointmentState } from '@/domain/appointment-view';

// Estado visible de una cita (FR-022): "Confirmada" con .badge; "Cancelada" y "Realizada" con .badge--muted.
export function AppointmentStatus({ state }: { state: AppointmentState }) {
  return (
    <span className={state === 'confirmed' ? 'badge' : 'badge badge--muted'}>{STATE_LABELS[state]}</span>
  );
}
