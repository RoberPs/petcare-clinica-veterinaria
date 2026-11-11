import { headers } from 'next/headers';
import { getClientIp } from '@/lib/client-ip';
import { getNow } from '@/lib/clock';
import { getEnv } from '@/lib/env';
import type { FlowContext } from './common';

/** IP del visitante y hora actual de la petición, para los flujos de cuenta (Server Actions). */
export async function actionContext(): Promise<FlowContext> {
  return { ip: getClientIp(await headers(), getEnv().trustedProxyIps), now: await getNow() };
}
