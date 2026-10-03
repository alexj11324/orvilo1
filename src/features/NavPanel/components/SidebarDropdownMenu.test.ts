import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import type * as OrviloPlatform from '@/platform';
import { electronSystemService } from '@/services/electron/system';

import SidebarContextMenu from './SidebarContextMenu';
import SidebarDropdownMenu from './SidebarDropdownMenu';

describe('SidebarDropdownMenu', () => {
  it('runs nested commands with their key path and blocks disabled commands', async () => {
    const nestedCommand = vi.fn();
    const disabledCommand = vi.fn();

    render(
      createElement(SidebarDropdownMenu, {
        children: createElement('button', { type: 'button' }, 'Open menu'),
        items: [
          {
            children: [{ key: 'nested', label: 'Nested command', onClick: nestedCommand }],
            key: 'parent',
            label: 'Parent command',
          },
          {
            disabled: true,
            key: 'disabled',
            label: 'Disabled command',
            onClick: disabledCommand,
          },
        ],
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const disabled = await screen.findByRole('menuitem', { name: 'Disabled command' });
    fireEvent.click(disabled);
    expect(disabledCommand).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Parent command' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Nested command' }));

    expect(nestedCommand).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'nested', keyPath: ['parent', 'nested'] }),
    );
  });

  it('uses a WorkspaceLink label as the menu item anchor', async () => {
    render(
      createElement(
        MemoryRouter,
        null,
        createElement(SidebarDropdownMenu, {
          children: createElement('button', { type: 'button' }, 'Open workspace menu'),
          items: [
            {
              key: 'settings',
              label: createElement(WorkspaceLink, { to: '/settings' }, 'Settings'),
            },
          ],
        }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open workspace menu' }));
    const settings = await screen.findByRole('link', { name: 'Settings' });

    expect(settings.tagName).toBe('A');
    expect(settings).toHaveAttribute('href', '/settings');
    expect(settings.querySelector('a, button')).toBeNull();
  });
});

vi.mock('@/services/electron/system', () => ({
  electronSystemService: { closePopupContextMenu: vi.fn(), popupContextMenu: vi.fn() },
}));
// HostPort — the native popup moved behind getHostPort().menu (WD-02); bridge
// the same service spies so the assertions keep characterizing the routing.
vi.mock('@/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof OrviloPlatform>();
  return {
    ...actual,
    getHostPort: () => ({
      ...actual.getHostPort(),
      menu: {
        closePopupContextMenu: () => electronSystemService.closePopupContextMenu(),
        popupContextMenu: (...args: any[]) => electronSystemService.popupContextMenu(...args),
      },
    }),
  };
});
beforeEach(() => {
  vi.clearAllMocks();
  delete window.orviloEnv;
});
afterEach(() => {
  delete window.orviloEnv;
});
describe('SidebarContextMenu', () => {
  it('routes macOS commands through the existing native popup without a web menu', async () => {
    window.orviloEnv = { platform: 'darwin' };
    const command = vi.fn();
    vi.mocked(electronSystemService.popupContextMenu).mockResolvedValue({ clickedId: '0' });
    render(
      createElement(SidebarContextMenu, {
        children: createElement('button', null, 'Native commands'),
        items: [{ key: 'copy', label: 'Copy', onClick: command }],
      }),
    );
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Native commands' }));
    await vi.waitFor(() => expect(command).toHaveBeenCalledTimes(1));
    expect(electronSystemService.popupContextMenu).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(command).toHaveBeenCalledWith(expect.objectContaining({ key: 'copy' }));
  });
  it('opens stock context primitives on web and retains disabled/nested commands', async () => {
    const nestedCommand = vi.fn();
    const disabledCommand = vi.fn();
    render(
      createElement(SidebarContextMenu, {
        children: createElement('button', null, 'Web commands'),
        items: [
          {
            children: [{ key: 'nested', label: 'Nested command', onClick: nestedCommand }],
            key: 'parent',
            label: 'Parent command',
          },
          {
            disabled: true,
            key: 'disabled',
            label: 'Disabled command',
            onClick: disabledCommand,
          },
        ],
      }),
    );
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Web commands' }));
    const disabled = await screen.findByRole('menuitem', { name: 'Disabled command' });
    expect(disabled).toHaveAttribute('data-slot', 'context-menu-item');
    fireEvent.click(disabled);
    expect(disabledCommand).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Parent command' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Nested command' }));
    expect(nestedCommand).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'nested', keyPath: ['parent', 'nested'] }),
    );
    expect(electronSystemService.popupContextMenu).not.toHaveBeenCalled();
  });
  it('falls back on macOS for link labels and renders a single navigation anchor', async () => {
    window.orviloEnv = { platform: 'darwin' };
    render(
      createElement(
        MemoryRouter,
        null,
        createElement(SidebarContextMenu, {
          children: createElement('button', null, 'Link commands'),
          items: [
            {
              key: 'settings',
              label: createElement(WorkspaceLink, { to: '/settings' }, 'Settings'),
            },
          ],
        }),
      ),
    );
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Link commands' }));
    const settings = await screen.findByRole('link', { name: 'Settings' });
    expect(settings.tagName).toBe('A');
    expect(settings).toHaveAttribute('href', '/settings');
    expect(settings.querySelector('a, button')).toBeNull();
    expect(electronSystemService.popupContextMenu).not.toHaveBeenCalled();
  });
});
