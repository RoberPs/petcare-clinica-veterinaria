'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { products } from '@/db/schema';
import { adminFieldErrors, formObject, productSchema, stockAdjustSchema, uuid } from '@/domain/store-schemas';
import { panelToken } from '@/lib/admin/action-helpers';
import { formValues, type AdminFormState } from '@/lib/admin/form-state';
import { hasUpload } from '@/lib/admin/product-images';
import { saveProduct as saveProductRecord, setProductPublished as setProductPublishedRecord } from '@/lib/admin/products';
import { adjustStock as adjustStockRecord } from '@/lib/admin/stock';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getNow } from '@/lib/clock';

// Server Actions de los productos (US1, contracts/routes.md). Cada una empieza por requireAdmin():
// el layout no se ejecuta en las acciones. Están registradas en ADMIN_ACTIONS.

/** El catálogo y la ficha lo reflejan en la siguiente consulta (FR-008). */
function revalidateCatalog(slug: string): void {
  revalidatePath('/');
  revalidatePath('/productos');
  revalidatePath(`/productos/${slug}`);
}

export async function saveProduct(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const now = await getNow();
  const token = panelToken(form, now);
  if (!token.ok) return { status: 'expired' };

  const file = form.get('image');
  const chosen = hasUpload(file);
  // FR-025: el navegador no conserva el archivo al volver con errores; el formulario lo avisa.
  const invalid = (fieldErrors: Record<string, string>): AdminFormState => ({
    status: 'invalid',
    fieldErrors,
    values: chosen ? { ...formValues(form), image_chosen: '1' } : formValues(form),
  });

  const raw = formObject(form, ['pet_ids']);
  let currentImage: string | null = null;
  if (typeof raw.id === 'string') {
    const id = uuid.safeParse(raw.id);
    if (!id.success) notFound();
    const [row] = await getDb().select({ imagePath: products.imagePath }).from(products).where(eq(products.id, id.data)).limit(1);
    if (!row) notFound();
    currentImage = row.imagePath;
  }
  const removing = raw.remove_image === 'on';
  const parsed = productSchema.safeParse({ ...raw, has_image: chosen || (currentImage !== null && !removing) });
  if (!parsed.success) return invalid(adminFieldErrors(parsed.error));

  const r = await saveProductRecord(admin, parsed.data, { now, submissionId: token.submissionId, image: chosen ? file : null });
  if (r.status === 'not_found') notFound();
  if (r.status === 'invalid') return invalid(r.fieldErrors);
  if (r.status === 'error') return { status: 'error' };
  revalidateCatalog(r.slug);
  redirect(`/admin/productos/${r.id}?aviso=guardado`);
}

export async function setProductPublished(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const now = await getNow();
  const id = uuid.safeParse(form.get('id'));
  if (!id.success) notFound();
  const token = panelToken(form, now);
  if (!token.ok) redirect(`/admin/productos/${id.data}?aviso=caducado`);
  const published = form.get('published') === '1';
  const r = await setProductPublishedRecord(admin, id.data, published, now);
  if (r.status === 'not_found') notFound();
  if (r.status === 'error') redirect(`/admin/productos/${id.data}?aviso=error`);
  revalidateCatalog(r.slug);
  redirect(`/admin/productos/${id.data}?aviso=${published ? 'reactivado' : 'desactivado'}`);
}

/** Ajuste manual del stock (US4, G5): PRG con stock-ajustado o stock-insuficiente&max=N. */
export async function adjustStock(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const now = await getNow();
  const id = uuid.safeParse(form.get('id'));
  if (!id.success) notFound();
  if (!panelToken(form, now).ok) return { status: 'expired' };
  const parsed = stockAdjustSchema.safeParse(formObject(form));
  if (!parsed.success) return { status: 'invalid', fieldErrors: adminFieldErrors(parsed.error), values: formValues(form) };
  const r = await adjustStockRecord(admin, parsed.data, now);
  if (r.status === 'not_found') notFound();
  if (r.status === 'error') return { status: 'error' };
  if (r.status === 'insufficient') redirect(`/admin/productos/${id.data}/stock?aviso=stock-insuficiente&max=${r.max}`);
  revalidateCatalog(r.slug);
  redirect(`/admin/productos/${id.data}/stock?aviso=stock-ajustado`);
}
