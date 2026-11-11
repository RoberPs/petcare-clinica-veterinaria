import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// SC-010: ningún texto del contenido de la demo coincide con un texto de las maquetas de design/.

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

// Etiquetas que la propia spec obliga a usar (no son textos de ejemplo de las maquetas):
// los motivos de contacto por defecto (FR-022) y los nombres de las páginas legales (FR-039).
const REQUIRED_BY_SPEC = new Set(['consulta sobre una cita', 'política de privacidad', 'política de cookies']);

function designTexts(): string[] {
  const texts = new Set<string>();
  for (const f of readdirSync('design').filter((n) => n.endsWith('.html') || n === 'layout.js')) {
    const html = readFileSync(join('design', f), 'utf8')
      .replace(/<script[\s\S]*?<\/script>/g, (m) => (f === 'layout.js' ? m : ' '))
      .replace(/<style[\s\S]*?<\/style>/g, ' ');
    // Texto entre etiquetas y valores de atributos visibles (alt, aria-label, placeholder).
    for (const m of html.matchAll(/>([^<>]+)</g)) texts.add(normalize(m[1]!));
    for (const m of html.matchAll(/(?:alt|aria-label|placeholder)="([^"]+)"/g)) texts.add(normalize(m[1]!));
    // layout.js tiene los textos dentro de literales.
    for (const m of html.matchAll(/'([^'\n]{21,})'/g)) texts.add(normalize(m[1]!));
  }
  return [...texts].filter((t) => t.length > 20 && !REQUIRED_BY_SPEC.has(t));
}

function contentStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(normalize(value));
  else if (Array.isArray(value)) value.forEach((v) => contentStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => contentStrings(v, out));
  return out;
}

describe('SC-010: sin copia de textos de design/', () => {
  it('ningún texto de content/petcare.yaml contiene un texto de más de 20 caracteres de design/', () => {
    const design = designTexts();
    expect(design.length).toBeGreaterThan(10);
    const content = contentStrings(parse(readFileSync('content/petcare.yaml', 'utf8')));
    const copies = design.filter((d) => content.some((c) => c.includes(d)));
    expect(copies).toEqual([]);
  });
});

// Feature 002: los textos de ejemplo de las maquetas de la cuenta no se publican (principio II).
function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (/\.(tsx?|ya?ml)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// Rótulos de interfaz que pide la spec o el plan (no son textos de ejemplo de las maquetas).
const ACCOUNT_UI_LABELS = new Set(['¿olvidaste tu contraseña?', '¿aún no tienes cuenta?']);

describe('SC-010: sin copia de textos de las maquetas de la cuenta', () => {
  const files = [...walkFiles('src'), ...walkFiles('content')];
  const sources = files.map((f) => ({ f, text: readFileSync(f, 'utf8') }));

  it('ni src/ ni content/ contienen los datos de ejemplo de cuenta.html, login.html y registro.html', () => {
    const samples = ['Hola, María', 'Toby', 'Luna', '#1042', '#1037', '57,70 €'];
    const found = sources.flatMap(({ f, text }) => samples.filter((s) => text.includes(s)).map((s) => `${f}: ${s}`));
    expect(found).toEqual([]);
  });

  it('ni src/ ni content/ copian frases de más de 20 caracteres de esas maquetas', () => {
    const phrases = new Set<string>();
    for (const name of ['cuenta.html', 'login.html', 'registro.html']) {
      const html = readFileSync(join('design', name), 'utf8').replace(/<script[\s\S]*?<\/script>/g, ' ');
      for (const m of html.matchAll(/>([^<>]+)</g)) phrases.add(normalize(m[1]!));
    }
    const long = [...phrases].filter((t) => t.length > 20 && !ACCOUNT_UI_LABELS.has(t) && !REQUIRED_BY_SPEC.has(t));
    expect(long.length).toBeGreaterThan(0);
    const copies = sources.flatMap(({ f, text }) => long.filter((p) => normalize(text).includes(p)).map((p) => `${f}: ${p}`));
    expect(copies).toEqual([]);
  });
});

