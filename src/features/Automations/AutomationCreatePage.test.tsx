/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import AutomationCreatePage from './AutomationCreatePage';
import type AutomationTriggerDraftComponent from './AutomationTriggerDraft';
import type { TriggerDraft } from './AutomationTriggerDraft';

const mocks = vi.hoisted(() => ({
  createTask: vi.fn(),
  toastError: vi.fn(),
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
        t: (key: string, options?: { count?: number; interval?: string; defaultValue?: string }) =>
          loaded
            ? options?.count !== undefined
              ? `${key}:${options.count}`
              : (mocks.translations[key] ?? options?.interval ?? options?.defaultValue ?? key)
            : key,
      };
    },
  };
});

vi.mock('@/components/toast', () => ({ toast: { error: mocks.toastError } }));

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
  default: ({ disabled, onChange }: { disabled?: boolean; onChange: (draft: unknown) => void }) => (
    <>
      <button
        disabled={disabled}
        onClick={() =>
          onChange({ kind: 'schedule', pattern: '0 9 * * *', timezone: 'UTC', maxExecutions: 7 })
        }
      >
        Configure limit
      </button>
      <button disabled={disabled} onClick={() => onChange({ kind: 'event' })}>
        Configure event
      </button>
    </>
  ),
}));

const renderPage = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <AutomationCreatePage />
    </MemoryRouter>,
  );

describe('AutomationCreatePage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createTask.mockImplementation(async (params) => ({
      ...params,
      assigneeAgentId: params.assigneeAgentId ?? null,
      identifier: 'T-42',
    }));
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

  it('saves an event automation paused and opens its settings without enabling Task scheduling', async () => {
    renderPage('/automations/new?template=investigate_top_datadog_errors');
    fireEvent.click(await screen.findByRole('button', { name: 'Configure event' }));
    fireEvent.click(await screen.findByRole('button', { name: 'create.save_event_draft' }));
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith('/automations/T-42', { replace: true }),
    );
    expect(mocks.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ automationMode: 'event', status: 'paused' }),
    );
    expect(mocks.updateTaskStatus).not.toHaveBeenCalled();
  });

  it('submits the configured execution limit', async () => {
    mocks.updateTaskStatus.mockResolvedValue(undefined);
    renderPage('/automations/new?template=investigate_top_datadog_errors');
    fireEvent.click(await screen.findByRole('button', { name: 'Configure limit' }));
    fireEvent.click(await screen.findByRole('button', { name: 'create.submit' }));
    await waitFor(() =>
      expect(mocks.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          config: { schedule: { maxExecutions: 7 } },
          schedulePattern: '0 9 * * *',
          scheduleTimezone: 'UTC',
        }),
      ),
    );
  });

  it('opens the saved draft without enabling if persistence loses a stopping condition', async () => {
    mocks.createTask.mockImplementation(async (params) => ({
      ...params,
      assigneeAgentId: null,
      config: {},
      identifier: 'T-42',
    }));
    renderPage('/automations/new?template=investigate_top_datadog_errors');
    fireEvent.click(await screen.findByRole('button', { name: 'Configure limit' }));
    fireEvent.click(await screen.findByRole('button', { name: 'create.submit' }));
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith('/automations/T-42', { replace: true }),
    );
    expect(mocks.updateTaskStatus).not.toHaveBeenCalled();
    expect(mocks.createTask).toHaveBeenCalledTimes(1);
  });

  it('keeps unsaved configuration editable when creation fails', async () => {
    mocks.createTask.mockRejectedValueOnce(new Error('offline'));
    renderPage('/automations/new?template=investigate_top_datadog_errors');
    fireEvent.click(await screen.findByRole('button', { name: 'create.submit' }));
    await waitFor(() => expect(screen.getByPlaceholderText('Automation title')).toBeEnabled());
    fireEvent.change(screen.getByPlaceholderText('Automation title'), {
      target: { value: 'Updated draft' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'create.submit' }));
    await waitFor(() => expect(mocks.createTask).toHaveBeenCalledTimes(2));
    expect(mocks.createTask).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'Updated draft' }),
    );
  });

  it('retries enabling the created task without creating a duplicate', async () => {
    mocks.updateTaskStatus.mockRejectedValueOnce(new Error('scheduler offline'));
    mocks.updateTaskStatus.mockResolvedValueOnce(undefined);
    renderPage('/automations/new?template=investigate_top_datadog_errors');

    fireEvent.click(await screen.findByRole('button', { name: 'create.submit' }));
    await waitFor(() => expect(mocks.updateTaskStatus).toHaveBeenCalledTimes(1));

    expect(await screen.findByPlaceholderText('Automation title')).toBeDisabled();
    expect(screen.getByPlaceholderText('create.instructions_placeholder')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Configure limit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'create.open_draft' })).toBeEnabled();

    fireEvent.click(await screen.findByRole('button', { name: 'create.retry_enable' }));
    await waitFor(() => expect(mocks.updateTaskStatus).toHaveBeenCalledTimes(2));

    expect(mocks.createTask).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith('/automations/T-42', { replace: true });
  });
});

// Exercise the real interval editor in the existing creation-page regression suite.
vi.mock('../AgentTasks/AgentTaskDetail/scheduler/SchedulerForm', () => ({
  default: () => null,
}));

let ActualAutomationTriggerDraft: typeof AutomationTriggerDraftComponent;

const DraftEditor = ({ initial }: { initial: TriggerDraft }) => {
  const [draft, setDraft] = useState<TriggerDraft | null>(initial);
  return (
    <>
      <ActualAutomationTriggerDraft draft={draft} onChange={setDraft} />
      <output data-testid="saved-interval">{draft?.heartbeatInterval}</output>
    </>
  );
};

describe('Automation creation interval editor', () => {
  beforeAll(async () => {
    const actual = await vi.importActual<{ default: typeof AutomationTriggerDraftComponent }>(
      './AutomationTriggerDraft',
    );
    ActualAutomationTriggerDraft = actual.default;
  });

  it('persists the same ten-minute interval shown after switching from hours to minutes', async () => {
    const user = userEvent.setup();
    render(<DraftEditor initial={{ heartbeatInterval: 3600, kind: 'heartbeat' }} />);
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'taskSchedule.minutes' }));

    await waitFor(() => expect(screen.getByTestId('saved-interval')).toHaveTextContent('600'));
    expect(screen.getByRole('textbox')).toHaveValue('10');
    expect(screen.getByText('taskSchedule.unit.minute:10')).toBeInTheDocument();
  });

  it('displays the persisted draft interval when reopened rather than a default hour', async () => {
    render(<DraftEditor initial={{ heartbeatInterval: 900, kind: 'heartbeat' }} />);
    expect(screen.getByRole('textbox')).toHaveValue('15');
    expect(await screen.findByText('taskSchedule.unit.minute:15')).toBeInTheDocument();
    expect(screen.getByTestId('saved-interval')).toHaveTextContent('900');
  });

  it('sets the displayed schedule defaults when switching back from an interval', async () => {
    const onChange = vi.fn();
    render(
      <ActualAutomationTriggerDraft
        draft={{ heartbeatInterval: 3600, kind: 'heartbeat' }}
        onChange={onChange}
      />,
    );
    fireEvent.click(await screen.findByRole('tab', { name: 'taskSchedule.schedulerTab' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'schedule',
        pattern: '0 9 * * *',
        timezone: expect.any(String),
      }),
    );
  });
});
