import { After, AfterAll, Before, BeforeAll, setDefaultTimeout, Status } from '@cucumber/cucumber';
import { type Cookie, request } from 'playwright';

import { clearMockLLMWorkerState } from '../mocks/llm/registry';
import { bindTestUserExecutionDevice } from '../support/bindExecutionDevice';
import { seedTestUser, TEST_USER } from '../support/seedTestUser';
import { startWebServer, stopWebServer } from '../support/webServer';
import { closeSharedBrowser, type CustomWorld } from '../support/world';

process.env['E2E'] = '1';
// Set default timeout for all steps to 30 seconds
setDefaultTimeout(30_000);

// Store base URL and cached session cookies
let baseUrl: string;
let sessionCookies: Cookie[] = [];

BeforeAll({ timeout: 600_000 }, async function () {
  console.log('🚀 Starting E2E test suite...');

  const PORT = process.env.PORT ? Number(process.env.PORT) : 3006;
  baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;

  console.log(`Base URL: ${baseUrl}`);

  // The browser client runtime is retired — sends run through the server-side
  // agent runtime in gateway mode. That path needs two stand-ins started by
  // `bun e2e/scripts/mockServices.ts` (wired into e2e.yml and setup.ts):
  // the fake Agent Gateway (browser WS channel) and the mock OpenAI-compatible
  // LLM endpoint (DEEPSEEK_PROXY_URL). Warn loudly when they are missing so a
  // bare `cucumber-js` invocation fails with an actionable hint instead of a
  // wall of "message was not persisted" timeouts.
  const llmPort = process.env.E2E_MOCK_LLM_PORT || '3406';
  const gatewayPort = process.env.E2E_MOCK_GATEWAY_PORT || '3407';
  for (const [name, url] of [
    ['mock LLM', `http://localhost:${llmPort}/health`],
    ['fake gateway', `http://localhost:${gatewayPort}/health`],
  ] as const) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(String(res.status));
      console.log(`   ✓ ${name} healthy (${url})`);
    } catch {
      console.warn(
        `   ⚠️ ${name} is not reachable at ${url} — agent-send scenarios will fail. ` +
          `Start it with: bun e2e/scripts/mockServices.ts`,
      );
    }
  }

  // Clean slate for this worker's shared mock-LLM registry file — stale
  // responses from a previous run must not shadow this run's defaults.
  clearMockLLMWorkerState();

  // Seed test user before starting web server
  await seedTestUser();

  // Start web server if not using external BASE_URL
  if (!process.env.BASE_URL) {
    await startWebServer({
      command: `bunx next start -p ${PORT}`,
      port: PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    });
  }

  console.log('🔐 Signing in once through the auth API...');
  const api = await request.newContext({ baseURL: baseUrl });

  try {
    const response = await api.post('/api/auth/sign-in/email', {
      data: {
        email: TEST_USER.email,
        password: TEST_USER.password,
      },
    });

    if (!response.ok()) {
      throw new Error(`Auth API sign-in failed: ${response.status()} ${await response.text()}`);
    }

    sessionCookies = (await api.storageState()).cookies;
  } finally {
    await api.dispose();
  }

  console.log(`✅ Auth API login successful, cached ${sessionCookies.length} cookies`);
});

Before(async function (this: CustomWorld, { pickle }) {
  await this.init();

  const testId = pickle.tags.find(
    (tag) =>
      tag.name.startsWith('@AGENT-') ||
      tag.name.startsWith('@HOME-') ||
      tag.name.startsWith('@OIDC-') ||
      tag.name.startsWith('@ROUTES-'),
  );
  console.log(`\n📝 Running: ${pickle.name}${testId ? ` (${testId.name.replace('@', '')})` : ''}`);

  // Set cached session cookies to skip login
  if (sessionCookies.length > 0) {
    await this.browserContext.addCookies(sessionCookies);
    console.log('🍪 Session cookies restored');

    // The in-process runtime is retired: web sends resolve a device/sandbox
    // execution plan, else the run lands on the "No device bound" stub. Bind
    // the fake-gateway device to the inbox agent (idempotent — also covers
    // workspaces a scenario just created).
    try {
      await bindTestUserExecutionDevice(this.browserContext.request);
    } catch (error) {
      console.warn('[e2e] execution-device binding failed:', error);
    }
  }
});

After(async function (this: CustomWorld, { pickle, result }) {
  const testId = pickle.tags
    .find(
      (tag) =>
        tag.name.startsWith('@AGENT-') ||
        tag.name.startsWith('@HOME-') ||
        tag.name.startsWith('@OIDC-') ||
        tag.name.startsWith('@ROUTES-'),
    )
    ?.name.replace('@', '');

  if (result?.status === Status.FAILED && this.page) {
    const screenshot = await this.takeScreenshot(`${testId || 'failure'}-${Date.now()}`);
    this.attach(screenshot, 'image/png');

    const html = await this.page.content();
    this.attach(html, 'text/html');

    if (this.testContext.jsErrors.length > 0) {
      const errors = this.testContext.jsErrors.map((e) => e.message).join('\n');
      this.attach(`JavaScript Errors:\n${errors}`, 'text/plain');
    }

    console.log(`❌ Failed: ${pickle.name}`);
    if (result.message) {
      console.log(`   Error: ${result.message}`);
    }
  } else if (result?.status === Status.FAILED) {
    console.log(`❌ Failed before page initialization: ${pickle.name}`);
    if (result.message) {
      console.log(`   Error: ${result.message}`);
    }
  } else if (result?.status === Status.PASSED) {
    console.log(`✅ Passed: ${pickle.name}`);
  }

  await this.cleanup();
});

AfterAll(async function () {
  console.log('\n🏁 Test suite completed');

  await closeSharedBrowser();

  // Stop web server if we started it
  if (!process.env.BASE_URL && process.env.CI) {
    await stopWebServer();
  }
});
