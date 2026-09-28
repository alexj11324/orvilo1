import { AccordionRoot } from '@lobehub/ui/base-ui';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import WorkspaceSection from './WorkspaceSection';

interface CapturedItem {
  children?: CapturedItem[];
  key?: string;
  label?: React.ReactNode;
  onClick?: () => void;
  type?: string;
}

const mocks = vi.hoisted(() => ({
  dropdownItems: undefined as CapturedItem[] | undefined,
  navigate: vi.fn(),
  openCustomizeSidebarModal: vi.fn(),
}));

vi.mock('@lobehub/ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ContextMenuTrigger: ({ children }: { children: React.ReactNode }) => children,
  DropdownMenu: ({ children, items }: { children: React.ReactNode; items: CapturedItem[] }) => {
    mocks.dropdownItems = items;
    return <div>{children}</div>;
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => 'workspace-1',
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceSlug', () => ({
  useActiveWorkspaceSlug: () => null,
}));

vi.mock('@/features/NavPanel/components/NavItem', () => ({
  default: ({ title }: { title: string }) => <span>{title}</span>,
}));

vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));

vi.mock('@/hooks/useActiveTabKey', () => ({
  useActiveTabKey: () => 'home',
}));

vi.mock('@/store/global', () => ({
  useGlobalStore: (selector: (state: unknown) => unknown) =>
    selector({ updateSystemStatus: vi.fn() }),
}));

vi.mock('@/store/global/selectors', () => ({
  systemStatusSelectors: { hiddenSidebarSections: () => () => [] },
}));

vi.mock('./CustomizeSidebarModal', () => ({
  openCustomizeSidebarModal: mocks.openCustomizeSidebarModal,
}));

const renderSection = () =>
  render(
    <MemoryRouter>
      <AccordionRoot value={['workspace']}>
        <WorkspaceSection itemKey="workspace" />
      </AccordionRoot>
    </MemoryRouter>,
  );

describe('WorkspaceSection More menu', () => {
  beforeEach(() => {
    mocks.dropdownItems = undefined;
    mocks.navigate.mockReset();
    mocks.openCustomizeSidebarModal.mockReset();
  });

  it('opens with the Linear "Showing all items" group, a divider, then the Orvilo surfaces', () => {
    renderSection();

    const items = mocks.dropdownItems;
    expect(items).toBeDefined();

    // Top-level order: header group → divider → the four kept Orvilo entries.
    expect(items?.map((item) => item.key ?? item.type)).toEqual([
      'showingAllItems',
      'divider',
      'agents',
      'automations',
      'resource',
      'workspaceSettings',
    ]);

    // The header is a non-interactive group label, not a clickable item.
    const group = items?.[0];
    expect(group?.type).toBe('group');
    expect(group?.label).toBe('navPanel.showingAllItems');
    expect(group?.onClick).toBeUndefined();

    expect(group?.children?.map((item) => [item.key, item.label])).toEqual([
      ['members', 'navPanel.members'],
      ['teams', 'tab.teams'],
      ['customizeSidebar', 'navPanel.customizeSidebar'],
    ]);
  });

  it('routes Members/Teams and opens the customize modal from the group items', () => {
    renderSection();

    const children = mocks.dropdownItems?.[0]?.children;
    expect(children).toHaveLength(3);
    const [members, teams, customize] = children ?? [];

    members.onClick?.();
    expect(mocks.navigate).toHaveBeenCalledWith('/members');

    teams.onClick?.();
    expect(mocks.navigate).toHaveBeenCalledWith('/teams');

    customize.onClick?.();
    expect(mocks.openCustomizeSidebarModal).toHaveBeenCalledTimes(1);
  });

  it('keeps the existing Orvilo entries working after the divider', () => {
    renderSection();

    const agents = mocks.dropdownItems?.[2];
    const automations = mocks.dropdownItems?.[3];
    const resource = mocks.dropdownItems?.[4];
    const workspaceSettings = mocks.dropdownItems?.[5];

    agents?.onClick?.();
    expect(mocks.navigate).toHaveBeenCalledWith('/agents');

    automations?.onClick?.();
    expect(mocks.navigate).toHaveBeenCalledWith('/automations');

    resource?.onClick?.();
    expect(mocks.navigate).toHaveBeenCalledWith('/resource');

    workspaceSettings?.onClick?.();
    expect(mocks.navigate).toHaveBeenCalledWith('/settings');
  });

  it('still renders the More row as the dropdown trigger', () => {
    renderSection();

    expect(screen.getByText('navPanel.more')).toBeInTheDocument();
  });
});
