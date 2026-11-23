import type { Metadata } from 'next';
import { LegalPage, legalMetadata } from '@/components/LegalPage';

export async function generateMetadata(): Promise<Metadata> {
  return { ...(await legalMetadata('aviso-legal')), alternates: { canonical: '/aviso-legal' } };
}

export default function Page() {
  return <LegalPage kind="aviso-legal" />;
}
