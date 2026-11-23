import { and, count, eq, sql } from 'drizzle-orm';
import { getDb, type DbOrTx } from '../client';
import { pets, species } from '../schema';

// Consultas de mascotas (A9). TODAS exigen el customerId de la sesión y filtran por él: nunca se
// busca una mascota solo por su id.

export interface Pet {
  id: string;
  name: string;
  /** null = "Otra" (A10). */
  speciesKey: string | null;
  speciesLabel: string | null;
  birthDate: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PetInput {
  name: string;
  speciesKey: string | null;
  birthDate: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Un id que no es un UUID no puede existir: se responde como "no encontrada" sin consultar. */
export const isPetId = (id: string) => UUID_RE.test(id);

const columns = {
  id: pets.id,
  name: pets.name,
  speciesKey: pets.speciesKey,
  speciesLabel: species.label,
  birthDate: pets.birthDate,
  createdAt: pets.createdAt,
  updatedAt: pets.updatedAt,
};

const byName = new Intl.Collator('es', { sensitivity: 'base' });

/** Mascotas del cliente ordenadas por nombre (sin distinguir mayúsculas ni tildes). */
export async function listPets(customerId: string, db: DbOrTx = getDb()): Promise<Pet[]> {
  const rows = await db.select(columns).from(pets).leftJoin(species, eq(species.key, pets.speciesKey)).where(eq(pets.customerId, customerId));
  return rows.sort((a, b) => byName.compare(a.name, b.name) || a.createdAt.getTime() - b.createdAt.getTime());
}

export async function getPet(customerId: string, petId: string, db: DbOrTx = getDb()): Promise<Pet | null> {
  if (!isPetId(petId)) return null;
  const [row] = await db
    .select(columns)
    .from(pets)
    .leftJoin(species, eq(species.key, pets.speciesKey))
    .where(and(eq(pets.id, petId), eq(pets.customerId, customerId)))
    .limit(1);
  return row ?? null;
}

export async function countPets(customerId: string, db: DbOrTx = getDb()): Promise<number> {
  const [row] = await db.select({ n: count() }).from(pets).where(eq(pets.customerId, customerId));
  return row?.n ?? 0;
}

export async function insertPet(customerId: string, input: PetInput, now: Date, db: DbOrTx = getDb()): Promise<string> {
  const [row] = await db
    .insert(pets)
    .values({ customerId, name: input.name, speciesKey: input.speciesKey, birthDate: input.birthDate, createdAt: now, updatedAt: now })
    .returning({ id: pets.id });
  return row!.id;
}

/** Devuelve false si la mascota no existe o no es del cliente. */
export async function updatePet(customerId: string, petId: string, input: PetInput, db: DbOrTx = getDb()): Promise<boolean> {
  if (!isPetId(petId)) return false;
  const rows = await db
    .update(pets)
    .set({ name: input.name, speciesKey: input.speciesKey, birthDate: input.birthDate, updatedAt: sql`now()` })
    .where(and(eq(pets.id, petId), eq(pets.customerId, customerId)))
    .returning({ id: pets.id });
  return rows.length > 0;
}

/** Devuelve false si la mascota no existe o no es del cliente. */
export async function deletePet(customerId: string, petId: string, db: DbOrTx = getDb()): Promise<boolean> {
  if (!isPetId(petId)) return false;
  const rows = await db
    .delete(pets)
    .where(and(eq(pets.id, petId), eq(pets.customerId, customerId)))
    .returning({ id: pets.id });
  return rows.length > 0;
}
