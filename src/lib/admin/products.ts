import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { productCategories, productPetLinks, productPets, products, stockMovements } from '@/db/schema';
import { normalizeSearch } from '@/domain/search';
import type { ProductInput } from '@/domain/store-schemas';
import { errorCode } from '@/lib/account/common';
import { logger } from '@/lib/logger';
import { diffChanges, recordAdminAction } from './audit';
import { slugify, uniqueSlug, type AdminActor } from './common';
import { PRODUCT_IMAGE_ERRORS, ProductImageError, removeProductImageFiles, storeProductImage, type StoredProductImage } from './product-images';

// Productos desde el panel (US1, G2, G3 y G4). No se borran: se desactivan (FR-007). El slug se
// fija al crear y no cambia (FR-005). El stock inicial deja un movimiento "initial"; después solo
// cambia con un ajuste (US4) o con los pedidos (G5).

export type SaveProductResult =
  | { status: 'ok'; id: string; slug: string; created: boolean }
  | { status: 'invalid'; fieldErrors: Record<string, string> }
  | { status: 'not_found' }
  | { status: 'error' };

const DUPLICATE_NAME = 'Ya hay un producto con ese nombre.';

/** Campos de producto que se comparan para el registro de acciones (sin los textos largos). */
type AuditedFields = {
  name: string;
  categoryId: string;
  petIds: string[];
  priceCents: number;
  compareAtCents: number | null;
  vatRate: number;
  isNew: boolean;
  published: boolean;
  position: number;
  image: string | null;
  imageAlt: string | null;
};

export async function saveProduct(
  admin: AdminActor,
  input: ProductInput,
  options: { now: Date; submissionId?: string; image?: Blob | null },
): Promise<SaveProductResult> {
  const { now } = options;
  const db = getDb();
  let stored: StoredProductImage | null = null;
  let oldImageToRemove: string | null = null;
  try {
    const [category] = await db.select({ id: productCategories.id }).from(productCategories).where(eq(productCategories.id, input.categoryId)).limit(1);
    if (!category) return { status: 'invalid', fieldErrors: { category_id: 'Esa categoría ya no existe.' } };
    const pets = await db.select({ id: productPets.id }).from(productPets).where(inArray(productPets.id, input.petIds));
    if (pets.length !== input.petIds.length) return { status: 'invalid', fieldErrors: { pet_ids: 'Alguna mascota ya no existe.' } };

    if (options.image) {
      try {
        stored = await storeProductImage(options.image);
      } catch (error) {
        if (error instanceof ProductImageError) return { status: 'invalid', fieldErrors: { image: PRODUCT_IMAGE_ERRORS[error.code] } };
        throw error;
      }
    }

    const result = await db.transaction(async (tx): Promise<SaveProductResult> => {
      const values = {
        name: input.name,
        searchName: normalizeSearch(input.name),
        shortDescription: input.shortDescription,
        descriptionMd: input.descriptionMd,
        ingredientsMd: input.ingredientsMd,
        usageMd: input.usageMd,
        categoryId: input.categoryId,
        priceCents: input.priceCents,
        compareAtCents: input.compareAtCents,
        vatRate: input.vatRate,
        isNew: input.isNew,
        published: input.published,
        position: input.position,
      };

      let before: AuditedFields | null = null;
      let descriptionChanged = false;
      let id = input.id;
      let slug: string;
      let image: { imagePath: string | null; imageWidth: number | null; imageHeight: number | null };

      if (id) {
        const [row] = await tx.select().from(products).where(eq(products.id, id)).for('update').limit(1);
        if (!row) return { status: 'not_found' };
        const links = await tx.select({ petId: productPetLinks.petId }).from(productPetLinks).where(eq(productPetLinks.productId, id));
        before = {
          name: row.name,
          categoryId: row.categoryId,
          petIds: links.map((l) => l.petId).sort(),
          priceCents: row.priceCents,
          compareAtCents: row.compareAtCents,
          vatRate: row.vatRate,
          isNew: row.isNew,
          published: row.published,
          position: row.position,
          image: row.imagePath,
          imageAlt: row.imageAlt,
        };
        descriptionChanged =
          row.shortDescription !== input.shortDescription ||
          row.descriptionMd !== input.descriptionMd ||
          row.ingredientsMd !== input.ingredientsMd ||
          row.usageMd !== input.usageMd;
        slug = row.slug;
        if (stored) {
          image = { imagePath: stored.imagePath, imageWidth: stored.width, imageHeight: stored.height };
          oldImageToRemove = row.imagePath;
        } else if (input.removeImage) {
          image = { imagePath: null, imageWidth: null, imageHeight: null };
          oldImageToRemove = row.imagePath;
        } else {
          image = { imagePath: row.imagePath, imageWidth: row.imageWidth, imageHeight: row.imageHeight };
        }
      } else {
        // Alta idempotente: el id es el submission_id del token firmado (como en la 007).
        id = options.submissionId ?? crypto.randomUUID();
        const [existing] = await tx.select({ id: products.id, slug: products.slug }).from(products).where(eq(products.id, id)).limit(1);
        if (existing) return { status: 'ok', id, slug: existing.slug, created: false };
        slug = '';
        image = stored
          ? { imagePath: stored.imagePath, imageWidth: stored.width, imageHeight: stored.height }
          : { imagePath: null, imageWidth: null, imageHeight: null };
      }

      // Nombre único sin distinguir mayúsculas (FR-003).
      const [clash] = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(sql`lower(${products.name}) = lower(${input.name})`, ne(products.id, id)))
        .limit(1);
      if (clash) return { status: 'invalid', fieldErrors: { name: DUPLICATE_NAME } };

      // Sin foto no hay texto alternativo (el CHECK lo exige al revés).
      const imageAlt = image.imagePath ? input.imageAlt : null;
      if (image.imagePath && !imageAlt) {
        return { status: 'invalid', fieldErrors: { image_alt: 'Describe la foto con un texto alternativo.' } };
      }

      if (before) {
        await tx
          .update(products)
          .set({ ...values, ...image, imageAlt, updatedAt: now })
          .where(eq(products.id, id));
      } else {
        const taken = new Set((await tx.select({ slug: products.slug }).from(products)).map((r) => r.slug));
        slug = uniqueSlug(slugify(input.name), taken);
        await tx.insert(products).values({
          id,
          slug,
          ...values,
          ...image,
          imageAlt,
          stock: input.stockInitial,
          createdAt: now,
          updatedAt: now,
        });
        await tx.insert(stockMovements).values({
          productId: id,
          delta: input.stockInitial,
          reason: 'initial',
          stockAfter: input.stockInitial,
          adminId: admin.id,
          createdAt: now,
        });
      }

      await tx.delete(productPetLinks).where(eq(productPetLinks.productId, id));
      await tx.insert(productPetLinks).values(input.petIds.map((petId) => ({ productId: id!, petId })));

      const after: AuditedFields = {
        name: input.name,
        categoryId: input.categoryId,
        petIds: [...input.petIds].sort(),
        priceCents: input.priceCents,
        compareAtCents: input.compareAtCents,
        vatRate: input.vatRate,
        isNew: input.isNew,
        published: input.published,
        position: input.position,
        image: image.imagePath,
        imageAlt,
      };
      const changes: Record<string, unknown> = diffChanges(before, after);
      if (!before) changes.slug = slug;
      if (descriptionChanged) changes.description_changed = true;
      if (!before || Object.keys(changes).length > 0) {
        await recordAdminAction(tx, {
          actorId: admin.id,
          action: before ? 'product.update' : 'product.create',
          entityType: 'product',
          entityId: id,
          changes,
        });
      }
      return { status: 'ok', id, slug, created: !before };
    });

    if (result.status !== 'ok') {
      // La foto nueva no ha llegado a usarse.
      if (stored) await removeProductImageFiles(stored.imagePath);
      return result;
    }
    if (oldImageToRemove && oldImageToRemove !== stored?.imagePath) await removeProductImageFiles(oldImageToRemove);
    logger.info({ admin_id: admin.id, product_id: result.id, code: result.created ? 'created' : 'updated' }, 'admin_product_saved');
    return result;
  } catch (error) {
    if (stored) await removeProductImageFiles(stored.imagePath);
    logger.error({ admin_id: admin.id, code: errorCode(error) }, 'admin_product_failed');
    return { status: 'error' };
  }
}

export type SetPublishedResult = { status: 'ok'; slug: string; changed: boolean } | { status: 'not_found' } | { status: 'error' };

/** Desactivar o reactivar (FR-007): el catálogo, el carrito y el pago lo reflejan en la siguiente consulta. */
export async function setProductPublished(admin: AdminActor, id: string, published: boolean, now: Date): Promise<SetPublishedResult> {
  try {
    return await getDb().transaction(async (tx): Promise<SetPublishedResult> => {
      const [row] = await tx.select({ slug: products.slug, published: products.published }).from(products).where(eq(products.id, id)).for('update').limit(1);
      if (!row) return { status: 'not_found' };
      if (row.published === published) return { status: 'ok', slug: row.slug, changed: false };
      await tx.update(products).set({ published, updatedAt: now }).where(eq(products.id, id));
      await recordAdminAction(tx, {
        actorId: admin.id,
        action: published ? 'product.publish' : 'product.unpublish',
        entityType: 'product',
        entityId: id,
        changes: { published: { before: row.published, after: published } },
      });
      return { status: 'ok', slug: row.slug, changed: true };
    });
  } catch (error) {
    logger.error({ admin_id: admin.id, code: errorCode(error) }, 'admin_product_publish_failed');
    return { status: 'error' };
  }
}
