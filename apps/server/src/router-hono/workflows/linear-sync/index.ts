import { withOtelMetricsForUpstashWorkflows } from '@orvilo/observability-otel/modules/upstash-workflow';
import { serve } from '@upstash/workflow/hono';
import { Hono } from 'hono';

import {
  executeLinearSyncWorkflow,
  executeLinearSyncWorkflowOptions,
} from '@/server/workflows/linearSync/execute';
import {
  processLinearSyncWorkflow,
  processLinearSyncWorkflowOptions,
} from '@/server/workflows/linearSync/process';

import { createWorkflowQstashClient } from '../qstashClient';

const app = new Hono();

app.post(
  '/process',
  serve(
    withOtelMetricsForUpstashWorkflows(processLinearSyncWorkflow, {
      url: '/api/workflows/linear-sync/process',
    }),
    { ...processLinearSyncWorkflowOptions, qstashClient: createWorkflowQstashClient() },
  ),
);

app.post(
  '/execute',
  serve(
    withOtelMetricsForUpstashWorkflows(executeLinearSyncWorkflow, {
      url: '/api/workflows/linear-sync/execute',
    }),
    { ...executeLinearSyncWorkflowOptions, qstashClient: createWorkflowQstashClient() },
  ),
);

export default app;
