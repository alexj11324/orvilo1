import type { HeterogeneousAgentPermissionCatalog } from '@orvilo/types';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { PermissionSelector } from './PermissionSelector';

const localDiscovery = vi.hoisted(() => ({ available: true }));
vi.mock('@/services/electron/heterogeneousAgent', () => ({
  heterogeneousAgentService: {
    get supportsLocalExecution() {
      return localDiscovery.available;
    },
  },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const discovery = vi.hoisted(() => ({
  data: undefined as HeterogeneousAgentPermissionCatalog[] | undefined,
  error: undefined as Error | undefined,
  isLoading: false,
  isValidating: false,
  mutate: vi.fn(),
}));
vi.mock('swr', () => ({ default: () => discovery }));

beforeEach(() => {
  localDiscovery.available = true;
  discovery.data = [
    {
      configId: 'mode',
      name: 'Permission mode',
      currentValue: 'auto',
      options: [
        { value: 'manual', name: 'Manual' },
        { value: 'auto', name: 'Auto' },
      ],
    },
  ];
  discovery.error = undefined;
  discovery.isLoading = false;
  discovery.isValidating = false;
  discovery.mutate.mockReset();
});
afterEach(cleanup);
vi.mock('@/components/toast', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/features/ChatInput/hooks/useAgentId', () => ({
  useCurrentComposerAgentId: () => () => 'agent',
}));
vi.mock('@/helpers/executionTarget', () => ({ resolveExecutionTarget: () => 'local' }));
vi.mock('@/hooks/useEffectiveWorkingDirectory', () => ({
  useEffectiveWorkingDirectory: () => '/tmp',
}));
vi.mock('@/hooks/useTopicAgencyConfig', () => ({
  useTopicAgencyConfig: () => ({
    agencyConfig: { executionTarget: 'local', heterogeneousProvider: { type: 'claude-code' } },
    workspaceScoped: false,
    isPreferenceLoading: false,
  }),
}));
vi.mock('@/services/heterogeneousAgent', () => ({
  heterogeneousAgentCatalogService: { listPermissions: vi.fn() },
}));
vi.mock('@/store/chat', () => ({
  useChatStore: (selector: (state: unknown) => unknown) => selector({ activeAgentId: 'agent' }),
}));
vi.mock('@/store/chat/selectors', () => ({
  topicSelectors: { activeTopicIdForAgent: () => () => undefined },
}));
vi.mock('../HeteroModel/useModelCatalog', () => ({ fingerprintConfig: () => 'config' }));

it('does not offer a local permission probe when the transport is unavailable', () => {
  localDiscovery.available = false;
  render(<PermissionSelector agentId="agent" />);
  const trigger = screen.getByRole('button', { name: 'heteroAgent.permission.label' });
  expect(trigger).toBeDisabled();
  fireEvent.click(trigger);
  expect(screen.queryByText('Permission mode')).not.toBeInTheDocument();
});

it('opens loaded advertised permission groups with real Base UI controls', async () => {
  render(<PermissionSelector agentId="agent" />);
  fireEvent.click(screen.getByRole('button', { name: 'heteroAgent.permission.label' }));
  expect(await screen.findByText('Permission mode')).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Manual' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Auto' })).toHaveAttribute('aria-current', 'true');
});

it('lets the user recover from failed permission discovery without leaving the menu', async () => {
  const catalog = discovery.data;
  discovery.data = undefined;
  discovery.error = new Error('Device temporarily unavailable');
  discovery.mutate.mockImplementation(async () => {
    discovery.data = catalog;
    discovery.error = undefined;
    return catalog;
  });
  const { rerender } = render(<PermissionSelector agentId="agent" />);
  fireEvent.click(screen.getByRole('button', { name: 'heteroAgent.permission.label' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'retry' }));
  rerender(<PermissionSelector agentId="agent" />);
  expect(await screen.findByRole('menuitem', { name: 'Manual' })).toBeInTheDocument();
  expect(screen.queryByText('heteroAgent.permission.unavailable')).not.toBeInTheDocument();
});
