import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { getPool } from '@/db/client';
import { ContentValidationError, loadContentFile } from '@/content/load';
import { setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

const snapshot = async () => {
  const q = async (sql: string) => (await getPool().query(sql)).rows;
  return {
    clinic: await q('SELECT name, inbox_email, demo_banner_enabled, latitude FROM clinic'),
    hours: await q('SELECT weekday, opens_at, closes_at FROM opening_hours ORDER BY weekday, opens_at'),
    services: await q('SELECT slug, name, position, published FROM services ORDER BY slug'),
    faqs: await q('SELECT slug, published FROM faqs ORDER BY slug'),
    legal: await q('SELECT kind, version FROM legal_pages ORDER BY kind'),
    sections: await q('SELECT key, href FROM sections ORDER BY key'),
  };
};

describe('carga del archivo de contenido', () => {
  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  it('cargar dos veces da el mismo resultado', async () => {
    const db = await setupTestDb();
    await loadContentFile(db, 'content/petcare.yaml');
    const first = await snapshot();
    await loadContentFile(db, 'content/petcare.yaml');
    const second = await snapshot();
    expect(second).toEqual(first);
    expect(first.clinic).toHaveLength(1);
    expect(first.services).toHaveLength(8);
    expect(first.clinic[0].inbox_email).toBe(process.env.CLINIC_INBOX_EMAIL);
  });

  it('eliminar un servicio del YAML lo despublica', async () => {
    const db = await setupTestDb();
    await loadContentFile(db, 'content/petcare.yaml');
    const content = parse(readFileSync('content/petcare.yaml', 'utf8'));
    content.services = content.services.filter((s: { slug: string }) => s.slug !== 'salud-dental');
    const file = join(mkdtempSync(join(tmpdir(), 'petcare-')), 'sin-dental.yaml');
    writeFileSync(file, stringify(content));
    await loadContentFile(db, file);
    const rows = (await getPool().query("SELECT published FROM services WHERE slug = 'salud-dental'")).rows;
    expect(rows).toEqual([{ published: false }]);
    // Volver a cargar el original lo publica otra vez.
    await loadContentFile(db, 'content/petcare.yaml');
    const again = (await getPool().query("SELECT published FROM services WHERE slug = 'salud-dental'")).rows;
    expect(again).toEqual([{ published: true }]);
  });

  it('no toca la base de datos si el archivo no es válido', async () => {
    const db = await setupTestDb();
    const content = parse(readFileSync('content/petcare.yaml', 'utf8'));
    content.clinic.name = '';
    const file = join(mkdtempSync(join(tmpdir(), 'petcare-')), 'mal.yaml');
    writeFileSync(file, stringify(content));
    await expect(loadContentFile(db, file)).rejects.toBeInstanceOf(ContentValidationError);
    expect((await getPool().query('SELECT count(*)::int AS n FROM clinic')).rows[0].n).toBe(0);
  });

  it('aborta si falta una imagen en public/', async () => {
    const db = await setupTestDb();
    const content = parse(readFileSync('content/petcare.yaml', 'utf8'));
    content.clinic.hero.image = 'media/petcare/no-existe.svg';
    const file = join(mkdtempSync(join(tmpdir(), 'petcare-')), 'sin-imagen.yaml');
    writeFileSync(file, stringify(content));
    await expect(loadContentFile(db, file)).rejects.toMatchObject({
      issues: [{ path: 'clinic.hero.image', message: 'no existe la imagen public/media/petcare/no-existe.svg' }],
    });
  });
});
