import { and, asc, count, desc, eq, exists, sql, type SQL } from 'drizzle-orm';
import { escapeLike, normalizeSearch } from '@/domain/search';
import { getDb, type DbOrTx } from '../client';
import { customers, orderItems, orders, productCategories, productPetLinks, productPets, products, stockMovements } from '../schema';

// Lecturas de productos para el panel (US1 y US4). A diferencia del catálogo, incluyen los
// desactivados y las categorías y mascotas ocultas.

export const ADMIN_PAGE_SIZE = 25;

/** Unidades apartadas por pedidos pendientes de pago (reserva "held"): ya restadas de `stock`. */
const reservedUnits = sql<number>`coalesce((select sum(oi.quantity) from ${orderItems} oi
  join ${orders} o on o.id = oi.order_id
  where oi.product_id = ${products.id} and o.reservation_status = 'held'), 0)::int`;

export type ProductStateFilter = 'publicado' | 'desactivado';

export interface AdminProductFilter {
  q?: string;
  categoryId?: string | null;
  petId?: string | null;
  state?: ProductStateFilter | null;
  page?: number;
}

export interface AdminProductRow {
  id: string;
  slug: string;
  name: string;
  categoryName: string;
  priceCents: number;
  compareAtCents: number | null;
  isNew: boolean;
  stock: number;
  reserved: number;
  published: boolean;
  imagePath: string | null;
  imageAlt: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
}

function conditions(filter: AdminProductFilter): SQL | undefined {
  const parts: SQL[] = [];
  const term = filter.q ? normalizeSearch(filter.q) : '';
  if (term) parts.push(sql`${products.searchName} like ${`%${escapeLike(term)}%`} escape '\\'`);
  if (filter.categoryId) parts.push(eq(products.categoryId, filter.categoryId));
  if (filter.petId) {
    parts.push(
      exists(
        getDb()
          .select({ one: sql`1` })
          .from(productPetLinks)
          .where(and(eq(productPetLinks.productId, products.id), eq(productPetLinks.petId, filter.petId))),
      ),
    );
  }
  if (filter.state === 'publicado') parts.push(eq(products.published, true));
  if (filter.state === 'desactivado') parts.push(eq(products.published, false));
  return parts.length ? and(...parts) : undefined;
}

export async function listProductsAdmin(filter: AdminProductFilter): Promise<{ rows: AdminProductRow[]; total: number }> {
  const db = getDb();
  const where = conditions(filter);
  const page = Math.max(1, filter.page ?? 1);
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: products.id,
        slug: products.slug,
        name: products.name,
        categoryName: productCategories.name,
        priceCents: products.priceCents,
        compareAtCents: products.compareAtCents,
        isNew: products.isNew,
        stock: products.stock,
        reserved: reservedUnits,
        published: products.published,
        imagePath: products.imagePath,
        imageAlt: products.imageAlt,
        imageWidth: products.imageWidth,
        imageHeight: products.imageHeight,
      })
      .from(products)
      .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
      .where(where)
      .orderBy(asc(products.name), asc(products.id))
      .limit(ADMIN_PAGE_SIZE)
      .offset((page - 1) * ADMIN_PAGE_SIZE),
    db.select({ n: count() }).from(products).where(where),
  ]);
  return { rows, total: totalRow?.n ?? 0 };
}

export type AdminProduct = typeof products.$inferSelect & { petIds: string[]; reserved: number; categoryName: string };

export async function getProductAdmin(id: string, db: DbOrTx = getDb()): Promise<AdminProduct | null> {
  const [row] = await db
    .select({ product: products, reserved: reservedUnits, categoryName: productCategories.name })
    .from(products)
    .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
    .where(eq(products.id, id))
    .limit(1);
  if (!row) return null;
  const links = await db.select({ petId: productPetLinks.petId }).from(productPetLinks).where(eq(productPetLinks.productId, id));
  return { ...row.product, reserved: row.reserved, categoryName: row.categoryName, petIds: links.map((l) => l.petId) };
}

export interface AdminOption {
  id: string;
  name: string;
  published: boolean;
}

/** Todas las categorías y mascotas, también las ocultas (se marcan "(oculta)" en el formulario). */
export async function listCategoriesAndPetsAdmin(): Promise<{ categories: AdminOption[]; pets: AdminOption[] }> {
  const db = getDb();
  const [categories, pets] = await Promise.all([
    db
      .select({ id: productCategories.id, name: productCategories.name, published: productCategories.published })
      .from(productCategories)
      .orderBy(asc(productCategories.position), asc(productCategories.name)),
    db
      .select({ id: productPets.id, name: productPets.name, published: productPets.published })
      .from(productPets)
      .orderBy(asc(productPets.position), asc(productPets.name)),
  ]);
  return { categories, pets };
}

export interface StockMovementRow {
  id: string;
  delta: number;
  reason: (typeof stockMovements.$inferSelect)['reason'];
  stockAfter: number;
  note: string | null;
  createdAt: Date;
  orderId: string | null;
  orderNumber: string | null;
  adminName: string | null;
}

/** Últimos movimientos de stock de un producto (US4), del más reciente al más antiguo. */
export async function listStockMovements(productId: string, limit = 50): Promise<StockMovementRow[]> {
  return getDb()
    .select({
      id: stockMovements.id,
      delta: stockMovements.delta,
      reason: stockMovements.reason,
      stockAfter: stockMovements.stockAfter,
      note: stockMovements.note,
      createdAt: stockMovements.createdAt,
      orderId: stockMovements.orderId,
      orderNumber: orders.number,
      adminName: sql<string | null>`case when ${customers.id} is null then null else ${customers.firstName} || ' ' || ${customers.lastName} end`,
    })
    .from(stockMovements)
    .leftJoin(orders, eq(orders.id, stockMovements.orderId))
    .leftJoin(customers, eq(customers.id, stockMovements.adminId))
    .where(eq(stockMovements.productId, productId))
    .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
    .limit(limit);
}
