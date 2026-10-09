/**
 * @vitest-environment happy-dom
 */
import type { UIChatMessage } from '@orvilo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MessageActionBar } from './index';

const permissionMock = vi.hoisted(() => ({
  canEdit: true,
}));
const actionMocks = vi.hoisted(() => ({
  commentsAvailable: true,
  regenerating: false,
  onRegenerate: vi.fn(),
  onCopyMessageId: vi.fn(),
}));
/** Menu adapter callback dispatch remains assertable through presentation changes. */
const rendered = vi.hoisted(() => ({ menu: undefined as any }));

vi.mock('@/components/ai-elements/message', () => ({
  MessageActions: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  MessageAction: ({ children, tooltip, label, ...props }: any) => (
    <button aria-label={label || tooltip} {...props}>
      {children}
    </button>
  ),
}));
vi.mock('@/features/NavPanel/components/SidebarDropdownMenu', () => ({
  default: ({ items, children }: any) => {
    rendered.menu = typeof items === 'function' ? items() : items;
    return (
      <div
        data-menu={rendered.menu.map((item: any) => item.key || item.type).join(',')}
        data-testid="action-menu"
      >
        {children}
      </div>
    );
  },
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ allowed: permissionMock.canEdit, reason: '' }),
}));

vi.mock('./useBuildActions', () => ({
  useBuildActions: () => ({
    advanced: { key: 'advanced', label: 'Advanced' },
    comments: actionMocks.commentsAvailable
      ? {
          key: 'comments',
          label: 'Comments',
        }
      : null,
    copy: { key: 'copy', label: 'Copy' },
    copyMessageId: {
      handleClick: actionMocks.onCopyMessageId,
      key: 'copyMessageId',
      label: 'Copy Message ID',
    },
    del: { key: 'del', label: 'Delete' },
    edit: { key: 'edit', label: 'Edit' },
    regenerate: {
      key: 'regenerate',
      label: 'Regenerate',
      disabled: actionMocks.regenerating,
      handleClick: actionMocks.onRegenerate,
    },
  }),
}));

describe('MessageActionBar', () => {
  it('renders a leading control inside the shared action container', () => {
    permissionMock.canEdit = true;

    render(
      <MessageActionBar
        bar={['edit', 'copy']}
        leading={<button>Reaction</button>}
        ctx={{
          data: { content: 'hello', role: 'assistant' } as UIChatMessage,
          id: 'message-1',
          role: 'assistant',
        }}
      />,
    );

    const container = screen.getByRole('toolbar');
    expect(container).toContainElement(screen.getByRole('button', { name: 'Reaction' }));
    expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled();
  });

  it('keeps read-only comments available to workspace viewers', () => {
    actionMocks.commentsAvailable = true;
    permissionMock.canEdit = false;

    render(
      <MessageActionBar
        bar={['edit', 'copy', 'regenerate']}
        menu={['edit', 'copy', 'del']}
        ctx={{
          data: { content: 'hello', role: 'assistant' } as UIChatMessage,
          id: 'message-1',
          role: 'assistant',
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Comments' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByTestId('action-menu')).toBeNull();
  });

  it('promotes the zero-comment entry from the menu to the action bar', () => {
    actionMocks.commentsAvailable = true;
    permissionMock.canEdit = true;

    render(
      <MessageActionBar
        bar={['copy']}
        menu={['comments']}
        ctx={{
          data: { content: 'hello', role: 'assistant' } as UIChatMessage,
          id: 'message-1',
          role: 'assistant',
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Comments' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByTestId('action-menu')).toBeNull();
  });

  it('keeps the direct action absent when the message already has comments', () => {
    actionMocks.commentsAvailable = false;
    permissionMock.canEdit = true;

    render(
      <MessageActionBar
        bar={['copy']}
        menu={['comments']}
        ctx={{
          data: { content: 'hello', role: 'assistant' } as UIChatMessage,
          id: 'message-1',
          role: 'assistant',
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Comments' })).toBeNull();
    expect(screen.queryByTestId('action-menu')).toBeNull();
  });

  it('collapses a menu whose every action opted out instead of passing []', () => {
    actionMocks.commentsAvailable = true;
    permissionMock.canEdit = true;

    // 'tts' is not in the mocked registry — the slot resolves to nothing, like
    // copyOperationId with dev mode off. ActionIconGroup would render an empty
    // overflow trigger for [], so the bar must pass undefined instead.
    render(
      <MessageActionBar
        bar={['copy']}
        menu={['tts']}
        ctx={{
          data: { content: 'hello', role: 'assistant' } as UIChatMessage,
          id: 'message-1',
          role: 'assistant',
        }}
      />,
    );

    expect(screen.queryByTestId('action-menu')).toBeNull();
  });

  it('drops dangling dividers when the group behind one opted out', () => {
    actionMocks.commentsAvailable = true;
    permissionMock.canEdit = true;

    // 'tts' resolves to nothing (not in the mocked registry), so the trailing
    // "divider + hidden group" must collapse away, and the double boundary
    // around the missing middle group must merge into one divider.
    render(
      <MessageActionBar
        bar={['copy']}
        menu={['edit', 'divider', 'tts', 'divider', 'del', 'divider', 'restoreToInput']}
        ctx={{
          data: { content: 'hello', role: 'assistant' } as UIChatMessage,
          id: 'message-1',
          role: 'assistant',
        }}
      />,
    );

    expect(screen.getByTestId('action-menu')).toHaveAttribute('data-menu', 'edit,divider,del');
  });

  // Each nested menu action must keep its own callback after adaptation.
  it('lets a submenu child dispatch itself', () => {
    permissionMock.canEdit = true;
    actionMocks.onCopyMessageId.mockClear();

    render(
      <MessageActionBar
        bar={['copy']}
        menu={[{ children: ['copyMessageId'], key: 'advanced' }]}
        ctx={{
          data: { content: 'hello', role: 'assistant' } as UIChatMessage,
          id: 'message-1',
          role: 'assistant',
        }}
      />,
    );

    const child = rendered.menu?.[0]?.children?.[0];
    expect(child.key).toBe('copyMessageId');
    child.onClick();
    expect(actionMocks.onCopyMessageId).toHaveBeenCalledTimes(1);
  });
  it('keeps an in-flight retry disabled and dispatches the action when available', () => {
    permissionMock.canEdit = true;
    actionMocks.regenerating = true;
    actionMocks.onRegenerate.mockClear();
    const props = {
      bar: ['regenerate'] as const,
      ctx: {
        data: { content: 'hello', role: 'assistant' } as UIChatMessage,
        id: 'message-1',
        role: 'assistant' as const,
      },
    };
    const { rerender } = render(<MessageActionBar bar={[...props.bar]} ctx={props.ctx} />);
    const retry = screen.getByRole('button', { name: 'Regenerate' });
    expect(retry).toBeDisabled();
    fireEvent.click(retry);
    expect(actionMocks.onRegenerate).not.toHaveBeenCalled();
    actionMocks.regenerating = false;
    rerender(<MessageActionBar bar={[...props.bar]} ctx={props.ctx} />);
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(actionMocks.onRegenerate).toHaveBeenCalledTimes(1);
  });
});
