import debug from 'debug';
import type { MiddlewareHandler } from 'hono';

import {
  type HeteroOperationJwtClaims,
  validateHeteroOperationJWT,
} from '@/libs/trpc/utils/internalJwt';

const log = debug('orvilo-server:agent:prime-operation-auth');

/** Claims the `prime:infer` bound credential must carry — the device-execution
 * contract's "short-lived credential bound to subject+operation+Device+TTL". */
export interface PrimeOperationClaims extends HeteroOperationJwtClaims {
  device_id: string;
  model_route: string;
}

declare module 'hono' {
  interface ContextVariableMap {
    primeOperation: PrimeOperationClaims;
  }
}

/**
 * Authenticates the device-side Prime broker bridge. The token is minted at
 * dispatch admission, scoped to `prime:infer` only (no ingest capability —
 * ingestion keeps using the operation JWT), and bound to one operation +
 * device + model route. Anything else on this surface is a 401/403, never a
 * softer lookup — a credential usable on the wrong device defeats the whole
 * binding.
 */
export const primeOperationAuth = (): MiddlewareHandler => async (c, next) => {
  const authHeader = c.req.header('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  const claims = await validateHeteroOperationJWT(token);
  if (
    !claims ||
    !claims.capabilities.includes('prime:infer') ||
    !claims.device_id ||
    !claims.model_route
  ) {
    log('prime-broker auth rejected: token missing prime:infer/device/model_route binding');
    return c.json({ error: 'Forbidden' }, 403);
  }

  c.set('primeOperation', claims as PrimeOperationClaims);
  await next();
};
