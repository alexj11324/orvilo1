import { Command } from 'commander';
import { afterEach, expect, it, vi } from 'vitest';

import { registerReviewCommands } from './review';

const read = vi.hoisted(() => vi.fn());
vi.mock('../../api/client', () => ({
  getTrpcClient: async () => ({ task: { getReview: { query: read } } }),
}));
afterEach(() => vi.restoreAllMocks());

it('keeps Task rubric history commands and withdraws set/add/remove/run writers', () => {
  const task = new Command('task');
  registerReviewCommands(task);
  const review = task.commands.find((command) => command.name() === 'review')!;
  expect(review.commands.map((command) => command.name())).toEqual(['view', 'criteria']);
  expect(
    review.commands
      .find((command) => command.name() === 'criteria')
      ?.commands.map((command) => command.name()),
  ).toEqual(['list']);
});

it('still reads the archived task rubric configuration', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  read.mockResolvedValue({
    data: {
      enabled: true,
      judge: {},
      rubrics: [
        { id: 'old', name: 'Original criteria', type: 'contains', config: { value: 'original' } },
      ],
    },
  });
  const task = new Command('task');
  registerReviewCommands(task);
  await task.parseAsync(['node', 'task', 'review', 'view', 'TASK-1']);
  expect(read).toHaveBeenCalledWith({ id: 'TASK-1' });
});
