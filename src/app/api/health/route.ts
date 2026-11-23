import { NextResponse } from 'next/server';
import { getPool } from '@/db/client';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// Comprobación de vida: la base de datos tiene que responder.
export async function GET() {
  try {
    await getPool().query('SELECT 1');
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    logger.error({ code: 'health_db_unreachable', err: error instanceof Error ? error.message : 'unknown' }, 'health');
    return NextResponse.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
