// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { tasks, taskTopics, topics, users } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { TaskModel } from '../task';

const serverDB: OrviloDatabase = await getTestDB();
const userId = 'task-pr-delivery-gate-user';

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values({ id: userId });
});

afterEach(async () => {
  await serverDB.delete(users);
});

// The gate raises inside a BEFORE UPDATE trigger; under node-postgres the
// rejection is a DrizzleQueryError whose own message is the failed statement,
// while the trigger's text lives on `cause`. Match either surface so the
// assertion holds in both TEST_SERVER_DB and embedded modes.
const expectCompletionError = async (model: TaskModel, taskId: string, pattern: RegExp) => {
  const error = await model.updateStatus(taskId, 'completed').then(
    () => null,
    (e) => e,
  );
  expect(error, 'expected task completion to be rejected').not.toBeNull();
  const messages = [error?.message, error?.cause?.message].filter(Boolean).join('\n');
  expect(messages).toMatch(pattern);
};

const bindGithubWorkspace = async (taskId: string, repo = 'acme/widgets') => {
  await serverDB
    .update(tasks)
    .set({
      config: {
        workspace: {
          provider: 'git',
          repo,
          repoPath: '/tmp/widgets',
        },
      },
    })
    .where(eq(tasks.id, taskId));
};

// The proof row must bind to the generation that is completing; a fresh task
// starts at generation 0 and each dispatch bumps it.
const addMergedDeliveryEvidence = async (taskId: string, identifier: string, generation = 0) => {
  const topicId = `topic-${identifier}-${generation}`;
  await serverDB.insert(topics).values({ id: topicId, userId });
  await serverDB.insert(taskTopics).values({
    executionGeneration: generation,
    integration: {
      attempts: 0,
      baseBranch: 'main',
      branch: `task/${identifier}`,
      expectedHeadSha: 'head-sha',
      integratedSha: 'merge-sha',
      prNumber: 42,
      prUrl: 'https://github.com/acme/widgets/pull/42',
      pushedToRemote: true,
      repo: 'acme/widgets',
      role: 'task',
      state: 'integrated',
    },
    seq: 1,
    status: 'completed',
    taskId,
    topicId,
    userId,
  });
};

// A repository-bound delivery topic without merged proof — the shape produced
// when the run delivered through a project/team repository association rather
// than an explicit config.workspace.repo binding.
const addPendingRepoBoundTopic = async (taskId: string, identifier: string, generation = 0) => {
  const topicId = `pending-${identifier}-${generation}`;
  await serverDB.insert(topics).values({ id: topicId, userId });
  await serverDB.insert(taskTopics).values({
    executionGeneration: generation,
    integration: {
      attempts: 1,
      baseBranch: 'main',
      branch: `task/${identifier}`,
      expectedHeadSha: 'head-sha',
      pushedToRemote: true,
      repo: 'acme/widgets',
      role: 'task',
      state: 'verification_pending',
    },
    seq: 1,
    status: 'running',
    taskId,
    topicId,
    userId,
  });
};

describe('task PR delivery completion gate', () => {
  it('rejects completion until a GitHub-backed task has merged PR evidence', async () => {
    const model = new TaskModel(serverDB, userId);
    const task = await model.create({ instruction: 'Implement the code change' });
    await bindGithubWorkspace(task.id);

    await expectCompletionError(
      model,
      task.id,
      /cannot complete until its pull request is merged/i,
    );

    await addMergedDeliveryEvidence(task.id, task.identifier);
    await expect(model.updateStatus(task.id, 'completed')).resolves.toMatchObject({
      id: task.id,
      status: 'completed',
    });
  });

  it('uses the nearest inherited git workspace when guarding a child task', async () => {
    const model = new TaskModel(serverDB, userId);
    const parent = await model.create({ instruction: 'Parent code goal' });
    await bindGithubWorkspace(parent.id);
    const child = await model.create({
      instruction: 'Child code task',
      parentTaskId: parent.id,
    });

    await expectCompletionError(
      model,
      child.id,
      /cannot complete until its pull request is merged/i,
    );
  });

  it('keeps local completion semantics for repoPath-only git bindings', async () => {
    const model = new TaskModel(serverDB, userId);
    const task = await model.create({ instruction: 'Legacy local worktree task' });
    await serverDB
      .update(tasks)
      .set({ config: { workspace: { provider: 'git', repoPath: '/tmp/widgets' } } })
      .where(eq(tasks.id, task.id));

    await expect(model.updateStatus(task.id, 'completed')).resolves.toMatchObject({
      id: task.id,
      status: 'completed',
    });
  });

  it('requires a remote or local target for malformed git bindings', async () => {
    const model = new TaskModel(serverDB, userId);
    const task = await model.create({ instruction: 'Malformed workspace task' });
    await serverDB
      .update(tasks)
      .set({ config: { workspace: { provider: 'git' } } })
      .where(eq(tasks.id, task.id));

    await expectCompletionError(model, task.id, /requires config\.workspace\.repo/i);
  });

  it('guards repository-bound deliveries made through association fallback', async () => {
    const model = new TaskModel(serverDB, userId);
    const task = await model.create({ instruction: 'Associated repo delivery' });
    await serverDB
      .update(tasks)
      .set({ config: { workspace: { provider: 'git', repoPath: '/tmp/widgets' } } })
      .where(eq(tasks.id, task.id));
    await addPendingRepoBoundTopic(task.id, task.identifier);

    await expectCompletionError(
      model,
      task.id,
      /cannot complete until its pull request is merged/i,
    );

    await addMergedDeliveryEvidence(task.id, task.identifier);
    await expect(model.updateStatus(task.id, 'completed')).resolves.toMatchObject({
      id: task.id,
      status: 'completed',
    });
  });

  it('does not accept merged evidence bound to an older generation', async () => {
    const model = new TaskModel(serverDB, userId);
    const task = await model.create({ instruction: 'Rerun a code change' });
    await bindGithubWorkspace(task.id);
    await addMergedDeliveryEvidence(task.id, task.identifier);
    await serverDB.update(tasks).set({ executionGeneration: 1 }).where(eq(tasks.id, task.id));

    await expectCompletionError(
      model,
      task.id,
      /cannot complete until its pull request is merged/i,
    );
  });

  it('preserves existing completion semantics for non-repository tasks', async () => {
    const model = new TaskModel(serverDB, userId);
    const task = await model.create({ instruction: 'Write a research note' });

    await expect(model.updateStatus(task.id, 'completed')).resolves.toMatchObject({
      id: task.id,
      status: 'completed',
    });
  });
});
