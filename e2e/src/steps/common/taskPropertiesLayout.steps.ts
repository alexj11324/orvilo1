import { randomUUID } from 'node:crypto';

import { After, Given, Then, When } from '@cucumber/cucumber';
import { type APIRequestContext, expect } from '@playwright/test';
import { request } from 'playwright';

import {
  formatViolations,
  isVerticalStack,
  runLayoutRules,
  type StaticLayoutRuleId,
} from '../../probes/layoutRules';
import { TEST_USER } from '../../support/seedTestUser';
import type { CustomWorld } from '../../support/world';

/**
 * Layout-rule probe over the issue rail (`[data-testid="task-properties"]`).
 *
 * The rail went wrong only in one state: while the task ran, the assignee
 * picker was blocked, its wrapper shrank the full-width row to its content,
 * and the trigger's `justify-content: center` parked it mid-rail. So the
 * fixture is a running task with the rows that make up a real rail (status,
 * workflow state, priority, assignee, schedule), plus a not-running control.
 */

const PROPERTIES = '[data-testid="task-properties"]';
const RULES: StaticLayoutRuleId[] = [
  'sibling-edge',
  'centered-in-full-row',
  'clipped-text',
  'date-format',
];

interface TaskFixture {
  id: string;
  identifier: string;
  status: string;
}

interface RpcEnvelope<T> {
  error?: { json?: { message?: string } };
  result?: { data?: { json?: { data?: T; success?: boolean } } };
}

const rpc = async <T>(api: APIRequestContext, method: string, input: Record<string, unknown>) => {
  const response = await api.post(`/trpc/lambda/task.${method}`, {
    data: { json: input },
  });
  const body = (await response.json()) as RpcEnvelope<T>;
  expect(response.ok(), `task.${method}: ${JSON.stringify(body)}`).toBe(true);
  expect(body.result?.data?.json?.success, `task.${method} must succeed`).toBe(true);
  return body.result!.data!.json!.data as T;
};

/**
 * A workflow state only reaches a task through a linked provider issue, which
 * the E2E stack has no provider for. The rail reads the projected columns, so
 * the fixture writes them directly — the same projection a sync would leave.
 */
const setWorkflowState = async (taskId: string, category: string) => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required to seed the task workflow state');

  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query(
      'UPDATE tasks SET workflow_state_id = $1, workflow_category = $2 WHERE id = $3',
      [`e2e-layout-probe-${category}`, category, taskId],
    );
    expect(result.rowCount, 'workflow state must land on the fixture task').toBe(1);
  } finally {
    await client.end();
  }
};

Given(
  '存在一个状态为 {string}、带 workflow 状态并指派给我的任务',
  { timeout: 60_000 },
  async function (this: CustomWorld, status: string) {
    console.log(`   📍 Step: 创建 ${status} 任务...`);
    const task = await rpc<TaskFixture>(this.browserContext.request, 'create', {
      assigneeUserId: TEST_USER.id,
      instruction: `Layout probe fixture (${status}) ${randomUUID()}`,
      name: `Layout probe ${status}`,
      priority: 2,
    });
    this.testContext.layoutProbeTask = task;
    // Cleanup runs after the shared After hook has closed the browser context,
    // so it signs its own request context in with this session.
    this.testContext.layoutProbeStorage = await this.browserContext.storageState();

    await setWorkflowState(task.id, status === 'running' ? 'in_progress' : 'todo');
    // Stamps the status without dispatching model work: the fixture has no topic.
    if (status !== 'backlog')
      await rpc(this.browserContext.request, 'updateStatus', { id: task.id, status });
    console.log(`   ✅ 任务 ${task.identifier} 已就绪`);
  },
);

When('我在 1440×900 视口打开该任务详情', async function (this: CustomWorld) {
  const task = this.testContext.layoutProbeTask as TaskFixture;
  await this.page.setViewportSize({ height: 900, width: 1440 });
  await this.page.goto(`/task/${task.identifier}`);

  const properties = this.page.locator(PROPERTIES);
  await expect(properties).toBeVisible({ timeout: 30_000 });
  // Wait for every row the probe is about to measure, including the async
  // member lookup that fills the assignee row.
  await expect(properties.locator('[data-task-workflow-state]')).toBeVisible({ timeout: 25_000 });
  await expect(properties.getByText(TEST_USER.fullName, { exact: true })).toBeVisible({
    timeout: 25_000,
  });
  await this.page.evaluate(() => document.fonts.ready);
});

Then(
  '属性栏通过 sibling-edge、centered-in-full-row、clipped-text、date-format 规则且至少采到 {int} 行',
  async function (this: CustomWorld, minRows: number) {
    const { sample, violations } = await runLayoutRules(this.page, PROPERTIES, { rules: RULES });
    const rows = sample.rowScopes.flatMap((scope) => scope.rows);

    console.log(`   📐 ${rows.length} rows: ${rows.map((row) => row.selector).join(' | ')}`);
    console.log(`   ${formatViolations(violations)}`);
    await this.attach(await this.page.locator(PROPERTIES).screenshot(), 'image/png');
    await this.attach(JSON.stringify(sample, null, 2), 'application/json');

    // "0 violations" over nothing proves nothing: the probe must have measured
    // the rail as the vertical stack sibling-edge judges.
    expect(sample.rowScopes, 'exactly one properties rail').toHaveLength(1);
    expect(rows.length, 'rows sampled from the rail').toBeGreaterThanOrEqual(minRows);
    expect(isVerticalStack(rows), 'rail rows must stack vertically at 1440px').toBe(true);
    expect(violations, formatViolations(violations)).toEqual([]);
  },
);

After({ tags: '@layout-probe' }, async function (this: CustomWorld) {
  const task = this.testContext.layoutProbeTask as TaskFixture | undefined;
  if (!task) return;
  const PORT = process.env.PORT ? Number(process.env.PORT) : 3006;
  const api = await request.newContext({
    baseURL: process.env.BASE_URL || `http://localhost:${PORT}`,
    storageState: this.testContext.layoutProbeStorage,
  });
  try {
    // Leave `running` first so deletion never races a live-execution guard.
    await rpc(api, 'updateStatus', { id: task.id, status: 'canceled' });
    await rpc(api, 'delete', { id: task.id });
  } catch (error) {
    console.warn(`[e2e] layout-probe fixture cleanup failed for ${task.identifier}:`, error);
  } finally {
    await api.dispose();
  }
});
