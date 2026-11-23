import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { parseContent } from '@/content/schema';

const env = {
  CLINIC_PHONE_E164: '+34600000000',
  CLINIC_PHONE_DISPLAY: '600 00 00 00',
  CLINIC_INBOX_EMAIL: 'buzon@example.test',
  LEGAL_OWNER_NAME: 'Responsable de Pruebas',
  LEGAL_CONTACT_EMAIL: 'derechos@example.test',
};

const petcare = () => parse(readFileSync('content/petcare.yaml', 'utf8')) as Record<string, any>;

describe('esquema del archivo de contenido', () => {
  it('content/petcare.yaml es válido y resuelve los ${VAR} desde el entorno', () => {
    const result = parseContent(petcare(), env);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.clinic.inbox_email).toBe('buzon@example.test');
    expect(result.data.clinic.legal.owner_name).toBe('Responsable de Pruebas');
    expect(result.data.legal_pages.find((p) => p.kind === 'aviso-legal')?.body_md).toContain('Responsable de Pruebas');
  });

  it('indica qué variable de entorno falta y dónde', () => {
    const result = parseContent(petcare(), { ...env, CLINIC_INBOX_EMAIL: undefined });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual({ path: 'clinic.inbox_email', message: 'falta la variable de entorno CLINIC_INBOX_EMAIL' });
  });

  it('falla si dos tramos del mismo día se solapan', () => {
    const content = petcare();
    content.opening_hours.push({ weekday: 1, opens: '13:00', closes: '15:00' });
    const result = parseContent(content, env);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.path.startsWith('opening_hours[') && i.message.includes('solapa'))).toBe(true);
  });

  it('falla si un cierre empieza después de terminar', () => {
    const content = petcare();
    content.closures = [{ slug: 'mal', starts_on: '2026-12-10', ends_on: '2026-12-01', reason: 'Prueba' }];
    const result = parseContent(content, env);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual({ path: 'closures[0].ends_on', message: 'starts_on no puede ser posterior a ends_on' });
  });

  it('falla con un aviso de salud sin fuente', () => {
    const content = petcare();
    content.health_notices = [{ slug: 'sin-fuente', text: 'Una afirmación sanitaria' }];
    const result = parseContent(content, env);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.path.startsWith('health_notices[0].source'))).toBe(true);
  });

  it('falla con un aviso de salud cuya fuente no es https', () => {
    const content = petcare();
    content.health_notices = [{ slug: 'http', text: 'Afirmación', source_label: 'Fuente', source_url: 'http://example.org' }];
    expect(parseContent(content, env).ok).toBe(false);
  });

  it('falla si falta una página legal', () => {
    const content = petcare();
    content.legal_pages = content.legal_pages.filter((p: { kind: string }) => p.kind !== 'terminos');
    const result = parseContent(content, env);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual({ path: 'legal_pages', message: 'falta la página legal "terminos"' });
  });

  it('falla si falta una sección', () => {
    const content = petcare();
    content.sections = content.sections.filter((s: { key: string }) => s.key !== 'carrito');
    expect(parseContent(content, env).ok).toBe(false);
  });
});

describe('especies (feature 002)', () => {
  const withSpecies = (species: unknown) => {
    const content = petcare();
    content.species = species;
    return parseContent(content, env);
  };
  const issuesOf = (result: ReturnType<typeof parseContent>) => (result.ok ? [] : result.issues);

  it('content/petcare.yaml trae especies válidas y en orden', () => {
    const result = parseContent(petcare(), env);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.species.map((s) => s.key)).toEqual(['perro', 'gato', 'conejo', 'huron', 'ave']);
  });

  it('rechaza la clave reservada "other"', () => {
    const issues = issuesOf(withSpecies([{ key: 'other', label: 'Otra' }]));
    expect(issues.some((i) => i.path === 'species[0].key' && i.message.includes('reservada'))).toBe(true);
  });

  it('rechaza claves duplicadas', () => {
    const issues = issuesOf(withSpecies([{ key: 'perro', label: 'Perro' }, { key: 'perro', label: 'Can' }]));
    expect(issues.some((i) => i.path === 'species[1]' && i.message.includes('repetido'))).toBe(true);
  });

  it('rechaza una lista vacía, una lista ausente y más de 20 especies', () => {
    expect(issuesOf(withSpecies([])).some((i) => i.path === 'species')).toBe(true);
    expect(issuesOf(withSpecies(undefined)).some((i) => i.path === 'species')).toBe(true);
    const many = Array.from({ length: 21 }, (_, i) => ({ key: `especie-${i}`, label: `Especie ${i}` }));
    expect(issuesOf(withSpecies(many)).some((i) => i.path === 'species')).toBe(true);
  });

  it('rechaza claves con formato no válido y etiquetas vacías o largas', () => {
    expect(issuesOf(withSpecies([{ key: 'Perro', label: 'Perro' }]))[0]?.path).toBe('species[0].key');
    expect(issuesOf(withSpecies([{ key: '1perro', label: 'Perro' }]))[0]?.path).toBe('species[0].key');
    expect(issuesOf(withSpecies([{ key: 'perro', label: '  ' }]))[0]?.path).toBe('species[0].label');
    expect(issuesOf(withSpecies([{ key: 'perro', label: 'x'.repeat(41) }]))[0]?.path).toBe('species[0].label');
  });
});
