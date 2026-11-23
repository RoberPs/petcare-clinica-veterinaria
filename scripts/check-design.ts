/**
 * check:design — vigila el principio I de la constitución.
 *
 * Falla si:
 *  - hay archivos .css fuera de design/;
 *  - se importa un CSS distinto de design/tokens.css y design/styles.css;
 *  - hay colores hexadecimales, rgb()/hsl() o atributos style= en src/;
 *  - design/styles.css contiene colores, px, rem o duraciones literales fuera de var(--…)
 *    (solo se admite el breakpoint en el preludio de los @media).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const ignoredDirs = new Set([
  'node_modules',
  '.next',
  '.git',
  'cli',
  'coverage',
  'test-results',
  'playwright-report',
  '.lighthouseci',
  '.specify',
  '.claude',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (ignoredDirs.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const rel = (p: string) => relative(root, p).split(sep).join('/');
const errors: string[] = [];
const files = walk(root);

// 1. Ningún .css fuera de design/.
for (const f of files) {
  if (f.endsWith('.css') && !rel(f).startsWith('design/')) errors.push(`${rel(f)}: hoja de estilos fuera de design/`);
}

// 2 y 3. Reglas sobre src/.
const allowedCss = new Set(['design/tokens.css', 'design/styles.css']);
const srcFiles = files.filter((f) => rel(f).startsWith('src/') && /\.(ts|tsx)$/.test(f));
for (const f of srcFiles) {
  const text = readFileSync(f, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    const where = `${rel(f)}:${i + 1}`;
    const cssImport = line.match(/import\s+['"]([^'"]+\.css)['"]/);
    if (cssImport) {
      const target = cssImport[1]!.replace(/^(\.\.\/)+/, '');
      if (!allowedCss.has(target)) errors.push(`${where}: import de CSS no permitido (${cssImport[1]})`);
    }
    if (/#[0-9a-fA-F]{3,8}\b/.test(line) && /['"`]#[0-9a-fA-F]{3,8}['"`]|:\s*#[0-9a-fA-F]{3,8}/.test(line)) {
      errors.push(`${where}: color hexadecimal escrito a mano`);
    }
    if (/\b(rgba?|hsla?)\(/.test(line)) errors.push(`${where}: color rgb()/hsl() escrito a mano`);
    if (/\bstyle\s*=/.test(line)) errors.push(`${where}: atributo style= prohibido`);
  });
}

// 4. design/styles.css solo con tokens.
const stylesPath = join(root, 'design', 'styles.css');
const styles = readFileSync(stylesPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
const literal = [
  { re: /#[0-9a-fA-F]{3,8}\b/, what: 'color hexadecimal' },
  { re: /\b(rgba?|hsla?)\(/, what: 'color rgb()/hsl()' },
  { re: /(^|[^\w-])-?\d*\.?\d+(px|rem)\b/, what: 'medida en px/rem' },
  { re: /(^|[^\w-])-?\d*\.?\d+m?s\b/, what: 'duración' },
];
styles.split('\n').forEach((rawLine, i) => {
  // El preludio de un @media puede llevar el breakpoint literal.
  let line = rawLine.replace(/@media[^{]*/g, '');
  line = line.replace(/var\(--[\w-]+\)/g, '');
  // @import ya no se permite: las fuentes se autoalojan (principio IV).
  if (/@import/.test(line)) errors.push(`design/styles.css:${i + 1}: @import no permitido`);
  for (const { re, what } of literal) {
    if (re.test(line)) errors.push(`design/styles.css:${i + 1}: ${what} fuera de var(--…): ${rawLine.trim().slice(0, 100)}`);
  }
});

if (errors.length > 0) {
  console.error(`check:design ha encontrado ${errors.length} problema(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('check:design: correcto.');
