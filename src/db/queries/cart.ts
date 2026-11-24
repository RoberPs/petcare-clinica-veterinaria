import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb, type DbOrTx } from '../client';
import { cartItems, carts, productCategories, productPetLinks, productPets, products } from '../schema';
import { publishedProducts } from './catalog-visibility';

// Lecturas del carrito (feature 005). Un carrito pertenece a un cliente o a un navegador (hash de pc_cart).

export type CartKind = 'main' | 'direct';
export type CartOwner = { customerId: string } | { tokenHash: string };

export interface CartRow {
  id: string;
  kind: CartKind;
  customerId: string | null;
  tokenHash: string | null;
  discountCodeId: string | null;
  updatedAt: Date;
}

const cartColumns = {
  id: carts.id,
  kind: carts.kind,
  customerId: carts.customerId,
  tokenHash: carts.tokenHash,
  discountCodeId: carts.discountCodeId,
  updatedAt: carts.updatedAt,
};

export function ownerCondition(owner: CartOwner) {
  return 'customerId' in owner ? eq(carts.customerId, owner.customerId) : eq(carts.tokenHash, owner.tokenHash);
}

export async function findCart(owner: CartOwner, kind: CartKind, db: DbOrTx = getDb()): Promise<CartRow | null> {
  const [row] = await db
    .select(cartColumns)
    .from(carts)
    .where(and(ownerCondition(owner), eq(carts.kind, kind)))
    .limit(1);
  return row ?? null;
}

/** Igual que findCart, pero bloquea la fila hasta el final de la transacción. */
export async function lockCart(owner: CartOwner, kind: CartKind, tx: DbOrTx): Promise<CartRow | null> {
  const [row] = await tx
    .select(cartColumns)
    .from(carts)
    .where(and(ownerCondition(owner), eq(carts.kind, kind)))
    .for('update')
    .limit(1);
  return row ?? null;
}

export interface CartLineRow {
  productId: string;
  quantity: number;
  /** Precio que vio el comprador (cart_items.unit_price_cents). */
  seenPriceCents: number;
  addedAt: Date;
  slug: string;
  name: string;
  priceCents: number;
  vatRate: number;
  stock: number;
  /** Visible en el catálogo (producto, categoría y alguna mascota publicados). */
  visible: boolean;
  categoryName: string;
  pets: string[];
  imagePath: string | null;
  imageAlt: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
}

/** Líneas del carrito con los datos actuales del producto, en el orden en que se añadieron. */
export async function cartLines(cartId: string, db: DbOrTx = getDb()): Promise<CartLineRow[]> {
  return db
    .select({
      productId: cartItems.productId,
      quantity: cartItems.quantity,
      seenPriceCents: cartItems.unitPriceCents,
      addedAt: cartItems.addedAt,
      slug: products.slug,
      name: products.name,
      priceCents: products.priceCents,
      vatRate: products.vatRate,
      stock: products.stock,
      visible: sql<boolean>`(${publishedProducts()})`,
      categoryName: productCategories.name,
      pets: sql<string[]>`array(select pp.name from ${productPetLinks} l join ${productPets} pp on pp.id = l.pet_id
        where l.product_id = ${products.id} and pp.published order by pp.position, pp.slug)`,
      imagePath: products.imagePath,
      imageAlt: products.imageAlt,
      imageWidth: products.imageWidth,
      imageHeight: products.imageHeight,
    })
    .from(cartItems)
    .innerJoin(products, eq(products.id, cartItems.productId))
    .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
    .where(eq(cartItems.cartId, cartId))
    .orderBy(asc(cartItems.addedAt), asc(cartItems.productId));
}

/**
 * Unidades del carrito principal para el contador de la cabecera: una sola consulta indexada
 * (carts por (customer_id, kind) o (token_hash, kind) y cart_items por su PK).
 */
export async function cartUnitCount(owner: CartOwner, db: DbOrTx = getDb()): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${cartItems.quantity}), 0)::int` })
    .from(carts)
    .innerJoin(cartItems, eq(cartItems.cartId, carts.id))
    .where(and(ownerCondition(owner), eq(carts.kind, 'main')));
  return row?.n ?? 0;
}

export interface BuyableProduct {
  id: string;
  slug: string;
  stock: number;
  priceCents: number;
}

/** Producto visible en el catálogo (se puede comprar si además tiene stock). */
export async function findBuyableProduct(productId: string, db: DbOrTx = getDb()): Promise<BuyableProduct | null> {
  const [row] = await db
    .select({ id: products.id, slug: products.slug, stock: products.stock, priceCents: products.priceCents })
    .from(products)
    .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
    .where(and(eq(products.id, productId), publishedProducts()))
    .limit(1);
  return row ?? null;
}
