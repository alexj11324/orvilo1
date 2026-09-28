import { Hono } from 'hono';

import { bearerSecretAuth } from '@/server/router-hono/agent/middlewares/bearerSecretAuth';
import { LinearSyncWorkflow } from '@/server/workflows/linearSync';
import type { LinearSyncWorkflowInput } from '@/server/workflows/linearSync/types';

import { sweep } from './handlers/sweep';

const app = new Hono();

const internalLinearSyncAuth = bearerSecretAuth(() => process.env.CRON_SECRET);

app.post('/sweep', internalLinearSyncAuth, sweep);

app.post('/process', internalLinearSyncAuth, async (c) => {
  try {
    const payload = (await c.req.json()) as LinearSyncWorkflowInput;
    return c.json({ ...(await LinearSyncWorkflow.trigger(payload)), success: true });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});

app.post('/execute', internalLinearSyncAuth, async (c) => {
  try {
    const payload = (await c.req.json()) as LinearSyncWorkflowInput & { installationId: string };
    return c.json({ ...(await LinearSyncWorkflow.triggerInstallation(payload)), success: true });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});

export default app;
