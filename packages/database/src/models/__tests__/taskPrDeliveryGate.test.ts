// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { taskTopics, tasks, topics, users } from '../../schemas';
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

const addMergedDeliveryEvidence = async (taskId: string, identifier: string) => {
  const topicId = `topic-${identifier}`;
  await serverDB.insert(topics).values({ id: topicId, userId });
  await serverDB.insert(taskTopics).values({
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

describe('task PR delivery completion gate', () => {
  it('rejects completion until a GitHub-backed task has merged PR evidence', async () => {
    const model = new TaskModel(serverDB, userId);
    const task = await model.create({ instruction: 'Implement the code change' });
    await bindGithubWorkspace(task.id);

    await expect(model.updateStatus(task.id, 'completed')).rejects.toThrow(
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

    await expect(model.updateStatus(child.id, 'completed')).rejects.toThrow(
      /cannot complete until its pull request is merged/i,
    );
  });

  it('requires a GitHub repo coordinate for legacy repoPath-only git bindings', async () => {
    const model = new TaskModel(serverDB, userId);
    const task = await model.create({ instruction: 'Legacy local worktree task' });
    await serverDB
      .update(tasks)
      .set({ config: { workspace: { provider: 'git', repoPath: '/tmp/widgets' } } })
      .where(eq(tasks.id, task.id));

    await expect(model.updateStatus(task.id, 'completed')).rejects.toThrow(
      /requires config\.workspace\.repo/i,
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