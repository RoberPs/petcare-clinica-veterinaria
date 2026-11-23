import type { Metadata } from 'next';
import { ServiceForm } from '@/components/admin/ServiceForm';
import { listStaffWithStats } from '@/lib/admin/staff';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';
import { createSubmissionToken } from '@/lib/form-token';
import { saveService } from '../actions';

export const metadata: Metadata = { title: 'Nuevo servicio' };

export default async function AdminNewServicePage() {
  await requireAdmin();
  const now = await getNow();
  const staff = await listStaffWithStats(now);
  return (
    <>
      <h2>Nuevo servicio</h2>
      <ServiceForm action={saveService} submissionToken={createSubmissionToken(now)} staff={staff} />
    </>
  );
}
