import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/require-admin';

// /admin lleva a la agenda (F3).
export default async function AdminHomePage() {
  await requireAdmin();
  redirect('/admin/agenda');
}
