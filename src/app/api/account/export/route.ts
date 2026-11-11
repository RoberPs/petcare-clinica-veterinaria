import { handleExportRequest } from '@/lib/account/export';

export const dynamic = 'force-dynamic';

// POST /api/account/export (A11, contracts/export-format.md): descarga en JSON de los datos de la
// cuenta. Comprueba el origen (CSRF) y la sesión; sin sesión, 303 a iniciar sesión.
export async function POST(request: Request) {
  return handleExportRequest(request, new Date());
}
