import type { Metadata } from 'next';
import { ProductForm } from '@/components/admin/ProductForm';
import { listCategoriesAndPetsAdmin } from '@/db/queries/admin-products';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';
import { createSubmissionToken } from '@/lib/form-token';
import { saveProduct } from '../actions';

export const metadata: Metadata = { title: 'Nuevo producto' };

// Alta de un producto (US1, escenarios 1 y 2).
export default async function AdminNewProductPage() {
  await requireAdmin();
  const [now, { categories, pets }] = await Promise.all([getNow(), listCategoriesAndPetsAdmin()]);
  return (
    <>
      <h2>Nuevo producto</h2>
      <ProductForm action={saveProduct} submissionToken={createSubmissionToken(now)} categories={categories} pets={pets} />
    </>
  );
}
