import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AddResourceContent } from './AddResourceModal';

const mocks = vi.hoisted(() => ({
  addKnowledgeBase: vi.fn(),
  swr: { data: undefined as unknown, isLoading: false, isValidating: false },
  toastError: vi.fn(),
}));

vi.mock('@lobehub/ui', () => ({
  Center: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Empty: ({ description }: { description?: ReactNode }) => <div>{description}</div>,
  Flexbox: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
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
  Skeleton: { Text: () => <div data-testid="picker-skeleton" /> },
  Tag: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  createModal: vi.fn(),
  toast: { error: mocks.toastError },
}));

vi.mock('@/services/project', () => ({
  projectService: { addKnowledgeBase: mocks.addKnowledgeBase },
}));

vi.mock('@/store/library', () => ({
  useKnowledgeBaseStore: (selector: (state: unknown) => unknown) =>
    selector({ useFetchKnowledgeBaseList: () => mocks.swr }),
}));

const library = (id: string, name: string) => ({ description: undefined, id, name });

const renderPicker = (linkedIds: string[] = [], onAdded = vi.fn()) => {
  render(
    <AddResourceContent linkedIds={new Set(linkedIds)} projectId={'prj_1'} onAdded={onAdded} />,
  );
  return onAdded;
};

beforeEach(() => {
  mocks.addKnowledgeBase.mockReset().mockResolvedValue(undefined);
  mocks.swr = { data: [], isLoading: false, isValidating: false };
  mocks.toastError.mockReset();
});

afterEach(cleanup);

describe('add project resource picker', () => {
  // The store's SWR hands back `fallbackData: []`, so an in-flight first fetch
  // looks exactly like "this reader owns no libraries". Showing the empty state
  // there would be a lie that resolves itself a moment later.
  it('waits out an in-flight fetch over empty fallback data', () => {
    mocks.swr = { data: [], isLoading: false, isValidating: true };

    renderPicker();

    expect(screen.getByTestId('picker-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('resources.addModal.empty')).not.toBeInTheDocument();
  });

  it('reports an empty library list only once the fetch has settled', () => {
    mocks.swr = { data: [], isLoading: false, isValidating: false };

    renderPicker();

    expect(screen.getByText('resources.addModal.empty')).toBeInTheDocument();
  });

  it('marks libraries the project already references', () => {
    mocks.swr = { data: [library('kb_1', 'Alpha'), library('kb_2', 'Beta')], isLoading: false };

    renderPicker(['kb_1']);

    expect(screen.getByText('resources.addModal.added')).toBeInTheDocument();
    // Beta is still actionable, so exactly one add button survives.
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('adds a library, marks it, and asks the page to refresh', async () => {
    mocks.swr = { data: [library('kb_2', 'Beta')], isLoading: false };
    const onAdded = renderPicker();

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(mocks.addKnowledgeBase).toHaveBeenCalledWith('prj_1', 'kb_2'));
    expect(onAdded).toHaveBeenCalledTimes(1);
    // Stays "added" for this session rather than flipping back while the project
    // detail refetches.
    await waitFor(() => expect(screen.getByText('resources.addModal.added')).toBeInTheDocument());
  });

  it('keeps the row actionable and reports a failed add', async () => {
    mocks.addKnowledgeBase.mockRejectedValue(new Error('nope'));
    mocks.swr = { data: [library('kb_2', 'Beta')], isLoading: false };
    const onAdded = renderPicker();

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('resources.addError'));
    expect(onAdded).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
