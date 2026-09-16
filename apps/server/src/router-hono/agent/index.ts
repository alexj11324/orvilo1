import { Hono } from 'hono';

import { finalizeAbandoned } from './handlers/finalizeAbandoned';
import { gatewayCallback } from './handlers/gatewayCallback';
import { gatewayCron } from './handlers/gatewayCron';
import { gatewayDesiredConnections } from './handlers/gatewayDesiredConnections';
import { gatewayStart } from './handlers/gatewayStart';
import { messengerInstall } from './handlers/messengerInstall';
import { messengerOAuthCallback } from './handlers/messengerOAuthCallback';
import { messengerWebhook } from './handlers/messengerWebhook';
import { platformWebhook } from './handlers/platformWebhook';
import { toolResult } from './handlers/toolResult';
import { bearerSecretAuth } from './middlewares/bearerSecretAuth';
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

// GET /api/agent/gateway — Vercel cron entry point (Bearer CRON_SECRET)
app.get(
  '/gateway',
  bearerSecretAuth(() => process.env.CRON_SECRET),
  gatewayCron,
);

// POST /api/agent/gateway/start — non-Vercel ensureRunning (Bearer KEY_VAULTS_SECRET)
app.post(
  '/gateway/start',
  bearerSecretAuth(() => process.env.KEY_VAULTS_SECRET),
  gatewayStart,
);

// POST /api/agent/gateway/callback — message gateway state-change callbacks
// (auth is inline so the disabled-feature 204 short-circuits before auth)
app.post('/gateway/callback', gatewayCallback);

// POST /api/agent/gateway/desired-connections — a gateway pulls the connect
// payloads it should hold, so it can rebuild itself after a restart.
// (auth is inline for the same reason as the callback above)
app.post('/gateway/desired-connections', gatewayDesiredConnections);

// POST /api/agent/webhooks/:platform[/:appId] — Chat SDK bot platform webhooks
app.post('/webhooks/:platform/:appId?', platformWebhook);

// GET /api/agent/messenger/:platform/install — start per-tenant OAuth install
app.get('/messenger/:platform/install', messengerInstall);

// GET /api/agent/messenger/:platform/oauth/callback — OAuth redirect target
app.get('/messenger/:platform/oauth/callback', messengerOAuthCallback);

// POST /api/agent/messenger/webhooks/:platform — shared Messenger bot webhook
app.post('/messenger/webhooks/:platform', messengerWebhook);

export default app;
