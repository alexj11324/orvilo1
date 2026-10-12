import { act, render, renderHook, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AuthAgreement, { useAuthAgreement } from './AuthAgreement';
import AuthFooterLinks from './AuthFooterLinks';

interface TransMockProps {
  components?: Record<string, ReactElement>;
  i18nKey: string;
}

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal()),
  Trans: ({ components, i18nKey }: TransMockProps) => (
    <>
      {i18nKey}
      {components?.terms}
      {components?.privacy}
    </>
  ),
}));

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const expectLinksToOpenInNewTabs = () => {
  const links = screen.getAllByRole('link');

  expect(links).toHaveLength(2);
  for (const link of links) {
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  }
};

describe('AuthAgreement', () => {
  it('should keep the passive agreement visible and open its links in new tabs', () => {
    render(<AuthAgreement />);

    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText('footer.agreement')).toBeTruthy();
    expectLinksToOpenInNewTabs();
  });

  it('should use the active agreement copy with the checkbox', () => {
    render(<AuthAgreement checked={false} onChange={vi.fn()} />);

    expect(screen.getByRole('checkbox')).toBeTruthy();
    expect(screen.getByText('agreement.checkbox')).toBeTruthy();
    expectLinksToOpenInNewTabs();
  });
});

describe('AuthFooterLinks', () => {
  const renderWithBranding = async (urls: { privacy?: string; terms?: string }) => {
    vi.resetModules();
    vi.doMock('@orvilo/business-const', async (importOriginal) => ({
      ...(await importOriginal<object>()),
      BRANDING_URL: urls,
    }));
    const { default: Links } = await import('./AuthFooterLinks');
    return render(<Links />);
  };

  afterEach(() => {
    vi.doUnmock('@orvilo/business-const');
  });

  it('renders nothing when the deployment publishes no legal pages', () => {
    const { container } = render(<AuthFooterLinks />);

    expect(container.firstChild).toBeNull();
  });

  it('should open its links in new tabs when both pages are configured', async () => {
    await renderWithBranding({
      privacy: 'https://example.com/privacy',
      terms: 'https://example.com/terms',
    });

    expectLinksToOpenInNewTabs();
  });

  it('links only the page that exists', async () => {
    await renderWithBranding({ terms: 'https://example.com/terms' });

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://example.com/terms');
  });
});

describe('useAuthAgreement', () => {
  it('should keep the agreement unchecked when confirmation is cancelled', () => {
    const requestConfirmation = vi.fn();
    const continueAction = vi.fn();
    const { result } = renderHook(() => useAuthAgreement(requestConfirmation));

    act(() => {
      result.current.continueWithAgreement(continueAction);
    });

    expect(result.current.agreementChecked).toBe(false);
    expect(requestConfirmation).toHaveBeenCalledOnce();
    expect(continueAction).not.toHaveBeenCalled();
  });

  it('should check the agreement and reuse consent after confirmation', () => {
    const requestConfirmation = vi.fn((onConfirm: () => void) => onConfirm());
    const continueAction = vi.fn();
    const { result } = renderHook(() => useAuthAgreement(requestConfirmation));

    act(() => {
      result.current.continueWithAgreement(continueAction);
    });

    expect(result.current.agreementChecked).toBe(true);

    act(() => {
      result.current.continueWithAgreement(continueAction);
    });

    expect(requestConfirmation).toHaveBeenCalledOnce();
    expect(continueAction).toHaveBeenCalledTimes(2);
  });

  it('should skip confirmation when the agreement is checked manually', () => {
    const requestConfirmation = vi.fn();
    const continueAction = vi.fn();
    const { result } = renderHook(() => useAuthAgreement(requestConfirmation));

    act(() => {
      result.current.setAgreementChecked(true);
    });

    act(() => {
      result.current.continueWithAgreement(continueAction);
    });

    expect(requestConfirmation).not.toHaveBeenCalled();
    expect(continueAction).toHaveBeenCalledOnce();
  });

  it('should skip confirmation on later visits after consent was given once', () => {
    const requestConfirmation = vi.fn((onConfirm: () => void) => onConfirm());
    const continueAction = vi.fn();
    const firstVisit = renderHook(() => useAuthAgreement(requestConfirmation));

    act(() => {
      firstVisit.result.current.continueWithAgreement(continueAction);
    });
    firstVisit.unmount();

    // A fresh hook instance simulates the user returning to the sign-in page.
    const secondVisit = renderHook(() => useAuthAgreement(requestConfirmation));

    expect(secondVisit.result.current.agreementChecked).toBe(true);

    act(() => {
      secondVisit.result.current.continueWithAgreement(continueAction);
    });

    expect(requestConfirmation).toHaveBeenCalledOnce();
    expect(continueAction).toHaveBeenCalledTimes(2);
  });

  it('should forget persisted consent once the agreement is unchecked', () => {
    const requestConfirmation = vi.fn();
    const firstVisit = renderHook(() => useAuthAgreement(requestConfirmation));

    act(() => {
      firstVisit.result.current.setAgreementChecked(true);
    });
    act(() => {
      firstVisit.result.current.setAgreementChecked(false);
    });
    firstVisit.unmount();

    const secondVisit = renderHook(() => useAuthAgreement(requestConfirmation));

    expect(secondVisit.result.current.agreementChecked).toBe(false);
  });
});
