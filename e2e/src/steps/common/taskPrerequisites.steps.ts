import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

import { After, Given, Then, When } from '@cucumber/cucumber';
import { type APIRequestContext, expect, request } from '@playwright/test';

import type { CustomWorld } from '../../support/world';

interface FixtureTask {
  id: string;
  identifier: string;
  name: string;
}
interface Fixture {
  dependent: FixtureTask;
  key: string;
  prerequisites: FixtureTask[];
}

const fixture = (world: CustomWorld): Fixture => world.testContext.prerequisites as Fixture;
const panel = (world: CustomWorld) =>
  world.page.getByRole('region', { name: 'Prerequisites', exact: true });

const mutate = async <T>(world: CustomWorld, procedure: string, input: unknown): Promise<T> => {
  const api = world.testContext.prerequisitesApi as APIRequestContext;
  const response = await api.post(`/trpc/lambda/task.${procedure}`, { data: { json: input } });
  const body = await response.json();
  expect(response.ok(), JSON.stringify(body)).toBe(true);
  expect(body.error).toBeUndefined();
  return body.result.data.json as T;
};

const capture = async (world: CustomWorld, state: string) => {
  await mkdir('screenshots', { recursive: true });
  const image = await world.page.screenshot({
    fullPage: true,
    path: `screenshots/prerequisites-${fixture(world).key}-${state}.png`,
  });
  await world.attach(image, 'image/png');
};

Given('I have an issue with two available prerequisite tasks', async function (this: CustomWorld) {
  this.testContext.prerequisitesApi = await request.newContext({
    baseURL: process.env.BASE_URL || `http://localhost:${process.env.PORT || 3006}`,
    storageState: await this.browserContext.storageState(),
  });
  const key = randomUUID().slice(0, 8);
  const created: FixtureTask[] = [];
  this.testContext.prerequisitesCreated = created;
  for (const label of ['First prerequisite', 'Second prerequisite', 'Dependent issue']) {
    const result = await mutate<{ data: FixtureTask }>(this, 'create', {
      instruction: `${label} ${key}`,
      name: `${label} ${key}`,
    });
    created.push(result.data);
  }
  this.testContext.prerequisites = {
    dependent: created[2],
    key,
    prerequisites: created.slice(0, 2),
  } satisfies Fixture;
  // Paused work is manually resumed, so completing its prerequisites proves
  // readiness without spending a model call through the automatic cascade.
  await mutate(this, 'updateStatus', { id: created[2].id, status: 'paused' });
  await this.page.goto(`/task/${created[2].identifier}`);
  await expect(panel(this)).toBeVisible();
});

When('I add both prerequisites through the issue picker', async function (this: CustomWorld) {
  for (const task of fixture(this).prerequisites) {
    await panel(this).getByRole('button', { name: 'Add prerequisite', exact: true }).click();
    await panel(this)
      .getByRole('textbox', { name: 'Search by task ID or title' })
      .fill(task.identifier);
    await panel(this)
      .getByRole('button', { name: `${task.identifier} · ${task.name}`, exact: true })
      .click();
    await expect(
      panel(this).getByRole('button', {
        name: `Remove prerequisite ${task.identifier}`,
        exact: true,
      }),
    ).toBeVisible();
  }
});

Then(
  'the issue should show {int} of {int} prerequisites complete and remain blocked',
  async function (this: CustomWorld, complete: number, total: number) {
    await expect(panel(this).getByRole('button', { name: /^Remove prerequisite / })).toHaveCount(total);
    await expect(panel(this).getByText('Completed', { exact: true })).toHaveCount(complete, {
      timeout: 20_000,
    });
    await expect(panel(this).getByText('Blocked until all prerequisite tasks are completed.', {
      exact: true,
    })).toBeVisible();
    await expect(this.page.getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
    await capture(this, `blocked-${complete}`);
  },
);

Then('the API should reject advancing the blocked issue', async function (this: CustomWorld) {
  for (const [procedure, input] of [
    ['updateStatus', { id: fixture(this).dependent.id, status: 'completed' }],
    ['run', { id: fixture(this).dependent.id }],
  ] as const) {
    const response = await this.page.request.post(`/trpc/lambda/task.${procedure}`, {
      data: { json: input },
    });
    expect(response.status()).toBe(412);
    expect(JSON.stringify(await response.json())).toContain('PRECONDITION_FAILED');
  }
});

When(
  'I mark prerequisite {int} as {string}',
  async function (this: CustomWorld, index: number, status: string) {
    await mutate(this, 'updateStatus', { id: fixture(this).prerequisites[index - 1].id, status });
  },
);

Then(
  'the issue should be ready after both prerequisites complete',
  async function (this: CustomWorld) {
    await expect(panel(this).getByText('All prerequisites are completed.', { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(panel(this).getByText('Completed', { exact: true })).toHaveCount(2);
    await expect(this.page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
    await capture(this, 'ready');
  },
);

When('I remove the first prerequisite through the issue panel', async function (this: CustomWorld) {
  const task = fixture(this).prerequisites[0];
  await panel(this)
    .getByRole('button', {
      name: `Remove prerequisite ${task.identifier}`,
      exact: true,
    })
    .click();
});

Then('only the second prerequisite should remain', async function (this: CustomWorld) {
  await expect(panel(this).getByRole('button', { name: /^Remove prerequisite / })).toHaveCount(1);
  await expect(panel(this).getByText('All prerequisites are completed.', { exact: true })).toBeVisible();
  await capture(this, 'unlinked');
});

After({ tags: '@task-prerequisites' }, async function (this: CustomWorld) {
  const api = this.testContext.prerequisitesApi as APIRequestContext | undefined;
  if (!api) return;
  try {
    // Independent request context survives the suite's browser cleanup hook.
    // Dependent first; also cleans partially-created fixtures after a failure.
    const created = this.testContext.prerequisitesCreated as FixtureTask[] | undefined;
    for (const task of [...(created ?? [])].reverse())
      await mutate(this, 'delete', { id: task.id });
  } finally {
    await api.dispose();
  }
});
