import type { Metadata } from 'next';
import { DiscountForm } from '@/components/admin/DiscountForm';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';
import { createSubmissionToken } from '@/lib/form-token';
import { createDiscountCode } from '../actions';

export const metadata: Metadata = { title: 'Nuevo código de descuento' };

// Alta de un código de descuento (US6, escenarios 1 y 2).
export default async function AdminNewDiscountPage() {
  await requireAdmin();
  const now = await getNow();
  return (
    <>
      <h2>Nuevo código de descuento</h2>
      <DiscountForm action={createDiscountCode} submissionToken={createSubmissionToken(now)} />
    </>
  );
}
