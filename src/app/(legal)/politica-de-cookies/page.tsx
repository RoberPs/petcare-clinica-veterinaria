import type { Metadata } from 'next';
import { LegalPage, legalMetadata } from '@/components/LegalPage';

export async function generateMetadata(): Promise<Metadata> {
  return { ...(await legalMetadata('cookies')), alternates: { canonical: '/politica-de-cookies' } };
}

export default function Page() {
  return <LegalPage kind="cookies" />;
}
