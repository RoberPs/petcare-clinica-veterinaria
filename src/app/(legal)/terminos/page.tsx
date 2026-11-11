import type { Metadata } from 'next';
import { LegalPage, legalMetadata } from '@/components/LegalPage';

export async function generateMetadata(): Promise<Metadata> {
  return { ...(await legalMetadata('terminos')), alternates: { canonical: '/terminos' } };
}

export default function Page() {
  return <LegalPage kind="terminos" />;
}
