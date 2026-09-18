#!/usr/bin/env bun
/**
 * E2E mock services entry point — starts the fake Agent Gateway and the
 * mock OpenAI-compatible LLM endpoint that the Orvilo server's agent runtime
 * talks to.
 *
 * Required env on the Orvilo server (set by e2e.yml / setup.ts):
 *   ENABLE_AGENT_GATEWAY=1
 *   AGENT_GATEWAY_URL=http://localhost:<gatewayPort>
 *   AGENT_GATEWAY_SERVICE_TOKEN=e2e-mock-service-token
 *   DEEPSEEK_API_KEY=e2e-mock-key
 *   DEEPSEEK_PROXY_URL=http://localhost:<llmPort>/v1
 *
 * Usage: bun e2e/scripts/mockServices.ts
 */
import { MOCK_GATEWAY_PORT, startFakeGateway } from '../src/mocks/gateway/server';
import { clearAllMockLLMState, MOCK_LLM_PORT } from '../src/mocks/llm/registry';
import { startMockLLMServer } from '../src/mocks/llm/server';

const orviloBaseUrl = process.env.E2E_ORVILO_BASE_URL || 'http://localhost:3006';

// Wipe stale worker-state files from previous runs — responses registered by
// this run's cucumber workers must not be shadowed by leftovers in $TMPDIR.
clearAllMockLLMState();

await startMockLLMServer(MOCK_LLM_PORT);
startFakeGateway(MOCK_GATEWAY_PORT, { orviloBaseUrl });

console.log('[e2e-mocks] mock services ready');
