/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type * as React from 'react';
import type { MouseEventHandler, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

    useParamsMock.mockReturnValue({ aid: 'agt_eH4zL98zBx5u', topicId: 'tpc_2FCHvjS7d4CA' });
  });

  it('offers Issues and search without sidebar creation or a duplicate Home', () => {
    usePathnameMock.mockReturnValue('/agent/agent-1');
    const { container } = render(<Nav />);
    expect(Array.from(container.querySelectorAll('a, button'), (item) => item.textContent)).toEqual(
      ['common:tab.issues', 'tab.search'],
    );
    expect(screen.queryByText('actions.addNewTopic')).not.toBeInTheDocument();
    expect(screen.queryByText('tab.home')).not.toBeInTheDocument();
  });

  it('lets modifier-clicking Issues keep the native link destination', () => {
    useActiveWorkspaceSlugMock.mockReturnValue('acme');
    render(<Nav />);
    const issues = screen.getByRole('link', { name: 'common:tab.issues' });
    expect(issues).toHaveAttribute('href', '/acme/tasks');
    fireEvent.click(issues, { metaKey: true });
    expect(appNavigateMock).not.toHaveBeenCalled();
  });

  it.each([
    [null, '/tasks'],
    ['acme', '/acme/tasks'],
  ])('reaches the same Issues destination in workspace %s', (slug, href) => {
    useActiveWorkspaceSlugMock.mockReturnValue(slug);
    usePathnameMock.mockReturnValue('/chat/new');
    render(<Nav />);
    const issues = screen.getByRole('link', { name: 'common:tab.issues' });
    expect(issues).toHaveAttribute('href', href);
    fireEvent.click(issues);
    expect(appNavigateMock).toHaveBeenCalledWith(href, { escape: true });
    expect(openNewTopicOrSaveTopicMock).not.toHaveBeenCalled();
  });
});
