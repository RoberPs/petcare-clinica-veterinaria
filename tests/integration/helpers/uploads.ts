import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Directorio de fotos subidas propio de cada suite (feature 008, G4): UPLOADS_DIR apunta a un
// temporal que se borra al terminar, así los tests no tocan ./var/uploads.

export async function useTempUploadsDir(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const previous = process.env.UPLOADS_DIR;
  const dir = await mkdtemp(path.join(tmpdir(), 'petcare-uploads-'));
  process.env.UPLOADS_DIR = dir;
  return {
    dir,
    cleanup: async () => {
      if (previous === undefined) delete process.env.UPLOADS_DIR;
      else process.env.UPLOADS_DIR = previous;
      await rm(dir, { recursive: true, force: true });
    },
  };
}
