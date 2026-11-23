import type { Metadata } from 'next';
import { StaffForm } from '@/components/admin/StaffForm';
import { listServicesWithStats } from '@/lib/admin/services';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';
import { createSubmissionToken } from '@/lib/form-token';
import { saveStaff } from '../actions';

export const metadata: Metadata = { title: 'Nuevo veterinario' };

export default async function AdminNewStaffPage() {
  await requireAdmin();
  const now = await getNow();
  const services = await listServicesWithStats(now);
  return (
    <>
      <h2>Nuevo veterinario</h2>
      <p>Se da de alta sin publicar en la página del equipo. Después, define su horario semanal.</p>
      <StaffForm action={saveStaff} submissionToken={createSubmissionToken(now)} services={services} />
    </>
  );
}
