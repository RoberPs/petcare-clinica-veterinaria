import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { StaffForm } from '@/components/admin/StaffForm';
import { uuid } from '@/domain/admin-schemas';
import { listServicesWithStats } from '@/lib/admin/services';
import { staffForEdit } from '@/lib/admin/staff';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';
import { createSubmissionToken } from '@/lib/form-token';
import { saveStaff } from '../actions';

export const metadata: Metadata = { title: 'Editar veterinario' };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminEditStaffPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  await requireAdmin();
  const [{ id }, sp, now] = await Promise.all([params, searchParams, getNow()]);
  if (!uuid.safeParse(id).success) notFound();
  const member = await staffForEdit(id);
  if (!member) notFound();
  const services = await listServicesWithStats(now);
  return (
    <>
      <div className="admin-heading">
        <h2>{member.name}</h2>
        <Link prefetch={false} className="btn" href={`/admin/veterinarios/${member.id}/horario`}>
          Horario semanal
        </Link>
      </div>
      <AdminNotice searchParams={sp} />
      <StaffForm
        action={saveStaff}
        submissionToken={createSubmissionToken(now)}
        services={services}
        initial={{ id: member.id, name: member.name, bookable: member.bookable, bookingPosition: member.bookingPosition, serviceIds: member.serviceIds }}
      />
    </>
  );
}
