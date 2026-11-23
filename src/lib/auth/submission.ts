import { eq } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import { processedSubmissions } from '@/db/schema';

// Idempotencia de los formularios con efectos (A5): el submission_id firmado del formulario (de
// createSubmissionToken / verifySubmissionToken en src/lib/form-token.ts) se registra en la misma
// transacción que el alta. Un reenvío con el mismo id no repite nada y devuelve el mismo destino.

export { createSubmissionToken, verifySubmissionToken } from '@/lib/form-token';

export type SubmissionScope = 'register' | 'pet_create' | 'newsletter';

export type ClaimResult = { status: 'fresh' } | { status: 'duplicate'; resultRef: string | null };

export async function claimSubmission(
  tx: DbOrTx,
  submissionId: string,
  scope: SubmissionScope,
  resultRef: string | null = null,
): Promise<ClaimResult> {
  const inserted = await tx
    .insert(processedSubmissions)
    .values({ submissionId, scope, resultRef })
    .onConflictDoNothing({ target: processedSubmissions.submissionId })
    .returning({ id: processedSubmissions.submissionId });
  if (inserted.length > 0) return { status: 'fresh' };
  const [existing] = await tx
    .select({ resultRef: processedSubmissions.resultRef })
    .from(processedSubmissions)
    .where(eq(processedSubmissions.submissionId, submissionId))
    .limit(1);
  return { status: 'duplicate', resultRef: existing?.resultRef ?? null };
}
