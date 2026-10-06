import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import McpEventTriggerSettings from './McpEventTriggerSettings';

const mocks = vi.hoisted(() => ({ create: vi.fn(), mutate: vi.fn() }));

vi.mock('react-i18next', async () => {
  const { default: labels } = await import('@/locales/default/automation');
  return {
    useTranslation: () => ({
      t: (key: string) => labels[key as keyof typeof labels] ?? key,
    }),
  };
});
vi.mock('@/services/mcpEvents', () => ({ mcpEventsService: { create: mocks.create } }));
vi.mock('@/features/AgentTasks/AgentTaskDetail/TaskDetailScope', () => ({
  useTaskDetailTaskId: () => 'task-1',
}));
vi.mock('./useSavedEventTrigger', () => ({
  useSavedEventTrigger: () => ({ data: { data: { triggers: [] } } }),
}));
vi.mock('@/store/mcpEvents', () => ({
  useMcpEventsStore: (selector: (state: Record<string, () => unknown>) => unknown) =>
    selector({
      useFetchEventSources: () => ({
        data: { data: [{ id: 'source-1', name: 'GitHub' }] },
        mutate: mocks.mutate,
      }),
      useFetchEventDefinitions: () => ({
        data: {
          data: {
            sourceType: 'github',
            events: ['github.pull_request', 'github.workflow_run'].map((name) => ({
              name,
              delivery: ['webhook'],
            })),
          },
        },
        mutate: mocks.mutate,
      }),
      useFetchEventTriggers: () => ({
        data: { data: { canCreate: true, triggers: [] } },
        mutate: mocks.mutate,
      }),
    }),
}));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue(undefined);
});

describe('GitHub event trigger selected labels', () => {
  it('shows source, event, action and conclusion labels while saving raw values', async () => {
    const user = userEvent.setup({ delay: null });
    render(<McpEventTriggerSettings />);
    const source = screen.getByRole('combobox', { name: 'Connected event source' });
    await user.click(source);
    await user.click(await screen.findByRole('option', { name: 'GitHub' }));
    expect(source).toHaveTextContent('GitHub');

    let saves = 0;
    for (const { event, label, filter } of [
      { event: 'github.pull_request', label: 'Pull request', filter: 'opened' },
      { event: 'github.workflow_run', label: 'Workflow run', filter: 'completed' },
    ]) {
      const eventControl = screen.getByRole('combobox', { name: 'Event' });
      await user.click(eventControl);
      await user.click(await screen.findByRole('option', { name: label }));
      expect(eventControl).toHaveTextContent(label);
      if (event === 'github.pull_request') {
        expect(screen.getByRole('combobox', { name: 'When a pull request is' })).toHaveTextContent(
          'Opened',
        );
      } else {
        const conclusion = screen.getByRole('combobox', { name: 'CI conclusion' });
        expect(conclusion).toHaveTextContent('Any conclusion');
        await user.click(conclusion);
        await user.click(await screen.findByRole('option', { name: 'Failure' }));
        expect(conclusion).toHaveTextContent('Failure');
      }
      const repository = screen.getByLabelText('GitHub repository');
      fireEvent.change(repository, { target: { value: 'owner/repository' } });
      await user.click(screen.getByRole('button', { name: 'Save GitHub trigger paused' }));
      saves++;
      await waitFor(() =>
        expect(mocks.create).toHaveBeenNthCalledWith(saves, {
          arguments: { repository: 'owner/repository' },
          connectorId: 'source-1',
          eventName: event,
          filters: [
            { operator: 'equals', path: ['action'], value: filter },
            ...(event === 'github.workflow_run'
              ? [{ operator: 'equals', path: ['workflow_run', 'conclusion'], value: 'failure' }]
              : []),
          ],
          taskId: 'task-1',
        }),
      );
    }
  });
});
