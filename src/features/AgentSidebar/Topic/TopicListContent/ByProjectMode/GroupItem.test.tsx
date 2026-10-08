/**
 * @vitest-environment happy-dom
 */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Accordion } from '@/components/ui/accordion';

import GroupItem from './GroupItem';

const commitAgentDefaultMock = vi.hoisted(() => vi.fn());
const switchTopicMock = vi.hoisted(() => vi.fn());
const routerPushMock = vi.hoisted(() => vi.fn());
const routeParamsMock = vi.hoisted(() => ({ aid: 'agent-1' as string | undefined }));
const agentStoreStateMock = vi.hoisted(() => ({ activeAgentId: 'agent-1' as string | undefined }));
const activeWorkspaceSlugMock = vi.hoisted(() => ({ value: 'orvilo' as string | null }));

vi.mock('react-router', () => ({
  useParams: () => routeParamsMock,
}));

vi.mock('@/components/ui/accordion', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...(await import('~base-ui-stubs')).baseUiStubs,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { directory?: string }) =>
      options?.directory ? `${key}:${options.directory}` : key,
  }),
}));

vi.mock('@/components/RingLoading', () => ({
  default: () => <span />,
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceSlug', () => ({
  useActiveWorkspaceSlug: () => activeWorkspaceSlugMock.value,
}));

vi.mock('@/const/version', () => ({ isDesktop: true }));

vi.mock('@/features/ChatInput/ControlBar/useCommitWorkingDirectory', () => ({
  useCommitWorkingDirectory: () => ({
    commitAgentDefault: commitAgentDefaultMock,
  }),
}));

vi.mock('@/helpers/executionTarget', () => ({
  resolveExecutionTarget: () => 'device',
}));

vi.mock('@/hooks/useQueryRoute', () => ({
  useQueryRoute: () => ({
    push: routerPushMock,
  }),
}));

vi.mock('@/hooks/useActiveLocation', () => ({
  useActiveLocation: () => ({ hash: '', pathname: '/orvilo/agent/agent-1/profile', search: '' }),
}));

vi.mock('@/store/agent', () => ({
  getAgentStoreState: () => agentStoreStateMock,
  useAgentStore: (selector: (state: { activeAgentId?: string }) => unknown) =>
    selector(agentStoreStateMock),
}));

vi.mock('@/store/agent/selectors', () => ({
  agentByIdSelectors: {
    getAgencyConfigById: () => () => ({ boundDeviceId: 'device-1' }),
    isAgentHeterogeneousById: () => () => true,
    isWorkspaceAgentById: () => () => false,
  },
  agentSelectors: {
    getAgentConfigById: () => () => undefined,
  },
}));

vi.mock('@/store/chat', () => {
  const useChatStore = (selector: (state: object) => unknown) => selector({});
  useChatStore.getState = () => ({ switchTopic: switchTopicMock });
  return { useChatStore };
});

vi.mock('@/store/chat/selectors', () => ({
  operationSelectors: {
    unreadCompletedCountForTopics: () => () => 0,
    visiblyRunningTopicIds: () => new Set<string>(),
  },
}));

vi.mock('../../List/Item', () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

describe('Project topic group item', () => {
  beforeEach(() => {
    commitAgentDefaultMock.mockReset();
    switchTopicMock.mockReset();
    routerPushMock.mockReset();
    routeParamsMock.aid = 'agent-1';
    agentStoreStateMock.activeAgentId = 'agent-1';
    activeWorkspaceSlugMock.value = 'orvilo';
  });

  it('keeps project conversations readable without a sidebar create action', () => {
    render(
      <Accordion multiple>
        <GroupItem
          expanded
          group={{ children: [], id: 'project:/Users/me/project', title: 'project' }}
        />
      </Accordion>,
    );
    expect(
      screen.queryByRole('button', { name: 'actions.addNewTopicInProject:project' }),
    ).not.toBeInTheDocument();
    expect(commitAgentDefaultMock).not.toHaveBeenCalled();
    expect(routerPushMock).not.toHaveBeenCalled();
  });
});
