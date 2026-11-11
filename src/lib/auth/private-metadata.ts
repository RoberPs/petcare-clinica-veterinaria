import type { Metadata } from 'next';

// Las páginas de la cuenta y de autenticación no se indexan (FR-045). La cabecera
// Cache-Control: private, no-store se fija en next.config.ts (A3).
export const privateMetadata: Metadata = {
  robots: { index: false, follow: false },
};
