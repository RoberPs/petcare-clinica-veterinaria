import type { Metadata } from 'next';
import { LegalPage, legalMetadata } from '@/components/LegalPage';

// Condiciones de venta (feature 005, D19): contenido de la clínica en legal_pages.
export async function generateMetadata(): Promise<Metadata> {
  return { ...(await legalMetadata('condiciones-venta')), alternates: { canonical: '/condiciones-de-venta' } };
}

export default function Page() {
  return <LegalPage kind="condiciones-venta" />;
}
