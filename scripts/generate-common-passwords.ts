/**
 * Genera src/domain/common-passwords.ts a partir de la lista de 10.000 contraseñas más comunes de
 * SecLists (licencia MIT). Se ejecuta a mano una sola vez y el resultado se versiona; el build no lo
 * usa (A7).
 *
 *   npx tsx scripts/generate-common-passwords.ts
 *
 * Solo se guardan las entradas de 10 caracteres o más: las más cortas ya las rechaza la longitud
 * mínima, así que no cambian el resultado y el módulo queda mucho más pequeño.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE_URL =
  'https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/10k-most-common.txt';
const MIN_LENGTH = 10;
const OUTPUT = join(process.cwd(), 'src', 'domain', 'common-passwords.ts');

async function main(): Promise<void> {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`No se ha podido descargar la lista (HTTP ${res.status}).`);
  const lines = (await res.text()).split(/\r?\n/);
  if (lines.length < 9_000) throw new Error(`La lista descargada tiene solo ${lines.length} líneas.`);

  const entries = [...new Set(lines.map((l) => l.trim().toLowerCase()).filter((l) => l.length >= MIN_LENGTH))].sort();

  const body = [
    '// ARCHIVO GENERADO por scripts/generate-common-passwords.ts. No se edita a mano.',
    '//',
    '// Origen: SecLists, Passwords/Common-Credentials/10k-most-common.txt',
    '// https://github.com/danielmiessler/SecLists — Copyright (c) 2018 Daniel Miessler. Licencia MIT:',
    '// se concede permiso, de forma gratuita, para usar, copiar, modificar y distribuir este contenido,',
    '// siempre que se incluyan este aviso de copyright y de permiso. Se ofrece "tal cual", sin garantía.',
    '//',
    `// Solo las entradas de ${MIN_LENGTH} caracteres o más (las cortas ya fallan por longitud), en minúsculas.`,
    '',
    'export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([',
    ...entries.map((e) => `  ${JSON.stringify(e)},`),
    ']);',
    '',
  ].join('\n');

  writeFileSync(OUTPUT, body, 'utf8');
  console.log(`Escrito ${OUTPUT} con ${entries.length} entradas (de ${lines.length} líneas).`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
