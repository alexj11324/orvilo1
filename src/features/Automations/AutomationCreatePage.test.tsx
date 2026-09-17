/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AutomationCreatePage from './AutomationCreatePage';

const mocks = vi.hoisted(() => ({
  createTask: vi.fn(),
  navigate: vi.fn(),
  translations: {
    'create.title_placeholder': 'Automation title',
    'templates.investigate_top_datadog_errors.title': 'Investigate top Datadog errors',
  } as Record<string, string>,
  updateTaskStatus: vi.fn(),
}));

// Simulates a lazily-loaded i18n namespace: `t` returns raw keys on the first
// render, then real translations once the namespace bundle has loaded and the
// hook re-renders the component.
vi.mock('react-i18next', async () => {
  const { useEffect, useState } = await import('react');
  return {
    useTranslation: () => {
      const [loaded, setLoaded] = useState(false);
      useEffect(() => {
        setLoaded(true);
      }, []);
      return {
        i18n: { language: 'en-US' },
        t: (key: string, options?: { defaultValue?: string }) =>
          loaded ? (mocks.translations[key] ?? options?.defaultValue ?? key) : key,
      };
    },
  };
});

vi.mock('@/features/NavHeader', () => ({
  default: ({ left, right }: { left?: ReactNode; right?: ReactNode }) => (
    <div>
      {left}
      {right}
    </div>
  ),
}));

vi.mock('@/features/WideScreenContainer', () => ({
  default: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));

vi.mock('@/features/Workspace/WorkspaceLink', () => ({
  default: ({ children, to }: { children?: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ allowed: true, reason: undefined }),
}));

vi.mock('@/store/task', () => ({
  useTaskStore: (selector: any) =>
    selector({ createTask: mocks.createTask, updateTaskStatus: mocks.updateTaskStatus }),
}));

vi.mock('../AgentTasks/features/AssigneeAgentSelector', () => ({
  default: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock('../AgentTasks/features/AssigneeAvatar', () => ({
  default: () => null,
}));

vi.mock('../AgentTasks/shared/useAgentDisplayMeta', () => ({
  useAgentDisplayMeta: () => undefined,
}));

vi.mock('./AutomationTriggerDraft', () => ({
  default: () => <div data-testid="trigger-draft" />,
}));

const renderPage = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <AutomationCreatePage />
    </MemoryRouter>,
  );

describe('AutomationCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fills the template title once the namespace loads instead of freezing the raw key', async () => {
    renderPage('/automations/new?template=investigate_top_datadog_errors');

    const input = await screen.findByPlaceholderText('Automation title');
    expect(input).toHaveValue('Investigate top Datadog errors');
  });

  it('keeps the user-edited name when the namespace finishes loading', async () => {
    renderPage('/automations/new?template=investigate_top_datadog_errors');

    const input = await screen.findByPlaceholderText('Automation title');
    fireEvent.change(input, { target: { value: 'My custom automation' } });
    expect(input).toHaveValue('My custom automation');
  });

  it('leaves the name empty without a template', async () => {
    renderPage('/automations/new');

    const input = await screen.findByPlaceholderText('Automation title');
    expect(input).toHaveValue('');
  });

  it('retries enabling the created task without creating a duplicate', async () => {
    mocks.createTask.mockResolvedValue({ identifier: 'T-42' });
    mocks.updateTaskStatus.mockRejectedValueOnce(new Error('scheduler offline'));
    mocks.updateTaskStatus.mockResolvedValueOnce(undefined);
    renderPage('/automations/new?template=investigate_top_datadog_errors');

    fireEvent.click(await screen.findByRole('button', { name: 'create.submit' }));
    await waitFor(() => expect(mocks.updateTaskStatus).toHaveBeenCalledTimes(1));

    fireEvent.click(await screen.findByRole('button', { name: 'create.retry_enable' }));
    await waitFor(() => expect(mocks.updateTaskStatus).toHaveBeenCalledTimes(2));

    expect(mocks.createTask).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith('/automations/T-42', { replace: true });
  });
});
