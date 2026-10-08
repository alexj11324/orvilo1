/**
 * @vitest-environment happy-dom
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useGroupDropdownMenu } from './useDropdownMenu';

const createConnectAgentMenuItemMock = vi.hoisted(() => vi.fn(() => ({ key: 'newPlatformAgent' })));

vi.mock('@lobehub/ui', () => ({
  Icon: () => null,
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => null,
}));

vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: {},
}));

vi.mock('@/store/home', () => ({
  useHomeStore: (selector: (state: { refreshAgentList: () => void }) => unknown) =>
    selector({ refreshAgentList: vi.fn() }),
}));

vi.mock('../../../../hooks', () => ({
  useCreateMenuItems: () => ({
    createAgentMenuItem: () => ({ key: 'newAgent' }),
    createConnectAgentMenuItem: createConnectAgentMenuItemMock,
    createGroupChatMenuItem: () => ({ key: 'newGroupChat' }),
  }),
  useSessionGroupMenuItems: () => ({
    configGroupMenuItem: () => ({ key: 'config' }),
    deleteGroupMenuItem: () => ({ key: 'delete' }),
    renameGroupMenuItem: () => ({ key: 'rename' }),
  }),
}));

const getMenuLayout = (items: ReturnType<typeof useGroupDropdownMenu>) =>
  (items ?? []).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    if ('type' in item && item.type === 'divider') return ['divider'];
    if ('key' in item && item.key) return [item.key];
    return [];
  });

describe('Category useGroupDropdownMenu', () => {
  it('keeps category organization without sidebar creation actions', () => {
    const { result } = renderHook(() =>
      useGroupDropdownMenu({
        anchor: null,
        id: 'group-1',
        isCustomGroup: true,
        name: 'Coding',
        openConfigGroupModal: vi.fn(),
        visibility: 'private',
      }),
    );

    expect(getMenuLayout(result.current)).toEqual(['rename', 'config', 'divider', 'delete']);
    expect(createConnectAgentMenuItemMock).not.toHaveBeenCalled();
  });
});
