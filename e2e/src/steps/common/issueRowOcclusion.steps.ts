import { randomUUID } from 'node:crypto';

import { Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';

import { findOccludedControls } from '../../probes/occlusion';
import type { CustomWorld } from '../../support/world';

interface TaskFixture {
  id: string;
  identifier: string;
}

interface RpcEnvelope<T> {
  result?: { data?: { json?: { data?: T; success?: boolean } } };
}

/** Everything a user can aim at in a row — composite glyphs count as one unit. */
const ROW_CONTROLS = [
  '[data-row-control]',
  '[data-collab-id$=":status"]',
  '[data-collab-id$=":assignee"]',
  '[data-issue-row-chip]',
  '[role=checkbox]',
  'button',
].join(', ');

Then(
  'no control in a hovered My issues row is drawn under another element',
  { timeout: 120_000 },
  async function (this: CustomWorld) {
    const api = this.browserContext.request;
    const suffix = randomUUID().slice(0, 8);
    const created: TaskFixture[] = [];
    const rpc = async <T>(method: string, input: Record<string, unknown>) => {
      const response = await api.post(`/trpc/lambda/task.${method}`, { data: { json: input } });
      const body = (await response.json()) as RpcEnvelope<T>;
      expect(response.ok(), `${method}: ${JSON.stringify(body)}`).toBe(true);
      return body.result!.data!.json!.data as T;
    };

    let primaryFailure: { error: unknown } | undefined;
    try {
      // Urgent/high/low marks differ in shape; each must stay clear of the gutter.
      for (const priority of [1, 2, 4]) {
        created.push(
          await rpc<TaskFixture>('create', {
            instruction: `Occlusion probe ${suffix}`,
            name: `Occlusion probe ${priority} ${suffix}`,
            priority,
          }),
        );
      }

      await this.page.goto('/my-issues?tab=created');
      for (const task of created) {
        const row = this.page.locator(`[data-bulk-row-id="${task.id}"]`);
        await expect(row).toBeVisible({ timeout: 25_000 });
        // The checkbox only paints on hover — probe the state a user sees.
        await row.hover();
        await expect(row.locator('.work-query-bulk-check')).toHaveCSS('opacity', '1');

        const { checked, occluded } = await findOccludedControls(
          this.page,
          `[data-bulk-row-id="${task.id}"]`,
          ROW_CONTROLS,
        );
        // Positive control: the two parties of the original overlap were sampled.
        for (const party of ['select', 'priority']) {
          expect(
            checked.some((control) => control.includes(`data-row-control=${party}`)),
            `${party} control sampled in ${task.identifier}`,
          ).toBe(true);
        }
        if (occluded.length > 0) {
          await this.attach(
            await this.takeScreenshot(`row-occlusion-${task.identifier}`),
            'image/png',
          );
        }
        expect(occluded, `${task.identifier} controls drawn under something else`).toEqual([]);
      }
    } catch (error) {
      primaryFailure = { error };
    }

    const failures: unknown[] = [];
    for (const task of created) {
      try {
        await rpc('delete', { id: task.id });
      } catch (error) {
        failures.push(error);
      }
    }
    if (primaryFailure) throw primaryFailure.error;
    if (failures.length > 0) throw new AggregateError(failures, 'Occlusion fixture cleanup failed');
  },
);
