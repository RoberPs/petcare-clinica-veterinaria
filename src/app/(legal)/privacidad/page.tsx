import type { Metadata } from 'next';
import { LegalPage, legalMetadata } from '@/components/LegalPage';

export async function generateMetadata(): Promise<Metadata> {
  return { ...(await legalMetadata('privacidad')), alternates: { canonical: '/privacidad' } };
}

export default function Page() {
  return <LegalPage kind="privacidad" />;
}
