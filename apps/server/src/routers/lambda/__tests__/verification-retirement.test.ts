// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { acceptanceRouter } from '../acceptance';
import { acceptanceCommentRouter } from '../acceptanceComment';
import { verifyRouter } from '../verify';

vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: vi.fn() }));
vi.mock('@/server/services/aiAgent/deviceQueue', () => ({
  cancelQueuedDeviceOperation: vi.fn(),
  finishQueuedDeviceOperation: vi.fn(),
  readDeviceQueue: vi.fn(),
}));
vi.mock('@/server/services/aiAgent', () => ({ AiAgentService: class {} }));
const touched = vi.hoisted(() => vi.fn());
vi.mock('@/libs/trpc/lambda/middleware', () => ({
  serverDatabase: ({ ctx, next }: { ctx: unknown; next: (input: unknown) => unknown }) =>
    next({ ctx }),
}));
const db = new Proxy(
  {},
  {
    get() {
      touched();
      throw new Error('No legacy ledger access');
    },
  },
);
const context = { userId: 'user', serverDB: db } as never;

it.each([
  [
    'acceptance checklist',
    () =>
      acceptanceRouter
        .createCaller(context)
        .saveChecklist({ subjectId: 'task', subjectType: 'task', checklist: [] }),
  ],
  ['acceptance decision', () => acceptanceRouter.createCaller(context).accept({ id: 'legacy' })],
  [
    'verify creation',
    () =>
      verifyRouter
        .createCaller(context)
        .createCriterion({ title: 'Legacy check', verifierType: 'agent' }),
  ],
  [
    'verify run deletion',
    () =>
      verifyRouter
        .createCaller(context)
        .deleteRun({ verifyRunId: '80b70eec-e109-45af-b363-0c6ab9c3e909' }),
  ],
  [
    'comment creation',
    () =>
      acceptanceCommentRouter
        .createCaller(context)
        .create({ acceptanceId: 'legacy', clientId: 'legacy-client', content: 'stale comment' }),
  ],
] as const)('rejects %s without touching ledger rows', async (_name, invoke) => {
  touched.mockClear();
  await expect(invoke()).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  expect(touched).not.toHaveBeenCalled();
});

for (const [name, router] of [
  ['acceptance', acceptanceRouter],
  ['verify', verifyRouter],
  ['acceptanceComment', acceptanceCommentRouter],
] as const) {
  const mutations = Object.entries(router._def.procedures)
    .filter(([, procedure]) => procedure._def.type === 'mutation')
    .map(([procedure]) => procedure);
  it.each(mutations)(`rejects stale ${name}.%s before ledger access`, async (procedure) => {
    touched.mockClear();
    const caller = router.createCaller(context) as unknown as Record<
      string,
      (input: unknown) => Promise<unknown>
    >;
    await expect(caller[procedure]({})).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(touched).not.toHaveBeenCalled();
  });
}
