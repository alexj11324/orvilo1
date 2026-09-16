import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectDetail } from '@/store/project';

import ProjectResources from './ProjectResources';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  openAddResourceModal: vi.fn(),
  onOk: undefined as (() => unknown) | undefined,
  removeKnowledgeBase: vi.fn(),
  toastError: vi.fn(),
}));

// Spelled out rather than spread from `importOriginal`: the real `Button` needs
// the app-level motion provider, so pulling it back in would trade one mock for
// a provider this test never mounts.
vi.mock('@lobehub/ui', () => ({
  Center: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Empty: ({ description }: { description?: ReactNode }) => <div>{description}</div>,
  Flexbox: ({ children, className }: { children?: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  Icon: () => null,
}));

vi.mock('@lobehub/ui/base-ui', () => ({
  Button: ({
    children,
    disabled,
    loading,
    onClick,
  }: {
    children?: ReactNode;
    disabled?: boolean;
    loading?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled || loading} onClick={onClick}>
      {children}
    </button>
  ),
  Tag: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  confirmModal: (config: { onOk?: () => unknown }) => {
    mocks.onOk = config.onOk;
  },
  toast: { error: mocks.toastError },
}));

vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));

vi.mock('@/services/project', () => ({
  projectService: { removeKnowledgeBase: mocks.removeKnowledgeBase },
}));

vi.mock('./AddResourceModal', () => ({
  openAddResourceModal: mocks.openAddResourceModal,
}));

const link = (id: string, name: string, enabled = true) => ({
  binding: { enabled, id: `bind-${id}` },
  knowledgeBase: { description: undefined, id, name },
});

const detailWith = (links: ReturnType<typeof link>[]) =>
  ({ knowledgeBases: links }) as unknown as ProjectDetail;

const renderPage = (links: ReturnType<typeof link>[], onRefresh = vi.fn()) => {
  render(<ProjectResources detail={detailWith(links)} projectId={'prj_1'} onRefresh={onRefresh} />);
  return onRefresh;
};

beforeEach(() => {
  mocks.navigate.mockReset();
  mocks.openAddResourceModal.mockReset();
  mocks.onOk = undefined;
  mocks.removeKnowledgeBase.mockReset().mockResolvedValue(undefined);
  mocks.toastError.mockReset();
});

afterEach(cleanup);

describe('project resources', () => {
  it('lists every library the project references', () => {
    renderPage([link('kb_1', 'Alpha'), link('kb_2', 'Beta')]);

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('marks a binding the project has switched off', () => {
    renderPage([link('kb_1', 'Alpha', false)]);

    expect(screen.getByText('resources.disabled')).toBeInTheDocument();
  });

  it('offers the empty state when nothing is referenced', () => {
    renderPage([]);

    expect(screen.getByText('resources.empty.title')).toBeInTheDocument();
    expect(screen.queryByText('resources.open')).not.toBeInTheDocument();
  });

  it('opens a library through the project-scoped path', () => {
    renderPage([link('kb_1', 'Alpha')]);

    fireEvent.click(screen.getByText('resources.open'));

    expect(mocks.navigate).toHaveBeenCalledWith('/project/prj_1/library/kb_1');
  });

  it('asks before removing, then drops the binding and refreshes', async () => {
    const onRefresh = renderPage([link('kb_1', 'Alpha')]);

    fireEvent.click(screen.getByText('resources.remove'));
    // Nothing is sent until the confirmation is accepted.
    expect(mocks.removeKnowledgeBase).not.toHaveBeenCalled();

    await mocks.onOk?.();

    expect(mocks.removeKnowledgeBase).toHaveBeenCalledWith('prj_1', 'kb_1');
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });

  it('keeps the list and reports the failure when removing fails', async () => {
    mocks.removeKnowledgeBase.mockRejectedValue(new Error('nope'));
    const onRefresh = renderPage([link('kb_1', 'Alpha')]);

    fireEvent.click(screen.getByText('resources.remove'));
    await mocks.onOk?.();

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('resources.removeError'));
    // A failed removal must not read as a success: no refresh that would imply
    // the binding is gone.
    expect(onRefresh).not.toHaveBeenCalled();
    expect(mocks.removeKnowledgeBase).toHaveBeenCalledTimes(1);
  });

  it('hands the picker the ids already referenced', () => {
    renderPage([link('kb_1', 'Alpha')]);

    fireEvent.click(screen.getByText('resources.add'));

    expect(mocks.openAddResourceModal).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'prj_1', linkedIds: new Set(['kb_1']) }),
    );
  });
});
