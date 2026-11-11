import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';
import tseslint from 'typescript-eslint';

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'cli/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      '.lighthouseci/**',
      'design/**',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Principio I: nada de estilos en línea. Todo sale de design/tokens.css y design/styles.css.
      'react/forbid-dom-props': ['error', { forbid: ['style'] }],
      'react/forbid-component-props': ['error', { forbid: ['style'] }],
      // Principio IV: nunca se inyecta HTML crudo.
      'react/no-danger': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Lista generada por scripts/generate-common-passwords.ts (A7): no se revisa como código escrito a mano.
    files: ['src/domain/common-passwords.ts'],
    rules: { quotes: 'off', 'max-len': 'off' },
  },
  {
    // En las pruebas se manipulan objetos de contenido sin tipar.
    files: ['tests/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    // src/domain es TypeScript puro: no puede depender de Next, React, Drizzle ni pg.
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['next', 'next/*', 'react', 'react/*', 'react-dom', 'drizzle-orm', 'drizzle-orm/*', 'pg'], message: 'src/domain debe ser TypeScript puro.' },
            { group: ['@/db/*', '@/lib/*', '@/app/*', '@/components/*', '@/email/*'], message: 'src/domain no depende de otras capas.' },
            // También por ruta relativa: la autenticación (src/lib/auth) y la base de datos (src/db) nunca entran en el dominio.
            { group: ['**/lib/auth/*', '**/lib/*', '**/db/*', '**/db'], message: 'src/domain no puede importar src/lib ni src/db.' },
            // La lógica con efectos de las citas (src/lib/booking) tampoco entra en el dominio.
            { group: ['@/lib/booking/*', '**/lib/booking/*', '**/lib/booking'], message: 'src/domain no puede importar src/lib/booking.' },
          ],
        },
      ],
    },
  },
);
