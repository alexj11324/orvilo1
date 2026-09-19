// @vitest-environment node
import { afterEach, describe, it, vi } from 'vitest';

import { reviewControllerCases } from './__tests__/reviewController.cases';

const mocked = new Set<string>();
afterEach(() => {
  for (const name of mocked) vi.doUnmock(name);
  mocked.clear();
  vi.resetModules();
});

describe('delivery review identity and confirmation boundaries', () => {
  for (const scenario of reviewControllerCases) {
    it(scenario.name, () =>
      scenario.run(async (mocks) => {
        vi.resetModules();
        for (const [name, value] of Object.entries(mocks)) {
          vi.doMock(name, () => value);
          mocked.add(name);
        }
        const { runTaskDeliveryReviewSweep } = await import('./index');
        return (db) =>
          runTaskDeliveryReviewSweep(db as Parameters<typeof runTaskDeliveryReviewSweep>[0]);
      }),
    );
  }
});
