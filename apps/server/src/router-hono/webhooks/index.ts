import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import { casdoorWebhook } from './handlers/casdoor';
import { githubEventsWebhook } from './handlers/githubEvents';
import { linearWebhook } from './handlers/linear';
import { logtoWebhook } from './handlers/logto';
import { mcpEventsWebhook } from './handlers/mcpEvents';
import { memoryExtractionWebhook } from './handlers/memoryExtraction';
import { memoryExtractionBenchmarkLocomo } from './handlers/memoryExtractionBenchmarkLocomo';
import { memoryUserMemoryChatTopicCancel } from './handlers/memoryUserMemoryChatTopicCancel';
import { memoryUserMemoryPersonaUpdateWriting } from './handlers/memoryUserMemoryPersonaUpdateWriting';
import { slackWebhook } from './handlers/slack';
import { memoryWebhookAuth } from './middlewares/memoryWebhookAuth';

const app = new Hono().basePath('/api/webhooks');

// Identity provider webhooks — each verifies its own provider signature.
app.post('/casdoor', casdoorWebhook);
app.post('/logto', logtoWebhook);
app.post('/linear/:workspaceId', linearWebhook);
app.post('/github-events/:callbackToken', githubEventsWebhook);
app.post('/mcp-events/:callbackToken', mcpEventsWebhook);
app.post('/slack', bodyLimit({ maxSize: 1024 * 1024 }), slackWebhook);

// Memory pipeline webhooks — share the configured static-header guard.
app.post('/memory-extraction', memoryWebhookAuth(), memoryExtractionWebhook);
app.post(
  '/memory-extraction/benchmark-locomo',
  memoryWebhookAuth(),
  memoryExtractionBenchmarkLocomo,
);
app.post(
  '/memory-user-memory/persona/update-writing',
  memoryWebhookAuth(),
  memoryUserMemoryPersonaUpdateWriting,
);
app.post(
  '/memory-user-memory/pipelines/extract/chat-topic/cancel',
  memoryWebhookAuth(),
  memoryUserMemoryChatTopicCancel,
);

export default app;
