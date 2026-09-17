import { randomUUID } from 'node:crypto';

import { Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';

import type { CustomWorld } from '../../support/world';

interface TaskFixture {
  id: string;
  identifier: string;
  status: string;
}

interface RpcEnvelope<T> {
  error?: { json?: { data?: { code?: string }; message?: string } };
  result?: { data?: { json?: { data?: T; success?: boolean } } };
}

Then(
  'issue prerequisites enforce all-completed readiness and recover after upstream changes',
  { timeout: 180_000 },
  async function (this: CustomWorld) {
    const api = this.browserContext.request;
    const created: TaskFixture[] = [];
    const suffix = randomUUID();
    let dependent: TaskFixture | undefined;
    let primaryFailure: { error: unknown } | undefined;

    const rpc = async <T>(method: string, input: Record<string, unknown>, query = false) => {
      const path = `/trpc/lambda/task.${method}`;
      const payload = { json: input };
      const response = query
        ? await api.get(path, { params: { input: JSON.stringify(payload) } })
        : await api.post(path, { data: payload });
      const body = (await response.json()) as RpcEnvelope<T>;
      expect(response.ok(), `${method}: ${JSON.stringify(body)}`).toBe(true);
      expect(body.error, `${method} must succeed`).toBeUndefined();
      expect(body.result?.data?.json?.success).toBe(true);
      return body.result!.data!.json!.data as T;
    };
    const rejected = async (method: string, input: Record<string, unknown>) => {
      const response = await api.post(`/trpc/lambda/task.${method}`, { data: { json: input } });
      const body = (await response.json()) as RpcEnvelope<never>;
      expect(response.status(), `${method}: ${JSON.stringify(body)}`).toBe(412);
      expect(body.error?.json?.data?.code).toBe('PRECONDITION_FAILED');
    };
    const screenshot = async (phase: string) => {
      await this.attach(await this.takeScreenshot(`prerequisites-${suffix}-${phase}`), 'image/png');
    };
    const blocked = this.page.getByText('Blocked until every prerequisite is completed.', {
      exact: true,
    });
    const ready = this.page.getByText('All prerequisites completed.', { exact: true });
    const empty = this.page.getByText('No prerequisite tasks.', { exact: true });

    try {
      for (const role of ['first', 'second', 'dependent']) {
        created.push(
          await rpc<TaskFixture>('create', {
            instruction: `Prerequisite acceptance ${role} ${suffix}`,
            name: `Prerequisite acceptance ${role}`,
          }),
        );
      }
      const [first, second, target] = created;
      dependent = target;
      await this.page.goto(`/task/${target.identifier}`);
      await expect(empty).toBeVisible({ timeout: 25_000 });
      await screenshot('empty');

      // Mutate behind an idle mounted page to exercise first-link invalidation.
      await rpc('addDependency', { dependsOnId: first.id, taskId: target.id });
      await expect(
        this.page.getByRole('button', {
          exact: true,
          name: `Remove prerequisite ${first.identifier}`,
        }),
      ).toBeVisible({ timeout: 25_000 });

      const input = this.page.getByRole('textbox', { name: 'Prerequisite task identifier' });
      await input.fill(second.identifier);
      await input.press('Enter');
      await expect(
        this.page.getByRole('button', {
          exact: true,
          name: `Remove prerequisite ${second.identifier}`,
        }),
      ).toBeVisible();
      await expect(blocked).toBeVisible();
      await rejected('run', { id: target.id });
      await rejected('updateStatus', { id: target.id, status: 'completed' });
      expect((await rpc<TaskFixture>('find', { id: target.id }, true)).status).toBe('backlog');
      await screenshot('two-blockers');

      // Avoid dispatching model work from fixtures; readiness must not override pause.
      await rpc('updateStatus', { id: target.id, status: 'paused' });
      await rpc('updateStatus', { id: first.id, status: 'completed' });
      await rejected('run', { id: target.id });
      await expect(blocked).toBeVisible();
      await screenshot('one-blocker');

      await rpc('updateStatus', { id: second.id, status: 'canceled' });
      await rejected('run', { id: target.id });
      await rejected('updateStatus', { id: target.id, status: 'completed' });
      await expect(blocked).toBeVisible();

      await rpc('updateStatus', { id: second.id, status: 'completed' });
      await expect(ready).toBeVisible({ timeout: 25_000 });
      expect((await rpc<TaskFixture>('find', { id: target.id }, true)).status).toBe('paused');
      await screenshot('all-completed');

      await rpc('updateStatus', { id: first.id, status: 'backlog' });
      await expect(blocked).toBeVisible({ timeout: 25_000 });
      await rejected('run', { id: target.id });
      await screenshot('reopened');
      await this.page
        .getByRole('button', {
          exact: true,
          name: `Remove prerequisite ${first.identifier}`,
        })
        .click();
      await expect(ready).toBeVisible();
      await this.page
        .getByRole('button', {
          exact: true,
          name: `Remove prerequisite ${second.identifier}`,
        })
        .click();
      await expect(empty).toBeVisible();
    } catch (error) {
      primaryFailure = { error };
    }

    // Always attempt every cleanup operation without masking the original assertion.
    const failures: unknown[] = [];
    if (dependent) {
      for (const upstream of created.filter(({ id }) => id !== dependent!.id)) {
        try {
          await rpc('removeDependency', { dependsOnId: upstream.id, taskId: dependent.id });
        } catch (error) {
          failures.push(error);
        }
      }
    }
    for (const task of [...created].reverse()) {
      try {
        await rpc('delete', { id: task.id });
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      await this.attach(
        `Prerequisite fixture cleanup failed: ${failures.map(String).join('\n')}`,
        'text/plain',
      );
    }
    if (primaryFailure) throw primaryFailure.error;
    if (failures.length > 0)
      throw new AggregateError(failures, 'Prerequisite fixture cleanup failed');
  },
);
