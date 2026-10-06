/**
 * @vitest-environment happy-dom
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import type { MouseEventHandler, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toast } from '@/components/toast';

import Nav from './Nav';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, memo: (component: unknown) => component };
});

vi.mock('@/components/toast', async (importOriginal) => {
  const actual = await importOriginal<{ toast: Record<string, unknown> }>();
  return { ...actual, toast: { ...actual.toast, error: vi.fn() } };
});

const appNavigateMock = vi.hoisted(() => vi.fn());
const useActiveWorkspaceSlugMock = vi.hoisted(() => vi.fn());
const mutateMock = vi.hoisted(() => vi.fn());
const openNewTopicOrSaveTopicMock = vi.hoisted(() => vi.fn());
const pushMock = vi.hoisted(() => vi.fn());
const chatState = vi.hoisted(() => ({ activeTopicId: undefined as string | undefined }));
const switchTopicMock = vi.hoisted(() => vi.fn());
const toggleCommandMenuMock = vi.hoisted(() => vi.fn());
const useParamsMock = vi.hoisted(() => vi.fn());
const usePathnameMock = vi.hoisted(() => vi.fn());
const permissionMock = vi.hoisted(() => ({
  create_content: true,
  edit_own_content: true,
}));
const labMock = vi.hoisted(() => ({
  enableSelfLearning: true,
  enableTopicAcceptance: true,
}));
vi.mock('@/features/ResourcePermission/useResourceAccess', () => ({
  useResourceAccess: () => ({ canEditResource: true, isAccessResolved: true }),
}));

vi.mock('react-router', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = (await vi.importActual('react-router')) as typeof import('react-router');

  return {
    ...actual,
    useParams: useParamsMock,
  };
});

vi.mock('@/business/client/hooks/useActiveWorkspaceSlug', () => ({
  useActiveWorkspaceSlug: useActiveWorkspaceSlugMock,
}));

vi.mock('@/features/Electron/navigation/appNavigate', () => ({
  appNavigate: appNavigateMock,
}));

vi.mock('@/features/NavPanel/components/NavItem', () => ({
  default: ({
    active,
    disabled,
    href,
    onClick,
    title,
  }: {
    active?: boolean;
    disabled?: boolean;
    href?: string;
    onClick?: MouseEventHandler<HTMLElement>;
    title: ReactNode;
  }) =>
    href ? (
      <a href={href} onClick={onClick}>
        {title}
      </a>
    ) : (
      <button data-active={String(active)} disabled={disabled} type="button" onClick={onClick}>
        {title}
      </button>
    ),
}));

vi.mock('@/hooks/useQueryRoute', () => ({
  useQueryRoute: () => ({
    push: pushMock,
  }),
}));

vi.mock('@/hooks/useActiveLocation', () => ({
  useActiveLocation: () => ({ hash: '', pathname: usePathnameMock(), search: '' }),
}));

vi.mock('@/libs/swr', () => ({
  useActionSWR: () => ({
    mutate: mutateMock,
  }),
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: (action: keyof typeof permissionMock) => ({
    allowed: permissionMock[action],
    reason: permissionMock[action] ? '' : 'requires member',
  }),
}));

// Nav no longer reads the agent store, but its transitive imports pull it in —
// and the real module drags `lucide-react` icon internals through this file's
// icon mock. Keep the stub so the module graph stays inert here.
vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (state: Record<string, unknown>) => unknown) => selector({}),
}));

vi.mock('@/store/chat', () => ({
  useChatStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        ...chatState,
        openNewTopicOrSaveTopic: openNewTopicOrSaveTopicMock,
        switchTopic: switchTopicMock,
      }),
    { getState: () => chatState },
  ),
}));

vi.mock('@/store/global', () => ({
  useGlobalStore: (selector: (state: { toggleCommandMenu: (open: boolean) => void }) => unknown) =>
    selector({ toggleCommandMenu: toggleCommandMenuMock }),
}));

vi.mock('@/store/serverConfig', () => ({
  featureFlagsSelectors: (state: { featureFlags: { isAgentEditable: boolean } }) =>
    state.featureFlags,
  useServerConfigStore: (
    selector: (state: { featureFlags: { isAgentEditable: boolean } }) => unknown,
  ) => selector({ featureFlags: { isAgentEditable: true } }),
}));

vi.mock('@/store/user', () => ({
  useUserStore: (selector: (state: unknown) => unknown) =>
    selector({ preference: { lab: labMock } }),
}));

vi.mock('@/store/user/selectors', () => ({
  labPreferSelectors: {
    enableSelfLearning: (state: { preference: { lab?: { enableSelfLearning?: boolean } } }) =>
      state.preference.lab?.enableSelfLearning ?? false,
    enableTopicAcceptance: (state: { preference: { lab?: { enableTopicAcceptance?: boolean } } }) =>
      state.preference.lab?.enableTopicAcceptance ?? false,
  },
}));

describe('Agent sidebar header nav', () => {
  beforeEach(() => {
    appNavigateMock.mockReset();
    useActiveWorkspaceSlugMock.mockReset().mockReturnValue(null);
    chatState.activeTopicId = undefined;
    mutateMock.mockReset().mockImplementation((data) => data);
    openNewTopicOrSaveTopicMock.mockReset();
    pushMock.mockReset();
    switchTopicMock.mockReset();
    toggleCommandMenuMock.mockReset();
    useParamsMock.mockReset();
    usePathnameMock.mockReset();
    permissionMock.create_content = true;
    permissionMock.edit_own_content = true;
    labMock.enableSelfLearning = true;
    labMock.enableTopicAcceptance = true;

    useParamsMock.mockReturnValue({ aid: 'agt_eH4zL98zBx5u', topicId: 'tpc_2FCHvjS7d4CA' });
  });

  it('returns to the agent chat route after opening a new topic from a topic page document route', async () => {
    usePathnameMock.mockReturnValue(
      '/agent/agt_eH4zL98zBx5u/tpc_2FCHvjS7d4CA/page/docs_9B8hFkmEOZyPZb60',
    );

    render(<Nav />);

    fireEvent.click(screen.getByRole('button', { name: 'actions.addNewTopic' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/agent/agt_eH4zL98zBx5u'));
    expect(mutateMock).toHaveBeenCalledTimes(1);
  });

  it('pushes the agent chat route even when already on it', async () => {
    usePathnameMock.mockReturnValue('/agent/agt_eH4zL98zBx5u');

    render(<Nav />);

    fireEvent.click(screen.getByRole('button', { name: 'actions.addNewTopic' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/agent/agt_eH4zL98zBx5u'));
    expect(mutateMock).toHaveBeenCalledTimes(1);
  });

  it('waits for the topic action before navigating away from its source conversation', async () => {
    usePathnameMock.mockReturnValue('/agent/agt_eH4zL98zBx5u/tpc_old');
    let complete!: () => void;
    const pending = new Promise<void>((resolve) => {
      complete = resolve;
    });
    mutateMock.mockReturnValue(pending);
    openNewTopicOrSaveTopicMock.mockReturnValue(pending);
    render(<Nav />);
    fireEvent.click(screen.getByRole('button', { name: 'actions.addNewTopic' }));
    expect(pushMock).not.toHaveBeenCalled();
    await act(async () => {
      complete();
    });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/agent/agt_eH4zL98zBx5u'));
  });

  it('does not overwrite a newer topic started while the blank-topic refresh is pending', async () => {
    usePathnameMock.mockReturnValue('/agent/agt_eH4zL98zBx5u/tpc_old');
    let complete!: () => void;
    openNewTopicOrSaveTopicMock.mockReturnValue(
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
    );
    render(<Nav />);
    fireEvent.click(screen.getByRole('button', { name: 'actions.addNewTopic' }));
    chatState.activeTopicId = 'tpc_new_send';
    await act(async () => {
      complete();
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('does not overwrite a newer navigation while the topic action is pending', async () => {
    usePathnameMock.mockReturnValue('/agent/agt_eH4zL98zBx5u/tpc_old');
    let complete!: () => void;
    openNewTopicOrSaveTopicMock.mockReturnValue(
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
    );
    const { rerender } = render(<Nav />);
    fireEvent.click(screen.getByRole('button', { name: 'actions.addNewTopic' }));
    usePathnameMock.mockReturnValue('/agent/agt_eH4zL98zBx5u/tasks');
    rerender(<Nav />);
    await act(async () => {
      complete();
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('keeps the source route on failure and allows retry without duplicating pending actions', async () => {
    usePathnameMock.mockReturnValue('/agent/agt_eH4zL98zBx5u/tpc_old');
    let reject!: (error: Error) => void;
    const pending = new Promise<void>((_, fail) => {
      reject = fail;
    });
    openNewTopicOrSaveTopicMock.mockReturnValueOnce(pending);
    render(<Nav />);
    const button = screen.getByRole('button', { name: 'actions.addNewTopic' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(openNewTopicOrSaveTopicMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      reject(new Error('offline'));
    });
    expect(pushMock).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('unknownError');
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    expect(openNewTopicOrSaveTopicMock).toHaveBeenCalledTimes(2);
  });

  it('disables starting a new topic for workspace viewers', () => {
    permissionMock.create_content = false;
    usePathnameMock.mockReturnValue('/agent/agt_eH4zL98zBx5u/profile');

    render(<Nav />);

    const startButton = screen.getByRole('button', { name: 'actions.addNewTopic' });
    expect(startButton).toBeDisabled();

    fireEvent.click(startButton);

    expect(pushMock).not.toHaveBeenCalled();
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('opens workspace tasks from a new conversation without an agent route parameter', () => {
    useParamsMock.mockReturnValue({});
    usePathnameMock.mockReturnValue('/chat/new');
    render(<Nav />);
    fireEvent.click(screen.getByRole('button', { name: 'tab.tasks' }));
    expect(pushMock).toHaveBeenCalledWith('/tasks');
  });

  it('navigates to the agent tasks page', () => {
    usePathnameMock.mockReturnValue('/agent/agt_eH4zL98zBx5u');

    render(<Nav />);
    fireEvent.click(screen.getByRole('button', { name: 'tab.tasks' }));

    expect(switchTopicMock).toHaveBeenCalledWith(null, { skipRefreshMessage: true });
    expect(pushMock).toHaveBeenCalledWith('/agent/agt_eH4zL98zBx5u/tasks');
  });

  it.each(['/agent/agt_eH4zL98zBx5u/tasks', '/agent/agt_eH4zL98zBx5u/task/task_2FCHvjS7d4CA'])(
    'keeps the tasks entry active on %s',
    (pathname) => {
      usePathnameMock.mockReturnValue(pathname);

      render(<Nav />);

      expect(screen.getByRole('button', { name: 'tab.tasks' })).toHaveAttribute(
        'data-active',
        'true',
      );
    },
  );

  it('removes goals and self-learning entries even when their labs toggles are enabled', () => {
    usePathnameMock.mockReturnValue('/agent/agt_eH4zL98zBx5u');

    render(<Nav />);

    expect(screen.queryByText('goalList.title')).toBeNull();
    expect(screen.queryByText('title')).toBeNull();
  });

  it('orders home, new topic, search, and tasks in one navigation list', () => {
    usePathnameMock.mockReturnValue('/agent/agt_eH4zL98zBx5u');

    const { container } = render(<Nav />);

    expect(Array.from(container.querySelectorAll('a, button'), (item) => item.textContent)).toEqual(
      ['tab.home', 'actions.addNewTopic', 'tab.search', 'tab.tasks'],
    );
  });

  it.each([
    [null, '/'],
    ['acme', '/acme/'],
  ])('returns home in workspace %s with its native link destination', (slug, href) => {
    useActiveWorkspaceSlugMock.mockReturnValue(slug);
    usePathnameMock.mockReturnValue('/agent/agt_eH4zL98zBx5u');

    render(<Nav />);
    const home = screen.getByRole('link', { name: 'tab.home' });
    expect(home).toHaveAttribute('href', href);
    fireEvent.click(home);

    expect(appNavigateMock).toHaveBeenCalledWith(href, { escape: true });
  });
});
