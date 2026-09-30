import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import AsyncError from '@/components/AsyncError';

import AsyncBoundary from './index';

const DATA = <div>DATA_CONTENT</div>;
const EMPTY = <div>EMPTY_ONBOARDING</div>;
const LOADING = <div>LOADING_SKELETON</div>;

describe('AsyncBoundary', () => {
  it('renders children when data is present', () => {
    render(
      <AsyncBoundary data={[1]} empty={EMPTY} isEmpty={false}>
        {DATA}
      </AsyncBoundary>,
    );
    expect(screen.getByText('DATA_CONTENT')).toBeInTheDocument();
    expect(screen.queryByText('EMPTY_ONBOARDING')).not.toBeInTheDocument();
  });

  it('renders the empty state only when there is no error', () => {
    render(
      <AsyncBoundary isEmpty data={[]} empty={EMPTY}>
        {DATA}
      </AsyncBoundary>,
    );
    expect(screen.getByText('EMPTY_ONBOARDING')).toBeInTheDocument();
    expect(screen.queryByText('DATA_CONTENT')).not.toBeInTheDocument();
  });

  it('shows the loading node on first load', () => {
    render(
      <AsyncBoundary isEmpty isLoading data={undefined} empty={EMPTY} loading={LOADING}>
        {DATA}
      </AsyncBoundary>,
    );
    expect(screen.getByText('LOADING_SKELETON')).toBeInTheDocument();
    expect(screen.queryByText('EMPTY_ONBOARDING')).not.toBeInTheDocument();
  });

  // The core regression this framework fixes: a *failed* fetch (isEmpty=true
  // because data is undefined) must NOT render the onboarding empty. Error wins.
  it('renders the error state BEFORE the empty branch (no failure-as-empty)', () => {
    const onRetry = vi.fn();
    render(
      <AsyncBoundary
        isEmpty
        data={undefined}
        empty={EMPTY}
        error={new Error('boom')}
        loading={LOADING}
        onRetry={onRetry}
      >
        {DATA}
      </AsyncBoundary>,
    );
    // The fake "connect your first device" onboarding is gone…
    expect(screen.queryByText('EMPTY_ONBOARDING')).not.toBeInTheDocument();
    // …replaced by a failure state offering Retry.
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  // After a failed first load the user clicks Retry: SWR keeps the previous
  // error until the revalidation settles, but isLoading is true again. The
  // boundary must show in-progress feedback, not the stale error + Retry.
  it('shows loading while a retry is in flight (error still set, isLoading)', () => {
    render(
      <AsyncBoundary
        isEmpty
        isLoading
        data={undefined}
        empty={EMPTY}
        error={new Error('boom')}
        loading={LOADING}
        onRetry={vi.fn()}
      >
        {DATA}
      </AsyncBoundary>,
    );
    expect(screen.getByText('LOADING_SKELETON')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  // A surface that successfully loaded an empty list has settled; a later
  // focus/reconnect revalidation failure (stale data=[] + error) must not
  // replace the onboarding empty with the error block. `data={[]}` is the
  // settled signal — `undefined` means never loaded.
  it('preserves a loaded empty state when a background revalidation errors', () => {
    render(
      <AsyncBoundary isEmpty data={[]} empty={EMPTY} error={new Error('revalidate failed')}>
        {DATA}
      </AsyncBoundary>,
    );
    expect(screen.getByText('EMPTY_ONBOARDING')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('keeps already-loaded content when a background refresh errors', () => {
    render(
      <AsyncBoundary data={[1]} empty={EMPTY} error={new Error('refresh failed')} isEmpty={false}>
        {DATA}
      </AsyncBoundary>,
    );
    expect(screen.getByText('DATA_CONTENT')).toBeInTheDocument();
  });

  it('does not offer Retry for a non-retryable (401) error', () => {
    render(
      <AsyncBoundary
        isEmpty
        data={undefined}
        empty={EMPTY}
        error={{ data: { httpStatus: 401 } }}
        onRetry={vi.fn()}
      >
        {DATA}
      </AsyncBoundary>,
    );
    expect(screen.queryByRole('button', { name: 'error.retry' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'asyncState.signIn' })).toBeInTheDocument();
    expect(screen.queryByText('EMPTY_ONBOARDING')).not.toBeInTheDocument();
  });

  it.each(['inline', 'metric'] as const)(
    'forwards Retry through the %s error variant',
    (errorVariant) => {
      const onRetry = vi.fn();

      render(
        <AsyncBoundary
          data={undefined}
          error={new Error('boom')}
          errorVariant={errorVariant}
          onRetry={onRetry}
        >
          {DATA}
        </AsyncBoundary>,
      );

      fireEvent.click(screen.getByRole('button'));

      expect(onRetry).toHaveBeenCalledTimes(1);
    },
  );
});

const { recoverAuthentication } = vi.hoisted(() => ({ recoverAuthentication: vi.fn() }));
vi.mock('@/components/AsyncError/recoverAuthentication', () => ({ recoverAuthentication }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const renderError = (props: Parameters<typeof AsyncError>[0]) =>
  render(
    <MemoryRouter>
      <AsyncError {...props} />
    </MemoryRouter>,
  );

describe('AsyncError recovery', () => {
  it.each(['block', 'page', 'inline', 'metric'] as const)(
    'offers sign-in instead of another failing request in %s',
    (variant) => {
      const onRetry = vi.fn();
      renderError({ error: { status: 401 }, onRetry, variant });
      fireEvent.click(screen.getByRole('button', { name: 'asyncState.signIn' }));
      expect(recoverAuthentication).toHaveBeenCalled();
      expect(onRetry).not.toHaveBeenCalled();
      expect(screen.queryByText('error.retry')).not.toBeInTheDocument();
    },
  );

  it('explains permissions and offers a safe destination without reauthentication', () => {
    renderError({ error: { data: { code: 'FORBIDDEN' } }, onRetry: vi.fn() });
    expect(screen.getByText('forbidden.desc')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'forbidden.backHome' })).toHaveAttribute('href', '/');
    expect(screen.queryByText('asyncState.signIn')).not.toBeInTheDocument();
    expect(screen.queryByText('error.retry')).not.toBeInTheDocument();
  });

  it.each(['block', 'inline', 'metric'] as const)('preserves a caller action in %s', (variant) => {
    renderError({ action: <button>Switch workspace</button>, error: { status: 403 }, variant });
    expect(screen.getByRole('button', { name: 'Switch workspace' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('keeps retry for transient failures', () => {
    const onRetry = vi.fn();
    renderError({ error: { status: 503 }, onRetry });
    fireEvent.click(screen.getByRole('button', { name: 'error.retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
