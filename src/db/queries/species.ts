import { asc } from 'drizzle-orm';
import { getDb, type DbOrTx } from '../client';
import { species } from '../schema';

export interface Species {
  key: string;
  label: string;
}

/** Especies de la clínica en el orden del archivo de contenido. "Otra" la añade la interfaz. */
export async function listSpecies(db: DbOrTx = getDb()): Promise<Species[]> {
  return db.select({ key: species.key, label: species.label }).from(species).orderBy(asc(species.sortOrder), asc(species.key));
}
