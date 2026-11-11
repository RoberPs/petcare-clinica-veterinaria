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

  describe('especies (feature 002)', () => {
    const writeVariant = (mutate: (content: any) => void) => {
      const content = parse(readFileSync('content/petcare.yaml', 'utf8'));
      mutate(content);
      const file = join(mkdtempSync(join(tmpdir(), 'petcare-')), 'especies.yaml');
      writeFileSync(file, stringify(content));
      return file;
    };
    const speciesRows = async () =>
      (await getPool().query('SELECT key, label, sort_order FROM species ORDER BY sort_order')).rows;

    it('carga las especies con su orden y las actualiza por clave', async () => {
      const db = await setupTestDb();
      await loadContentFile(db, 'content/petcare.yaml');
      expect((await speciesRows()).map((r) => r.key)).toEqual(['perro', 'gato', 'conejo', 'huron', 'ave']);

      const file = writeVariant((c) => {
        c.species = [{ key: 'gato', label: 'Gato doméstico' }, ...c.species.filter((s: any) => s.key !== 'gato')];
      });
      await loadContentFile(db, file);
      const rows = await speciesRows();
      expect(rows[0]).toEqual({ key: 'gato', label: 'Gato doméstico', sort_order: 0 });
      expect(rows).toHaveLength(5);
    });

    it('borra las especies ausentes y sus mascotas pasan a "Otra" (species_key = NULL)', async () => {
      const db = await setupTestDb();
      await loadContentFile(db, 'content/petcare.yaml');
      const pool = getPool();
      const customer = await pool.query(
        `INSERT INTO customers (email, email_normalized, first_name, last_name, password_hash)
         VALUES ('a@example.test', 'a@example.test', 'Ana', 'Prueba', 'x') RETURNING id`,
      );
      const customerId = customer.rows[0].id;
      await pool.query(
        `INSERT INTO pets (customer_id, name, species_key, birth_date) VALUES ($1, 'Bolita', 'huron', '2024-01-01'),
         ($1, 'Rex', 'perro', '2020-05-05')`,
        [customerId],
      );

      const warnings: string[] = [];
      const original = console.warn;
      console.warn = (msg: string) => warnings.push(msg);
      try {
        const file = writeVariant((c) => {
          c.species = c.species.filter((s: any) => s.key !== 'huron');
        });
        const summary = await loadContentFile(db, file);
        expect(summary.petsMovedToOther).toBe(1);
      } finally {
        console.warn = original;
      }
      expect(warnings.some((w) => w.includes('1 mascota(s)'))).toBe(true);
      expect((await speciesRows()).map((r) => r.key)).not.toContain('huron');
      const pets = (await pool.query('SELECT name, species_key FROM pets ORDER BY name')).rows;
      expect(pets).toEqual([
        { name: 'Bolita', species_key: null },
        { name: 'Rex', species_key: 'perro' },
      ]);
    });
  });
});
