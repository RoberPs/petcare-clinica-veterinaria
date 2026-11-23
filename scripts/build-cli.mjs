// Compila los scripts de operación a cli/*.mjs para la imagen de producción (sin tsx ni TypeScript).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

await build({
  entryPoints: {
    migrate: 'scripts/migrate.ts',
    'content-load': 'scripts/content-load.ts',
    'email-dispatch': 'scripts/email-dispatch.ts',
    'retention-purge': 'scripts/retention-purge.ts',
    // Feature 005: gestión de pedidos sin panel (D15) y tarea de mantenimiento (D16).
    orders: 'scripts/orders.ts',
    'orders-maintain': 'scripts/orders-maintain.ts',
    // Feature 007: rol de administrador del panel (F14).
    admin: 'scripts/admin.ts',
  },
  outdir: 'cli',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  absWorkingDir: root,
  alias: { '@': './src' },
  external: ['pg-native'],
  // Algunas dependencias son CommonJS: se les da un require dentro del módulo ESM.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
