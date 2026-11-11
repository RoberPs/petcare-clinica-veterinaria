import { NextResponse, type NextRequest } from 'next/server';
import { CONSENT_COOKIE, consentCookieOptions, encodeConsent } from '@/lib/consent';
import { isSafeReturnTo } from '@/lib/return-to';

export const dynamic = 'force-dynamic';

// POST /api/consent (contracts/consent-and-email.md). Funciona sin JavaScript (303) y con fetch (JSON).

function isSameOrigin(request: NextRequest): boolean {
  if (request.headers.get('sec-fetch-site') === 'same-origin') return true;
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'origen no permitido' }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'petición no válida' }, { status: 400 });
  }
  const choice = form.get('choice');
  if (choice !== 'accept' && choice !== 'reject') {
    return NextResponse.json({ error: 'elección no válida' }, { status: 400 });
  }
  const thirdParty = choice === 'accept';
  const returnTo = form.get('return_to');

  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');
  const response = wantsJson
    ? NextResponse.json({ thirdParty })
    : new NextResponse(null, { status: 303, headers: { Location: isSafeReturnTo(returnTo) ? returnTo : '/' } });
  response.cookies.set(CONSENT_COOKIE, encodeConsent(thirdParty), consentCookieOptions);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
