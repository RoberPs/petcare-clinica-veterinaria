import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ServiceForm } from '@/components/admin/ServiceForm';
import { futureAppointmentsCount, serviceForEdit } from '@/lib/admin/services';
import { listStaffWithStats } from '@/lib/admin/staff';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';
import { createSubmissionToken } from '@/lib/form-token';
import { uuid } from '@/domain/admin-schemas';
import { saveService } from '../actions';

export const metadata: Metadata = { title: 'Editar servicio' };

type Params = Promise<{ id: string }>;

// Edición de un servicio, con el aviso previo de citas futuras (FR-014).
export default async function AdminEditServicePage({ params }: { params: Params }) {
  await requireAdmin();
  const [{ id }, now] = await Promise.all([params, getNow()]);
  if (!uuid.safeParse(id).success) notFound();
  const service = await serviceForEdit(id);
  if (!service) notFound();
  const [staff, futureCount] = await Promise.all([listStaffWithStats(now), futureAppointmentsCount(id, now)]);
  return (
    <>
      <h2>Editar servicio: {service.name}</h2>
      <ServiceForm
        action={saveService}
        submissionToken={createSubmissionToken(now)}
        staff={staff}
        futureCount={futureCount}
        initial={{
          id: service.id,
          name: service.name,
          durationMinutes: service.durationMinutes,
          published: service.published,
          position: service.position,
          staffIds: service.staffIds,
        }}
      />
    </>
  );
}
