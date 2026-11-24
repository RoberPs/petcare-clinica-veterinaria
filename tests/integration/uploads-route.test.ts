import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET } from '@/app/media/subidas/productos/[file]/route';
import { useTempUploadsDir } from './helpers/uploads';

// Ruta pública de las fotos subidas (G4, contracts/routes.md): solo los nombres de las variantes.

const ID = '0b7c6f3e-3f1a-4c55-9d1e-6a2b8c9d0e1f';
let uploads: Awaited<ReturnType<typeof useTempUploadsDir>>;

const get = (file: string) => GET(new Request(`http://localhost/media/subidas/productos/${encodeURIComponent(file)}`), { params: Promise.resolve({ file }) });

describe('GET /media/subidas/productos/[file]', () => {
  beforeAll(async () => {
    uploads = await useTempUploadsDir();
    mkdirSync(path.join(uploads.dir, 'productos'), { recursive: true });
    writeFileSync(path.join(uploads.dir, 'productos', `${ID}-480.webp`), Buffer.from('RIFF....WEBP'));
    writeFileSync(path.join(uploads.dir, 'secreto.txt'), 'no se sirve');
  });
  afterAll(async () => {
    await uploads.cleanup();
  });

  it('sirve una variante con image/webp, caché inmutable y nosniff', async () => {
    const res = await get(`${ID}-480.webp`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('RIFF....WEBP');
  });

  it('da 404 con "..", otra extensión, otro ancho o un archivo ausente', async () => {
    for (const name of [`../secreto.txt`, `..%2Fsecreto.txt`, `${ID}-480.png`, `${ID}-500.webp`, `${ID}-960.webp`, 'secreto.txt', `${ID}-480.webp/..`]) {
      const res = await get(name);
      expect(res.status, name).toBe(404);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    }
  });
});
