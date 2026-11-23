import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { ScheduleGrid } from '@/components/admin/ScheduleGrid';
import { WeeklyHours } from '@/components/WeeklyHours';
import { loadStaffHours } from '@/db/queries/booking-config';
import { getSiteData } from '@/db/queries/site';
import { uuid } from '@/domain/admin-schemas';
import { staffForEdit } from '@/lib/admin/staff';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';
import { createSubmissionToken } from '@/lib/form-token';
import { saveStaffHours } from '../../actions';

export const metadata: Metadata = { title: 'Horario semanal' };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Horario semanal de un veterinario (FR-016, FR-019), con el de la clínica como referencia.
export default async function AdminStaffHoursPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  await requireAdmin();
  const [{ id }, sp, now] = await Promise.all([params, searchParams, getNow()]);
  if (!uuid.safeParse(id).success) notFound();
  const member = await staffForEdit(id);
  if (!member) notFound();
  const [hours, site] = await Promise.all([loadStaffHours(), getSiteData()]);
  return (
    <>
      <h2>Horario semanal de {member.name}</h2>
      <AdminNotice searchParams={sp} />
      <section className="panel" aria-labelledby="horario-clinica">
        <h2 id="horario-clinica">Horario de la clínica</h2>
        <p>Solo se ofrecen las horas en que coinciden el horario del veterinario y el de la clínica.</p>
        <WeeklyHours hours={site.hours} />
      </section>
      <ScheduleGrid action={saveStaffHours} submissionToken={createSubmissionToken(now)} staffId={member.id} initial={hours.get(member.id) ?? []} />
    </>
  );
}
