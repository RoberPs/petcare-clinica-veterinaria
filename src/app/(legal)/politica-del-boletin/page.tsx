import type { Metadata } from 'next';
import { LegalPage, legalMetadata } from '@/components/LegalPage';

// Política del boletín (feature 006, E13): contenido de la clínica en legal_pages. Con el boletín
// desactivado, el middleware la sirve como 404.
export async function generateMetadata(): Promise<Metadata> {
  return { ...(await legalMetadata('boletin')), alternates: { canonical: '/politica-del-boletin' } };
}

export default function Page() {
  return <LegalPage kind="boletin" />;
}
