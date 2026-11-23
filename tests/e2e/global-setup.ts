import { loadPetcare, migrateTestDb } from './db';

// Antes de la suite: migra la base de datos de pruebas y carga content/petcare.yaml.
export default async function globalSetup() {
  await migrateTestDb();
  await loadPetcare();
}
