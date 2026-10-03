import { Hono } from 'hono';

import { finalizeAbandoned } from './handlers/finalizeAbandoned';
import { primeBrokerActivate, primeBrokerCancel, primeBrokerInfer } from './handlers/primeBroker';
import { toolResult } from './handlers/toolResult';
import { primeOperationAuth } from './middlewares/primeOperationAuth';
import { serviceTokenAuth } from './middlewares/serviceTokenAuth';

/**
 * Hono app for `/api/agent/*` endpoints. Mounted via the Next.js optional
 * catch-all at `src/app/(backend)/api/agent/[[...route]]/route.ts`.
 *
 * Routing precedence: existing static `route.ts` files win over the catch-all,
 * so individual paths can migrate one at a time — delete the static `route.ts`
 * and add the corresponding handler here.
 */
const app = new Hono().basePath('/api/agent');

// POST /api/agent/tool-result — gateway-side tool result LPUSH'd to Redis
app.post('/tool-result', serviceTokenAuth(), toolResult);

// POST /api/agent/finalize-abandoned — watchdog reverse-trigger finalize
app.post('/finalize-abandoned', serviceTokenAuth(), finalizeAbandoned);
app.get('/finalize-abandoned', (c) =>
  c.json({
    healthy: true,
    message: 'Agent finalize-abandoned endpoint is running',
    timestamp: new Date().toISOString(),
  }),
);

// POST /api/agent/prime-broker/{activate,infer,cancel} — remote broker surface
// for device-side Prime runs. Auth is the bound operation credential
// (`prime:infer` + device/model/operation claims), never a raw provider key.
app.post('/prime-broker/activate', primeOperationAuth(), primeBrokerActivate);
app.post('/prime-broker/infer', primeOperationAuth(), primeBrokerInfer);
app.post('/prime-broker/cancel', primeOperationAuth(), primeBrokerCancel);

export default app;
