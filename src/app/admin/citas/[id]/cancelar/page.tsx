import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { appointmentDetail } from '@/db/queries/admin-agenda';
import { CLINIC_NOTE_MAX } from '@/domain/admin-schemas';
import { describeWhen } from '@/domain/availability';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';
import { createSubmissionToken } from '@/lib/form-token';
import { cancelAppointmentAdmin } from '../actions';

export const metadata: Metadata = { title: 'Cancelar la cita' };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Confirmación de la cancelación con la nota opcional al cliente (FR-020).
export default async function AdminCancelPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  await requireAdmin();
  const [{ id }, sp, now] = await Promise.all([params, searchParams, getNow()]);
  const a = await appointmentDetail(id);
  if (!a) notFound();
  const when = describeWhen(a.startsAt);
  const editable = a.status === 'confirmed' && a.startsAt.getTime() > now.getTime();

  return (
    <>
      <h2>Cancelar la cita</h2>
      <AdminNotice searchParams={sp} />
      <p>
        {a.serviceName} para {a.petName}, con {a.staffName}, el {when.longDate} a las {when.time}.
      </p>
      {editable ? (
        <form className="panel form" action={cancelAppointmentAdmin}>
          <input type="hidden" name="id" value={a.id} />
          <input type="hidden" name="version" value={a.manageVersion} />
          <input type="hidden" name="submission" value={createSubmissionToken(now)} />
          <div className="field">
            <label htmlFor="cancelar-nota">Mensaje para el cliente (opcional)</label>
            <textarea id="cancelar-nota" name="note" rows={4} maxLength={CLINIC_NOTE_MAX} aria-describedby="cancelar-nota-hint" />
            <span className="field__hint" id="cancelar-nota-hint">
              Hasta {CLINIC_NOTE_MAX} caracteres. No incluyas datos de salud: se envía por correo.
            </span>
          </div>
          <p>La franja quedará libre en el acto y el cliente recibirá un correo con la cancelación.</p>
          <div className="form-actions">
            <button className="btn btn--ghost" type="submit">
              Cancelar la cita
            </button>
            <Link prefetch={false} className="btn" href={`/admin/citas/${a.id}`}>
              Volver sin cancelar
            </Link>
          </div>
        </form>
      ) : (
        <div className="notice" role="alert">
          <p>Esta cita ya no se puede cancelar: está cancelada o ya ha pasado.</p>
          <p>
            <Link prefetch={false} href={`/admin/citas/${a.id}`}>
              Volver al detalle
            </Link>
          </p>
        </div>
      )}
    </>
  );
}
