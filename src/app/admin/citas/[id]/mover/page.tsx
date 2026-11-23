import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { appointmentDetail } from '@/db/queries/admin-agenda';
import { dateParam, uuid } from '@/domain/admin-schemas';
import { describeWhen, localDateTime, longDateLabel } from '@/domain/availability';
import { todayInClinic } from '@/domain/time';
import { adminMoveSlots } from '@/lib/admin/appointments';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';
import { createSubmissionToken } from '@/lib/form-token';
import { moveAppointmentAdmin } from '../actions';

export const metadata: Metadata = { title: 'Mover la cita' };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Mover una cita (FR-021): fecha y veterinario por GET y franjas libres con las AdminRules (sin
// antelación mínima ni horizonte de la reserva pública, pero con horario, bloqueos y sin solapes).
export default async function AdminMovePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  await requireAdmin();
  const [{ id }, sp, now] = await Promise.all([params, searchParams, getNow()]);
  const a = await appointmentDetail(id);
  if (!a) notFound();
  const today = todayInClinic(now);
  const current = describeWhen(a.startsAt);
  const editable = a.status === 'confirmed' && a.startsAt.getTime() > now.getTime();
  const askedDate = dateParam.safeParse(first(sp.fecha) ?? '');
  const date = askedDate.success ? askedDate.data : localDateTime(a.startsAt).date < today ? today : localDateTime(a.startsAt).date;
  const askedStaff = uuid.safeParse(first(sp.veterinario) ?? '');
  const staffId = askedStaff.success ? askedStaff.data : a.teamMemberId;
  const options = editable ? await adminMoveSlots({ id: a.id, bookingServiceId: a.bookingServiceId }, date, staffId, now) : null;
  const staffOk = options?.staff.some((m) => m.id === staffId) ?? false;
  const slots = staffOk ? (options?.slots ?? []) : [];

  return (
    <>
      <h2>Mover la cita</h2>
      <AdminNotice searchParams={sp} />
      <p>
        Ahora: {a.serviceName} para {a.petName}, con {a.staffName}, el {current.longDate} a las {current.time}.
      </p>
      {!editable || !options ? (
        <div className="notice" role="alert">
          <p>Esta cita ya no se puede mover: está cancelada o ya ha pasado.</p>
          <p>
            <Link prefetch={false} href={`/admin/citas/${a.id}`}>
              Volver al detalle
            </Link>
          </p>
        </div>
      ) : (
        <>
          <form className="panel form admin-toolbar" method="get" action={`/admin/citas/${a.id}/mover`} aria-label="Elegir fecha y veterinario">
            <div className="field">
              <label htmlFor="mover-fecha">Fecha</label>
              <input id="mover-fecha" type="date" name="fecha" defaultValue={date} min={today} max={options.lastDay} required />
            </div>
            <div className="field">
              <label htmlFor="mover-veterinario">Veterinario</label>
              <select id="mover-veterinario" name="veterinario" defaultValue={staffId}>
                {options.staff.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn--ghost" type="submit">
              Ver franjas
            </button>
          </form>
          <form className="panel form" action={moveAppointmentAdmin}>
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="version" value={a.manageVersion} />
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="staff_id" value={staffId} />
            <input type="hidden" name="submission" value={createSubmissionToken(now)} />
            <fieldset className="choice-list">
              <legend>Franjas libres el {longDateLabel(date)}</legend>
              {!staffOk ? <p>Ese veterinario no atiende este servicio o no recibe reservas.</p> : null}
              {staffOk && slots.length === 0 ? <p>No hay franjas libres ese día para este veterinario.</p> : null}
              {slots.length > 0 ? (
                <div className="slots">
                  {slots.map((s) => (
                    <label key={s.time} className="slot-option">
                      <input type="radio" name="time" value={s.time} required />
                      <span className="slot">{s.time}</span>
                    </label>
                  ))}
                </div>
              ) : null}
            </fieldset>
            <p>El cliente recibirá un correo con la hora anterior y la nueva.</p>
            <div className="form-actions">
              <button className="btn" type="submit" disabled={slots.length === 0}>
                Mover la cita
              </button>
              <Link prefetch={false} className="btn btn--ghost" href={`/admin/citas/${a.id}`}>
                Volver sin cambiar
              </Link>
            </div>
          </form>
        </>
      )}
    </>
  );
}
